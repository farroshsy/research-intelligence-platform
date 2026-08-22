export type MissionTemplate = "general" | "career" | "procurement_policy";

export type MissionPreset = {
  label: string;
  description: string;
  decisionQuestionPlaceholder: string;
  sourceGuidance: string;
  materialSignals: string[];
  briefSections: string[];
  urgency: string;
  guidedFields: Array<{ key: string; label: string; placeholder: string; required?: boolean }>;
  materialityPolicy: {
    presetVersion: string;
    urgency: string;
    materialSignals: string[];
    recommendedBriefSections: string[];
    reviewRequirement: string;
  };
};

export const missionPresets: Record<MissionTemplate, MissionPreset> = {
  general: {
    label: "General research",
    description: "Frame an evidence-bounded decision before collecting signals from approved sources.",
    decisionQuestionPlaceholder: "What decision should this mission support, and what evidence would change it?",
    sourceGuidance: "Link only sources you are permitted to monitor and can review later.",
    materialSignals: ["policy shift", "deadline", "eligibility", "material update"],
    briefSections: ["signal", "evidence", "impact", "options"],
    urgency: "materiality",
    guidedFields: [],
    materialityPolicy: { presetVersion: "general-v1", urgency: "materiality", materialSignals: ["policy shift", "deadline", "eligibility", "material update"], recommendedBriefSections: ["signal", "evidence", "impact", "options"], reviewRequirement: "Human review before any decision or action." },
  },
  career: {
    label: "Career intelligence",
    description: "Track role-fit evidence and deadlines without treating a recommendation as an automatic application decision.",
    decisionQuestionPlaceholder: "Which verified requirements, deadlines, or role signals should inform my next career decision?",
    sourceGuidance: "Use official careers pages, role descriptions, and approved programme sources you can verify.",
    materialSignals: ["application deadline", "eligibility", "required skill", "location", "programme change"],
    briefSections: ["role fit", "skills evidence", "eligibility", "deadline", "human next action"],
    urgency: "deadline",
    guidedFields: [{ key: "targetRoleOrProgramme", label: "Target role or programme", placeholder: "e.g. a role family or programme to assess", required: true }, { key: "locationOrWorkAuthorisation", label: "Location or work-authorisation concern", placeholder: "Country, city, or eligibility context" }, { key: "deadlineConcern", label: "Deadline concern", placeholder: "What timing must be verified?" }, { key: "skillFocus", label: "Skill focus", placeholder: "Skills or technical evidence to track" }],
    materialityPolicy: { presetVersion: "career-v1", urgency: "deadline", materialSignals: ["application deadline", "eligibility", "required skill", "location", "programme change"], recommendedBriefSections: ["role fit", "skills evidence", "eligibility", "deadline", "human next action"], reviewRequirement: "Human review before application, contact, or submission." },
  },
  procurement_policy: {
    label: "Procurement & policy",
    description: "Track official opportunity, regulation, and qualification changes while leaving bid, filing, and escalation decisions to people.",
    decisionQuestionPlaceholder: "Which verified procurement or policy changes could affect our eligibility, response timeline, or review decision?",
    sourceGuidance: "Use official notices, regulation publishers, and permitted procurement portals only.",
    materialSignals: ["publication", "amendment", "eligibility", "submission deadline", "value or scope"],
    briefSections: ["opportunity", "qualification", "policy impact", "response options", "human accountable action"],
    urgency: "publication",
    guidedFields: [{ key: "jurisdictionOrAuthority", label: "Jurisdiction or issuing authority", placeholder: "Country, regulator, buyer, or authority", required: true }, { key: "noticeType", label: "Notice or policy type", placeholder: "Tender, amendment, consultation, regulation…" }, { key: "eligibilityFocus", label: "Eligibility focus", placeholder: "Qualification or compliance issue to verify" }, { key: "submissionWindow", label: "Submission or response window", placeholder: "Deadline or timing concern" }],
    materialityPolicy: { presetVersion: "procurement-policy-v1", urgency: "publication", materialSignals: ["publication", "amendment", "eligibility", "submission deadline", "value or scope"], recommendedBriefSections: ["opportunity", "qualification", "policy impact", "response options", "human accountable action"], reviewRequirement: "Human review before filing, bidding, escalation, or external communication." },
  },
};
