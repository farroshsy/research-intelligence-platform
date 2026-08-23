import { eq } from "drizzle-orm";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { alertRules, sourceCollections, users } from "../../drizzle/schema";
import { getDb } from "../db";
import type { TrpcContext } from "../_core/context";
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
  const ids = { rule: [] as number[], collection: [] as number[], user: [] as number[] };

  beforeAll(async () => { const connection = await getDb(); if (!connection) throw new Error("DATABASE_URL is required for this integration test."); db = connection; });
  afterEach(async () => { for (const id of ids.rule.splice(0)) await db.delete(alertRules).where(eq(alertRules.id, id)); for (const id of ids.collection.splice(0)) await db.delete(sourceCollections).where(eq(sourceCollections.id, id)); for (const id of ids.user.splice(0)) await db.delete(users).where(eq(users.id, id)); });

  function ctxFor(id: number, openId: string): TrpcContext { return { user: { id, openId, name: "Rule owner", email: null, loginMethod: null, role: "user", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() }, req: { headers: {} } as TrpcContext["req"], res: {} as TrpcContext["res"] }; }

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
});
