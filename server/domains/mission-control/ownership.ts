import { and, eq } from "drizzle-orm";
import { decisionBriefs, researchMissions } from "../../../drizzle/schema";
import { getDb } from "../../db";

/** Access-policy boundary for decision-first missions. */
export async function requireOwnedMission(ownerId: number, missionId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable.");
  const mission = (await db.select().from(researchMissions).where(and(eq(researchMissions.id, missionId), eq(researchMissions.ownerId, ownerId))).limit(1))[0];
  if (!mission) throw new Error("Mission not found.");
  return mission;
}

/** A brief is accessible only through an owned parent mission. */
export async function requireOwnedDecisionBrief(ownerId: number, briefId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable.");
  const brief = (await db.select({ brief: decisionBriefs }).from(decisionBriefs).innerJoin(researchMissions, eq(decisionBriefs.missionId, researchMissions.id)).where(and(eq(decisionBriefs.id, briefId), eq(researchMissions.ownerId, ownerId))).limit(1))[0]?.brief;
  if (!brief) throw new Error("Decision brief not found.");
  return brief;
}
