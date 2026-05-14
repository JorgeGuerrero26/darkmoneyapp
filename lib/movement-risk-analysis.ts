import { normalizeAnalyticsText } from "../services/analytics/movement-features";

export type MovementRiskKind = "duplicate" | "amount_anomaly";
export type MovementRiskSource = "local" | "deepseek";

export type MovementRiskItem = {
  id: number;
  movementType: string;
  occurredAt: string;
  description: string;
  amount: number;
  categoryId?: number | null;
  categoryName?: string | null;
  counterpartyId?: number | null;
  counterpartyName?: string | null;
  accountId?: number | null;
  accountName?: string | null;
};

export type MovementRiskExplanation = {
  kind: MovementRiskKind;
  severity: "low" | "medium" | "high";
  confidence: number;
  title: string;
  explanation: string;
  reasons: string[];
  relatedMovementIds: number[];
  source: MovementRiskSource;
};

function dayDistance(leftDate: string, rightDate: string) {
  const left = new Date(leftDate);
  const right = new Date(rightDate);
  if (Number.isNaN(left.getTime()) || Number.isNaN(right.getTime())) return Infinity;
  return Math.abs(left.getTime() - right.getTime()) / 86_400_000;
}

function textSimilarity(left: string, right: string) {
  const leftTokens = new Set(normalizeAnalyticsText(left).split(" ").filter((token) => token.length >= 3));
  const rightTokens = new Set(normalizeAnalyticsText(right).split(" ").filter((token) => token.length >= 3));
  const all = new Set([...leftTokens, ...rightTokens]);
  if (all.size === 0) return 0;
  let overlap = 0;
  for (const token of all) {
    if (leftTokens.has(token) && rightTokens.has(token)) overlap += 1;
  }
  return overlap / all.size;
}

function amountSimilarity(left: number, right: number) {
  if (!Number.isFinite(left) || !Number.isFinite(right) || left <= 0 || right <= 0) return 0;
  const diffRatio = Math.abs(left - right) / Math.max(left, right);
  if (diffRatio <= 0.01) return 1;
  if (diffRatio <= 0.05) return 0.88;
  if (diffRatio <= 0.1) return 0.7;
  return 0;
}

function median(values: number[]) {
  const sorted = values.filter((value) => Number.isFinite(value) && value > 0).sort((a, b) => a - b);
  if (sorted.length === 0) return null;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

export function analyzeMovementRiskLocally(
  current: MovementRiskItem | null,
  history: MovementRiskItem[],
): MovementRiskExplanation | null {
  if (!current || current.amount <= 0 || current.movementType === "transfer") return null;

  const duplicateCandidates = history
    .filter((item) => item.id !== current.id && item.movementType === current.movementType)
    .map((item) => {
      const days = dayDistance(current.occurredAt, item.occurredAt);
      if (days > 2) return null;
      const amountScore = amountSimilarity(current.amount, item.amount);
      if (amountScore < 0.7) return null;
      const textScore = textSimilarity(current.description, item.description);
      const sameCounterparty = current.counterpartyId != null && item.counterpartyId === current.counterpartyId;
      const sameAccount = current.accountId != null && item.accountId === current.accountId;
      const sameCategory = current.categoryId != null && item.categoryId === current.categoryId;
      let score = amountScore * 0.42 + Math.max(textScore, sameCounterparty ? 0.75 : 0) * 0.34;
      if (days < 0.75) score += 0.1;
      if (sameAccount) score += 0.06;
      if (sameCategory) score += 0.04;
      if (sameCounterparty) score += 0.08;
      const reasons = [
        days < 0.75 ? "mismo día" : "fecha cercana",
        amountScore >= 0.88 ? "monto casi igual" : null,
        textScore >= 0.55 ? "texto parecido" : null,
        sameAccount ? "misma cuenta" : null,
        sameCounterparty ? "misma contraparte" : null,
      ].filter((reason): reason is string => Boolean(reason));
      return { item, score: Math.min(1, score), reasons };
    })
    .filter((entry): entry is { item: MovementRiskItem; score: number; reasons: string[] } => Boolean(entry))
    .sort((left, right) => right.score - left.score);

  const strongestDuplicate = duplicateCandidates[0];
  if (strongestDuplicate && strongestDuplicate.score >= 0.68) {
    const confidence = strongestDuplicate.score;
    return {
      kind: "duplicate",
      severity: confidence >= 0.82 ? "high" : "medium",
      confidence,
      title: "Podría estar repetido",
      explanation: `Se parece a otro movimiento por ${strongestDuplicate.reasons.slice(0, 3).join(", ")}.`,
      reasons: strongestDuplicate.reasons.slice(0, 4),
      relatedMovementIds: duplicateCandidates.slice(0, 3).map((entry) => entry.item.id),
      source: "local",
    };
  }

  const comparable = history.filter((item) => {
    if (item.id === current.id || item.movementType !== current.movementType) return false;
    if (current.categoryId != null && item.categoryId === current.categoryId) return true;
    if (current.counterpartyId != null && item.counterpartyId === current.counterpartyId) return true;
    return false;
  });
  if (comparable.length >= 5) {
    const base = median(comparable.map((item) => item.amount));
    if (base && current.amount >= base * 2.5 && current.amount - base >= 10) {
      const confidence = Math.min(0.86, 0.56 + Math.min(0.3, (current.amount / base - 2.5) * 0.08));
      return {
        kind: "amount_anomaly",
        severity: confidence >= 0.78 ? "high" : "medium",
        confidence,
        title: "Monto inusual",
        explanation: `Este monto es bastante mayor que tu valor habitual cercano a ${Math.round(base * 100) / 100}.`,
        reasons: ["monto fuera de tu patrón", current.categoryName ? `categoría ${current.categoryName}` : "historial comparable"],
        relatedMovementIds: comparable.slice(0, 3).map((item) => item.id),
        source: "local",
      };
    }
  }

  return null;
}
