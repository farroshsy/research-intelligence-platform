import { getMissionWorkflowNextStep } from "@/lib/missionWorkflow";
import { trpc } from "@/lib/trpc";
import { CheckCircle2, CircleDotDashed, GitBranch, NotebookTabs, ScanSearch } from "lucide-react";

export function MissionWorkflowSummary({ missionId }: { missionId: number }) {
  const { data: claims } = trpc.missions.claims.list.useQuery({ missionId });
  const { data: relations } = trpc.missions.relationships.list.useQuery();
  const { data: clusters } = trpc.missions.clusters.list.useQuery({ missionId });
  const { data: briefs } = trpc.missions.briefs.list.useQuery({ missionId });
  const { data: actions } = trpc.missions.actions.listForMission.useQuery({ missionId });
  const claimIds = new Set(claims?.map(claim => claim.id) ?? []);
  const relatedCount = relations?.filter(relation => relation.evidenceClaimId !== null && claimIds.has(relation.evidenceClaimId)).length ?? 0;
  const openActions = actions?.filter(action => action.status === "open" || action.status === "in_progress").length ?? 0;
  const counts = { claims: claims?.length ?? 0, linkedClaims: claims?.filter(claim => claim.changeEventId !== null).length ?? 0, relationships: relatedCount, clusters: clusters?.length ?? 0, briefs: briefs?.length ?? 0, openActions };
  const stages = [{ label: "Evidence", value: counts.claims, icon: ScanSearch }, { label: "Graph", value: counts.relationships, icon: GitBranch }, { label: "Clusters", value: counts.clusters, icon: CircleDotDashed }, { label: "Briefs", value: counts.briefs, icon: NotebookTabs }];
  return <section className="mt-4 rounded-xl border border-primary/15 bg-primary/[0.03] p-3"><div className="flex flex-wrap items-center justify-between gap-2"><p className="flex items-center gap-2 text-xs font-medium text-foreground"><CheckCircle2 className="h-4 w-4 text-primary" />Mission workflow readiness</p><span className="text-[11px] text-muted-foreground">{counts.linkedClaims} linked preserved change(s)</span></div><div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">{stages.map(stage => { const Icon = stage.icon; return <div className="rounded-lg bg-background px-2.5 py-2" key={stage.label}><p className="flex items-center gap-1.5 text-[11px] text-muted-foreground"><Icon className="h-3.5 w-3.5" />{stage.label}</p><p className="mt-1 text-sm font-semibold text-foreground">{stage.value}</p></div>; })}</div><p className="mt-3 text-xs leading-5 text-muted-foreground"><span className="font-medium text-foreground">Suggested human next step:</span> {getMissionWorkflowNextStep(counts)}</p></section>;
}
