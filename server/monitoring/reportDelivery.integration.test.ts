import { and, eq } from "drizzle-orm";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { recoveryRecords, reportDeliveries, reportDeliveryAttempts, users } from "../../drizzle/schema";
import { getDb } from "../db";
import { deliverScheduledReport, deliverTestNotification } from "./reportDelivery";

const describeWithDatabase = process.env.DATABASE_URL ? describe : describe.skip;
function insertId(result: unknown) { const header = Array.isArray(result) ? result[0] : result; const id = Number((header as { insertId?: number }).insertId ?? 0); if (!id) throw new Error("Fixture insert did not return an identifier."); return id; }

describeWithDatabase("scheduled report delivery recovery", () => {
  let db: NonNullable<Awaited<ReturnType<typeof getDb>>>; const userIds: number[] = []; const deliveryIds: number[] = []; const recoveryIds: number[] = [];
  const original = { key: process.env.RESEND_API_KEY, from: process.env.RESEND_FROM_EMAIL, fetch: globalThis.fetch };
  beforeAll(async () => { const connection = await getDb(); if (!connection) throw new Error("DATABASE_URL is required for this test."); db = connection; });
  afterEach(async () => { for (const id of recoveryIds.splice(0)) await db.delete(recoveryRecords).where(eq(recoveryRecords.id, id)); for (const id of deliveryIds.splice(0)) await db.delete(reportDeliveries).where(eq(reportDeliveries.id, id)); for (const id of userIds.splice(0)) await db.delete(users).where(eq(users.id, id)); process.env.RESEND_API_KEY = original.key; process.env.RESEND_FROM_EMAIL = original.from; vi.stubGlobal("fetch", original.fetch); });

  it("persists a retry record when the configured email channel cannot accept a scheduled report", async () => {
    const suffix = `${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`; const ownerId = insertId(await db.insert(users).values({ openId: `report-delivery-${suffix}`, name: "Report delivery owner", role: "user" })); userIds.push(ownerId);
    const deliveryId = insertId(await db.insert(reportDeliveries).values({ ownerId, name: "Recovery report", cron: "0 0 9 * * 1", enabled: true, recipients: ["team@example.test"], primaryEmailProvider: "resend", fallbackProviders: [], slackEnabled: false, filters: {} })); deliveryIds.push(deliveryId);
    const delivery = (await db.select().from(reportDeliveries).where(eq(reportDeliveries.id, deliveryId)).limit(1))[0]; if (!delivery) throw new Error("Fixture delivery missing.");
    process.env.RESEND_API_KEY = "test-key"; process.env.RESEND_FROM_EMAIL = "Reports <reports@example.test>"; vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("provider outage", { status: 503 })));
    const result = await deliverScheduledReport(delivery);
    expect(result.pendingRetry).toBe(true);
    const records = await db.select().from(recoveryRecords).where(and(eq(recoveryRecords.reportDeliveryId, deliveryId), eq(recoveryRecords.kind, "report_retry")));
    recoveryIds.push(...records.map(record => record.id));
    expect(records).toHaveLength(1); expect(records[0]?.status).toBe("pending"); expect((records[0]?.details as { deliveredProviders?: string[] }).deliveredProviders).toEqual([]);
  });

  it("records a deliberate manual test without activating the schedule or creating an automatic retry", async () => {
    const suffix = `${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`; const ownerId = insertId(await db.insert(users).values({ openId: `report-test-${suffix}`, name: "Report test owner", role: "user" })); userIds.push(ownerId);
    const deliveryId = insertId(await db.insert(reportDeliveries).values({ ownerId, name: "Test delivery", cron: "0 0 9 * * 1", enabled: false, recipients: ["team@example.test"], primaryEmailProvider: "resend", fallbackProviders: [], emailEnabled: true, slackEnabled: false, filters: {} })); deliveryIds.push(deliveryId);
    const delivery = (await db.select().from(reportDeliveries).where(eq(reportDeliveries.id, deliveryId)).limit(1))[0]; if (!delivery) throw new Error("Fixture delivery missing.");
    process.env.RESEND_API_KEY = "test-key"; process.env.RESEND_FROM_EMAIL = "Reports <reports@example.test>"; vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("accepted", { status: 202 })));
    const result = await deliverTestNotification(delivery);
    expect(result.status).toBe("succeeded");
    const attempts = await db.select().from(reportDeliveryAttempts).where(eq(reportDeliveryAttempts.deliveryId, deliveryId));
    expect(attempts).toHaveLength(1); expect(attempts[0]?.attemptKind).toBe("manual_test");
    const refreshed = (await db.select().from(reportDeliveries).where(eq(reportDeliveries.id, deliveryId)).limit(1))[0]; expect(refreshed?.enabled).toBe(false);
    const records = await db.select().from(recoveryRecords).where(eq(recoveryRecords.reportDeliveryId, deliveryId));
    expect(records).toHaveLength(0);
  });
});
