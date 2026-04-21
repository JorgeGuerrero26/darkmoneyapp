export type AnalyticsMovementLike = {
  id: number;
  movementType: string;
  status: string;
  occurredAt: string;
  sourceAccountId: number | null;
  destinationAccountId: number | null;
  categoryId: number | null;
  counterpartyId: number | null;
  description: string;
};

export type MovementFeature = {
  id: number;
  normalizedDescription: string;
  tokens: string[];
  tokenSet: Set<string>;
  weekday: number;
  accountId: number | null;
  counterpartyId: number | null;
  categoryId: number | null;
  timestamp: number;
};

export function normalizeAnalyticsText(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[0-9]/g, " ")
    .replace(/[^a-z\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function tokenizeAnalyticsText(value: string) {
  return normalizeAnalyticsText(value)
    .split(" ")
    .filter((token) => token.length >= 3);
}

export function buildMovementFeature(movement: AnalyticsMovementLike): MovementFeature {
  const tokens = tokenizeAnalyticsText(movement.description);
  const occurredAt = new Date(movement.occurredAt);
  const sourceAccountId = movement.sourceAccountId ?? null;
  const destinationAccountId = movement.destinationAccountId ?? null;
  return {
    id: movement.id,
    normalizedDescription: normalizeAnalyticsText(movement.description),
    tokens,
    tokenSet: new Set(tokens),
    weekday: occurredAt.getDay(),
    accountId: sourceAccountId ?? destinationAccountId,
    counterpartyId: movement.counterpartyId ?? null,
    categoryId: movement.categoryId ?? null,
    timestamp: occurredAt.getTime(),
  };
}

export function buildInverseDocumentFrequency(features: MovementFeature[]) {
  const documentFrequency = new Map<string, number>();
  for (const feature of features) {
    for (const token of feature.tokenSet) {
      documentFrequency.set(token, (documentFrequency.get(token) ?? 0) + 1);
    }
  }

  const totalDocuments = Math.max(features.length, 1);
  const idf = new Map<string, number>();
  for (const [token, count] of documentFrequency.entries()) {
    idf.set(token, Math.log((1 + totalDocuments) / (1 + count)) + 1);
  }
  return idf;
}

export function weightedJaccardSimilarity(
  left: MovementFeature,
  right: MovementFeature,
  idf: Map<string, number>,
) {
  const allTokens = new Set([...left.tokenSet, ...right.tokenSet]);
  if (allTokens.size === 0) return 0;

  let intersection = 0;
  let union = 0;
  for (const token of allTokens) {
    const weight = idf.get(token) ?? 1;
    const inLeft = left.tokenSet.has(token);
    const inRight = right.tokenSet.has(token);
    if (inLeft || inRight) union += weight;
    if (inLeft && inRight) intersection += weight;
  }
  return union > 0 ? intersection / union : 0;
}

export function amountSimilarity(leftAmount: number, rightAmount: number) {
  if (leftAmount <= 0.009 || rightAmount <= 0.009) return 0;
  const ratio = Math.abs(leftAmount - rightAmount) / Math.max(leftAmount, rightAmount);
  if (ratio >= 0.6) return 0;
  return 1 - ratio / 0.6;
}
