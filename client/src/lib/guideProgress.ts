export const guideAcknowledgementStepIds = ["review", "govern", "brief", "report"] as const;

export function parseGuideAcknowledgements(raw: string | null) {
  try {
    const parsed = JSON.parse(raw ?? "[]");
    if (!Array.isArray(parsed)) return [];
    return Array.from(new Set(parsed.filter((item): item is string => typeof item === "string" && guideAcknowledgementStepIds.includes(item as typeof guideAcknowledgementStepIds[number]))));
  } catch {
    return [];
  }
}

export function toggleGuideAcknowledgement(current: string[], id: string) {
  if (!guideAcknowledgementStepIds.includes(id as typeof guideAcknowledgementStepIds[number])) return current;
  return current.includes(id) ? current.filter(item => item !== id) : [...current, id];
}
