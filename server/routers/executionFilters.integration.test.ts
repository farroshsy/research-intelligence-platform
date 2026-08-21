import { eq } from "drizzle-orm";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { fetchRuns, sources, users } from "../../drizzle/schema";
import { getDb } from "../db";
import type { TrpcContext } from "../_core/context";
import { monitoringRouter } from "./monitoring";

const describeWithDatabase = process.env.DATABASE_URL ? describe : describe.skip;
function insertId(result: unknown): number { const header = Array.isArray(result) ? result[0] : result; const id = Number((header as { insertId?: number }).insertId ?? 0); if (!id) throw new Error("Fixture insert did not return an identifier."); return id; }

describeWithDatabase("operations.executionList database integration", () => {
  let db: NonNullable<Awaited<ReturnType<typeof getDb>>>;
  const ids = { runs: [] as number[], sources: [] as number[], users: [] as number[] };
  beforeAll(async () => { const connection = await getDb(); if (!connection) throw new Error("DATABASE_URL is required for this integration test."); db = connection; });
  afterEach(async () => { for (const id of ids.runs.splice(0)) await db.delete(fetchRuns).where(eq(fetchRuns.id, id)); for (const id of ids.sources.splice(0)) await db.delete(sources).where(eq(sources.id, id)); for (const id of ids.users.splice(0)) await db.delete(users).where(eq(users.id, id)); });

  it("returns only matching owner runs for source, keyword, status, and UTC date filters", async () => {
    const suffix = `${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
    const ownerId = insertId(await db.insert(users).values({ openId: `execution-owner-${suffix}`, name: "Execution owner", role: "user" })); ids.users.push(ownerId);
    const alphaSourceId = insertId(await db.insert(sources).values({ ownerId, name: "Alpha public notices", sourceType: "plain_text", url: `https://example.org/alpha-${suffix}`, checkCron: "0 0 9 * * *", rateLimitSeconds: 60, parserConfig: {}, ignoreRules: {}, materialityPolicy: {}, status: "paused", health: "unknown" }));
    const betaSourceId = insertId(await db.insert(sources).values({ ownerId, name: "Beta public notices", sourceType: "plain_text", url: `https://example.org/beta-${suffix}`, checkCron: "0 0 9 * * *", rateLimitSeconds: 60, parserConfig: {}, ignoreRules: {}, materialityPolicy: {}, status: "paused", health: "unknown" })); ids.sources.push(alphaSourceId, betaSourceId);
    const alphaRunId = insertId(await db.insert(fetchRuns).values({ sourceId: alphaSourceId, idempotencyKey: `alpha-${suffix}`, initiatedBy: "manual", status: "succeeded", startedAt: new Date("2026-08-20T10:00:00Z"), completedAt: new Date("2026-08-20T10:01:00Z") }));
    const betaRunId = insertId(await db.insert(fetchRuns).values({ sourceId: betaSourceId, idempotencyKey: `beta-${suffix}`, initiatedBy: "scheduled", status: "failed", startedAt: new Date("2026-08-21T10:00:00Z"), completedAt: new Date("2026-08-21T10:01:00Z") })); ids.runs.push(alphaRunId, betaRunId);
    const ctx: TrpcContext = { user: { id: ownerId, openId: `execution-owner-${suffix}`, name: "Execution owner", email: null, loginMethod: null, role: "user", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() }, req: { headers: {} } as TrpcContext["req"], res: {} as TrpcContext["res"] };
    const filtered = await monitoringRouter.createCaller(ctx).operations.executionList({ query: "alpha", sourceId: alphaSourceId, status: "succeeded", initiatedBy: "manual", from: new Date("2026-08-20T00:00:00Z"), to: new Date("2026-08-20T23:59:59Z") });
    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.run.id).toBe(alphaRunId);
    expect(filtered.some(item => item.run.id === betaRunId)).toBe(false);
  });
});
