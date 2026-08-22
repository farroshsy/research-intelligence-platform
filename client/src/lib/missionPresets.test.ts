import { describe, expect, it } from "vitest";
import { missionPresets } from "./missionPresets";

describe("mission presets", () => {
  it("defines tailored career and procurement-policy materiality and brief guidance", () => {
    expect(missionPresets.career.materialSignals).toContain("application deadline");
    expect(missionPresets.career.briefSections).toContain("skills evidence");
    expect(missionPresets.career.guidedFields.find(field => field.key === "targetRoleOrProgramme")?.required).toBe(true);
    expect(missionPresets.procurement_policy.materialSignals).toContain("eligibility");
    expect(missionPresets.procurement_policy.briefSections).toContain("policy impact");
    expect(missionPresets.procurement_policy.guidedFields.find(field => field.key === "jurisdictionOrAuthority")?.required).toBe(true);
    expect(missionPresets.procurement_policy.materialityPolicy.reviewRequirement).toContain("Human review");
  });
});
