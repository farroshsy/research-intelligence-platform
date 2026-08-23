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
  reportDeliveries,
  reportDeliveryAttempts,
  reportTemplates,
  recoveryRecords,
  reviews,
  sources,
  systemJobs,
} from "../../drizzle/schema";
import { COOKIE_NAME } from "../../shared/const";
import { getDb } from "../db";
import { createHeartbeatJob, deleteHeartbeatJob, updateHeartbeatJob } from "../_core/heartbeat";
import { protectedProcedure, router } from "../_core/trpc";
import { getOwnerNotificationCenter, requireOwnedReportDelivery, updateOwnedNotificationChannels } from "../domains/notification-center/service";
import { requireOwnedSource } from "../domains/source-governance/ownership";
import { confirmMaterialChange, createAdvisoryExplanation, resolveReviewStatus, runSourceCheck, validateExternalSourceUrl } from "../monitoring/service";
import { deliverTestNotification, deliveryReadiness } from "../monitoring/reportDelivery";

const cronSchema = z.string().trim().min(9).max(100).refine(value => value.split(/\s+/).length === 6, "Use a six-field UTC cron expression: sec min hour day month weekday.");
const jsonObjectSchema = z.record(z.string(), z.unknown());
const sourceInput = z.object({
  name: z.string().trim().min(2).max(200),
  description: z.string().trim().max(2000).optional().nullable(),
  steward: z.string().trim().max(160).optional().nullable(),
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
const storedReportFiltersSchema = z.object({
  sourceId: z.number().int().positive().optional(),
  classification: z.enum(["baseline", "no_change", "cosmetic", "material"]).optional(),
  status: z.enum(["pending_review", "confirmed", "not_material", "suppressed"]).optional(),
  includeSuppressed: z.boolean().default(false),
});
const deliveryInput = z.object({
  name: z.string().trim().min(2).max(140),
  templateId: z.number().int().positive().nullable().optional(),
  cron: cronSchema,
  recipients: z.array(z.string().trim().email().max(320)).max(50).default([]),
  primaryEmailProvider: z.enum(["resend", "gmail", "outlook"]),
  fallbackProviders: z.array(z.enum(["resend", "gmail", "outlook"])).max(2).default([]),
  emailEnabled: z.boolean().default(true),
  slackEnabled: z.boolean().default(true),
  filters: storedReportFiltersSchema,
}).superRefine((value, ctx) => {
  if (!value.emailEnabled && !value.slackEnabled) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Enable at least one notification channel." });
  if (value.emailEnabled && value.recipients.length === 0) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["recipients"], message: "Add at least one email recipient when email delivery is enabled." });
});
const notificationCenterFilters = z.object({
  query: z.string().trim().min(1).max(140).optional(),
  deliveryId: z.number().int().positive().optional(),
  status: z.enum(["pending", "running", "succeeded", "partial", "failed"]).optional(),
  attemptKind: z.enum(["scheduled", "reconciliation", "manual_test"]).optional(),
  sort: z.enum(["newest", "oldest", "status", "delivery"]).default("newest"),
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

async function activateDeliverySchedule(deliveryId: number, ownerId: number, token: string) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable.");
  const delivery = await requireOwnedReportDelivery(ownerId, deliveryId);
  let taskUid = delivery.scheduleCronTaskUid;
  if (taskUid) await updateHeartbeatJob(taskUid, { cron: delivery.cron, path: "/api/scheduled/report-delivery", enable: true, description: `Send report ${delivery.name}` }, token);
  else taskUid = (await createHeartbeatJob({ name: `research-report-${delivery.id}`, cron: delivery.cron, path: "/api/scheduled/report-delivery", payload: {}, description: `Send report ${delivery.name}` }, token)).taskUid;
  await db.update(reportDeliveries).set({ enabled: true, scheduleCronTaskUid: taskUid }).where(eq(reportDeliveries.id, delivery.id));
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
  trends: protectedProcedure.input(z.object({ days: z.union([z.literal(7), z.literal(30), z.literal(90)]).default(30) }).optional()).query(async ({ ctx, input }) => {
    const db = await getDb();
    const days = input?.days ?? 30;
    if (!db) return { days, sources: [] };
    const since = new Date(Date.now() - (days - 1) * 86_400_000);
    const owned = await db.select().from(sources).where(eq(sources.ownerId, ctx.user.id)).orderBy(desc(sources.updatedAt));
    if (!owned.length) return { days, sources: [] };
    const [runs, events] = await Promise.all([
      db.select({ run: fetchRuns, source: sources }).from(fetchRuns).innerJoin(sources, eq(fetchRuns.sourceId, sources.id)).where(and(eq(sources.ownerId, ctx.user.id), gte(fetchRuns.startedAt, since))).orderBy(fetchRuns.startedAt).limit(5000),
      db.select({ event: changeEvents, source: sources }).from(changeEvents).innerJoin(sources, eq(changeEvents.sourceId, sources.id)).where(and(eq(sources.ownerId, ctx.user.id), gte(changeEvents.detectedAt, since))).orderBy(changeEvents.detectedAt).limit(5000),
    ]);
    const daysList = Array.from({ length: days }, (_, index) => { const value = new Date(since); value.setUTCDate(value.getUTCDate() + index); return value.toISOString().slice(0, 10); });
    const grouped = new Map(owned.map(source => [source.id, { source, buckets: new Map(daysList.map(day => [day, { date: day, material: 0, cosmetic: 0, successful: 0, failed: 0 }])) }]));
    for (const item of runs) { const bucket = grouped.get(item.source.id)?.buckets.get(new Date(item.run.startedAt).toISOString().slice(0, 10)); if (bucket) { if (item.run.status === "succeeded") bucket.successful++; if (item.run.status === "failed") bucket.failed++; } }
    for (const item of events) { const bucket = grouped.get(item.source.id)?.buckets.get(new Date(item.event.detectedAt).toISOString().slice(0, 10)); if (bucket) { if (item.event.classification === "material") bucket.material++; if (item.event.classification === "cosmetic") bucket.cosmetic++; } }
    return { days, sources: Array.from(grouped.values()).map(({ source, buckets }) => { const series = Array.from(buckets.values()); const totalRuns = series.reduce((total, bucket) => total + bucket.successful + bucket.failed, 0); const totalFailures = series.reduce((total, bucket) => total + bucket.failed, 0); return { source, series, totals: { material: series.reduce((total, bucket) => total + bucket.material, 0), cosmetic: series.reduce((total, bucket) => total + bucket.cosmetic, 0), totalRuns, totalFailures, failureRate: totalRuns ? Math.round((totalFailures / totalRuns) * 100) : 0 } }; }) };
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
    templates: router({
      list: protectedProcedure.query(async ({ ctx }) => { const db = await getDb(); return db ? db.select().from(reportTemplates).where(eq(reportTemplates.ownerId, ctx.user.id)).orderBy(desc(reportTemplates.updatedAt)) : []; }),
      create: protectedProcedure.input(z.object({ name: z.string().trim().min(2).max(140), description: z.string().trim().max(1000).optional(), filters: storedReportFiltersSchema })).mutation(async ({ ctx, input }) => { const db = await getDb(); if (!db) throw new Error("Database is unavailable."); const result = await db.insert(reportTemplates).values({ ownerId: ctx.user.id, name: input.name, description: input.description ?? null, filters: input.filters, includeSuppressed: input.filters.includeSuppressed }); return { id: insertId(result) }; }),
      update: protectedProcedure.input(z.object({ id: z.number().int().positive(), patch: z.object({ name: z.string().trim().min(2).max(140).optional(), description: z.string().trim().max(1000).nullable().optional(), filters: storedReportFiltersSchema.optional() }) })).mutation(async ({ ctx, input }) => { const db = await getDb(); if (!db) throw new Error("Database is unavailable."); const template = (await db.select().from(reportTemplates).where(and(eq(reportTemplates.id, input.id), eq(reportTemplates.ownerId, ctx.user.id))).limit(1))[0]; if (!template) throw new Error("Report template not found."); await db.update(reportTemplates).set({ ...input.patch, includeSuppressed: input.patch.filters?.includeSuppressed ?? template.includeSuppressed }).where(eq(reportTemplates.id, template.id)); return { success: true }; }),
      remove: protectedProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => { const db = await getDb(); if (!db) throw new Error("Database is unavailable."); await db.delete(reportTemplates).where(and(eq(reportTemplates.id, input.id), eq(reportTemplates.ownerId, ctx.user.id))); return { success: true }; }),
    }),
    deliveryConfiguration: protectedProcedure.query(() => ({ slack: Boolean(process.env.SLACK_WEBHOOK_URL), resend: Boolean(process.env.RESEND_API_KEY && process.env.RESEND_FROM_EMAIL), gmail: Boolean(process.env.GMAIL_ACCESS_TOKEN), outlook: Boolean(process.env.OUTLOOK_ACCESS_TOKEN) })),
    notificationCenter: protectedProcedure.input(notificationCenterFilters).query(({ ctx, input }) => getOwnerNotificationCenter(ctx.user.id, input)),
    deliveries: router({
      list: protectedProcedure.query(async ({ ctx }) => { const db = await getDb(); if (!db) return []; const deliveries = await db.select().from(reportDeliveries).where(eq(reportDeliveries.ownerId, ctx.user.id)).orderBy(desc(reportDeliveries.updatedAt)); return Promise.all(deliveries.map(async delivery => ({ delivery, attempts: await db.select().from(reportDeliveryAttempts).where(eq(reportDeliveryAttempts.deliveryId, delivery.id)).orderBy(desc(reportDeliveryAttempts.startedAt)).limit(3) }))); }),
      create: protectedProcedure.input(deliveryInput).mutation(async ({ ctx, input }) => { const db = await getDb(); if (!db) throw new Error("Database is unavailable."); if (input.templateId) { const template = (await db.select().from(reportTemplates).where(and(eq(reportTemplates.id, input.templateId), eq(reportTemplates.ownerId, ctx.user.id))).limit(1))[0]; if (!template) throw new Error("Report template not found."); } const result = await db.insert(reportDeliveries).values({ ...input, ownerId: ctx.user.id, templateId: input.templateId ?? null, fallbackProviders: Array.from(new Set(input.fallbackProviders.filter(provider => provider !== input.primaryEmailProvider))), enabled: false }); return { id: insertId(result) }; }),
      update: protectedProcedure.input(z.object({ id: z.number().int().positive(), patch: deliveryInput.partial() })).mutation(async ({ ctx, input }) => { const delivery = await requireOwnedReportDelivery(ctx.user.id, input.id); const db = await getDb(); if (!db) throw new Error("Database is unavailable."); if (delivery.enabled && input.patch.cron && delivery.scheduleCronTaskUid) await updateHeartbeatJob(delivery.scheduleCronTaskUid, { cron: input.patch.cron }, sessionToken(ctx.req.headers)); await db.update(reportDeliveries).set(input.patch).where(eq(reportDeliveries.id, delivery.id)); return { success: true }; }),
      updateNotificationChannels: protectedProcedure.input(z.object({ id: z.number().int().positive(), emailEnabled: z.boolean(), slackEnabled: z.boolean() })).mutation(async ({ ctx, input }) => updateOwnedNotificationChannels(ctx.user.id, input)),
      sendTest: protectedProcedure.input(z.object({ id: z.number().int().positive(), confirmed: z.literal(true) })).mutation(async ({ ctx, input }) => {
        const delivery = await requireOwnedReportDelivery(ctx.user.id, input.id);
        const readiness = deliveryReadiness(delivery);
        if (!readiness.email || !readiness.slack) throw new Error("Connect every selected Slack/email channel before sending a test notification.");
        return deliverTestNotification(delivery);
      }),
      activate: protectedProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => { const delivery = await requireOwnedReportDelivery(ctx.user.id, input.id); const readiness = deliveryReadiness(delivery); if (!readiness.email || !readiness.slack) throw new Error("Connect the selected email provider and any selected Slack channel before activating this schedule."); return { taskUid: await activateDeliverySchedule(input.id, ctx.user.id, sessionToken(ctx.req.headers)) }; }),
      pause: protectedProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => { const delivery = await requireOwnedReportDelivery(ctx.user.id, input.id); if (delivery.scheduleCronTaskUid) await updateHeartbeatJob(delivery.scheduleCronTaskUid, { enable: false }, sessionToken(ctx.req.headers)); const db = await getDb(); if (!db) throw new Error("Database is unavailable."); await db.update(reportDeliveries).set({ enabled: false }).where(eq(reportDeliveries.id, delivery.id)); return { success: true }; }),
      remove: protectedProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => { const delivery = await requireOwnedReportDelivery(ctx.user.id, input.id); if (delivery.scheduleCronTaskUid) await deleteHeartbeatJob(delivery.scheduleCronTaskUid, sessionToken(ctx.req.headers)); const db = await getDb(); if (!db) throw new Error("Database is unavailable."); await db.delete(reportDeliveries).where(eq(reportDeliveries.id, delivery.id)); return { success: true }; }),
    }),
  }),
});
