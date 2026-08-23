export type MissionWorkflowCounts = { claims: number; linkedClaims: number; relationships: number; clusters: number; briefs: number; openActions: number };

export function getMissionWorkflowNextStep(counts: MissionWorkflowCounts) {
  if (!counts.claims) return "Preserve and review an evidence claim before drawing conclusions.";
  if (!counts.relationships) return "Optionally connect owned entities with a preserved claim when a relationship needs review.";
  if (!counts.clusters) return "Review any deterministic material-change candidates before creating a cluster.";
  if (!counts.briefs) return "Create a decision brief when a human needs to compare options or assign follow-through.";
  if (counts.openActions) return "Review open accountable actions and record only human-confirmed outcomes.";
  return "Review the evidence boundary and brief status before deciding whether more monitoring is needed.";
}
