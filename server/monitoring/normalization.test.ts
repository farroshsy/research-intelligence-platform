import { describe, expect, it } from "vitest";
import { compareNormalizedContent, normalizeSourceContent, sha256 } from "./normalization";
import { buildNotificationRecoveryInput, isAdvisoryEligible, isWithinRateLimit, resolveReviewStatus, validateExternalSourceUrl } from "./service";

describe("source canonicalization", () => {
  it("stabilizes JSON object ordering and removes configured volatile fields", () => {
    const output = normalizeSourceContent(
      "json_api",
      '{"updated_at":"2026-08-21","status":"open","metadata":{"counter":13,"name":"alpha"}}',
      {},
      { dropFields: ["updated_at"], ignoreKeysMatching: ["^counter$"] }
    );

    expect(output.canonicalText).toBe('{"metadata":{"name":"alpha"},"status":"open"}');
    expect(output.hash).toBe(sha256(output.canonicalText));
  });

  it("removes configured text volatility before hashing", () => {
    const output = normalizeSourceContent(
      "html_page",
      "<html><nav>navigation</nav><main>Important notice. Updated 2026-08-21.</main></html>",
      {},
      { removePatterns: ["Updated\\s+\\d{4}-\\d{2}-\\d{2}"] }
    );

    expect(output.canonicalText).toBe("navigation Important notice. .");
  });
});

describe("deterministic change classification", () => {
  it("returns no-change for an identical canonical representation", () => {
    const current = normalizeSourceContent("plain_text", "Stable content", {}, {});
    const result = compareNormalizedContent({ canonicalText: "Stable content", structuredPayload: null }, current, {});
    expect(result.classification).toBe("no_change");
    expect(result.deterministicScore).toBe(0);
  });

  it("elevates configured keyword changes to material", () => {
    const current = normalizeSourceContent("plain_text", "The application deadline is now 30 September.", {}, {});
    const result = compareNormalizedContent(
      { canonicalText: "The application window is open.", structuredPayload: null },
      current,
      { minChangedChars: 9999, ratioThreshold: 1, keywords: ["deadline"] }
    );
    expect(result.classification).toBe("material");
    expect(result.suggestedSignificance).toBe("high");
  });
});

describe("source URL validation", () => {
  it("accepts a normal external HTTPS URL", () => {
    expect(validateExternalSourceUrl("https://example.org/feed.json").hostname).toBe("example.org");
  });

  it("rejects local and credential-bearing URLs", () => {
    expect(() => validateExternalSourceUrl("http://127.0.0.1:8080/admin")).toThrow("not allowed");
    expect(() => validateExternalSourceUrl("https://user:secret@example.org/private")).toThrow("not allowed");
  });
});

describe("operational guardrails", () => {
  it("enforces the configured per-source request interval", () => {
    const lastCheck = new Date("2026-08-21T00:00:00.000Z");
    expect(isWithinRateLimit(lastCheck, 300, Date.parse("2026-08-21T00:04:59.000Z"))).toBe(true);
    expect(isWithinRateLimit(lastCheck, 300, Date.parse("2026-08-21T00:05:00.000Z"))).toBe(false);
  });

  it("requires a material candidate before confirmation or advisory analysis", () => {
    expect(resolveReviewStatus("material", "confirm_material")).toBe("confirmed");
    expect(() => resolveReviewStatus("cosmetic", "confirm_material")).toThrow("Only a material candidate");
    expect(isAdvisoryEligible("material")).toBe(true);
    expect(isAdvisoryEligible("no_change")).toBe(false);
  });

  it("keeps a failed owner notification linked to its source for operational audit", () => {
    expect(buildNotificationRecoveryInput(14, 29, 7)).toMatchObject({
      sourceId: 7,
      notificationId: 29,
      kind: "notification_retry",
      details: { changeEventId: 14, notificationType: "owner_push" },
    });
  });
});
