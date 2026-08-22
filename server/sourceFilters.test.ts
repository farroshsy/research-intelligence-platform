import { describe, expect, it } from "vitest";
import { matchesSourceGovernanceFilters } from "../client/src/lib/sourceFilters";

describe("matchesSourceGovernanceFilters", () => {
  const source = { status: "active", steward: "Research APJ", tags: ["policy", "priority"], collectionIds: [7, 11] };
  it("requires every selected governance filter to match", () => {
    expect(matchesSourceGovernanceFilters(source, { status: "active", tag: "policy", collection: "7", steward: "apj" })).toBe(true);
    expect(matchesSourceGovernanceFilters(source, { status: "paused", tag: "policy", collection: "7", steward: "apj" })).toBe(false);
    expect(matchesSourceGovernanceFilters(source, { status: "active", tag: "finance", collection: "7", steward: "apj" })).toBe(false);
    expect(matchesSourceGovernanceFilters(source, { status: "active", tag: "policy", collection: "99", steward: "apj" })).toBe(false);
    expect(matchesSourceGovernanceFilters(source, { status: "active", tag: "policy", collection: "7", steward: "owner" })).toBe(false);
  });
});
