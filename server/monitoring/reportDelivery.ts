import { and, desc, eq, gte, lte, sql } from "drizzle-orm";
import { changeEvents, recoveryRecords, reportDeliveries, reportDeliveryAttempts, sources } from "../../drizzle/schema";
import { getDb } from "../db";

type Provider = "resend" | "gmail" | "outlook";
type Delivery = typeof reportDeliveries.$inferSelect;

export function isProviderConfigured(provider: Provider): boolean {
  if (provider === "resend") return Boolean(process.env.RESEND_API_KEY && process.env.RESEND_FROM_EMAIL);
  if (provider === "gmail") return Boolean(process.env.GMAIL_ACCESS_TOKEN);
  return Boolean(process.env.OUTLOOK_ACCESS_TOKEN);
}

export function deliveryReadiness(delivery: Pick<Delivery, "primaryEmailProvider" | "emailEnabled" | "slackEnabled">) {
  return { email: !delivery.emailEnabled || isProviderConfigured(delivery.primaryEmailProvider), slack: !delivery.slackEnabled || Boolean(process.env.SLACK_WEBHOOK_URL) };
}

export function orderedEmailProviders(primary: Provider, fallbacks: string[]): Provider[] {
  return Array.from(new Set([primary, ...fallbacks.filter((value): value is Provider => value === "resend" || value === "gmail" || value === "outlook")]));
}

function escapeHtml(value: string) { return value.replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[character] ?? character); }
function reportText(records: { event: typeof changeEvents.$inferSelect; source: typeof sources.$inferSelect }[]) { return records.slice(0, 25).map(({ event, source }) => `• ${source.name}: ${event.classification} (${event.suggestedSignificance}) — ${event.changedFields.join(", ") || "fields not specified"}`).join("\n"); }

async function compiledDeliveryReport(delivery: Delivery) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable.");
  const filters = delivery.filters as { sourceId?: number; classification?: "baseline" | "no_change" | "cosmetic" | "material"; status?: "pending_review" | "confirmed" | "not_material" | "suppressed"; includeSuppressed?: boolean };
  const conditions = [eq(sources.ownerId, delivery.ownerId)];
  if (filters.sourceId) conditions.push(eq(changeEvents.sourceId, filters.sourceId));
  if (filters.classification) conditions.push(eq(changeEvents.classification, filters.classification));
  if (filters.status) conditions.push(eq(changeEvents.status, filters.status));
  if (!filters.includeSuppressed && !filters.status) conditions.push(sql`${changeEvents.status} <> 'suppressed'`);
  const records = await db.select({ event: changeEvents, source: sources }).from(changeEvents).innerJoin(sources, eq(changeEvents.sourceId, sources.id)).where(and(...conditions)).orderBy(desc(changeEvents.detectedAt)).limit(100);
  const material = records.filter(record => record.event.classification === "material").length;
  return { records, summary: { generatedAt: new Date().toISOString(), recordCount: records.length, materialCount: material, filters } };
}

async function sendResend(to: string[], subject: string, html: string, idempotencyKey: string) {
  const response = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json", "Idempotency-Key": idempotencyKey }, body: JSON.stringify({ from: process.env.RESEND_FROM_EMAIL, to, subject, html, text: html.replace(/<[^>]+>/g, " ") }) });
  if (!response.ok) throw new Error(`Resend delivery failed: ${response.status} ${await response.text()}`);
}

async function sendGmail(to: string[], subject: string, html: string) {
  const mime = [`To: ${to.join(", ")}`, `Subject: ${subject}`, "MIME-Version: 1.0", 'Content-Type: text/html; charset="UTF-8"', "", html].join("\r\n");
  const raw = Buffer.from(mime).toString("base64url");
  const response = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", { method: "POST", headers: { Authorization: `Bearer ${process.env.GMAIL_ACCESS_TOKEN}`, "Content-Type": "application/json" }, body: JSON.stringify({ raw }) });
  if (!response.ok) throw new Error(`Gmail delivery failed: ${response.status} ${await response.text()}`);
}

async function sendOutlook(to: string[], subject: string, html: string) {
  const response = await fetch("https://graph.microsoft.com/v1.0/me/sendMail", { method: "POST", headers: { Authorization: `Bearer ${process.env.OUTLOOK_ACCESS_TOKEN}`, "Content-Type": "application/json" }, body: JSON.stringify({ message: { subject, body: { contentType: "HTML", content: html }, toRecipients: to.map(address => ({ emailAddress: { address } })) }, saveToSentItems: true }) });
  if (!response.ok) throw new Error(`Outlook delivery failed: ${response.status} ${await response.text()}`);
}

async function sendSlack(subject: string, summary: string) {
  const response = await fetch(process.env.SLACK_WEBHOOK_URL!, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: `${subject}\n${summary || "No detected changes matched this report."}` }) });
  if (!response.ok) throw new Error(`Slack delivery failed: ${response.status} ${await response.text()}`);
}

export async function deliverScheduledReport(delivery: Delivery, options: { alreadyDelivered?: string[]; createRetry?: boolean } = {}) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable.");
  if (!delivery.enabled) return { ok: true, skipped: "paused" as const };
  const readiness = deliveryReadiness(delivery);
  if (!readiness.email || !readiness.slack) return { ok: false, retryable: false, error: "Delivery credentials are not ready for the selected email provider or Slack channel." };
  const report = await compiledDeliveryReport(delivery);
  const subject = `Research Intelligence · ${delivery.name} · ${report.summary.recordCount} changes`;
  const plain = reportText(report.records);
  const html = `<h2>${escapeHtml(subject)}</h2><p>Material changes: <strong>${report.summary.materialCount}</strong></p><pre>${escapeHtml(plain || "No detected changes matched this report.")}</pre>`;
  const insert = await db.insert(reportDeliveryAttempts).values({ deliveryId: delivery.id, status: "running", providersAttempted: [], deliveredProviders: [], reportSummary: report.summary });
  const attemptId = Number((Array.isArray(insert) ? insert[0] : insert as { insertId?: number }).insertId ?? 0);
  const attempted: string[] = []; const delivered: string[] = Array.from(new Set(options.alreadyDelivered ?? [])); const errors: string[] = [];
  if (delivery.slackEnabled && !delivered.includes("slack")) { attempted.push("slack"); try { await sendSlack(subject, plain); delivered.push("slack"); } catch (error) { errors.push(error instanceof Error ? error.message : String(error)); } }
  if (delivery.emailEnabled) {
    const providerOrder = orderedEmailProviders(delivery.primaryEmailProvider, delivery.fallbackProviders as string[]);
    for (const provider of providerOrder) {
      if (delivered.includes(provider)) break;
      attempted.push(provider);
      if (!isProviderConfigured(provider)) { errors.push(`${provider} is not configured.`); continue; }
      try {
        if (provider === "resend") await sendResend(delivery.recipients, subject, html, `research-delivery-${delivery.id}-${new Date().toISOString().slice(0, 16)}`);
        else if (provider === "gmail") await sendGmail(delivery.recipients, subject, html);
        else await sendOutlook(delivery.recipients, subject, html);
        delivered.push(provider);
        break;
      } catch (error) { errors.push(error instanceof Error ? error.message : String(error)); }
    }
  }
  const emailDelivered = !delivery.emailEnabled || delivered.some(item => item === "resend" || item === "gmail" || item === "outlook");
  const slackDelivered = !delivery.slackEnabled || delivered.includes("slack");
  const status = emailDelivered && slackDelivered ? "succeeded" : delivered.length ? "partial" : "failed";
  const retryNeeded = !emailDelivered || !slackDelivered;
  await db.update(reportDeliveryAttempts).set({ status, providersAttempted: attempted, deliveredProviders: delivered, errorSummary: errors.join("\n") || null, completedAt: new Date() }).where(eq(reportDeliveryAttempts.id, attemptId));
  await db.update(reportDeliveries).set({ lastAttemptAt: new Date() }).where(eq(reportDeliveries.id, delivery.id));
  if (retryNeeded && options.createRetry !== false) await db.insert(recoveryRecords).values({ reportDeliveryId: delivery.id, kind: "report_retry", status: "pending", retryCount: 0, nextAttemptAt: new Date(Date.now() + 5 * 60_000), lastError: errors.join("\n") || "One or more delivery channels did not accept the report.", details: { deliveredProviders: delivered, attemptedProviders: attempted, attemptId } });
  return { ok: true, pendingRetry: retryNeeded, status, delivered, errors };
}
