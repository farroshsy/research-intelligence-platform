import { describe, expect, it } from "vitest";
import { changeReportCsv, type ChangeReport } from "../client/src/lib/changeReportExport";

describe("change report CSV export", () => {
  it("includes advisory, review, and evidence fields while neutralizing spreadsheet formulas", () => {
    const report: ChangeReport = {
      generatedAt: new Date("2026-08-21T12:00:00Z"),
      filters: { status: "confirmed" },
      records: [{
        event: { id: 9, classification: "material", status: "confirmed", changedFields: ["$.deadline"], deterministicScore: 0.92, detectedAt: new Date("2026-08-20T10:00:00Z"), suggestedSignificance: "high" },
        source: { name: "Public notice", url: "https://example.org/notice" },
        review: { decision: "confirm_material", notes: "=SUM(A1:A2)", reviewedAt: new Date("2026-08-20T11:00:00Z") },
        explanation: { summary: "Deadline was moved.", whyItMayMatter: "Review procurement timeline.", suggestedSignificance: "high", confidence: 0.88, caveats: ["Source language may be ambiguous."], schemaValid: true },
        evidence: [{ role: "diff", sha256: "abc123", previewText: "deadline changed" }],
      }],
    };
    const csv = changeReportCsv(report);
    expect(csv).toContain('"report_generated_at_utc","2026-08-21T12:00:00.000Z"');
    expect(csv).toContain('"applied_filters","status=confirmed"');
    expect(csv).toContain('"event_id"');
    expect(csv).toContain('"Deadline was moved."');
    expect(csv).toContain('"diff:abc123"');
    expect(csv).toContain('"\'=SUM(A1:A2)"');
  });
});
