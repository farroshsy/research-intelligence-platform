import { eq } from "drizzle-orm";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { advisoryExplanations, changeEvents, contentVersions, fetchRuns, observations, sources, users } from "../../drizzle/schema";
import { getDb } from "../db";

const { mockInvokeLLM } = vi.hoisted(() => ({ mockInvokeLLM: vi.fn() }));
vi.mock("../_core/llm", () => ({ invokeLLM: mockInvokeLLM }));

import { ADVISORY_MODEL, createAdvisoryExplanation } from "./service";

const describeWithDatabase = process.env.DATABASE_URL ? describe : describe.skip;

function insertId(result: unknown): number {
  const header = Array.isArray(result) ? result[0] : result;
  const id = Number((header as { insertId?: number }).insertId ?? 0);
  if (!id) throw new Error("Test fixture insert did not return an identifier.");
  return id;
}

describeWithDatabase("advisory explanation persistence integration", () => {
  let db: NonNullable<Awaited<ReturnType<typeof getDb>>>;
  const ids = { advisory: [] as number[], event: [] as number[], version: [] as number[], observation: [] as number[], fetch: [] as number[], source: [] as number[], user: [] as number[] };

  beforeAll(async () => {
    const connection = await getDb();
    if (!connection) throw new Error("DATABASE_URL is required for this integration test.");
    db = connection;
  });

  afterEach(async () => {
    vi.resetAllMocks();
    for (const id of ids.advisory.splice(0)) await db.delete(advisoryExplanations).where(eq(advisoryExplanations.id, id));
    for (const id of ids.event.splice(0)) await db.delete(changeEvents).where(eq(changeEvents.id, id));
    for (const id of ids.version.splice(0)) await db.delete(contentVersions).where(eq(contentVersions.id, id));
    for (const id of ids.observation.splice(0)) await db.delete(observations).where(eq(observations.id, id));
    for (const id of ids.fetch.splice(0)) await db.delete(fetchRuns).where(eq(fetchRuns.id, id));
    for (const id of ids.source.splice(0)) await db.delete(sources).where(eq(sources.id, id));
    for (const id of ids.user.splice(0)) await db.delete(users).where(eq(users.id, id));
  });

  it("persists a schema-valid advisory record and marks the material event ready", async () => {
    const suffix = `${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
    const ownerId = insertId(await db.insert(users).values({ openId: `advisory-owner-${suffix}`, name: "Advisory owner", role: "user" }));
    ids.user.push(ownerId);
    const sourceId = insertId(await db.insert(sources).values({ ownerId, name: "Advisory source", sourceType: "plain_text", url: `https://example.org/advisory-${suffix}`, checkCron: "0 0 9 * * *", rateLimitSeconds: 60, parserConfig: {}, ignoreRules: {}, materialityPolicy: {}, status: "paused", health: "unknown" }));
    ids.source.push(sourceId);
    const fetchRunId = insertId(await db.insert(fetchRuns).values({ sourceId, idempotencyKey: `advisory-${suffix}`, initiatedBy: "manual", status: "succeeded", completedAt: new Date() }));
    ids.fetch.push(fetchRunId);
    const observationId = insertId(await db.insert(observations).values({ sourceId, fetchRunId, canonicalHash: `advisory-hash-${suffix}`, classification: "material" }));
    ids.observation.push(observationId);
    const versionId = insertId(await db.insert(contentVersions).values({ sourceId, observationId, versionNumber: 1, contentHash: `advisory-hash-${suffix}`, canonicalText: `advisory content ${suffix}`, isBaseline: false }));
    ids.version.push(versionId);
    const eventId = insertId(await db.insert(changeEvents).values({ sourceId, observationId, currentVersionId: versionId, classification: "material", status: "pending_review", changedFields: ["$.policy"], structuredDiff: { kind: "integration" }, deterministicScore: 1, suggestedSignificance: "high" }));
    ids.event.push(eventId);
    mockInvokeLLM.mockResolvedValue({ choices: [{ message: { content: JSON.stringify({ summary: "A deadline changed.", whyItMayMatter: "A reviewer should assess the timeline.", suggestedSignificance: "high", confidence: 0.8, caveats: ["Source context is limited."] }) } }] });

    const output = await createAdvisoryExplanation(eventId, ownerId);
    const records = await db.select().from(advisoryExplanations).where(eq(advisoryExplanations.changeEventId, eventId));
    const updatedEvent = (await db.select().from(changeEvents).where(eq(changeEvents.id, eventId)).limit(1))[0];
    if (records[0]) ids.advisory.push(records[0].id);

    expect(output.suggestedSignificance).toBe("high");
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ model: ADVISORY_MODEL, schemaValid: true, confidence: 0.8 });
    expect(updatedEvent?.explanationStatus).toBe("ready");
  });
});
