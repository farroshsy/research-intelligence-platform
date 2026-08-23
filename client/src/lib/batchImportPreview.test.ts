import { describe, expect, it } from "vitest";
import { buildBatchPreview, getImportableBatchRows } from "./batchImportPreview";

describe("batch import preview", () => {
  it("marks invalid and duplicate rows while forwarding only valid rows for paused-source creation", () => {
    const rows = buildBatchPreview("Official RSS,https://example.org/feed,rss,0 0 9 * * *,Owner\nDuplicate,https://example.org/feed,rss,0 0 9 * * *,Owner\nExisting,https://known.example,html_page,0 0 9 * * *,Owner\nBad type,https://other.example,atom,0 0 9 * * *,Owner", ["https://known.example"]);
    expect(rows.map(row => row.valid)).toEqual([true, false, false, false]);
    expect(rows[1]?.reason).toContain("duplicated");
    expect(rows[2]?.reason).toContain("already exists");
    expect(getImportableBatchRows(rows)).toEqual([{ name: "Official RSS", url: "https://example.org/feed", sourceType: "rss", checkCron: "0 0 9 * * *", steward: "Owner" }]);
  });
});
