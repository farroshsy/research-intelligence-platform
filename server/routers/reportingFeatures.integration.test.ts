import { eq } from "drizzle-orm";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { fetchRuns, recoveryRecords, reportDeliveries, reportDeliveryAttempts, reportTemplates, sources, users } from "../../drizzle/schema";
import { getDb } from "../db";
import type { TrpcContext } from "../_core/context";
import { monitoringRouter } from "./monitoring";

const describeWithDatabase = process.env.DATABASE_URL ? describe : describe.skip;
function insertId(result: unknown): number { const header = Array.isArray(result) ? result[0] : result; const id = Number((header as { insertId?: number }).insertId ?? 0); if (!id) throw new Error("Fixture insert did not return an identifier."); return id; }

describeWithDatabase("reporting features database integration", () => {
  let db: NonNullable<Awaited<ReturnType<typeof getDb>>>;
  const ids = { users: [] as number[], sources: [] as number[], runs: [] as number[], templates: [] as number[], deliveries: [] as number[], attempts: [] as number[], recoveries: [] as number[] };
  beforeAll(async () => { const connection = await getDb(); if (!connection) throw new Error("DATABASE_URL is required for this integration test."); db = connection; });
  afterEach(async () => { for (const id of ids.recoveries.splice(0)) await db.delete(recoveryRecords).where(eq(recoveryRecords.id, id)); for (const id of ids.attempts.splice(0)) await db.delete(reportDeliveryAttempts).where(eq(reportDeliveryAttempts.id, id)); for (const id of ids.deliveries.splice(0)) await db.delete(reportDeliveries).where(eq(reportDeliveries.id, id)); for (const id of ids.templates.splice(0)) await db.delete(reportTemplates).where(eq(reportTemplates.id, id)); for (const id of ids.runs.splice(0)) await db.delete(fetchRuns).where(eq(fetchRuns.id, id)); for (const id of ids.sources.splice(0)) await db.delete(sources).where(eq(sources.id, id)); for (const id of ids.users.splice(0)) await db.delete(users).where(eq(users.id, id)); });

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

  it("keeps notification history and channel preferences owner-scoped without activating schedules", async () => {
    const suffix = `${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
    const ownerId = insertId(await db.insert(users).values({ openId: `notification-owner-${suffix}`, name: "Notification owner", role: "user" })); ids.users.push(ownerId);
    const otherOwnerId = insertId(await db.insert(users).values({ openId: `notification-other-${suffix}`, name: "Other owner", role: "user" })); ids.users.push(otherOwnerId);
    const deliveryId = insertId(await db.insert(reportDeliveries).values({ ownerId, name: "Owner delivery", cron: "0 0 9 * * 1", enabled: false, recipients: ["owner@example.test"], primaryEmailProvider: "resend", fallbackProviders: [], emailEnabled: true, slackEnabled: true, filters: {} })); ids.deliveries.push(deliveryId);
    const otherDeliveryId = insertId(await db.insert(reportDeliveries).values({ ownerId: otherOwnerId, name: "Other delivery", cron: "0 0 9 * * 1", enabled: false, recipients: ["other@example.test"], primaryEmailProvider: "resend", fallbackProviders: [], emailEnabled: true, slackEnabled: true, filters: {} })); ids.deliveries.push(otherDeliveryId);
    ids.attempts.push(insertId(await db.insert(reportDeliveryAttempts).values({ deliveryId, attemptKind: "manual_test", status: "failed", providersAttempted: ["slack"], deliveredProviders: [], reportSummary: {}, errorSummary: "Webhook unavailable" })), insertId(await db.insert(reportDeliveryAttempts).values({ deliveryId: otherDeliveryId, status: "succeeded", providersAttempted: ["resend"], deliveredProviders: ["resend"], reportSummary: {} })));
    ids.recoveries.push(insertId(await db.insert(recoveryRecords).values({ reportDeliveryId: deliveryId, kind: "report_retry", status: "pending", retryCount: 0, nextAttemptAt: new Date(), details: {} })));
    const ctx: TrpcContext = { user: { id: ownerId, openId: `notification-owner-${suffix}`, name: "Notification owner", email: null, loginMethod: null, role: "user", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() }, req: { headers: {} } as TrpcContext["req"], res: {} as TrpcContext["res"] };
    const caller = monitoringRouter.createCaller(ctx);
    const center = await caller.reports.notificationCenter();
    expect(center.deliveries.map(item => item.id)).toEqual([deliveryId]);
    expect(center.recentAttempts.map(item => item.attempt.deliveryId)).toEqual([deliveryId]);
    expect(center.recentAttempts[0]?.attempt.attemptKind).toBe("manual_test");
    expect(center.recoveries.map(item => item.recovery.reportDeliveryId)).toEqual([deliveryId]);
    const matchingManualTests = await caller.reports.notificationCenter({ attemptKind: "manual_test", status: "failed", sort: "oldest" });
    expect(matchingManualTests.recentAttempts.map(item => item.attempt.id)).toEqual([center.recentAttempts[0]?.attempt.id]);
    const noScheduledAttempts = await caller.reports.notificationCenter({ attemptKind: "scheduled", sort: "newest" });
    expect(noScheduledAttempts.recentAttempts).toHaveLength(0);
    const updated = await caller.reports.deliveries.updateNotificationChannels({ id: deliveryId, emailEnabled: false, slackEnabled: true });
    expect(updated.emailEnabled).toBe(false); expect(updated.slackEnabled).toBe(true); expect(updated.enabled).toBe(false);
    await expect(caller.reports.deliveries.updateNotificationChannels({ id: deliveryId, emailEnabled: false, slackEnabled: false })).rejects.toThrow("Enable at least one notification channel");
  });
});
