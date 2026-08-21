import { eq } from "drizzle-orm";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { changeEvents, contentVersions, fetchRuns, observations, sources, users } from "../../drizzle/schema";
import { getDb } from "../db";

const describeWithDatabase = process.env.DATABASE_URL ? describe : describe.skip;

function insertId(result: unknown): number {
  const header = Array.isArray(result) ? result[0] : result;
  const id = Number((header as { insertId?: number }).insertId ?? 0);
  if (!id) throw new Error("Test fixture insert did not return an identifier.");
  return id;
}

describeWithDatabase("monitoring idempotency database integration", () => {
  let db: NonNullable<Awaited<ReturnType<typeof getDb>>>;
  const ids = { event: [] as number[], version: [] as number[], observation: [] as number[], fetch: [] as number[], source: [] as number[], user: [] as number[] };

  beforeAll(async () => {
    const connection = await getDb();
    if (!connection) throw new Error("DATABASE_URL is required for this integration test.");
    db = connection;
  });

  afterEach(async () => {
    for (const id of ids.event.splice(0)) await db.delete(changeEvents).where(eq(changeEvents.id, id));
    for (const id of ids.version.splice(0)) await db.delete(contentVersions).where(eq(contentVersions.id, id));
    for (const id of ids.observation.splice(0)) await db.delete(observations).where(eq(observations.id, id));
    for (const id of ids.fetch.splice(0)) await db.delete(fetchRuns).where(eq(fetchRuns.id, id));
    for (const id of ids.source.splice(0)) await db.delete(sources).where(eq(sources.id, id));
    for (const id of ids.user.splice(0)) await db.delete(users).where(eq(users.id, id));
  });

  it("rejects duplicate scheduled execution keys and duplicate change events for one observation", async () => {
    const suffix = `${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
    const ownerId = insertId(await db.insert(users).values({ openId: `idempotency-owner-${suffix}`, name: "Idempotency owner", role: "user" }));
    ids.user.push(ownerId);
    const sourceId = insertId(await db.insert(sources).values({ ownerId, name: "Idempotency source", sourceType: "plain_text", url: `https://example.org/idempotency-${suffix}`, checkCron: "0 0 9 * * *", rateLimitSeconds: 60, parserConfig: {}, ignoreRules: {}, materialityPolicy: {}, status: "paused", health: "unknown" }));
    ids.source.push(sourceId);
    const executionKey = `scheduled:${sourceId}:task:${suffix}`;
    const fetchRunId = insertId(await db.insert(fetchRuns).values({ sourceId, idempotencyKey: executionKey, initiatedBy: "scheduled", status: "succeeded", completedAt: new Date() }));
    ids.fetch.push(fetchRunId);

    await expect(db.insert(fetchRuns).values({ sourceId, idempotencyKey: executionKey, initiatedBy: "scheduled", status: "running" })).rejects.toThrow();
    const matchingRuns = await db.select().from(fetchRuns).where(eq(fetchRuns.idempotencyKey, executionKey));
    expect(matchingRuns).toHaveLength(1);

    const observationId = insertId(await db.insert(observations).values({ sourceId, fetchRunId, canonicalHash: `hash-${suffix}`, classification: "material" }));
    ids.observation.push(observationId);
    const versionId = insertId(await db.insert(contentVersions).values({ sourceId, observationId, versionNumber: 1, contentHash: `hash-${suffix}`, canonicalText: `content-${suffix}`, isBaseline: false }));
    ids.version.push(versionId);
    const eventValues = { sourceId, observationId, currentVersionId: versionId, classification: "material" as const, status: "pending_review" as const, changedFields: [], structuredDiff: { kind: "integration" }, deterministicScore: 1, suggestedSignificance: "high" as const };
    const eventId = insertId(await db.insert(changeEvents).values(eventValues));
    ids.event.push(eventId);

    await expect(db.insert(changeEvents).values(eventValues)).rejects.toThrow();
    const matchingEvents = await db.select().from(changeEvents).where(eq(changeEvents.observationId, observationId));
    expect(matchingEvents).toHaveLength(1);
  });
});
