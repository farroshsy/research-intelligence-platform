import { eq } from "drizzle-orm";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { alertMatches, alertRules, anomalyFindings, changeAnnotations, changeEvents, contentVersions, fetchRuns, observations, sourceCollections, sourceTags, sources, users } from "../../drizzle/schema";
import { getDb } from "../db";
import type { TrpcContext } from "../_core/context";
import { evaluateMaterialAlertRules } from "../intelligence/alertMatching";
import { intelligenceRouter } from "./intelligence";

const describeWithDatabase = process.env.DATABASE_URL ? describe : describe.skip;

function insertId(result: unknown) {
  const header = Array.isArray(result) ? result[0] : result;
  const id = Number((header as { insertId?: number }).insertId ?? 0);
  if (!id) throw new Error("Test fixture insert did not return an identifier.");
  return id;
}

describeWithDatabase("intelligence alert-rule integration", () => {
  let db: NonNullable<Awaited<ReturnType<typeof getDb>>>;
  const ids = { match: [] as number[], rule: [] as number[], annotation: [] as number[], anomaly: [] as number[], event: [] as number[], version: [] as number[], observation: [] as number[], run: [] as number[], source: [] as number[], collection: [] as number[], user: [] as number[] };

  beforeAll(async () => { const connection = await getDb(); if (!connection) throw new Error("DATABASE_URL is required for this integration test."); db = connection; });
  afterEach(async () => { for (const id of ids.match.splice(0)) await db.delete(alertMatches).where(eq(alertMatches.id, id)); for (const id of ids.rule.splice(0)) await db.delete(alertRules).where(eq(alertRules.id, id)); for (const id of ids.annotation.splice(0)) await db.delete(changeAnnotations).where(eq(changeAnnotations.id, id)); for (const id of ids.anomaly.splice(0)) await db.delete(anomalyFindings).where(eq(anomalyFindings.id, id)); for (const id of ids.event.splice(0)) await db.delete(changeEvents).where(eq(changeEvents.id, id)); for (const id of ids.version.splice(0)) await db.delete(contentVersions).where(eq(contentVersions.id, id)); for (const id of ids.observation.splice(0)) await db.delete(observations).where(eq(observations.id, id)); for (const id of ids.run.splice(0)) await db.delete(fetchRuns).where(eq(fetchRuns.id, id)); for (const id of ids.source.splice(0)) await db.delete(sources).where(eq(sources.id, id)); for (const id of ids.collection.splice(0)) await db.delete(sourceCollections).where(eq(sourceCollections.id, id)); for (const id of ids.user.splice(0)) await db.delete(users).where(eq(users.id, id)); });

  function ctxFor(id: number, openId: string): TrpcContext { return { user: { id, openId, name: "Rule owner", email: null, loginMethod: null, role: "user", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() }, req: { headers: {} } as TrpcContext["req"], res: {} as TrpcContext["res"] }; }
  async function materialEvent(ownerId: number, suffix: string) { const sourceId = insertId(await db.insert(sources).values({ ownerId, name: `Governance source ${suffix}`, sourceType: "plain_text", url: `https://www.example.com/governance-${suffix}`, checkCron: "0 0 9 * * *", parserConfig: {}, ignoreRules: {}, materialityPolicy: {} })); ids.source.push(sourceId); const runId = insertId(await db.insert(fetchRuns).values({ sourceId, idempotencyKey: `governance-run-${suffix}`, initiatedBy: "test", status: "succeeded" })); ids.run.push(runId); const observationId = insertId(await db.insert(observations).values({ sourceId, fetchRunId: runId, canonicalHash: `governance-hash-${suffix}`, classification: "material" })); ids.observation.push(observationId); const versionId = insertId(await db.insert(contentVersions).values({ sourceId, observationId, versionNumber: 1, contentHash: `governance-version-${suffix}`, canonicalText: "A material deadline amendment." })); ids.version.push(versionId); const eventId = insertId(await db.insert(changeEvents).values({ sourceId, observationId, currentVersionId: versionId, classification: "material", changedFields: ["deadline"], structuredDiff: { deadline: "amended" }, deterministicScore: 0.9, suggestedSignificance: "high" })); ids.event.push(eventId); return { sourceId, eventId }; }

  it("allows an owner to update scoped alert settings and delete a rule while rejecting another owner", async () => {
    const suffix = `${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
    const ownerId = insertId(await db.insert(users).values({ openId: `rule-owner-${suffix}`, name: "Rule owner", role: "user" }));
    const otherId = insertId(await db.insert(users).values({ openId: `rule-other-${suffix}`, name: "Rule other", role: "user" }));
    ids.user.push(ownerId, otherId);
    const owner = intelligenceRouter.createCaller(ctxFor(ownerId, `rule-owner-${suffix}`));
    const other = intelligenceRouter.createCaller(ctxFor(otherId, `rule-other-${suffix}`));
    const otherCollectionId = insertId(await db.insert(sourceCollections).values({ ownerId: otherId, name: `Other collection ${suffix}`, color: "teal" }));
    ids.collection.push(otherCollectionId);
    await expect(owner.alerts.create({ name: "Cross-owner scope", collectionId: otherCollectionId, keywords: [], minSignificance: "medium", severity: "medium", cooldownMinutes: 60, ownerAlertEligible: false })).rejects.toThrow("Collection not found");
    const created = await owner.alerts.create({ name: "Policy amendment", tag: "policy", keywords: ["amendment"], minSignificance: "high", severity: "critical", cooldownMinutes: 180, ownerAlertEligible: true });
    ids.rule.push(created.id);

    await owner.alerts.update({ id: created.id, patch: { tag: "priority", keywords: ["deadline"], minSignificance: "medium", cooldownMinutes: 90, ownerAlertEligible: false, enabled: false } });
    const updated = (await db.select().from(alertRules).where(eq(alertRules.id, created.id)).limit(1))[0];
    expect(updated).toMatchObject({ tag: "priority", keywords: ["deadline"], minSignificance: "medium", cooldownMinutes: 90, ownerAlertEligible: false, enabled: false });
    await expect(other.alerts.update({ id: created.id, patch: { name: "Unauthorized" } })).rejects.toThrow("Alert rule not found");
    await expect(owner.alerts.update({ id: created.id, patch: { collectionId: otherCollectionId } })).rejects.toThrow("Collection not found");

    await owner.alerts.remove({ id: created.id });
    ids.rule.splice(ids.rule.indexOf(created.id), 1);
    expect((await db.select().from(alertRules).where(eq(alertRules.id, created.id)).limit(1))[0]).toBeUndefined();
  });

  it("matches a scoped material alert once within its cooldown and creates batch sources paused", async () => {
    const suffix = `${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
    const ownerId = insertId(await db.insert(users).values({ openId: `matching-owner-${suffix}`, name: "Matching owner", role: "user" }));
    ids.user.push(ownerId);
    const owner = intelligenceRouter.createCaller(ctxFor(ownerId, `matching-owner-${suffix}`));
    const { sourceId, eventId } = await materialEvent(ownerId, suffix);
    await db.insert(sourceTags).values({ sourceId, tag: "policy" });
    const rule = await owner.alerts.create({ name: "Deadline policy", tag: "policy", keywords: ["deadline"], minSignificance: "medium", severity: "high", cooldownMinutes: 60, ownerAlertEligible: false });
    ids.rule.push(rule.id);
    expect(await evaluateMaterialAlertRules({ ownerId, sourceId, changeEventId: eventId, suggestedSignificance: "high", changedFields: ["deadline"], structuredDiff: { deadline: "amended" } })).toBe(1);
    expect(await evaluateMaterialAlertRules({ ownerId, sourceId, changeEventId: eventId, suggestedSignificance: "high", changedFields: ["deadline"], structuredDiff: { deadline: "amended" } })).toBe(0);
    const match = (await db.select().from(alertMatches).where(eq(alertMatches.alertRuleId, rule.id)).limit(1))[0];
    if (match) ids.match.push(match.id);
    expect(match?.changeEventId).toBe(eventId);

    const batch = await owner.organization.batchImport({ rows: [{ name: "Paused intake", url: `https://www.example.com/intake-${suffix}`, sourceType: "html_page", checkCron: "0 0 9 * * *", steward: "Researcher" }] });
    ids.source.push(...batch.created);
    const imported = (await db.select().from(sources).where(eq(sources.id, batch.created[0]!)).limit(1))[0];
    expect(imported?.status).toBe("paused");
  });

  it("keeps annotations and anomaly triage under the owning reviewer’s control", async () => {
    const suffix = `${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
    const ownerId = insertId(await db.insert(users).values({ openId: `annotation-owner-${suffix}`, name: "Annotation owner", role: "user" }));
    const otherId = insertId(await db.insert(users).values({ openId: `annotation-other-${suffix}`, name: "Annotation other", role: "user" }));
    ids.user.push(ownerId, otherId);
    const owner = intelligenceRouter.createCaller(ctxFor(ownerId, `annotation-owner-${suffix}`)); const other = intelligenceRouter.createCaller(ctxFor(otherId, `annotation-other-${suffix}`));
    const { sourceId, eventId } = await materialEvent(ownerId, `annotation-${suffix}`);
    const annotation = await owner.changes.annotate({ changeEventId: eventId, body: "Reviewer context", category: "follow_up" }); ids.annotation.push(annotation.id);
    expect(await owner.changes.annotations({ changeEventId: eventId })).toHaveLength(1);
    await expect(other.changes.annotate({ changeEventId: eventId, body: "Unauthorized", category: "note" })).rejects.toThrow("Change event not found");
    const anomalyId = insertId(await db.insert(anomalyFindings).values({ ownerId, sourceId, kind: "change_spike", observedValue: 3, baselineValue: 1, thresholdValue: 2, explanation: "Deterministic test finding." })); ids.anomaly.push(anomalyId);
    await owner.anomalies.triage({ id: anomalyId, status: "acknowledged" });
    expect((await db.select().from(anomalyFindings).where(eq(anomalyFindings.id, anomalyId)).limit(1))[0]?.status).toBe("acknowledged");
    await expect(other.anomalies.triage({ id: anomalyId, status: "dismissed" })).rejects.toThrow("Anomaly finding not found");
  });
});
