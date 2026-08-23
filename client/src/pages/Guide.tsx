import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { parseGuideAcknowledgements, toggleGuideAcknowledgement } from "@/lib/guideProgress";
import { BookOpenCheck, CheckCircle2, ChevronRight, Circle, ClipboardCheck, FileBarChart, Radar, ShieldCheck, Target } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";

type GuideStep = {
  id: string;
  title: string;
  description: string;
  safety: string;
  path: string;
  action: string;
  icon: typeof Target;
  complete: boolean;
};

const storageKey = "research-intelligence-guide-acknowledged-v1";

export default function Guide() {
  const [, setLocation] = useLocation();
  const missions = trpc.missions.list.useQuery();
  const sources = trpc.monitoring.sources.list.useQuery();
  const [acknowledged, setAcknowledged] = useState<string[]>([]);

  useEffect(() => { setAcknowledged(parseGuideAcknowledgements(window.localStorage.getItem(storageKey))); }, []);

  const toggleAcknowledgement = (id: string) => {
    setAcknowledged(current => {
      const next = toggleGuideAcknowledgement(current, id);
      window.localStorage.setItem(storageKey, JSON.stringify(next));
      return next;
    });
  };

  const steps = useMemo<GuideStep[]>(() => [
    { id: "mission", title: "Frame a decision mission", description: "Start with the decision question, expected horizon, and what evidence would change your view. Career and procurement/policy presets provide optional focused fields.", safety: "A mission is a draft workspace; it does not make a decision or contact anyone.", path: "/missions", action: "Open Mission Control", icon: Target, complete: Boolean(missions.data?.length) },
    { id: "sources", title: "Add only permitted sources", description: "Configure sources you are authorized to monitor, keep them paused until policies are reviewed, and preserve their evidence trail.", safety: "Do not add private, restricted, or credential-protected sources unless you are authorized to monitor them.", path: "/sources", action: "Open Sources", icon: Radar, complete: Boolean(sources.data?.length) },
    { id: "review", title: "Review material changes", description: "Compare preserved before/after evidence and explicitly confirm or reject a candidate change. Use annotations and comparisons when the judgement needs context.", safety: "Only a human review can confirm a material change; the system never treats a draft explanation as a decision.", path: "/changes", action: "Open Change review", icon: ClipboardCheck, complete: acknowledged.includes("review") },
    { id: "govern", title: "Triage and shape the signal", description: "Use collections, alert rules, anomaly triage, and source governance to make the monitoring boundary intentional and maintainable.", safety: "Alerts may surface candidates, but external escalation remains gated by confirmed human review.", path: "/intelligence", action: "Open Intelligence", icon: ShieldCheck, complete: acknowledged.includes("govern") },
    { id: "brief", title: "Turn evidence into a human brief", description: "In Mission Control, preserve claims, review evidence confidence, group material changes, and prepare an accountable decision brief with options and outcomes.", safety: "The advisory investigation is evidence-bounded and cannot submit, email, publish, or execute external actions.", path: "/missions", action: "Continue in Missions", icon: BookOpenCheck, complete: acknowledged.includes("brief") },
    { id: "report", title: "Share an auditable report", description: "Apply filters, then export a PDF or CSV with change records, review status, evidence hashes, and advisory context. Keep delivery schedules paused until credentials are ready.", safety: "Reports distribute reviewed information; they do not change sources, decisions, or third-party systems.", path: "/reports", action: "Open Reports", icon: FileBarChart, complete: acknowledged.includes("report") },
  ], [acknowledged, missions.data?.length, sources.data?.length]);

  const completed = steps.filter(step => step.complete).length;
  return <div className="mx-auto max-w-5xl space-y-6 pb-20"><section className="surface soft-border relative overflow-hidden rounded-3xl p-6 md:p-8"><div className="absolute -right-10 -top-10 h-40 w-40 rounded-full border border-primary/15 bg-primary/[0.04]" /><div className="relative max-w-3xl"><p className="data-label text-primary">Guided workspace tour</p><h1 className="mt-2 text-3xl font-bold tracking-[-0.05em]">Use the system from evidence to a human decision.</h1><p className="mt-3 text-sm leading-6 text-muted-foreground">This guide works with your actual workspace. It never inserts demo sources, claims, decisions, review outcomes, or deliveries. Complete the first two setup steps through real data; the remaining acknowledgements only record local guide progress in this browser.</p><div className="mt-5 flex flex-wrap items-center gap-3"><span className="rounded-full bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary">{completed} of {steps.length} guide steps complete</span><Button variant="outline" size="sm" onClick={() => { setAcknowledged([]); window.localStorage.removeItem(storageKey); }}>Restart guide</Button></div></div></section><section className="grid gap-3 md:grid-cols-2">{steps.map((step, index) => { const Icon = step.icon; const actionableAcknowledgement = step.id !== "mission" && step.id !== "sources"; return <article key={step.id} className="surface soft-border rounded-2xl p-5"><div className="flex items-start justify-between gap-4"><div className="flex min-w-0 items-start gap-3"><span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${step.complete ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>{step.complete ? <CheckCircle2 className="h-4 w-4" /> : <Icon className="h-4 w-4" />}</span><div><p className="data-label">Step {index + 1}</p><h2 className="mt-1 text-base font-semibold text-foreground">{step.title}</h2></div></div>{step.complete ? <span className="text-xs font-medium text-primary">Ready</span> : <Circle className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />}</div><p className="mt-4 text-sm leading-6 text-muted-foreground">{step.description}</p><div className="mt-4 rounded-xl border border-primary/15 bg-primary/[0.03] p-3 text-xs leading-5 text-muted-foreground"><span className="font-medium text-foreground">Safety check:</span> {step.safety}</div><div className="mt-4 flex flex-wrap items-center gap-2"><Button size="sm" onClick={() => setLocation(step.path)}>{step.action}<ChevronRight className="ml-1 h-3.5 w-3.5" /></Button>{actionableAcknowledgement ? <Button size="sm" variant="outline" onClick={() => toggleAcknowledgement(step.id)}>{acknowledged.includes(step.id) ? "Mark incomplete" : "Mark guide step complete"}</Button> : null}</div></article>; })}</section><section className="rounded-2xl border border-primary/20 bg-primary/[0.03] p-5 text-sm leading-6 text-muted-foreground"><p className="flex items-center gap-2 font-medium text-foreground"><ShieldCheck className="h-4 w-4 text-primary" />Always keep consequential decisions human-controlled</p><p className="mt-1">Treat sources as evidence to inspect, preserve the reasoning trail, use advisory output only as a bounded explanation, and record human review before anything consequential is escalated or shared.</p></section></div>;
}
