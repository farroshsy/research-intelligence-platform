import { cn } from "@/lib/utils";

const stateStyles: Record<string, string> = {
  healthy: "border-emerald-300/20 bg-emerald-400/10 text-emerald-200",
  active: "border-emerald-300/20 bg-emerald-400/10 text-emerald-200",
  confirmed: "border-emerald-300/20 bg-emerald-400/10 text-emerald-200",
  succeeded: "border-emerald-300/20 bg-emerald-400/10 text-emerald-200",
  material: "border-amber-300/20 bg-amber-300/10 text-amber-100",
  pending_review: "border-amber-300/20 bg-amber-300/10 text-amber-100",
  needs_follow_up: "border-amber-300/20 bg-amber-300/10 text-amber-100",
  degraded: "border-orange-300/20 bg-orange-400/10 text-orange-100",
  failed: "border-rose-300/20 bg-rose-400/10 text-rose-100",
  paused: "border-slate-300/20 bg-slate-300/10 text-slate-200",
  retired: "border-slate-300/20 bg-slate-300/10 text-slate-300",
  suppressed: "border-slate-300/20 bg-slate-300/10 text-slate-300",
  not_material: "border-slate-300/20 bg-slate-300/10 text-slate-300",
  cosmetic: "border-sky-300/20 bg-sky-300/10 text-sky-100",
  baseline: "border-sky-300/20 bg-sky-300/10 text-sky-100",
  no_change: "border-slate-300/20 bg-slate-300/10 text-slate-300",
  unknown: "border-slate-300/20 bg-slate-300/10 text-slate-300",
};

export function StatusPill({ value, className }: { value: string; className?: string }) {
  const label = value.replace(/_/g, " ");
  return <span className={cn("inline-flex items-center rounded-full border px-2.5 py-1 font-mono text-[0.63rem] font-medium uppercase tracking-[0.08em]", stateStyles[value] ?? stateStyles.unknown, className)}>{label}</span>;
}
