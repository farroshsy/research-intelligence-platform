import { StatusPill } from "@/components/StatusPill";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { Bot, BookmarkPlus, CheckCircle2, Eye, FileWarning, GitCompareArrows, ShieldAlert, Sparkles, XCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useLocation } from "wouter";

type Decision = "confirm_material" | "not_material" | "incorrect" | "needs_follow_up";

function formatDate(value: Date | string | null | undefined) {
  return value ? new Date(value).toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) : "Not yet";
}

export default function Changes() {
  const [location, setLocation] = useLocation();
  const queryId = Number(new URLSearchParams(location.split("?")[1] ?? "").get("id"));
  const [selectedId, setSelectedId] = useState<number | null>(Number.isFinite(queryId) && queryId > 0 ? queryId : null);
  const [notes, setNotes] = useState("");
  const [annotationBody, setAnnotationBody] = useState("");
  const [annotationCategory, setAnnotationCategory] = useState<"note" | "decision" | "follow_up">("note");
  const [comparisonIds, setComparisonIds] = useState<number[]>([]);
  const utils = trpc.useUtils();
  const list = trpc.monitoring.changes.list.useQuery();
  const detail = trpc.monitoring.changes.detail.useQuery({ id: selectedId ?? 0 }, { enabled: Boolean(selectedId) });
  const annotations = trpc.intelligence.changes.annotations.useQuery({ changeEventId: selectedId ?? 0 }, { enabled: Boolean(selectedId) });
  const comparison = trpc.intelligence.changes.compare.useQuery({ ids: comparisonIds.length >= 2 ? comparisonIds : [1, 2] }, { enabled: comparisonIds.length >= 2 });

  useEffect(() => {
    if (!selectedId && list.data?.[0]) setSelectedId(list.data[0].event.id);
  }, [list.data, selectedId]);

  const review = trpc.monitoring.changes.review.useMutation({
    onSuccess: result => {
      utils.monitoring.changes.list.invalidate();
      utils.monitoring.changes.detail.invalidate();
      utils.monitoring.dashboard.invalidate();
      toast.success(result.notification?.delivered === false ? "Review saved; owner alert queued for retry." : "Review decision recorded.");
      setNotes("");
    },
    onError: error => toast.error(error.message),
  });
  const explain = trpc.monitoring.changes.explain.useMutation({
    onSuccess: () => {
      utils.monitoring.changes.detail.invalidate();
      toast.success("Advisory explanation generated for human review.");
    },
    onError: error => toast.error(error.message),
  });
  const annotate = trpc.intelligence.changes.annotate.useMutation({ onSuccess: () => { setAnnotationBody(""); utils.intelligence.changes.annotations.invalidate({ changeEventId: selectedId ?? 0 }); toast.success("Append-only annotation added to this review trail."); }, onError: error => toast.error(error.message) });

  const item = detail.data;
  const choose = (id: number) => {
    setSelectedId(id);
    setLocation(`/changes?id=${id}`);
  };
  const decide = (decision: Decision) => {
    if (selectedId) review.mutate({ id: selectedId, decision, notes: notes || undefined });
  };
  const toggleComparison = (id: number) => setComparisonIds(current => current.includes(id) ? current.filter(value => value !== id) : current.length >= 5 ? [...current.slice(1), id] : [...current, id]);

  return (
    <div className="mx-auto max-w-[1500px] space-y-6 pb-20 lg:pb-0">
      <section>
        <p className="data-label text-primary">Review queue</p>
        <h1 className="mt-2 text-3xl font-bold tracking-[-0.05em]">Evidence first. Human decision second.</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">Material candidates remain pending until an accountable reviewer confirms the evidence. Advisory language is optional and never triggers an automated action.</p>
      </section>
      <section className="grid min-h-[620px] gap-5 xl:grid-cols-[360px_minmax(0,1fr)]">
        <aside className="surface soft-border overflow-hidden rounded-3xl">
          <div className="border-b border-white/8 px-5 py-4"><p className="data-label">Detected events</p><p className="mt-1 text-sm font-semibold">{list.data?.length ?? 0} recent records</p></div>
          <div className="max-h-[620px] overflow-y-auto">
            {list.data?.length ? list.data.map(({ event, source }) => (
              <button key={event.id} onClick={() => choose(event.id)} className={`w-full border-b border-white/7 px-5 py-4 text-left transition ${selectedId === event.id ? "bg-primary/10" : "hover:bg-white/[0.035]"}`}>
                <div className="flex items-center justify-between gap-2"><StatusPill value={event.status} /><span className="text-[0.65rem] text-slate-500">{formatDate(event.detectedAt)}</span></div>
                <p className="mt-3 truncate text-sm font-semibold">{source.name}</p>
                <p className="mt-1 line-clamp-2 font-mono text-[0.65rem] leading-5 text-slate-500">{event.changedFields.join(" · ") || "No field summary"}</p>
              </button>
            )) : <div className="p-8 text-center text-xs leading-5 text-slate-500">No change events are ready for review. Add a source, create a baseline, then compare a future observation.</div>}
          </div>
        </aside>
        <article className="surface soft-border overflow-hidden rounded-3xl">
          {item ? (
            <div className="flex h-full flex-col">
              <header className="flex flex-wrap items-start justify-between gap-4 border-b border-white/8 px-5 py-5 sm:px-7">
                <div><div className="flex flex-wrap items-center gap-2"><StatusPill value={item.event.classification} /><StatusPill value={item.event.status} /><span className="font-mono text-[0.67rem] text-slate-500">Event #{item.event.id}</span></div><h2 className="mt-3 text-xl font-bold tracking-tight">{item.source.name}</h2><p className="mt-1 max-w-xl font-mono text-[0.7rem] text-slate-500">{item.source.url}</p></div>
                <div className="text-right text-xs text-slate-500"><p>Detected {formatDate(item.event.detectedAt)}</p><p className="mt-1">Deterministic score <span className="font-mono text-slate-200">{item.event.deterministicScore.toFixed(3)}</span></p></div>
              </header>
              <div className="grid flex-1 gap-5 p-5 sm:p-7 lg:grid-cols-[1.1fr_0.9fr]">
                <div className="space-y-5">
                  <section className="rounded-2xl border border-white/8 bg-black/10 p-4"><p className="data-label">Structured diff</p><pre className="mt-3 max-h-80 overflow-auto whitespace-pre-wrap break-words font-mono text-xs leading-5 text-slate-300">{JSON.stringify(item.event.structuredDiff, null, 2)}</pre></section>
                  <section className="grid gap-4 md:grid-cols-2">
                    {item.evidence.filter(row => row.evidence.role.includes("normalized")).slice(0, 2).map(row => <div key={row.evidence.id} className="rounded-2xl border border-white/8 bg-black/10 p-4"><p className="data-label">{row.evidence.role.replace(/_/g, " ")}</p><p className="mt-3 line-clamp-[10] whitespace-pre-wrap text-xs leading-5 text-slate-400">{row.evidence.excerpt ?? row.artifact.previewText ?? "No inline preview preserved."}</p>{row.artifact.storageUrl && <a href={row.artifact.storageUrl} target="_blank" rel="noreferrer" className="mt-4 inline-flex items-center text-xs text-primary hover:text-primary/80"><Eye className="mr-1.5 h-3.5 w-3.5" /> Open artifact</a>}</div>)}
                  </section>
                </div>
                <div className="space-y-5">
                  <section className="rounded-2xl border border-primary/15 bg-primary/[0.045] p-4">
                    <div className="flex items-start gap-3"><Bot className="mt-0.5 h-4 w-4 text-primary" /><div><p className="text-sm font-semibold">Advisory explanation</p><p className="mt-1 text-xs leading-5 text-slate-400">Optional, schema-validated assistance using gpt-5-mini. It is capped at 12 manually requested explanations per UTC day and never triggers an action.</p></div></div>
                    {item.explanations[0]?.schemaValid ? <div className="mt-4 space-y-3 text-xs leading-5"><p className="text-slate-200">{item.explanations[0].summary}</p><p className="text-slate-400">{item.explanations[0].whyItMayMatter}</p><div className="flex items-center gap-2"><StatusPill value={item.explanations[0].suggestedSignificance ?? "unknown"} /><span className="font-mono text-slate-500">confidence {item.explanations[0].confidence?.toFixed(2)}</span></div>{item.explanations[0].caveats?.length ? <p className="text-amber-100/80">Caveats: {item.explanations[0].caveats.join(" · ")}</p> : null}</div> : item.event.classification === "material" ? <Button size="sm" variant="outline" onClick={() => selectedId && explain.mutate({ id: selectedId })} disabled={explain.isPending} className="mt-4 border-primary/25 bg-primary/10 text-primary hover:bg-primary/18"><Sparkles className="mr-1.5 h-3.5 w-3.5" />{explain.isPending ? "Generating advisory…" : "Generate advisory explanation"}</Button> : <p className="mt-4 text-xs leading-5 text-slate-500">Advisory explanation is reserved for material candidates after deterministic analysis.</p>}
                  </section>
                  <section className="rounded-2xl border border-white/8 bg-black/10 p-4"><p className="data-label">Reviewer record</p><Textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optional decision notes, assumptions, or follow-up context…" className="mt-3 min-h-24 border-white/10 bg-black/15 text-sm" /><div className="mt-4 grid gap-2"><Button onClick={() => decide("confirm_material")} disabled={review.isPending || item.event.status === "confirmed"} className="justify-start bg-emerald-300 text-emerald-950 hover:bg-emerald-200"><CheckCircle2 className="mr-2 h-4 w-4" /> Confirm material & notify owner</Button><div className="grid grid-cols-2 gap-2"><Button variant="outline" onClick={() => decide("needs_follow_up")} disabled={review.isPending} className="border-amber-200/16 bg-amber-200/6 text-amber-50 hover:bg-amber-200/12"><FileWarning className="mr-1.5 h-3.5 w-3.5" /> Follow up</Button><Button variant="outline" onClick={() => decide("not_material")} disabled={review.isPending} className="border-white/12 bg-white/4 text-slate-200 hover:bg-white/8"><XCircle className="mr-1.5 h-3.5 w-3.5" /> Not material</Button></div></div></section>
                  <section className="rounded-2xl border border-white/8 bg-black/10 p-4"><p className="data-label">Decision history</p>{item.reviews.length ? <div className="mt-3 space-y-3">{item.reviews.map(entry => <div key={entry.id} className="border-l border-white/10 pl-3"><p className="text-xs font-semibold">{entry.decision.replace(/_/g, " ")}</p><p className="mt-1 text-[0.68rem] text-slate-500">{formatDate(entry.reviewedAt)}{entry.notes ? ` · ${entry.notes}` : ""}</p></div>)}</div> : <p className="mt-3 text-xs leading-5 text-slate-500">No review decisions have been recorded yet.</p>}</section>
                  <section className="rounded-2xl border border-white/8 bg-black/10 p-4"><div className="flex items-center gap-2"><BookmarkPlus className="h-4 w-4 text-primary" /><p className="data-label">Append-only review context</p></div><div className="mt-3 flex gap-2"><select value={annotationCategory} onChange={event => setAnnotationCategory(event.target.value as typeof annotationCategory)} className="h-9 rounded-md border border-white/10 bg-black/15 px-2 text-xs text-slate-200"><option value="note">Note</option><option value="decision">Decision context</option><option value="follow_up">Follow-up</option></select><Button size="sm" variant="outline" onClick={() => selectedId && annotate.mutate({ changeEventId: selectedId, body: annotationBody, category: annotationCategory })} disabled={!annotationBody.trim() || annotate.isPending} className="border-white/12 bg-white/4 text-slate-200 hover:bg-white/8">Add context</Button></div><Textarea value={annotationBody} onChange={event => setAnnotationBody(event.target.value)} placeholder="Record evidence context or a follow-up for the next reviewer…" className="mt-2 min-h-20 border-white/10 bg-black/15 text-sm" /><div className="mt-3 space-y-2">{annotations.data?.length ? annotations.data.map(entry => <div key={entry.id} className="border-l border-primary/30 pl-3"><p className="text-[0.65rem] font-semibold uppercase tracking-wide text-primary">{entry.category.replace(/_/g, " ")}</p><p className="mt-1 text-xs leading-5 text-slate-300">{entry.body}</p><p className="mt-1 text-[0.65rem] text-slate-500">{formatDate(entry.createdAt)}</p></div>) : <p className="text-xs leading-5 text-slate-500">No annotations yet. Add context without modifying preserved evidence or prior reviews.</p>}</div></section>
                  <section className="rounded-2xl border border-white/8 bg-black/10 p-4"><div className="flex items-center gap-2"><GitCompareArrows className="h-4 w-4 text-primary" /><p className="data-label">Compare selected evidence</p></div><p className="mt-2 text-xs leading-5 text-slate-500">Select two to five owned changes to compare their classification, deterministic score, and changed fields beside this review.</p><div className="mt-3 max-h-40 divide-y divide-white/8 overflow-auto">{list.data?.slice(0, 30).map(({ event, source }) => <label key={event.id} className="flex cursor-pointer items-center gap-2 py-2 text-xs"><input type="checkbox" checked={comparisonIds.includes(event.id)} onChange={() => toggleComparison(event.id)} className="accent-primary" /><span className="min-w-0 flex-1 truncate text-slate-300">{source.name} · #{event.id}</span><span className="text-slate-500">{event.classification}</span></label>)}</div><div className="mt-3 rounded-xl border border-white/8 bg-black/15 p-3 text-xs leading-5 text-slate-400">{comparisonIds.length < 2 ? "Choose at least two changes to compare them." : comparison.data?.map(row => <p key={row.event.id} className="py-1"><span className="font-semibold text-slate-200">{row.source.name}</span> · {row.event.classification} · score {row.event.deterministicScore.toFixed(3)} · {row.event.changedFields.join(", ") || "no field summary"}</p>)}</div></section>
                </div>
              </div>
            </div>
          ) : <div className="flex h-full min-h-96 flex-col items-center justify-center p-8 text-center"><ShieldAlert className="h-8 w-8 text-slate-600" /><p className="mt-4 text-sm font-semibold">Select an evidence event</p><p className="mt-2 max-w-sm text-xs leading-5 text-slate-500">The review panel shows structured diffs, preserved artifacts, advisory explanation, and append-only reviewer decisions.</p></div>}
        </article>
      </section>
    </div>
  );
}
