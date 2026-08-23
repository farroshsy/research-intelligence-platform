export type BatchPreviewRow = { row: number; name: string; url: string; sourceType: "json_api" | "html_page" | "rss" | "plain_text"; checkCron: string; steward?: string; valid: boolean; reason: string };

export function buildBatchPreview(csv: string, existingUrls: Iterable<string>): BatchPreviewRow[] {
  const existing = new Set(Array.from(existingUrls, url => url.trim().toLowerCase()));
  const batchUrls = new Set<string>();
  return csv.split("\n").map(line => line.trim()).filter(Boolean).map((line, index) => {
    const [rawName = "", rawUrl = "", rawType = "html_page", rawCron = "0 0 9 * * *", rawSteward = ""] = line.split(",").map(value => value.trim());
    const name = rawName.trim(); const url = rawUrl.trim(); const sourceType = rawType as BatchPreviewRow["sourceType"]; const checkCron = rawCron.trim(); const steward = rawSteward.trim() || undefined;
    const canonicalUrl = url.toLowerCase();
    let reason = "Ready — will be created paused.";
    if (name.length < 2) reason = "Name must contain at least two characters.";
    else if (!/^https?:\/\//i.test(url)) reason = "Use a public HTTP(S) URL.";
    else if (!["json_api", "html_page", "rss", "plain_text"].includes(sourceType)) reason = "Choose json_api, html_page, rss, or plain_text.";
    else if (checkCron.split(/\s+/).length !== 6) reason = "Use a six-field UTC cron expression.";
    else if (existing.has(canonicalUrl)) reason = "This URL already exists in your workspace.";
    else if (batchUrls.has(canonicalUrl)) reason = "This URL is duplicated in this batch.";
    if (canonicalUrl) batchUrls.add(canonicalUrl);
    return { row: index + 1, name, url, sourceType, checkCron, steward, valid: reason.startsWith("Ready"), reason };
  });
}

export function getImportableBatchRows(rows: BatchPreviewRow[]) {
  return rows.filter(row => row.valid).map(({ row: _row, valid: _valid, reason: _reason, ...input }) => input);
}
