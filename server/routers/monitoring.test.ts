import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetDb } = vi.hoisted(() => ({ mockGetDb: vi.fn() }));

vi.mock("../db", () => ({
  getDb: mockGetDb,
}));

import { monitoringRouter } from "./monitoring";
import type { TrpcContext } from "../_core/context";

function ownerContext(): TrpcContext {
  return {
    user: {
      id: 42,
      openId: "owner-42",
      name: "Owner",
      email: "owner@example.test",
      loginMethod: "manus",
      role: "user",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: { headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

describe("operations.recoveryList", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns a notification-linked recovery record through the owner-scoped audit queue", async () => {
    const ownedRecovery = {
      recovery: {
        id: 17,
        sourceId: 8,
        fetchRunId: null,
        notificationId: 29,
        kind: "notification_retry",
        status: "pending",
        retryCount: 0,
        nextAttemptAt: new Date("2026-08-21T12:00:00Z"),
        lastError: "Owner notification provider was temporarily unavailable.",
        details: { changeEventId: 14, notificationType: "owner_push" },
        createdAt: new Date("2026-08-21T11:55:00Z"),
        resolvedAt: null,
      },
      source: { id: 8, ownerId: 42, name: "Owned source" },
    };
    const limit = vi.fn().mockResolvedValue([ownedRecovery]);
    const orderBy = vi.fn().mockReturnValue({ limit });
    const where = vi.fn().mockReturnValue({ orderBy });
    const innerJoin = vi.fn().mockReturnValue({ where });
    const from = vi.fn().mockReturnValue({ innerJoin });
    const select = vi.fn().mockReturnValue({ from });
    mockGetDb.mockResolvedValue({ select });

    const caller = monitoringRouter.createCaller(ownerContext());
    const result = await caller.operations.recoveryList();

    expect(result).toEqual([ownedRecovery]);
    expect(select).toHaveBeenCalledTimes(1);
    expect(where).toHaveBeenCalledTimes(1);
    expect(limit).toHaveBeenCalledWith(50);
    expect(result[0]?.source.ownerId).toBe(42);
    expect(result[0]?.recovery.notificationId).toBe(29);
  });
});
