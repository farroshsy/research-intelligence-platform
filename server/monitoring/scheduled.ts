import type { Request, Response } from "express";
import { getReportDeliveryByScheduleTaskUid, getSourceByScheduleTaskUid, getSystemJobByScheduleTaskUid } from "../db";
import { sdk } from "../_core/sdk";
import { reconcileMonitoring, runSourceCheck } from "./service";
import { deliverScheduledReport } from "./reportDelivery";

function errorPayload(error: unknown, context: Record<string, unknown>) {
  return {
    error: error instanceof Error ? error.message : String(error),
    context,
    timestamp: new Date().toISOString(),
  };
}

export async function scheduledSourceCheckHandler(req: Request, res: Response) {
  try {
    const user = await sdk.authenticateRequest(req);
    if (!user.isCron || !user.taskUid) return res.status(403).json({ error: "cron-only" });
    const source = await getSourceByScheduleTaskUid(user.taskUid);
    if (!source) return res.json({ ok: true, skipped: "orphan" });
    if (source.status !== "active") return res.json({ ok: true, skipped: source.status });
    const result = await runSourceCheck(source, { initiatedBy: "scheduled", taskUid: user.taskUid });
    if (!result.ok && result.retryable) return res.status(503).json(result);
    return res.status(result.ok ? 200 : 422).json(result);
  } catch (error) {
    console.error("[Scheduled source check]", error);
    return res.status(500).json(errorPayload(error, { url: req.originalUrl }));
  }
}

export async function scheduledReconciliationHandler(req: Request, res: Response) {
  try {
    const user = await sdk.authenticateRequest(req);
    if (!user.isCron || !user.taskUid) return res.status(403).json({ error: "cron-only" });
    const job = await getSystemJobByScheduleTaskUid(user.taskUid);
    if (!job || !job.enabled) return res.json({ ok: true, skipped: "orphan_or_disabled" });
    return res.json({ ok: true, ...(await reconcileMonitoring()) });
  } catch (error) {
    console.error("[Scheduled reconciliation]", error);
    return res.status(500).json(errorPayload(error, { url: req.originalUrl }));
  }
}

export async function scheduledReportDeliveryHandler(req: Request, res: Response) {
  try {
    const user = await sdk.authenticateRequest(req);
    if (!user.isCron || !user.taskUid) return res.status(403).json({ error: "cron-only" });
    const delivery = await getReportDeliveryByScheduleTaskUid(user.taskUid);
    if (!delivery) return res.json({ ok: true, skipped: "orphan" });
    const result = await deliverScheduledReport(delivery);
    if (!result.ok && result.retryable) return res.status(503).json(result);
    return res.status(result.ok ? 200 : 422).json(result);
  } catch (error) {
    console.error("[Scheduled report delivery]", error);
    return res.status(500).json(errorPayload(error, { url: req.originalUrl }));
  }
}
