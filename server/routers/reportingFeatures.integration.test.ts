import { eq } from "drizzle-orm";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { fetchRuns, reportTemplates, sources, users } from "../../drizzle/schema";
import { getDb } from "../db";
import type { TrpcContext } from "../_core/context";
import { monitoringRouter } from "./monitoring";

const describeWithDatabase = process.env.DATABASE_URL ? describe : describe.skip;
function insertId(result: unknown): number { const header = Array.isArray(result) ? result[0] : result; const id = Number((header as { insertId?: number }).insertId ?? 0); if (!id) throw new Error("Fixture insert did not return an identifier."); return id; }

describeWithDatabase("reporting features database integration", () => {
  let db: NonNullable<Awaited<ReturnType<typeof getDb>>>;
  const ids = { users: [] as number[], sources: [] as number[], runs: [] as number[], templates: [] as number[] };
  beforeAll(async () => { const connection = await getDb(); if (!connection) throw new Error("DATABASE_URL is required for this integration test."); db = connection; });
  afterEach(async () => { for (const id of ids.templates.splice(0)) await db.delete(reportTemplates).where(eq(reportTemplates.id, id)); for (const id of ids.runs.splice(0)) await db.delete(fetchRuns).where(eq(fetchRuns.id, id)); for (const id of ids.sources.splice(0)) await db.delete(sources).where(eq(sources.id, id)); for (const id of ids.users.splice(0)) await db.delete(users).where(eq(users.id, id)); });

  it("returns source-specific success and failure trend data and persists reusable report filters", async () => {
    const suffix = `${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
    const ownerId = insertId(await db.insert(users).values({ openId: `reporting-owner-${suffix}`, name: "Reporting owner", role: "user" })); ids.users.push(ownerId);
    const sourceId = insertId(await db.insert(sources).values({ ownerId, name: "Trend source", sourceType: "plain_text", url: `https://example.org/trend-${suffix}`, checkCron: "0 0 9 * * *", rateLimitSeconds: 60, parserConfig: {}, ignoreRules: {}, materialityPolicy: {}, status: "paused", health: "unknown" })); ids.sources.push(sourceId);
    const now = new Date(); const yesterday = new Date(now.getTime() - 86_400_000);
    ids.runs.push(insertId(await db.insert(fetchRuns).values({ sourceId, idempotencyKey: `trend-ok-${suffix}`, initiatedBy: "manual", status: "succeeded", startedAt: now, completedAt: now })), insertId(await db.insert(fetchRuns).values({ sourceId, idempotencyKey: `trend-failed-${suffix}`, initiatedBy: "manual", status: "failed", startedAt: yesterday, completedAt: yesterday })));
    const ctx: TrpcContext = { user: { id: ownerId, openId: `reporting-owner-${suffix}`, name: "Reporting owner", email: null, loginMethod: null, role: "user", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() }, req: { headers: {} } as TrpcContext["req"], res: {} as TrpcContext["res"] };
    const caller = monitoringRouter.createCaller(ctx);
    const trends = await caller.trends({ days: 7 });
    const sourceTrend = trends.sources.find(item => item.source.id === sourceId);
    expect(sourceTrend?.totals.totalRuns).toBe(2); expect(sourceTrend?.totals.totalFailures).toBe(1);
    const template = await caller.reports.templates.create({ name: "Confirmed changes", filters: { sourceId, status: "confirmed", includeSuppressed: false } }); ids.templates.push(template.id);
    const templates = await caller.reports.templates.list();
    expect(templates.some(item => item.id === template.id && item.filters.sourceId === sourceId)).toBe(true);
  });
});
