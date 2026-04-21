import {
  amountSimilarity,
  buildInverseDocumentFrequency,
  buildMovementFeature,
  type AnalyticsMovementLike,
  type MovementFeature,
  weightedJaccardSimilarity,
} from "./movement-features";

export type PatternCluster = {
  label: string;
  categoryId: number | null;
  category: string;
  total: number;
  count: number;
  average: number;
  movementIds: number[];
  lastAt: string;
  type: "Ingreso" | "Gasto";
  confidence: number;
  variantCount: number;
  reason: string;
};

type BuildPatternClustersOptions<TMovement extends AnalyticsMovementLike> = {
  movements: TMovement[];
  isCashflow: (movement: TMovement) => boolean;
  isIncomeLike: (movement: TMovement) => boolean;
  getAmount: (movement: TMovement) => number;
  categoryNames?: ReadonlyMap<number, string>;
  now?: Date;
  sinceDays?: number;
  limit?: number;
};

type ClusterCandidate<TMovement extends AnalyticsMovementLike> = {
  movement: TMovement;
  feature: MovementFeature;
  amount: number;
  isIncome: boolean;
};

function dayDistance(left: Date, right: Date) {
  return Math.abs(left.getTime() - right.getTime()) / 86_400_000;
}

function categoryName(categoryId: number | null, categoryNames?: ReadonlyMap<number, string>) {
  if (categoryId == null) return "Sin categoría";
  return categoryNames?.get(categoryId) ?? "Categoría";
}

function normalizeLabel(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function mostCommonCategory<TMovement extends AnalyticsMovementLike>(items: ClusterCandidate<TMovement>[]) {
  const counts = new Map<number | null, { count: number; amount: number }>();
  for (const item of items) {
    const key = item.movement.categoryId ?? null;
    const current = counts.get(key) ?? { count: 0, amount: 0 };
    counts.set(key, { count: current.count + 1, amount: current.amount + item.amount });
  }
  return Array.from(counts.entries())
    .sort((a, b) => b[1].count - a[1].count || b[1].amount - a[1].amount)[0]?.[0] ?? null;
}

function buildClusterLabel<TMovement extends AnalyticsMovementLike>(
  items: ClusterCandidate<TMovement>[],
  categoryId: number | null,
  categoryNames?: ReadonlyMap<number, string>,
) {
  const labelCounts = new Map<string, { count: number; latestAt: number; original: string }>();
  for (const item of items) {
    const label = normalizeLabel(item.movement.description);
    if (!label) continue;
    const key = item.feature.normalizedDescription || label.toLowerCase();
    const current = labelCounts.get(key) ?? { count: 0, latestAt: 0, original: label };
    const timestamp = item.feature.timestamp;
    labelCounts.set(key, {
      count: current.count + 1,
      latestAt: Math.max(current.latestAt, timestamp),
      original: timestamp >= current.latestAt ? label : current.original,
    });
  }

  const bestLabel = Array.from(labelCounts.values()).sort((a, b) => b.count - a.count || b.latestAt - a.latestAt)[0];
  const variants = labelCounts.size;
  if (bestLabel && bestLabel.count >= Math.ceil(items.length / 2)) return bestLabel.original;

  const category = categoryName(categoryId, categoryNames);
  if (category !== "Sin categoría") {
    return variants > 1 ? `${category}: movimientos parecidos` : category;
  }
  return bestLabel?.original ?? "Movimientos parecidos";
}

function buildReason(parts: {
  exactTextPairs: number;
  strongTextPairs: number;
  sameCounterpartyPairs: number;
  sameCategoryPairs: number;
  closeAmountPairs: number;
  sameWeekdayPairs: number;
}) {
  const reasons: string[] = [];
  if (parts.exactTextPairs > 0) reasons.push("nombre repetido");
  else if (parts.strongTextPairs > 0) reasons.push("nombre parecido");
  if (parts.sameCounterpartyPairs > 0) reasons.push("mismo contacto o negocio");
  if (parts.sameCategoryPairs > 0) reasons.push("misma categoría");
  if (parts.closeAmountPairs > 0) reasons.push("monto parecido");
  if (parts.sameWeekdayPairs > 0 && reasons.length < 4) reasons.push("mismo día de la semana");
  return reasons.length > 0
    ? `Agrupado por ${reasons.slice(0, 4).join(", ")}.`
    : "Agrupado porque se parece a otros movimientos recientes.";
}

export function buildPatternClusters<TMovement extends AnalyticsMovementLike>({
  movements,
  isCashflow,
  isIncomeLike,
  getAmount,
  categoryNames,
  now = new Date(),
  sinceDays = 90,
  limit = 4,
}: BuildPatternClustersOptions<TMovement>): PatternCluster[] {
  const since = new Date(now.getTime() - Math.max(1, sinceDays - 1) * 86_400_000);
  const candidates: Array<ClusterCandidate<TMovement>> = movements
    .filter((movement) => movement.status === "posted")
    .filter(isCashflow)
    .filter((movement) => {
      const occurredAt = new Date(movement.occurredAt);
      return occurredAt >= since && occurredAt <= now;
    })
    .map((movement) => ({
      movement,
      feature: buildMovementFeature(movement),
      amount: Math.abs(getAmount(movement)),
      isIncome: isIncomeLike(movement),
    }))
    .filter((item) => item.amount > 0.009)
    .sort((a, b) => b.feature.timestamp - a.feature.timestamp);

  if (candidates.length < 2) return [];

  const idf = buildInverseDocumentFrequency(candidates.map((item) => item.feature));
  const parent = new Map<number, number>();
  for (const item of candidates) parent.set(item.movement.id, item.movement.id);

  function find(id: number): number {
    const current = parent.get(id) ?? id;
    if (current === id) return current;
    const root = find(current);
    parent.set(id, root);
    return root;
  }

  function union(left: number, right: number) {
    const leftRoot = find(left);
    const rightRoot = find(right);
    if (leftRoot !== rightRoot) parent.set(rightRoot, leftRoot);
  }

  const pairEvidence = new Map<string, {
    score: number;
    exactText: boolean;
    strongText: boolean;
    sameCounterparty: boolean;
    sameCategory: boolean;
    closeAmount: boolean;
    sameWeekday: boolean;
  }>();

  for (let i = 0; i < candidates.length; i += 1) {
    const left = candidates[i];
    for (let j = i + 1; j < candidates.length; j += 1) {
      const right = candidates[j];
      if (left.isIncome !== right.isIncome) continue;
      if (dayDistance(new Date(left.movement.occurredAt), new Date(right.movement.occurredAt)) > sinceDays) continue;

      const textScore = weightedJaccardSimilarity(left.feature, right.feature, idf);
      const amountScore = amountSimilarity(left.amount, right.amount);
      const exactText = Boolean(
        left.feature.normalizedDescription &&
          left.feature.normalizedDescription === right.feature.normalizedDescription,
      );
      const sameCounterparty =
        left.feature.counterpartyId != null &&
        right.feature.counterpartyId != null &&
        left.feature.counterpartyId === right.feature.counterpartyId;
      const sameCategory =
        left.feature.categoryId != null &&
        right.feature.categoryId != null &&
        left.feature.categoryId === right.feature.categoryId;
      const sameAccount =
        left.feature.accountId != null &&
        right.feature.accountId != null &&
        left.feature.accountId === right.feature.accountId;
      const sameWeekday = left.feature.weekday === right.feature.weekday;

      let score = 0;
      if (exactText) score += 3.4;
      score += textScore * 4.2;
      score += amountScore * 1.6;
      if (sameCounterparty) score += 2.4;
      if (sameCategory) score += 2.0;
      if (sameAccount) score += 0.65;
      if (sameWeekday) score += 0.35;

      const hasMeaningfulAnchor =
        exactText ||
        textScore >= 0.35 ||
        sameCounterparty ||
        (sameCategory && amountScore >= 0.72 && (sameAccount || sameWeekday));
      if (!hasMeaningfulAnchor || score < 4.2) continue;

      const key = [left.movement.id, right.movement.id].sort((a, b) => a - b).join(":");
      pairEvidence.set(key, {
        score,
        exactText,
        strongText: textScore >= 0.45,
        sameCounterparty,
        sameCategory,
        closeAmount: amountScore >= 0.72,
        sameWeekday,
      });
      union(left.movement.id, right.movement.id);
    }
  }

  const groupsByRoot = new Map<number, Array<ClusterCandidate<TMovement>>>();
  for (const item of candidates) {
    const root = find(item.movement.id);
    groupsByRoot.set(root, [...(groupsByRoot.get(root) ?? []), item]);
  }

  return Array.from(groupsByRoot.values())
    .filter((items) => items.length >= 2)
    .map((items): PatternCluster => {
      const movementIds = items.map((item) => item.movement.id);
      const pairEntries = Array.from(pairEvidence.entries()).filter(([key]) => {
        const [left, right] = key.split(":").map(Number);
        return movementIds.includes(left) && movementIds.includes(right);
      });
      const evidence = pairEntries.reduce(
        (acc, [, item]) => ({
          maxScore: Math.max(acc.maxScore, item.score),
          exactTextPairs: acc.exactTextPairs + (item.exactText ? 1 : 0),
          strongTextPairs: acc.strongTextPairs + (item.strongText ? 1 : 0),
          sameCounterpartyPairs: acc.sameCounterpartyPairs + (item.sameCounterparty ? 1 : 0),
          sameCategoryPairs: acc.sameCategoryPairs + (item.sameCategory ? 1 : 0),
          closeAmountPairs: acc.closeAmountPairs + (item.closeAmount ? 1 : 0),
          sameWeekdayPairs: acc.sameWeekdayPairs + (item.sameWeekday ? 1 : 0),
        }),
        {
          maxScore: 0,
          exactTextPairs: 0,
          strongTextPairs: 0,
          sameCounterpartyPairs: 0,
          sameCategoryPairs: 0,
          closeAmountPairs: 0,
          sameWeekdayPairs: 0,
        },
      );
      const categoryId = mostCommonCategory(items);
      const total = items.reduce((sum, item) => sum + item.amount, 0);
      const latest = items.slice().sort((a, b) => b.feature.timestamp - a.feature.timestamp)[0];
      const variantCount = new Set(items.map((item) => item.feature.normalizedDescription || item.movement.description.trim())).size;

      return {
        label: buildClusterLabel(items, categoryId, categoryNames),
        categoryId,
        category: categoryName(categoryId, categoryNames),
        total,
        count: items.length,
        average: total / items.length,
        movementIds,
        lastAt: latest.movement.occurredAt,
        type: latest.isIncome ? "Ingreso" : "Gasto",
        confidence: Math.max(45, Math.min(99, Math.round(42 + evidence.maxScore * 8 + Math.min(items.length, 6) * 3))),
        variantCount,
        reason: buildReason(evidence),
      };
    })
    .sort((a, b) => b.count - a.count || b.confidence - a.confidence || b.total - a.total)
    .slice(0, limit);
}
