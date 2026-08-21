import { parse as parseCookie } from "cookie";
import { and, desc, eq, gte, like, lte, or, sql } from "drizzle-orm";
import { z } from "zod";
import {
  advisoryExplanations,
  artifacts,
  changeEvents,
  contentVersions,
  evidence,
  fetchRuns,
  notifications,
  observations,
  recoveryRecords,
  reviews,
  sources,
  systemJobs,
} from "../../drizzle/schema";
import { COOKIE_NAME } from "../../shared/const";
import { getDb } from "../db";
import { createHeartbeatJob, deleteHeartbeatJob, updateHeartbeatJob } from "../_core/heartbeat";
import { protectedProcedure, router } from "../_core/trpc";
import { confirmMaterialChange, createAdvisoryExplanation, resolveReviewStatus, runSourceCheck, validateExternalSourceUrl } from "../monitoring/service";

const cronSchema = z.string().trim().min(9).max(100).refine(value => value.split(/\s+/).length === 6, "Use a six-field UTC cron expression: sec min hour day month weekday.");
const jsonObjectSchema = z.record(z.string(), z.unknown());
const sourceInput = z.object({
  name: z.string().trim().min(2).max(200),
  description: z.string().trim().max(2000).optional().nullable(),
  sourceType: z.enum(["json_api", "html_page", "rss", "plain_text"]),
  url: z.string().trim().url().max(2048),
  checkCron: cronSchema,
  rateLimitSeconds: z.number().int().min(60).max(86_400).default(60),
  parserConfig: jsonObjectSchema.default({}),
  ignoreRules: jsonObjectSchema.default({}),
  materialityPolicy: jsonObjectSchema.default({}),
});
const executionFiltersSchema = z.object({
  query: z.string().trim().max(160).optional(),
  sourceId: z.number().int().positive().optional(),
  status: z.enum(["running", "succeeded", "failed", "skipped"]).optional(),
  initiatedBy: z.enum(["scheduled", "manual", "reconciliation"]).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
}).optional();
const reportFiltersSchema = z.object({
  sourceId: z.number().int().positive().optional(),
  classification: z.enum(["baseline", "no_change", "cosmetic", "material"]).optional(),
  status: z.enum(["pending_review", "confirmed", "not_material", "suppressed"]).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  includeSuppressed: z.boolean().optional(),
}).optional();

function sessionToken(headers: Record<string, string | string[] | undefined>) {
  const value = headers.cookie;
  return parseCookie(Array.isArray(value) ? value.join(";") : value ?? "")[COOKIE_NAME] ?? "";
}

function insertId(result: unknown) {
  const header = Array.isArray(result) ? result[0] : result;
  const id = Number((header as { insertId?: number }).insertId ?? 0);
  if (!id) throw new Error("Database insert did not return an identifier.");
  return id;
}

async function requireOwnedSource(ownerId: number, sourceId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable.");
  const source = (await db.select().from(sources).where(and(eq(sources.id, sourceId), eq(sources.ownerId, ownerId))).limit(1))[0];
  if (!source) throw new Error("Source not found.");
  return source;
}

async function activateSourceSchedule(sourceId: number, ownerId: number, token: string) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable.");
  const source = await requireOwnedSource(ownerId, sourceId);
  let taskUid = source.scheduleCronTaskUid;
  if (taskUid) {
    await updateHeartbeatJob(taskUid, { cron: source.checkCron, path: "/api/scheduled/source-check", enable: true, description: `Monitor ${source.name}` }, token);
  } else {
    const created = await createHeartbeatJob({ name: `research-source-${source.id}`, cron: source.checkCron, path: "/api/scheduled/source-check", payload: {}, description: `Monitor ${source.name}` }, token);
    taskUid = created.taskUid;
  }
  await db.update(sources).set({ status: "active", scheduleCronTaskUid: taskUid }).where(eq(sources.id, source.id));
  return taskUid;
}

export const monitoringRouter = router({
  sources: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) return [];
      return db.select().from(sources).where(eq(sources.ownerId, ctx.user.id)).orderBy(desc(sources.updatedAt));
    }),
    create: protectedProcedure.input(sourceInput).mutation(async ({ ctx, input }) => {
      validateExternalSourceUrl(input.url);
      const db = await getDb();
      if (!db) throw new Error("Database is unavailable.");
      const result = await db.insert(sources).values({ ...input, ownerId: ctx.user.id, status: "paused", health: "unknown" });
      const id = insertId(result);
      return requireOwnedSource(ctx.user.id, id);
    }),
    update: protectedProcedure.input(z.object({ id: z.number().int().positive(), patch: sourceInput.partial() })).mutation(async ({ ctx, input }) => {
      const source = await requireOwnedSource(ctx.user.id, input.id);
      if (input.patch.url) validateExternalSourceUrl(input.patch.url);
      const db = await getDb();
      if (!db) throw new Error("Database is unavailable.");
      if (source.status === "active" && input.patch.checkCron && source.scheduleCronTaskUid) {
        await updateHeartbeatJob(source.scheduleCronTaskUid, { cron: input.patch.checkCron }, sessionToken(ctx.req.headers));
      }
      await db.update(sources).set(input.patch).where(eq(sources.id, source.id));
      return requireOwnedSource(ctx.user.id, source.id);
    }),
    activate: protectedProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => ({ taskUid: await activateSourceSchedule(input.id, ctx.user.id, sessionToken(ctx.req.headers)) })),
    pause: protectedProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      const source = await requireOwnedSource(ctx.user.id, input.id);
      if (source.scheduleCronTaskUid) await updateHeartbeatJob(source.scheduleCronTaskUid, { enable: false }, sessionToken(ctx.req.headers));
      const db = await getDb();
      if (!db) throw new Error("Database is unavailable.");
      await db.update(sources).set({ status: "paused" }).where(eq(sources.id, source.id));
      return { success: true };
    }),
    retire: protectedProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      const source = await requireOwnedSource(ctx.user.id, input.id);
      if (source.scheduleCronTaskUid) await deleteHeartbeatJob(source.scheduleCronTaskUid, sessionToken(ctx.req.headers));
      const db = await getDb();
      if (!db) throw new Error("Database is unavailable.");
      await db.update(sources).set({ status: "retired", scheduleCronTaskUid: null }).where(eq(sources.id, source.id));
      return { success: true };
    }),
    runNow: protectedProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      const source = await requireOwnedSource(ctx.user.id, input.id);
      return runSourceCheck(source, { initiatedBy: "manual" });
    }),
  }),
  dashboard: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return { sources: [], metrics: { active: 0, healthy: 0, degraded: 0, failed: 0, pendingReviews: 0, successRate: 0 }, recentChanges: [], executions: [] };
    const owned = await db.select().from(sources).where(eq(sources.ownerId, ctx.user.id)).orderBy(desc(sources.updatedAt));
    const sourceIds = owned.map(source => source.id);
    if (sourceIds.length === 0) return { sources: owned, metrics: { active: 0, healthy: 0, degraded: 0, failed: 0, pendingReviews: 0, successRate: 0 }, recentChanges: [], executions: [] };
    const changes = await db.select({ event: changeEvents, source: sources }).from(changeEvents).innerJoin(sources, eq(changeEvents.sourceId, sources.id)).where(eq(sources.ownerId, ctx.user.id)).orderBy(desc(changeEvents.detectedAt)).limit(12);
    const executions = await db.select({ run: fetchRuns, source: sources }).from(fetchRuns).innerJoin(sources, eq(fetchRuns.sourceId, sources.id)).where(eq(sources.ownerId, ctx.user.id)).orderBy(desc(fetchRuns.startedAt)).limit(18);
    const active = owned.filter(source => source.status === "active").length;
    const healthy = owned.filter(source => source.health === "healthy").length;
    const degraded = owned.filter(source => source.health === "degraded").length;
    const failed = owned.filter(source => source.health === "failed").length;
    const pendingReviews = changes.filter(change => change.event.status === "pending_review").length;
    const completed = executions.filter(item => item.run.status === "succeeded" || item.run.status === "failed");
    const successRate = completed.length ? Math.round((completed.filter(item => item.run.status === "succeeded").length / completed.length) * 100) : 0;
    return { sources: owned, metrics: { active, healthy, degraded, failed, pendingReviews, successRate }, recentChanges: changes, executions };
  }),
  changes: router({
    list: protectedProcedure.input(z.object({ status: z.enum(["pending_review", "confirmed", "not_material", "suppressed"]).optional() }).optional()).query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return [];
      const conditions = [eq(sources.ownerId, ctx.user.id)];
      if (input?.status) conditions.push(eq(changeEvents.status, input.status));
      return db.select({ event: changeEvents, source: sources }).from(changeEvents).innerJoin(sources, eq(changeEvents.sourceId, sources.id)).where(and(...conditions)).orderBy(desc(changeEvents.detectedAt)).limit(100);
    }),
    detail: protectedProcedure.input(z.object({ id: z.number().int().positive() })).query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database is unavailable.");
      const item = (await db.select({ event: changeEvents, source: sources, previous: contentVersions, current: contentVersions }).from(changeEvents).innerJoin(sources, eq(changeEvents.sourceId, sources.id)).where(and(eq(changeEvents.id, input.id), eq(sources.ownerId, ctx.user.id))).limit(1))[0];
      if (!item) throw new Error("Change event not found.");
      const eventEvidence = await db.select({ evidence, artifact: artifacts }).from(evidence).innerJoin(artifacts, eq(evidence.artifactId, artifacts.id)).where(eq(evidence.changeEventId, input.id));
      const eventReviews = await db.select().from(reviews).where(eq(reviews.changeEventId, input.id)).orderBy(desc(reviews.reviewedAt));
      const explanations = await db.select().from(advisoryExplanations).where(eq(advisoryExplanations.changeEventId, input.id)).orderBy(desc(advisoryExplanations.createdAt));
      return { ...item, evidence: eventEvidence, reviews: eventReviews, explanations };
    }),
    review: protectedProcedure.input(z.object({ id: z.number().int().positive(), decision: z.enum(["confirm_material", "not_material", "incorrect", "needs_follow_up"]), correctedClassification: z.enum(["baseline", "no_change", "cosmetic", "material"]).optional(), notes: z.string().max(5000).optional() })).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database is unavailable.");
      const item = (await db.select({ event: changeEvents, source: sources }).from(changeEvents).innerJoin(sources, eq(changeEvents.sourceId, sources.id)).where(and(eq(changeEvents.id, input.id), eq(sources.ownerId, ctx.user.id))).limit(1))[0];
      if (!item) throw new Error("Change event not found.");
      await db.insert(reviews).values({ changeEventId: item.event.id, reviewerId: ctx.user.id, decision: input.decision, correctedClassification: input.correctedClassification, notes: input.notes ?? null });
      const nextStatus = resolveReviewStatus(item.event.classification, input.decision);
      await db.update(changeEvents).set({ status: nextStatus }).where(eq(changeEvents.id, item.event.id));
      const notification = input.decision === "confirm_material" ? await confirmMaterialChange(item.event.id, item.source.name, item.source.id) : null;
      return { status: nextStatus, notification };
    }),
    explain: protectedProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database is unavailable.");
      const sourceCheck = await db.select({ event: changeEvents }).from(changeEvents).innerJoin(sources, eq(changeEvents.sourceId, sources.id)).where(and(eq(changeEvents.id, input.id), eq(sources.ownerId, ctx.user.id))).limit(1);
      if (!sourceCheck[0]) throw new Error("Change event not found.");
      return createAdvisoryExplanation(input.id, ctx.user.id);
    }),
  }),
  operations: router({
    recoveryList: protectedProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) return [];
      return db.select({ recovery: recoveryRecords, source: sources }).from(recoveryRecords).innerJoin(sources, eq(recoveryRecords.sourceId, sources.id)).where(eq(sources.ownerId, ctx.user.id)).orderBy(desc(recoveryRecords.createdAt)).limit(50);
    }),
    executionList: protectedProcedure.input(executionFiltersSchema).query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return [];
      const conditions = [eq(sources.ownerId, ctx.user.id)];
      if (input?.sourceId) conditions.push(eq(fetchRuns.sourceId, input.sourceId));
      if (input?.status) conditions.push(eq(fetchRuns.status, input.status));
      if (input?.initiatedBy) conditions.push(eq(fetchRuns.initiatedBy, input.initiatedBy));
      if (input?.from) conditions.push(gte(fetchRuns.startedAt, input.from));
      if (input?.to) conditions.push(lte(fetchRuns.startedAt, input.to));
      if (input?.query) conditions.push(or(like(sources.name, `%${input.query}%`), like(sources.url, `%${input.query}%`))!);
      return db.select({ run: fetchRuns, source: sources }).from(fetchRuns).innerJoin(sources, eq(fetchRuns.sourceId, sources.id)).where(and(...conditions)).orderBy(desc(fetchRuns.startedAt)).limit(120);
    }),
    executionDetail: protectedProcedure.input(z.object({ runId: z.number().int().positive() })).query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database is unavailable.");
      const item = (await db.select({ run: fetchRuns, source: sources }).from(fetchRuns).innerJoin(sources, eq(fetchRuns.sourceId, sources.id)).where(and(eq(fetchRuns.id, input.runId), eq(sources.ownerId, ctx.user.id))).limit(1))[0];
      if (!item) throw new Error("Execution not found.");
      const runArtifacts = await db.select().from(artifacts).where(eq(artifacts.fetchRunId, input.runId)).orderBy(desc(artifacts.createdAt));
      const runObservations = await db.select().from(observations).where(eq(observations.fetchRunId, input.runId));
      const recovery = await db.select().from(recoveryRecords).where(eq(recoveryRecords.fetchRunId, input.runId)).orderBy(desc(recoveryRecords.createdAt));
      return { ...item, artifacts: runArtifacts, observations: runObservations, recovery };
    }),
    setupReconciliation: protectedProcedure.input(z.object({ cron: cronSchema.default("0 */15 * * * *") }).optional()).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database is unavailable.");
      const existing = (await db.select().from(systemJobs).where(and(eq(systemJobs.ownerId, ctx.user.id), eq(systemJobs.kind, "reconciliation"))).limit(1))[0];
      const token = sessionToken(ctx.req.headers);
      let taskUid = existing?.scheduleCronTaskUid;
      const cron = input?.cron ?? "0 */15 * * * *";
      if (taskUid) {
        await updateHeartbeatJob(taskUid, { cron, path: "/api/scheduled/reconcile", enable: true, description: "Research intelligence reconciliation" }, token);
      } else {
        const created = await createHeartbeatJob({ name: `research-reconcile-${ctx.user.id}`, cron, path: "/api/scheduled/reconcile", payload: {}, description: "Research intelligence reconciliation" }, token);
        taskUid = created.taskUid;
      }
      if (existing) await db.update(systemJobs).set({ cron, scheduleCronTaskUid: taskUid, enabled: true }).where(eq(systemJobs.id, existing.id));
      else await db.insert(systemJobs).values({ ownerId: ctx.user.id, kind: "reconciliation", cron, scheduleCronTaskUid: taskUid, enabled: true });
      return { taskUid };
    }),
  }),
  reports: router({
    changeList: protectedProcedure.input(reportFiltersSchema).query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return { generatedAt: new Date(), filters: input ?? {}, records: [] };
      const conditions = [eq(sources.ownerId, ctx.user.id)];
      if (input?.sourceId) conditions.push(eq(changeEvents.sourceId, input.sourceId));
      if (input?.classification) conditions.push(eq(changeEvents.classification, input.classification));
      if (input?.status) conditions.push(eq(changeEvents.status, input.status));
      if (input?.from) conditions.push(gte(changeEvents.detectedAt, input.from));
      if (input?.to) conditions.push(lte(changeEvents.detectedAt, input.to));
      if (!input?.includeSuppressed && !input?.status) conditions.push(sql`${changeEvents.status} <> 'suppressed'`);
      const events = await db.select({ event: changeEvents, source: sources }).from(changeEvents).innerJoin(sources, eq(changeEvents.sourceId, sources.id)).where(and(...conditions)).orderBy(desc(changeEvents.detectedAt)).limit(250);
      const records = await Promise.all(events.map(async ({ event, source }) => {
        const [review] = await db.select().from(reviews).where(eq(reviews.changeEventId, event.id)).orderBy(desc(reviews.reviewedAt)).limit(1);
        const [explanation] = await db.select().from(advisoryExplanations).where(eq(advisoryExplanations.changeEventId, event.id)).orderBy(desc(advisoryExplanations.createdAt)).limit(1);
        const preservedEvidence = await db.select({ role: evidence.role, sha256: artifacts.sha256, previewText: artifacts.previewText }).from(evidence).innerJoin(artifacts, eq(evidence.artifactId, artifacts.id)).where(eq(evidence.changeEventId, event.id));
        return { event, source, review: review ?? null, explanation: explanation ?? null, evidence: preservedEvidence };
      }));
      return { generatedAt: new Date(), filters: input ?? {}, records };
    }),
  }),
});
