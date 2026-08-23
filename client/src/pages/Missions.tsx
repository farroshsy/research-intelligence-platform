import { Button } from "@/components/ui/button";
import { EntityGraphWorkspace } from "@/components/EntityGraphWorkspace";
import { ClusterReviewWorkspace } from "@/components/ClusterReviewWorkspace";
import { DecisionWorkflowWorkspace } from "@/components/DecisionWorkflowWorkspace";
import { MissionWorkflowSummary } from "@/components/MissionWorkflowSummary";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";
import { missionPresets, type MissionTemplate } from "@/lib/missionPresets";
import { CheckCircle2, ChevronDown, Plus, ShieldCheck, Target } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

type ClaimAssessment = "unreviewed" | "trusted" | "uncertain" | "rejected";

const assessmentTone: Record<ClaimAssessment, string> = {
  unreviewed: "bg-muted text-muted-foreground",
  trusted: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  uncertain: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
  rejected: "bg-destructive/10 text-destructive",
};

function ClaimReviewRow({ claim, missionId }: { claim: { id: number; changeEventId: number | null; claimText: string; stance: "support" | "contradict" | "context"; authorityScore: number; freshnessScore: number; corroborationScore: number; humanAssessment: ClaimAssessment; createdAt: Date }; missionId: number }) {
  const utils = trpc.useUtils();
  const [assessment, setAssessment] = useState<ClaimAssessment>(claim.humanAssessment);
  const [authority, setAuthority] = useState(String(claim.authorityScore));
  const [freshness, setFreshness] = useState(String(claim.freshnessScore));
  const [corroboration, setCorroboration] = useState(String(claim.corroborationScore));
  const score = (value: string) => Math.max(0, Math.min(1, Number(value) || 0));
  const review = trpc.missions.claimReview.assess.useMutation({
    onSuccess: () => {
      utils.missions.claims.list.invalidate({ missionId });
      utils.missions.confidence.invalidate({ missionId });
      toast.success("Claim review recorded. Confidence has been refreshed.");
    },
    onError: error => toast.error(error.message),
  });

  return <div className="rounded-xl border border-border bg-background p-3"><div className="flex flex-wrap items-start justify-between gap-2"><p className="min-w-0 flex-1 text-sm leading-5 text-foreground">{claim.claimText}</p><span className={`rounded-full px-2 py-1 text-[11px] font-medium ${assessmentTone[assessment]}`}>{assessment}</span></div><p className="mt-2 text-xs text-muted-foreground">Stance: {claim.stance} · captured {new Date(claim.createdAt).toLocaleDateString()}{claim.changeEventId ? ` · linked change #${claim.changeEventId}` : ""}</p><div className="mt-3 grid gap-2 sm:grid-cols-4"><label className="text-xs text-muted-foreground">Authority<Input aria-label="Authority score" inputMode="decimal" type="number" min="0" max="1" step="0.1" value={authority} onChange={event => setAuthority(event.target.value)} className="mt-1 h-8 bg-background text-xs" /></label><label className="text-xs text-muted-foreground">Freshness<Input aria-label="Freshness score" inputMode="decimal" type="number" min="0" max="1" step="0.1" value={freshness} onChange={event => setFreshness(event.target.value)} className="mt-1 h-8 bg-background text-xs" /></label><label className="text-xs text-muted-foreground">Corroboration<Input aria-label="Corroboration score" inputMode="decimal" type="number" min="0" max="1" step="0.1" value={corroboration} onChange={event => setCorroboration(event.target.value)} className="mt-1 h-8 bg-background text-xs" /></label><label className="text-xs text-muted-foreground">Reviewer assessment<select aria-label="Reviewer assessment" value={assessment} onChange={event => setAssessment(event.target.value as ClaimAssessment)} className="mt-1 h-8 w-full rounded-md border border-border bg-background px-2 text-xs text-foreground"><option value="unreviewed">Unreviewed</option><option value="trusted">Trusted</option><option value="uncertain">Uncertain</option><option value="rejected">Rejected</option></select></label></div><div className="mt-3 flex items-center justify-between gap-3"><p className="text-[11px] leading-4 text-muted-foreground">Scores are human review inputs, not a decision or source of truth.</p><Button size="sm" variant="outline" className="shrink-0" onClick={() => review.mutate({ id: claim.id, authorityScore: score(authority), freshnessScore: score(freshness), corroborationScore: score(corroboration), humanAssessment: assessment })} disabled={review.isPending}>Save review</Button></div></div>;
}

function ClaimLedger({ missionId }: { missionId: number }) {
  const utils = trpc.useUtils();
  const { data: claims, isLoading } = trpc.missions.claims.list.useQuery({ missionId });
  const { data: candidates } = trpc.missions.clusterCandidates.useQuery({ missionId });
  const [claimText, setClaimText] = useState("");
  const [stance, setStance] = useState<"support" | "contradict" | "context">("support");
  const [authority, setAuthority] = useState("0.5");
  const [freshness, setFreshness] = useState("0.5");
  const [changeEventId, setChangeEventId] = useState("");
  const score = (value: string) => Math.max(0, Math.min(1, Number(value) || 0));
  const create = trpc.missions.claims.create.useMutation({
    onSuccess: () => {
      setClaimText("");
      setChangeEventId("");
      utils.missions.claims.list.invalidate({ missionId });
      utils.missions.confidence.invalidate({ missionId });
      toast.success("Preserved evidence claim added for human review.");
    },
    onError: error => toast.error(error.message),
  });

  return <details className="mt-4 rounded-xl border border-border bg-muted/20 p-3"><summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-medium text-foreground"><span className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-primary" />Evidence claim ledger</span><span className="text-xs font-normal text-muted-foreground">{claims?.length ?? 0} preserved</span><ChevronDown className="h-4 w-4 text-muted-foreground" /></summary><div className="mt-4 rounded-xl border border-border bg-background p-3"><p className="text-xs font-medium text-foreground">Capture a preserved claim</p><textarea value={claimText} onChange={event => setClaimText(event.target.value)} placeholder="Record a factual claim from approved preserved evidence. Do not add conclusions as facts." className="mt-2 min-h-20 w-full rounded-lg border border-border bg-background p-2 text-sm outline-none focus:ring-2 focus:ring-primary" /><div className="mt-2 grid gap-2 sm:grid-cols-3"><select aria-label="Claim stance" value={stance} onChange={event => setStance(event.target.value as typeof stance)} className="h-9 rounded-md border border-border bg-background px-2 text-xs"><option value="support">Supports the question</option><option value="contradict">Contradicts the question</option><option value="context">Context only</option></select><Input aria-label="Initial authority score" inputMode="decimal" type="number" min="0" max="1" step="0.1" value={authority} onChange={event => setAuthority(event.target.value)} className="h-9 bg-background text-xs" placeholder="Authority 0–1" /><Input aria-label="Initial freshness score" inputMode="decimal" type="number" min="0" max="1" step="0.1" value={freshness} onChange={event => setFreshness(event.target.value)} className="h-9 bg-background text-xs" placeholder="Freshness 0–1" /></div><select aria-label="Linked preserved material change" value={changeEventId} onChange={event => setChangeEventId(event.target.value)} className="mt-2 h-9 w-full rounded-md border border-border bg-background px-2 text-xs"><option value="">No linked material change</option>{candidates?.flatMap(candidate => candidate.changeEventIds.map(changeId => ({ changeId, title: candidate.title }))).map(option => <option value={option.changeId} key={option.changeId}>Change #{option.changeId} · {option.title}</option>)}</select><p className="mt-1 text-[11px] leading-4 text-muted-foreground">Only material changes from this mission's owned sources can be linked and retrieved as compact preserved evidence.</p><Button size="sm" className="mt-3" onClick={() => create.mutate({ missionId, changeEventId: changeEventId ? Number(changeEventId) : null, claimText, stance, authorityScore: score(authority), freshnessScore: score(freshness) })} disabled={claimText.trim().length < 3 || create.isPending}><Plus className="mr-2 h-3.5 w-3.5" />Add preserved claim</Button></div><div className="mt-3 space-y-2">{isLoading ? <p className="text-xs text-muted-foreground">Loading preserved claims…</p> : null}{!isLoading && !claims?.length ? <p className="rounded-lg border border-dashed border-border p-3 text-xs leading-5 text-muted-foreground">No claims have been preserved for this mission. Add evidence manually after reviewing an approved source or change record.</p> : null}{claims?.map(claim => <ClaimReviewRow key={claim.id} claim={claim} missionId={missionId} />)}</div></details>;
}

function MissionSummary({ mission }: { mission: { id: number; template: string; status: string; name: string; decisionQuestion: string } }) {
  const utils = trpc.useUtils();
  const { data: confidence } = trpc.missions.confidence.useQuery({ missionId: mission.id });
  const [question, setQuestion] = useState("");
  const investigate = trpc.missions.investigate.useMutation({ onError: error => toast.error(error.message) });
  return <article className="surface soft-border rounded-2xl p-5"><p className="data-label">{mission.template.replace(/_/g, " ")} · {mission.status}</p><h2 className="mt-2 text-lg font-semibold">{mission.name}</h2><p className="mt-3 text-sm leading-6 text-muted-foreground">{mission.decisionQuestion}</p><div className="mt-4 rounded-xl bg-muted/50 px-3 py-2 text-xs text-muted-foreground"><span className="font-medium text-foreground">Evidence confidence: {confidence ? `${Math.round(confidence.score * 100)}%` : "loading"}</span><span className="mx-1.5">·</span>{confidence?.explanation ?? "Calculated from preserved claims and reviewer assessment."}</div><MissionWorkflowSummary missionId={mission.id} /><ClaimLedger missionId={mission.id} /><EntityGraphWorkspace missionId={mission.id} /><ClusterReviewWorkspace missionId={mission.id} /><DecisionWorkflowWorkspace missionId={mission.id} defaultTitle={mission.name} decisionQuestion={mission.decisionQuestion} /><div className="mt-4 space-y-2"><textarea value={question} onChange={event => setQuestion(event.target.value)} placeholder="Ask only about preserved evidence" className="min-h-20 w-full rounded-xl border border-border bg-background p-3 text-sm" /><Button size="sm" variant="outline" onClick={() => investigate.mutate({ missionId: mission.id, question })} disabled={question.trim().length < 8 || investigate.isPending}>Investigate evidence</Button>{investigate.data ? <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 text-xs leading-5"><p className="font-medium">{investigate.data.answer}</p><p className="mt-2 text-muted-foreground">Cited claims: {investigate.data.citedClaimIds.join(", ") || "none"} · Retrieved: {investigate.data.retrievedEvidenceCount} of {investigate.data.evidenceBoundary}</p>{investigate.data.uncertainty.length ? <p className="mt-1 text-muted-foreground">Uncertainty: {investigate.data.uncertainty.join("; ")}</p> : null}{investigate.data.unsupportedGaps.length ? <p className="mt-1 text-muted-foreground">Unsupported gaps: {investigate.data.unsupportedGaps.join("; ")}</p> : null}</div> : null}</div></article>;
}

export default function Missions() {
  const utils = trpc.useUtils();
  const { data: missions } = trpc.missions.list.useQuery();
  const [name, setName] = useState("");
  const [question, setQuestion] = useState("");
  const [template, setTemplate] = useState<MissionTemplate>("general");
  const [guidedInputs, setGuidedInputs] = useState<Record<string, string>>({});
  const create = trpc.missions.create.useMutation({ onSuccess: () => { setName(""); setQuestion(""); utils.missions.list.invalidate(); toast.success("Mission created as a draft."); }, onError: error => toast.error(error.message) });
  const activePreset = missionPresets[template];
  const guidedFieldsValid = !activePreset.guidedFields.some(field => field.required && (guidedInputs[field.key]?.trim().length ?? 0) < 2);
  const materialityPolicy = { ...activePreset.materialityPolicy, guidedInputs: Object.fromEntries(activePreset.guidedFields.map(field => [field.key, guidedInputs[field.key]?.trim() ?? ""])) };
  return <div className="mx-auto max-w-[1300px] space-y-6 pb-20"><section><p className="data-label text-primary">Mission control</p><h1 className="mt-2 text-3xl font-bold tracking-[-0.05em]">Start with the decision, not the feed.</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">A research mission defines the decision question, time horizon, evidence boundary, and accountable workflow for your monitoring system.</p></section><section className="surface soft-border rounded-3xl p-6"><div className="flex items-center gap-2"><Target className="h-4 w-4 text-primary" /><p className="data-label">New mission</p></div><div className="mt-5 grid gap-3 md:grid-cols-2"><Input value={name} onChange={event => setName(event.target.value)} placeholder="Mission name" className="border-border bg-background" /><select value={template} onChange={event => { setTemplate(event.target.value as MissionTemplate); setGuidedInputs({}); }} className="h-10 rounded-md border border-border bg-background px-3 text-sm">{(Object.entries(missionPresets) as Array<[MissionTemplate, typeof activePreset]>).map(([value, config]) => <option value={value} key={value}>{config.label}</option>)}</select><textarea value={question} onChange={event => setQuestion(event.target.value)} placeholder={activePreset.decisionQuestionPlaceholder} className="min-h-28 rounded-xl border border-border bg-background p-3 text-sm outline-none focus:ring-2 focus:ring-primary md:col-span-2" />{activePreset.guidedFields.map(field => <label key={field.key} className="text-xs text-muted-foreground">{field.label}{field.required ? " *" : ""}<Input value={guidedInputs[field.key] ?? ""} onChange={event => setGuidedInputs(current => ({ ...current, [field.key]: event.target.value }))} placeholder={field.placeholder} className="mt-1 border-border bg-background text-sm" /></label>)}</div><div className="mt-3 rounded-xl border border-primary/15 bg-primary/[0.03] p-3 text-xs leading-5 text-muted-foreground"><p className="font-medium text-foreground">{activePreset.label} guidance</p><p className="mt-1">{activePreset.description}</p><p className="mt-1">Suggested sources: {activePreset.sourceGuidance}</p><p className="mt-1">Material signals: {activePreset.materialSignals.join(" · ")}</p><p className="mt-1">Recommended brief: {activePreset.briefSections.join(" · ")} · priority: {activePreset.urgency}</p></div>{!guidedFieldsValid ? <p className="mt-2 text-xs text-muted-foreground">Complete the required guided field before creating this tailored mission.</p> : null}<Button className="mt-4" onClick={() => create.mutate({ name, template, decisionQuestion: question, materialityPolicy })} disabled={name.trim().length < 2 || question.trim().length < 8 || !guidedFieldsValid}><Plus className="mr-2 h-4 w-4" />Create draft mission</Button></section><section className="grid gap-4 md:grid-cols-2">{missions?.length ? missions.map(mission => <MissionSummary key={mission.id} mission={mission} />) : <div className="surface soft-border rounded-2xl p-8 text-sm text-muted-foreground">No missions yet. Create one draft to turn your monitoring sources into a decision workflow.</div>}</section><section className="rounded-2xl border border-primary/15 bg-primary/[0.03] p-4 text-xs leading-5 text-muted-foreground"><p className="flex items-center gap-2 font-medium text-foreground"><CheckCircle2 className="h-4 w-4 text-primary" />Human decision safeguard</p><p className="mt-1">Claim capture and assessment preserve your reasoning trail. They do not publish findings, contact third parties, or autonomously create decisions or external actions.</p></section></div>;
}
