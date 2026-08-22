import { and, desc, eq, gte } from "drizzle-orm";
import { alertMatches, alertRules, changeEvents, sourceCollectionMembers, sourceTags } from "../../drizzle/schema";
import { getDb } from "../db";

const score = { low: 1, medium: 2, high: 3 } as const;

export async function evaluateMaterialAlertRules(input: { ownerId: number; sourceId: number; changeEventId: number; suggestedSignificance: "low" | "medium" | "high"; changedFields: string[]; structuredDiff: Record<string, unknown> }) {
  const db = await getDb();
  if (!db || score[input.suggestedSignificance] < score.medium) return 0;
  const [rules, tags, memberships] = await Promise.all([
    db.select().from(alertRules).where(and(eq(alertRules.ownerId, input.ownerId), eq(alertRules.enabled, true))),
    db.select().from(sourceTags).where(eq(sourceTags.sourceId, input.sourceId)),
    db.select().from(sourceCollectionMembers).where(eq(sourceCollectionMembers.sourceId, input.sourceId)),
  ]);
  const tagSet = new Set(tags.map(item => item.tag)); const collectionSet = new Set(memberships.map(item => item.collectionId)); const searchable = `${input.changedFields.join(" ")} ${JSON.stringify(input.structuredDiff)}`.toLowerCase(); let matched = 0;
  for (const rule of rules) {
    if (score[input.suggestedSignificance] < score[rule.minSignificance]) continue;
    if (rule.sourceId && rule.sourceId !== input.sourceId) continue;
    if (rule.collectionId && !collectionSet.has(rule.collectionId)) continue;
    if (rule.tag && !tagSet.has(rule.tag)) continue;
    if (rule.keywords.length && !rule.keywords.some(keyword => searchable.includes(keyword.toLowerCase()))) continue;
    const cooldownCutoff = new Date(Date.now() - rule.cooldownMinutes * 60_000);
    const recent = await db.select().from(alertMatches).where(and(eq(alertMatches.alertRuleId, rule.id), gte(alertMatches.matchedAt, cooldownCutoff))).orderBy(desc(alertMatches.matchedAt)).limit(1);
    if (recent[0]) continue;
    await db.insert(alertMatches).values({ alertRuleId: rule.id, changeEventId: input.changeEventId }).onDuplicateKeyUpdate({ set: { status: "matched" } });
    matched++;
  }
  return matched;
}
