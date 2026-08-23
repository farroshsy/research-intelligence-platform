import { and, asc, desc, eq, like } from "drizzle-orm";
import { recoveryRecords, reportDeliveries, reportDeliveryAttempts } from "../../../drizzle/schema";
import { getDb } from "../../db";
import { deliveryReadiness } from "../../monitoring/reportDelivery";

export async function requireOwnedReportDelivery(ownerId: number, deliveryId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable.");
  const delivery = (await db.select().from(reportDeliveries).where(and(eq(reportDeliveries.id, deliveryId), eq(reportDeliveries.ownerId, ownerId))).limit(1))[0];
  if (!delivery) throw new Error("Scheduled delivery not found.");
  return delivery;
}

export type NotificationCenterFilters = {
  query?: string;
  deliveryId?: number;
  status?: "pending" | "running" | "succeeded" | "partial" | "failed";
  attemptKind?: "scheduled" | "reconciliation" | "manual_test";
  sort?: "newest" | "oldest" | "status" | "delivery";
};

export async function getOwnerNotificationCenter(ownerId: number, filters: NotificationCenterFilters = {}) {
  const db = await getDb();
  const readiness = {
    slack: Boolean(process.env.SLACK_WEBHOOK_URL),
    resend: Boolean(process.env.RESEND_API_KEY && process.env.RESEND_FROM_EMAIL),
    gmail: Boolean(process.env.GMAIL_ACCESS_TOKEN),
    outlook: Boolean(process.env.OUTLOOK_ACCESS_TOKEN),
  };
  if (!db) return { readiness, summary: { savedDeliveries: 0, activeSchedules: 0, readySchedules: 0, recentAttemptCount: 0, pendingRecoveries: 0 }, deliveries: [], recentAttempts: [], recoveries: [] };

  const deliveries = await db.select().from(reportDeliveries).where(eq(reportDeliveries.ownerId, ownerId)).orderBy(desc(reportDeliveries.updatedAt));
  const attemptConditions = [eq(reportDeliveries.ownerId, ownerId)];
  if (filters.deliveryId) attemptConditions.push(eq(reportDeliveryAttempts.deliveryId, filters.deliveryId));
  if (filters.status) attemptConditions.push(eq(reportDeliveryAttempts.status, filters.status));
  if (filters.attemptKind) attemptConditions.push(eq(reportDeliveryAttempts.attemptKind, filters.attemptKind));
  if (filters.query) attemptConditions.push(like(reportDeliveries.name, `%${filters.query.replace(/[%_]/g, "\\$&")}%`));
  const orderBy = filters.sort === "oldest" ? [asc(reportDeliveryAttempts.startedAt)] : filters.sort === "status" ? [asc(reportDeliveryAttempts.status), desc(reportDeliveryAttempts.startedAt)] : filters.sort === "delivery" ? [asc(reportDeliveries.name), desc(reportDeliveryAttempts.startedAt)] : [desc(reportDeliveryAttempts.startedAt)];
  const attempts = await db.select({ attempt: reportDeliveryAttempts, delivery: reportDeliveries }).from(reportDeliveryAttempts).innerJoin(reportDeliveries, eq(reportDeliveryAttempts.deliveryId, reportDeliveries.id)).where(and(...attemptConditions)).orderBy(...orderBy).limit(200);
  const recoveries = await db.select({ recovery: recoveryRecords, delivery: reportDeliveries }).from(recoveryRecords).innerJoin(reportDeliveries, eq(recoveryRecords.reportDeliveryId, reportDeliveries.id)).where(eq(reportDeliveries.ownerId, ownerId)).orderBy(desc(recoveryRecords.createdAt)).limit(30);
  const configuredDeliveries = deliveries.map(delivery => ({ ...delivery, readiness: deliveryReadiness(delivery) }));
  const readySchedules = configuredDeliveries.filter(delivery => delivery.readiness.email && delivery.readiness.slack).length;
  return {
    readiness,
    summary: {
      savedDeliveries: deliveries.length,
      activeSchedules: deliveries.filter(delivery => delivery.enabled).length,
      readySchedules,
      recentAttemptCount: attempts.length,
      pendingRecoveries: recoveries.filter(({ recovery }) => recovery.status === "pending").length,
    },
    deliveries: configuredDeliveries,
    recentAttempts: attempts,
    recoveries,
  };
}

export async function updateOwnedNotificationChannels(ownerId: number, input: { id: number; emailEnabled: boolean; slackEnabled: boolean }) {
  if (!input.emailEnabled && !input.slackEnabled) throw new Error("Enable at least one notification channel before saving preferences.");
  const delivery = await requireOwnedReportDelivery(ownerId, input.id);
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable.");
  await db.update(reportDeliveries).set({ emailEnabled: input.emailEnabled, slackEnabled: input.slackEnabled }).where(eq(reportDeliveries.id, delivery.id));
  return requireOwnedReportDelivery(ownerId, delivery.id);
}
