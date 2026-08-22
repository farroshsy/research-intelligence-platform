import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { entities, entityRelations, evidenceClaims, researchMissions, users } from "../../drizzle/schema";
import { getDb } from "../db";
import type { TrpcContext } from "../_core/context";
import { missionsRouter } from "./missions";

const { mockInvokeLLM } = vi.hoisted(() => ({ mockInvokeLLM: vi.fn() }));
vi.mock("../_core/llm", () => ({ invokeLLM: mockInvokeLLM }));

const describeWithDatabase = process.env.DATABASE_URL ? describe : describe.skip;

function insertId(result: unknown): number {
  const header = Array.isArray(result) ? result[0] : result;
  const id = Number((header as { insertId?: number }).insertId ?? 0);
  if (!id) throw new Error("Test fixture insert did not return an identifier.");
  return id;
}

describeWithDatabase("missions router integration", () => {
  let db: NonNullable<Awaited<ReturnType<typeof getDb>>>;
  const ids = {
    relation: [] as number[],
    entity: [] as number[],
    claim: [] as number[],
    mission: [] as number[],
    user: [] as number[],
  };

  beforeAll(async () => {
    const connection = await getDb();
    if (!connection) throw new Error("DATABASE_URL is required for this integration test.");
    db = connection;
  });

  afterEach(async () => {
    vi.resetAllMocks();
    for (const id of ids.relation.splice(0)) await db.delete(entityRelations).where(eq(entityRelations.id, id));
    for (const id of ids.entity.splice(0)) await db.delete(entities).where(eq(entities.id, id));
    for (const id of ids.claim.splice(0)) await db.delete(evidenceClaims).where(eq(evidenceClaims.id, id));
    for (const id of ids.mission.splice(0)) await db.delete(researchMissions).where(eq(researchMissions.id, id));
    for (const id of ids.user.splice(0)) await db.delete(users).where(eq(users.id, id));
  });

  function ctxFor(id: number, openId: string, name: string): TrpcContext {
    return {
      user: { id, openId, name, email: null, loginMethod: null, role: "user", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() },
      req: { headers: {} } as TrpcContext["req"],
      res: {} as TrpcContext["res"],
    };
  }

  it("rejects investigation results that cite claims outside the mission evidence boundary", async () => {
    const suffix = `${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
    const ownerId = insertId(await db.insert(users).values({ openId: `mission-owner-${suffix}`, name: "Mission owner", role: "user" }));
    ids.user.push(ownerId);
    const missionId = insertId(await db.insert(researchMissions).values({ ownerId, name: "Mission boundary", template: "general", decisionQuestion: "What changed?", materialityPolicy: {} }));
    ids.mission.push(missionId);
    const claimId = insertId(await db.insert(evidenceClaims).values({ ownerId, missionId, claimText: "Confirmed preserved claim.", stance: "support", authorityScore: 0.8, freshnessScore: 0.7, corroborationScore: 0.6, humanAssessment: "trusted" }));
    ids.claim.push(claimId);
    mockInvokeLLM.mockResolvedValue({ choices: [{ message: { content: JSON.stringify({ answer: "Unsafe citation.", citedClaimIds: [claimId + 9999], uncertainty: ["none"], unsupportedGaps: [] }) } }] });

    const caller = missionsRouter.createCaller(ctxFor(ownerId, `mission-owner-${suffix}`, "Mission owner"));

    await expect(caller.investigate({ missionId, question: "What does the evidence show?" })).rejects.toThrow("outside this mission boundary");
  });

  it("selects question-relevant preserved claims before advisory investigation", async () => {
    const suffix = `${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
    const ownerId = insertId(await db.insert(users).values({ openId: `retrieval-owner-${suffix}`, name: "Retrieval owner", role: "user" }));
    ids.user.push(ownerId);
    const missionId = insertId(await db.insert(researchMissions).values({ ownerId, name: "Career deadline", template: "career", decisionQuestion: "What is the application deadline?", materialityPolicy: {} }));
    ids.mission.push(missionId);
    const relevantClaimId = insertId(await db.insert(evidenceClaims).values({ ownerId, missionId, claimText: "The AWS application deadline is 30 September.", stance: "support", authorityScore: 0.9, freshnessScore: 0.8, corroborationScore: 0.7, humanAssessment: "trusted" }));
    const irrelevantClaimId = insertId(await db.insert(evidenceClaims).values({ ownerId, missionId, claimText: "A music album received a five-star review.", stance: "context", authorityScore: 0.5, freshnessScore: 0.5, corroborationScore: 0, humanAssessment: "trusted" }));
    ids.claim.push(relevantClaimId, irrelevantClaimId);
    mockInvokeLLM.mockResolvedValue({ choices: [{ message: { content: JSON.stringify({ answer: "The listed deadline is 30 September.", citedClaimIds: [relevantClaimId], uncertainty: [], unsupportedGaps: [] }) } }] });

    const caller = missionsRouter.createCaller(ctxFor(ownerId, `retrieval-owner-${suffix}`, "Retrieval owner"));
    const result = await caller.investigate({ missionId, question: "What is the AWS application deadline?" });
    const call = mockInvokeLLM.mock.calls[0]?.[0] as { messages: Array<{ content: string }> };

    expect(result.citedClaimIds).toEqual([relevantClaimId]);
    expect(result.retrievedEvidenceCount).toBe(1);
    expect(call.messages[1]?.content).toContain("AWS application deadline");
    expect(call.messages[1]?.content).not.toContain("music album");
  });

  it("allows only the claim owner to record a human evidence assessment", async () => {
    const suffix = `${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
    const ownerId = insertId(await db.insert(users).values({ openId: `assessment-owner-${suffix}`, name: "Assessment owner", role: "user" }));
    const otherId = insertId(await db.insert(users).values({ openId: `assessment-other-${suffix}`, name: "Assessment other", role: "user" }));
    ids.user.push(ownerId, otherId);
    const missionId = insertId(await db.insert(researchMissions).values({ ownerId, name: "Evidence assessment", template: "general", decisionQuestion: "Assess the evidence.", materialityPolicy: {} }));
    ids.mission.push(missionId);
    const claimId = insertId(await db.insert(evidenceClaims).values({ ownerId, missionId, claimText: "A preserved claim requires review.", stance: "support", authorityScore: 0.4, freshnessScore: 0.4, corroborationScore: 0, humanAssessment: "unreviewed" }));
    ids.claim.push(claimId);

    const owner = missionsRouter.createCaller(ctxFor(ownerId, `assessment-owner-${suffix}`, "Assessment owner"));
    await owner.claimReview.assess({ id: claimId, authorityScore: 0.9, freshnessScore: 0.8, corroborationScore: 0.7, humanAssessment: "trusted" });
    const updated = (await db.select().from(evidenceClaims).where(eq(evidenceClaims.id, claimId)).limit(1))[0];
    expect(updated?.humanAssessment).toBe("trusted");
    expect(updated?.corroborationScore).toBe(0.7);

    const other = missionsRouter.createCaller(ctxFor(otherId, `assessment-other-${suffix}`, "Assessment other"));
    await expect(other.claimReview.assess({ id: claimId, humanAssessment: "rejected" })).rejects.toThrow("Evidence claim not found");
  });

  it("prevents relationships between entities that do not both belong to the caller", async () => {
    const suffix = `${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
    const ownerId = insertId(await db.insert(users).values({ openId: `relationship-owner-${suffix}`, name: "Relationship owner", role: "user" }));
    const otherId = insertId(await db.insert(users).values({ openId: `relationship-other-${suffix}`, name: "Relationship other", role: "user" }));
    ids.user.push(ownerId, otherId);
    const ownerEntityId = insertId(await db.insert(entities).values({ ownerId, name: "Owner entity", entityType: "organization", aliases: [] }));
    const otherEntityId = insertId(await db.insert(entities).values({ ownerId: otherId, name: "Other entity", entityType: "organization", aliases: [] }));
    ids.entity.push(ownerEntityId, otherEntityId);

    const caller = missionsRouter.createCaller(ctxFor(ownerId, `relationship-owner-${suffix}`, "Relationship owner"));

    await expect(caller.relationships.create({ fromEntityId: ownerEntityId, toEntityId: otherEntityId, relationType: "partners_with", evidenceClaimId: 1, confidence: 0.7 })).rejects.toThrow("Both entities must belong to you");
  });

  it("requires preserved evidence and keeps relationship review owner-scoped", async () => {
    const suffix = `${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
    const ownerId = insertId(await db.insert(users).values({ openId: `graph-owner-${suffix}`, name: "Graph owner", role: "user" }));
    const otherId = insertId(await db.insert(users).values({ openId: `graph-other-${suffix}`, name: "Graph other", role: "user" }));
    ids.user.push(ownerId, otherId);
    const missionId = insertId(await db.insert(researchMissions).values({ ownerId, name: "Entity graph", template: "general", decisionQuestion: "Which entities relate?", materialityPolicy: {} }));
    ids.mission.push(missionId);
    const claimId = insertId(await db.insert(evidenceClaims).values({ ownerId, missionId, claimText: "The preserved source identifies an organization and programme relationship.", stance: "support", authorityScore: 0.8, freshnessScore: 0.8, corroborationScore: 0.6, humanAssessment: "trusted" }));
    ids.claim.push(claimId);
    const organizationId = insertId(await db.insert(entities).values({ ownerId, name: "Owner organization", entityType: "organization", aliases: [] }));
    const programmeId = insertId(await db.insert(entities).values({ ownerId, name: "Owner programme", entityType: "programme", aliases: [] }));
    ids.entity.push(organizationId, programmeId);
    const owner = missionsRouter.createCaller(ctxFor(ownerId, `graph-owner-${suffix}`, "Graph owner"));

    await expect(owner.relationships.create({ fromEntityId: organizationId, toEntityId: programmeId, relationType: "operates", confidence: 0.7 })).rejects.toThrow();
    const relation = await owner.relationships.create({ fromEntityId: organizationId, toEntityId: programmeId, relationType: "operates", evidenceClaimId: claimId, confidence: 0.7 });
    ids.relation.push(relation.id);
    await owner.relationships.review({ id: relation.id, confidence: 0.9, humanAssessment: "trusted" });
    const updated = (await db.select().from(entityRelations).where(eq(entityRelations.id, relation.id)).limit(1))[0];
    expect(updated?.humanAssessment).toBe("trusted");
    expect(updated?.confidence).toBe(0.9);

    const other = missionsRouter.createCaller(ctxFor(otherId, `graph-other-${suffix}`, "Graph other"));
    await expect(other.relationships.review({ id: relation.id, humanAssessment: "rejected" })).rejects.toThrow("Entity relationship not found");
    await owner.relationships.remove({ id: relation.id });
    const removed = await db.select().from(entityRelations).where(eq(entityRelations.id, relation.id)).limit(1);
    expect(removed).toHaveLength(0);
  });
});
