export type FinanceAgentLookupItem = {
  id: string;
  label: string;
  detail?: string | null;
  kind?: string | null;
  status?: string | null;
};

function normalizeLookupText(value: string) {
  return value
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

function scoreLookupCandidate(query: string, candidate: FinanceAgentLookupItem) {
  const normalizedQuery = normalizeLookupText(query);
  const normalizedLabel = normalizeLookupText(candidate.label);
  const normalizedDetail = normalizeLookupText(candidate.detail ?? '');
  const target = `${normalizedLabel} ${normalizedDetail}`.trim();

  if (!normalizedQuery || !target) return 0;
  if (normalizedLabel === normalizedQuery) return 1;
  if (target.includes(normalizedQuery)) return 0.92;
  if (normalizedQuery.includes(normalizedLabel)) return 0.86;

  const queryTokens = new Set(normalizedQuery.split(' ').filter(Boolean));
  const targetTokens = new Set(target.split(' ').filter(Boolean));
  const matches = [...queryTokens].filter((token) => targetTokens.has(token)).length;
  if (!matches) return 0;

  const overlap = matches / Math.max(1, queryTokens.size);
  return Math.min(0.82, overlap);
}

export function bestFinanceAgentMatch(query: string, candidates: FinanceAgentLookupItem[]) {
  const ranked = candidates
    .map((candidate) => ({
      candidate,
      score: scoreLookupCandidate(query, candidate)
    }))
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score);

  const best = ranked[0] ?? null;
  if (!best) {
    return null;
  }

  return {
    ...best.candidate,
    score: best.score
  };
}

export function filterFinanceAgentMatches(query: string | null | undefined, candidates: FinanceAgentLookupItem[], limit = 10) {
  const normalizedLimit = Math.max(1, Math.min(30, Math.trunc(limit)));
  if (!query?.trim()) {
    return candidates.slice(0, normalizedLimit).map((candidate) => ({ ...candidate, score: 1 }));
  }

  return candidates
    .map((candidate) => ({
      ...candidate,
      score: scoreLookupCandidate(query, candidate)
    }))
    .filter((candidate) => candidate.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, normalizedLimit);
}
