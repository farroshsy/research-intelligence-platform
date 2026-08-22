export function matchesSourceGovernanceFilters(input: { status: string; steward: string | null; tags: string[]; collectionIds: number[] }, filters: { status: string; tag: string; collection: string; steward: string }) {
  return (filters.status === "all" || input.status === filters.status) && (filters.tag === "all" || input.tags.includes(filters.tag)) && (filters.collection === "all" || input.collectionIds.includes(Number(filters.collection))) && (!filters.steward.trim() || (input.steward ?? "").toLowerCase().includes(filters.steward.toLowerCase()));
}
