import type { PatternMovement } from "../services/queries/movement-patterns";

type FreqEntry = { id: number; count: number };

export type PatternMaps = {
  /** normalized word → [{categoryId, count}] sorted desc */
  wordToCategory: Map<string, FreqEntry[]>;
  /** counterpartyId → [{categoryId, count}] sorted desc */
  counterpartyToCategory: Map<number, FreqEntry[]>;
  /** categoryId → [{counterpartyId, count}] sorted desc */
  categoryToCounterparty: Map<number, FreqEntry[]>;
  /** counterpartyId → [{accountId, count}] sorted desc */
  counterpartyToAccount: Map<number, FreqEntry[]>;
};

/** Splits text into normalized words (lowercase, only alphanum + Spanish chars, min 3 chars) */
function normalizeWords(text: string): string[] {
  return text
    .toLowerCase()
    .split(/\s+/)
    .map((w) => w.replace(/[^a-záéíóúüñ0-9]/gi, ""))
    .filter((w) => w.length > 2);
}

function toSorted(map: Map<number, number>): FreqEntry[] {
  return Array.from(map.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([id, count]) => ({ id, count }));
}

export function buildPatternMaps(movements: PatternMovement[]): PatternMaps {
  const rawWord = new Map<string, Map<number, number>>();
  const rawCpToCat = new Map<number, Map<number, number>>();
  const rawCatToCp = new Map<number, Map<number, number>>();
  const rawCpToAcc = new Map<number, Map<number, number>>();

  for (const m of movements) {
    const catId = m.category_id;
    const cpId = m.counterparty_id;
    const accId = m.source_account_id;

    if (catId && m.description) {
      for (const word of normalizeWords(m.description)) {
        if (!rawWord.has(word)) rawWord.set(word, new Map());
        const freq = rawWord.get(word)!;
        freq.set(catId, (freq.get(catId) ?? 0) + 1);
      }
    }

    if (cpId && catId) {
      if (!rawCpToCat.has(cpId)) rawCpToCat.set(cpId, new Map());
      const freq = rawCpToCat.get(cpId)!;
      freq.set(catId, (freq.get(catId) ?? 0) + 1);
    }

    if (catId && cpId) {
      if (!rawCatToCp.has(catId)) rawCatToCp.set(catId, new Map());
      const freq = rawCatToCp.get(catId)!;
      freq.set(cpId, (freq.get(cpId) ?? 0) + 1);
    }

    if (cpId && accId) {
      if (!rawCpToAcc.has(cpId)) rawCpToAcc.set(cpId, new Map());
      const freq = rawCpToAcc.get(cpId)!;
      freq.set(accId, (freq.get(accId) ?? 0) + 1);
    }
  }

  return {
    wordToCategory: new Map(Array.from(rawWord.entries()).map(([k, v]) => [k, toSorted(v)])),
    counterpartyToCategory: new Map(Array.from(rawCpToCat.entries()).map(([k, v]) => [k, toSorted(v)])),
    categoryToCounterparty: new Map(Array.from(rawCatToCp.entries()).map(([k, v]) => [k, toSorted(v)])),
    counterpartyToAccount: new Map(Array.from(rawCpToAcc.entries()).map(([k, v]) => [k, toSorted(v)])),
  };
}

/**
 * Suggests a categoryId based on description words.
 * Scores each category by summing per-word frequency counts, returns the top match.
 * Returns null if no confident suggestion (needs at least 2 occurrences).
 */
export function suggestCategoryFromDescription(
  description: string,
  maps: PatternMaps,
  excludeId?: number | null,
): number | null {
  const words = normalizeWords(description);
  if (!words.length) return null;

  const scores = new Map<number, number>();
  for (const word of words) {
    for (const { id, count } of maps.wordToCategory.get(word) ?? []) {
      scores.set(id, (scores.get(id) ?? 0) + count);
    }
  }

  const sorted = Array.from(scores.entries()).sort((a, b) => b[1] - a[1]);
  const best = sorted.find(([id, count]) => id !== excludeId && count >= 2);
  return best ? best[0] : null;
}

/** Suggests a categoryId based on which category this counterparty has been assigned to most. */
export function suggestCategoryFromCounterparty(
  counterpartyId: number,
  maps: PatternMaps,
  excludeId?: number | null,
): number | null {
  const entries = maps.counterpartyToCategory.get(counterpartyId) ?? [];
  const best = entries.find((e) => e.id !== excludeId && e.count >= 2);
  return best?.id ?? null;
}

/** Suggests a counterpartyId based on which counterparty has been used most with this category. */
export function suggestCounterpartyFromCategory(
  categoryId: number,
  maps: PatternMaps,
  excludeId?: number | null,
): number | null {
  const entries = maps.categoryToCounterparty.get(categoryId) ?? [];
  const best = entries.find((e) => e.id !== excludeId && e.count >= 2);
  return best?.id ?? null;
}

/** Suggests a source accountId based on which account has been used most with this counterparty. */
export function suggestAccountFromCounterparty(
  counterpartyId: number,
  maps: PatternMaps,
  excludeId?: number | null,
): number | null {
  const entries = maps.counterpartyToAccount.get(counterpartyId) ?? [];
  const best = entries.find((e) => e.id !== excludeId && e.count >= 2);
  return best?.id ?? null;
}
