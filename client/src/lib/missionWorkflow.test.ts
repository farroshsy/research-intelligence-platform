import { describe, expect, it } from "vitest";
import { getMissionWorkflowNextStep } from "./missionWorkflow";

describe("mission workflow readiness", () => {
  it("prioritizes preserved evidence before graph, clustering, and decision work", () => {
    expect(getMissionWorkflowNextStep({ claims: 0, linkedClaims: 0, relationships: 0, clusters: 0, briefs: 0, openActions: 0 })).toContain("evidence claim");
    expect(getMissionWorkflowNextStep({ claims: 1, linkedClaims: 0, relationships: 0, clusters: 0, briefs: 0, openActions: 0 })).toContain("owned entities");
    expect(getMissionWorkflowNextStep({ claims: 1, linkedClaims: 1, relationships: 1, clusters: 1, briefs: 1, openActions: 2 })).toContain("open accountable actions");
  });
});
