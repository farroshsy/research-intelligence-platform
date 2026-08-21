type ReportRecord = {
  event: { id: number; classification: string; status: string; changedFields: string[]; deterministicScore: number; detectedAt: Date | string; suggestedSignificance: string };
  source: { name: string; url: string };
  review: { decision: string; notes: string | null; reviewedAt: Date | string } | null;
  explanation: { summary: string | null; whyItMayMatter: string | null; suggestedSignificance: string | null; confidence: number | null; caveats: string[] | null; schemaValid: boolean } | null;
  evidence: { role: string; sha256: string; previewText: string | null }[];
};

export type ChangeReport = { generatedAt: Date | string; filters: Record<string, unknown>; records: ReportRecord[] };

function safeCell(value: unknown): string {
  const text = value === null || value === undefined ? "" : String(value).replace(/\r?\n/g, " ");
  const formulaSafe = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${formulaSafe.replace(/"/g, '""')}"`;
}

function formatDate(value: Date | string | null | undefined): string {
  return value ? new Date(value).toISOString() : "";
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

export function changeReportCsv(report: ChangeReport): string {
  const headers = ["event_id", "detected_at_utc", "source", "source_url", "classification", "status", "suggested_significance", "deterministic_score", "changed_fields", "review_decision", "reviewed_at_utc", "review_notes", "advisory_schema_valid", "advisory_significance", "advisory_confidence", "advisory_summary", "advisory_why_it_may_matter", "advisory_caveats", "evidence_hashes"];
  const appliedFilters = Object.entries(report.filters).filter(([, value]) => value !== undefined && value !== false).map(([key, value]) => `${key}=${value instanceof Date ? value.toISOString() : String(value)}`).join("; ") || "none";
  const rows = report.records.map(record => [record.event.id, formatDate(record.event.detectedAt), record.source.name, record.source.url, record.event.classification, record.event.status, record.event.suggestedSignificance, record.event.deterministicScore, record.event.changedFields.join(" | "), record.review?.decision ?? "", formatDate(record.review?.reviewedAt), record.review?.notes ?? "", record.explanation?.schemaValid ? "true" : "false", record.explanation?.suggestedSignificance ?? "", record.explanation?.confidence ?? "", record.explanation?.summary ?? "", record.explanation?.whyItMayMatter ?? "", record.explanation?.caveats?.join(" | ") ?? "", record.evidence.map(item => `${item.role}:${item.sha256}`).join(" | ")]);
  return [["report_generated_at_utc", formatDate(report.generatedAt)], ["applied_filters", appliedFilters], [], headers, ...rows].map(row => row.map(safeCell).join(",")).join("\r\n");
}

export function downloadChangeCsv(report: ChangeReport): void {
  const blob = new Blob(["\uFEFF", changeReportCsv(report)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `research-change-report-${slug(formatDate(report.generatedAt).slice(0, 10)) || "export"}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export async function downloadChangePdf(report: ChangeReport): Promise<void> {
  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF({ unit: "pt", format: "a4" });
  const width = pdf.internal.pageSize.getWidth();
  const height = pdf.internal.pageSize.getHeight();
  const margin = 42;
  let y = 48;
  const write = (text: string, size = 9, weight = "normal") => {
    pdf.setFont("helvetica", weight);
    pdf.setFontSize(size);
    const lines = pdf.splitTextToSize(text, width - margin * 2) as string[];
    const lineHeight = size + 4;
    if (y + lines.length * lineHeight > height - margin) { pdf.addPage(); y = margin; }
    pdf.text(lines, margin, y);
    y += lines.length * lineHeight + 5;
  };
  write("Research Intelligence Change Report", 18, "bold");
  write(`Generated (UTC): ${formatDate(report.generatedAt)}  |  Records: ${report.records.length}`, 9);
  write(`Applied filters: ${Object.entries(report.filters).filter(([, value]) => value !== undefined && value !== false).map(([key, value]) => `${key}=${value instanceof Date ? value.toISOString() : String(value)}`).join("; ") || "none"}`, 8);
  y += 5;
  report.records.forEach((record, index) => {
    write(`${index + 1}. ${record.source.name} — ${record.event.classification.toUpperCase()} / ${record.event.status.toUpperCase()}`, 11, "bold");
    write(`Detected: ${formatDate(record.event.detectedAt)} | Fields: ${record.event.changedFields.join(", ") || "not specified"} | Score: ${record.event.deterministicScore.toFixed(3)}`, 8);
    if (record.review) write(`Reviewer decision: ${record.review.decision} (${formatDate(record.review.reviewedAt)})${record.review.notes ? ` — ${record.review.notes}` : ""}`, 8);
    if (record.explanation?.schemaValid) write(`Advisory (${record.explanation.suggestedSignificance ?? "unlabeled"}, confidence ${record.explanation.confidence?.toFixed(2) ?? "n/a"}): ${record.explanation.summary ?? ""} ${record.explanation.whyItMayMatter ?? ""}`, 8);
    write(`Evidence hashes: ${record.evidence.map(item => `${item.role}:${item.sha256}`).join("; ") || "none preserved"}`, 7);
    y += 4;
  });
  pdf.save(`research-change-report-${slug(formatDate(report.generatedAt).slice(0, 10)) || "export"}.pdf`);
}
