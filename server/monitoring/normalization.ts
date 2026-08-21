import crypto from "crypto";

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

export type NormalizationConfig = {
  fieldPaths?: string[];
  includePatterns?: string[];
  extractionVersion?: string;
};

export type IgnoreRules = {
  dropFields?: string[];
  removePatterns?: string[];
  ignoreKeysMatching?: string[];
};

export type MaterialityPolicy = {
  minChangedChars?: number;
  ratioThreshold?: number;
  keywords?: string[];
};

export type NormalizedContent = {
  canonicalText: string;
  structuredPayload: Record<string, unknown> | null;
  hash: string;
  extractionVersion: string;
};

export type ComparisonResult = {
  classification: "no_change" | "cosmetic" | "material";
  changedFields: string[];
  structuredDiff: Record<string, unknown>;
  deterministicScore: number;
  suggestedSignificance: "low" | "medium" | "high";
};

const MAX_DIFF_ITEMS = 30;

function normalizeWhitespace(value: string): string {
  return value.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}

function stableValue(value: unknown, dropFields: Set<string>, ignoredKeyPatterns: RegExp[]): JsonValue {
  if (Array.isArray(value)) {
    return value.map(item => stableValue(item, dropFields, ignoredKeyPatterns));
  }
  if (value && typeof value === "object") {
    return Object.keys(value as Record<string, unknown>)
      .filter(key => !dropFields.has(key) && !ignoredKeyPatterns.some(pattern => pattern.test(key)))
      .sort()
      .reduce((acc, key) => {
        acc[key] = stableValue((value as Record<string, unknown>)[key], dropFields, ignoredKeyPatterns);
        return acc;
      }, {} as Record<string, JsonValue>);
  }
  if (typeof value === "string") return normalizeWhitespace(value);
  if (typeof value === "number" || typeof value === "boolean" || value === null) return value;
  return String(value);
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function safePatterns(values: string[]): RegExp[] {
  return values.slice(0, 20).flatMap(value => {
    try {
      return [new RegExp(value, "gi")];
    } catch {
      return [];
    }
  });
}

function stripMarkup(input: string): string {
  return input
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<[^>]+>/g, " ");
}

function applyTextRules(input: string, rules: IgnoreRules): string {
  let output = input;
  for (const pattern of safePatterns(asStringArray(rules.removePatterns))) {
    output = output.replace(pattern, " ");
  }
  return normalizeWhitespace(output);
}

export function sha256(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

export function normalizeSourceContent(
  sourceType: "json_api" | "html_page" | "rss" | "plain_text",
  rawContent: string,
  parserConfig: Record<string, unknown>,
  ignoreRules: Record<string, unknown>
): NormalizedContent {
  const config = parserConfig as NormalizationConfig;
  const rules = ignoreRules as IgnoreRules;
  const extractionVersion = typeof config.extractionVersion === "string" ? config.extractionVersion : "v1";

  if (sourceType === "json_api") {
    const parsed = JSON.parse(rawContent) as unknown;
    const stable = stableValue(
      parsed,
      new Set(asStringArray(rules.dropFields)),
      safePatterns(asStringArray(rules.ignoreKeysMatching))
    );
    const canonicalText = JSON.stringify(stable);
    return { canonicalText, structuredPayload: stable as Record<string, unknown>, hash: sha256(canonicalText), extractionVersion };
  }

  let normalized = sourceType === "html_page" || sourceType === "rss" ? stripMarkup(rawContent) : rawContent;
  normalized = applyTextRules(normalized, rules);

  const patterns = asStringArray(config.includePatterns);
  if (patterns.length > 0) {
    const selected = patterns.flatMap(pattern => {
      try {
        return Array.from(normalized.matchAll(new RegExp(pattern, "gi"))).map(match => match[0]);
      } catch {
        return [];
      }
    });
    if (selected.length > 0) normalized = normalizeWhitespace(selected.join("\n"));
  }

  return {
    canonicalText: normalized,
    structuredPayload: null,
    hash: sha256(normalized),
    extractionVersion,
  };
}

function lineDiff(previous: string, current: string) {
  const beforeLines = previous.split(/\n+/).map(normalizeWhitespace).filter(Boolean);
  const afterLines = current.split(/\n+/).map(normalizeWhitespace).filter(Boolean);
  const beforeSet = new Set(beforeLines);
  const afterSet = new Set(afterLines);
  const removed = beforeLines.filter(line => !afterSet.has(line)).slice(0, MAX_DIFF_ITEMS);
  const added = afterLines.filter(line => !beforeSet.has(line)).slice(0, MAX_DIFF_ITEMS);
  const changedUnits = added.length + removed.length;
  const denominator = Math.max(beforeLines.length, afterLines.length, 1);
  return { added, removed, ratio: changedUnits / denominator };
}

function diffJson(previous: unknown, current: unknown, path = "$", changes: Array<Record<string, unknown>> = []): Array<Record<string, unknown>> {
  if (changes.length >= MAX_DIFF_ITEMS) return changes;
  if (Object.is(previous, current)) return changes;
  if (Array.isArray(previous) || Array.isArray(current)) {
    changes.push({ path, before: previous, after: current, kind: "array_changed" });
    return changes;
  }
  if (
    previous && current && typeof previous === "object" && typeof current === "object"
  ) {
    const keys = new Set([...Object.keys(previous as Record<string, unknown>), ...Object.keys(current as Record<string, unknown>)]);
    for (const key of Array.from(keys).sort()) {
      diffJson(
        (previous as Record<string, unknown>)[key],
        (current as Record<string, unknown>)[key],
        `${path}.${key}`,
        changes
      );
      if (changes.length >= MAX_DIFF_ITEMS) break;
    }
    return changes;
  }
  changes.push({ path, before: previous, after: current, kind: "value_changed" });
  return changes;
}

export function compareNormalizedContent(
  previous: { canonicalText: string; structuredPayload: Record<string, unknown> | null },
  current: NormalizedContent,
  policyInput: Record<string, unknown>
): ComparisonResult {
  if (previous.canonicalText === current.canonicalText) {
    return {
      classification: "no_change",
      changedFields: [],
      structuredDiff: { kind: "no_change", additions: [], removals: [] },
      deterministicScore: 0,
      suggestedSignificance: "low",
    };
  }

  const policy = policyInput as MaterialityPolicy;
  const minChangedChars = typeof policy.minChangedChars === "number" ? policy.minChangedChars : 160;
  const ratioThreshold = typeof policy.ratioThreshold === "number" ? policy.ratioThreshold : 0.05;
  const keywords = asStringArray(policy.keywords).map(value => value.toLowerCase());

  if (previous.structuredPayload && current.structuredPayload) {
    const changes = diffJson(previous.structuredPayload, current.structuredPayload);
    const diffText = JSON.stringify(changes).toLowerCase();
    const keywordHit = keywords.find(keyword => diffText.includes(keyword));
    const score = Math.min(1, changes.length / 10);
    const material = Boolean(keywordHit) || changes.length >= 3 || score >= ratioThreshold;
    return {
      classification: material ? "material" : "cosmetic",
      changedFields: changes.map(change => String(change.path)),
      structuredDiff: { kind: "json", changes, keywordHit: keywordHit ?? null },
      deterministicScore: score,
      suggestedSignificance: material ? (keywordHit || changes.length >= 6 ? "high" : "medium") : "low",
    };
  }

  const diff = lineDiff(previous.canonicalText, current.canonicalText);
  const changedCharacters = Math.abs(current.canonicalText.length - previous.canonicalText.length) + diff.added.join(" ").length + diff.removed.join(" ").length;
  const diffText = `${diff.added.join(" ")} ${diff.removed.join(" ")}`.toLowerCase();
  const keywordHit = keywords.find(keyword => diffText.includes(keyword));
  const material = Boolean(keywordHit) || changedCharacters >= minChangedChars || diff.ratio >= ratioThreshold;

  return {
    classification: material ? "material" : "cosmetic",
    changedFields: diff.added.concat(diff.removed).slice(0, MAX_DIFF_ITEMS),
    structuredDiff: { kind: "text", ...diff, changedCharacters, keywordHit: keywordHit ?? null },
    deterministicScore: Math.min(1, diff.ratio),
    suggestedSignificance: material ? (keywordHit || diff.ratio >= 0.25 ? "high" : "medium") : "low",
  };
}
