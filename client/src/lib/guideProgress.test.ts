import { describe, expect, it } from "vitest";
import { parseGuideAcknowledgements, toggleGuideAcknowledgement } from "./guideProgress";

describe("in-product guide progress", () => {
  it("keeps only local acknowledgement steps and never treats mission or source setup as locally complete", () => {
    expect(parseGuideAcknowledgements('["review","mission","review",42]')).toEqual(["review"]);
    expect(toggleGuideAcknowledgement(["review"], "govern")).toEqual(["review", "govern"]);
    expect(toggleGuideAcknowledgement(["review"], "review")).toEqual([]);
    expect(toggleGuideAcknowledgement([], "sources")).toEqual([]);
  });
});
