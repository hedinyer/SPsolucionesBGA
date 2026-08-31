/** Normalize for search: lowercase, strip diacritics. */
export function normalizeSearch(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function bigrams(s: string): string[] {
  if (s.length < 2) return s.length === 1 ? [s] : [];
  const out: string[] = [];
  for (let i = 0; i < s.length - 1; i++) {
    out.push(s.slice(i, i + 2));
  }
  return out;
}

/** Dice coefficient on character bigrams (0–1). */
export function diceCoefficient(a: string, b: string): number {
  if (!a && !b) return 1;
  if (!a || !b) return 0;
  if (a === b) return 1;
  const aGrams = bigrams(a);
  const bGrams = bigrams(b);
  if (aGrams.length === 0 || bGrams.length === 0) {
    return a === b ? 1 : 0;
  }
  const bCounts = new Map<string, number>();
  for (const g of bGrams) {
    bCounts.set(g, (bCounts.get(g) ?? 0) + 1);
  }
  let overlap = 0;
  for (const g of aGrams) {
    const n = bCounts.get(g) ?? 0;
    if (n > 0) {
      overlap += 1;
      bCounts.set(g, n - 1);
    }
  }
  return (2 * overlap) / (aGrams.length + bGrams.length);
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const rows = a.length + 1;
  const cols = b.length + 1;
  let prev = new Array<number>(cols);
  let curr = new Array<number>(cols);
  for (let j = 0; j < cols; j++) prev[j] = j;
  for (let i = 1; i < rows; i++) {
    curr[0] = i;
    const ca = a.charCodeAt(i - 1);
    for (let j = 1; j < cols; j++) {
      const cost = ca === b.charCodeAt(j - 1) ? 0 : 1;
      curr[j] = Math.min(
        prev[j]! + 1,
        curr[j - 1]! + 1,
        prev[j - 1]! + cost,
      );
    }
    [prev, curr] = [curr, prev];
  }
  return prev[b.length]!;
}

/** Similarity from edit distance: 1 - dist / maxLen. */
export function editSimilarity(a: string, b: string): number {
  if (!a && !b) return 1;
  if (!a || !b) return 0;
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return 1 - levenshtein(a, b) / maxLen;
}

/**
 * Score query against a haystack (both should already be normalized, or will be).
 * Final score = max(Dice on full strings, mean best-token edit similarity).
 */
export function similarityScore(query: string, haystack: string): number {
  const q = normalizeSearch(query.trim());
  const h = normalizeSearch(haystack.trim());
  if (!q || !h) return 0;
  if (h.includes(q)) return 1;

  const dice = diceCoefficient(q.replace(/\s+/g, ""), h.replace(/\s+/g, ""));

  const qTokens = q.split(/\s+/).filter(Boolean);
  const hTokens = h.split(/\s+/).filter(Boolean);
  if (qTokens.length === 0 || hTokens.length === 0) {
    return dice;
  }

  let tokenSum = 0;
  for (const qt of qTokens) {
    let best = 0;
    for (const ht of hTokens) {
      const s = Math.max(editSimilarity(qt, ht), diceCoefficient(qt, ht));
      if (s > best) best = s;
    }
    tokenSum += best;
  }
  const tokenScore = tokenSum / qTokens.length;

  return Math.max(dice, tokenScore);
}

export type RankedItem<T> = { item: T; score: number };

export type RankBySimilarityOptions = {
  /** Minimum score to include (default 0.45). */
  threshold?: number;
  /** Max results (default 20). */
  limit?: number;
};

/**
 * Rank items by text similarity to query. Items below threshold are dropped.
 * Sorted by score desc, then stable by original order for ties.
 */
export function rankBySimilarity<T>(
  query: string,
  items: readonly T[],
  getHaystack: (item: T) => string,
  options?: RankBySimilarityOptions,
): RankedItem<T>[] {
  const threshold = options?.threshold ?? 0.45;
  const limit = options?.limit ?? 20;
  const q = query.trim();
  if (!q || items.length === 0) return [];

  const ranked: RankedItem<T>[] = [];
  for (const item of items) {
    const score = similarityScore(q, getHaystack(item));
    if (score >= threshold) {
      ranked.push({ item, score });
    }
  }

  ranked.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return 0;
  });

  return ranked.slice(0, limit);
}
