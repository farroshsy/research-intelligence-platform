import { eq } from "drizzle-orm";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { changeEvents, contentVersions, fetchRuns, notifications, observations, recoveryRecords, sources, users } from "../../drizzle/schema";
import { getDb } from "../db";
import type { TrpcContext } from "../_core/context";
import { monitoringRouter } from "./monitoring";

const describeWithDatabase = process.env.DATABASE_URL ? describe : describe.skip;

function insertId(result: unknown): number {
  const header = Array.isArray(result) ? result[0] : result;
  const id = Number((header as { insertId?: number }).insertId ?? 0);
  if (!id) throw new Error("Test fixture insert did not return an identifier.");
  return id;
}

describeWithDatabase("operations.recoveryList database integration", () => {
  let db: NonNullable<Awaited<ReturnType<typeof getDb>>>;
  const ids = { recovery: [] as number[], notification: [] as number[], event: [] as number[], version: [] as number[], observation: [] as number[], fetch: [] as number[], source: [] as number[], user: [] as number[] };

  beforeAll(async () => {
    const connection = await getDb();
    if (!connection) throw new Error("DATABASE_URL is required for this integration test.");
    db = connection;
  });

  afterEach(async () => {
    for (const id of ids.recovery.splice(0)) await db.delete(recoveryRecords).where(eq(recoveryRecords.id, id));
    for (const id of ids.notification.splice(0)) await db.delete(notifications).where(eq(notifications.id, id));
    for (const id of ids.event.splice(0)) await db.delete(changeEvents).where(eq(changeEvents.id, id));
    for (const id of ids.version.splice(0)) await db.delete(contentVersions).where(eq(contentVersions.id, id));
    for (const id of ids.observation.splice(0)) await db.delete(observations).where(eq(observations.id, id));
    for (const id of ids.fetch.splice(0)) await db.delete(fetchRuns).where(eq(fetchRuns.id, id));
    for (const id of ids.source.splice(0)) await db.delete(sources).where(eq(sources.id, id));
    for (const id of ids.user.splice(0)) await db.delete(users).where(eq(users.id, id));
  });

  async function createNotificationRecovery(ownerId: number, suffix: string) {
    const sourceId = insertId(await db.insert(sources).values({ ownerId, name: `Integration source ${suffix}`, sourceType: "plain_text", url: `https://example.org/${suffix}`, checkCron: "0 0 9 * * *", rateLimitSeconds: 60, parserConfig: {}, ignoreRules: {}, materialityPolicy: {}, status: "paused", health: "unknown" }));
    ids.source.push(sourceId);
    const fetchRunId = insertId(await db.insert(fetchRuns).values({ sourceId, idempotencyKey: `integration-${suffix}`, initiatedBy: "manual", status: "succeeded", completedAt: new Date() }));
    ids.fetch.push(fetchRunId);
    const observationId = insertId(await db.insert(observations).values({ sourceId, fetchRunId, canonicalHash: `hash-${suffix}`, classification: "baseline" }));
    ids.observation.push(observationId);
    const versionId = insertId(await db.insert(contentVersions).values({ sourceId, observationId, versionNumber: 1, contentHash: `hash-${suffix}`, canonicalText: `integration content ${suffix}`, isBaseline: true }));
    ids.version.push(versionId);
    const eventId = insertId(await db.insert(changeEvents).values({ sourceId, observationId, currentVersionId: versionId, classification: "material", status: "confirmed", changedFields: [], structuredDiff: { kind: "integration" }, deterministicScore: 1, suggestedSignificance: "high" }));
    ids.event.push(eventId);
    const notificationId = insertId(await db.insert(notifications).values({ changeEventId: eventId, notificationType: "owner_push", dedupeKey: `integration-alert-${suffix}`, status: "failed" }));
    ids.notification.push(notificationId);
    const recoveryId = insertId(await db.insert(recoveryRecords).values({ sourceId, notificationId, kind: "notification_retry", status: "pending", retryCount: 0, nextAttemptAt: new Date(), lastError: "Provider unavailable", details: { changeEventId: eventId, notificationType: "owner_push" } }));
    ids.recovery.push(recoveryId);
    return { sourceId, notificationId, recoveryId };
  }

  it("returns a notification-retry record only through the recovery queue of the source owner", async () => {
    const suffix = `${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
    const ownerId = insertId(await db.insert(users).values({ openId: `integration-owner-${suffix}`, name: "Integration owner", role: "user" }));
    const otherId = insertId(await db.insert(users).values({ openId: `integration-other-${suffix}`, name: "Integration other", role: "user" }));
    ids.user.push(ownerId, otherId);
    const ownerRecovery = await createNotificationRecovery(ownerId, `owner-${suffix}`);
    const otherRecovery = await createNotificationRecovery(otherId, `other-${suffix}`);
    const ctx: TrpcContext = { user: { id: ownerId, openId: `integration-owner-${suffix}`, name: "Integration owner", email: null, loginMethod: null, role: "user", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() }, req: { headers: {} } as TrpcContext["req"], res: {} as TrpcContext["res"] };

    const result = await monitoringRouter.createCaller(ctx).operations.recoveryList();

    expect(result.some(entry => entry.recovery.id === ownerRecovery.recoveryId && entry.recovery.notificationId === ownerRecovery.notificationId)).toBe(true);
    expect(result.some(entry => entry.recovery.id === otherRecovery.recoveryId || entry.source.ownerId === otherId)).toBe(false);
  });
});
