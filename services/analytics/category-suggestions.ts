import {
  amountSimilarity,
  buildInverseDocumentFrequency,
  buildMovementFeature,
  type AnalyticsMovementLike,
  type MovementFeature,
  weightedJaccardSimilarity,
} from "./movement-features";

type CategoryLike = {
  id: number;
  name: string;
};

export type CategorySuggestionCandidate = {
  movementId: number;
  description: string;
  occurredAt: string;
  amount: number;
  suggestedCategoryId: number;
  suggestedCategoryName: string;
  confidence: number;
  matchedSamples: number;
  reasons: string[];
};

type CategoryScore = {
  score: number;
  samples: number;
  exactDescription: number;
  strongText: number;
  closeAmount: number;
  sameCounterparty: number;
  sameAccount: number;
  sameWeekday: number;
  strongestSampleScore: number;
};

type BuildCategorySuggestionOptions<TMovement extends AnalyticsMovementLike> = {
  movements: TMovement[];
  categories: CategoryLike[];
  isCashflow: (movement: TMovement) => boolean;
  isIncomeLike: (movement: TMovement) => boolean;
  getAmount: (movement: TMovement) => number;
  limit?: number;
  targetLimit?: number;
};

function addCategoryScore(
  current: CategoryScore,
  sampleScore: number,
  target: MovementFeature,
  sample: MovementFeature,
  amountScore: number,
  textScore: number,
) {
  return {
    score: current.score + sampleScore,
    samples: current.samples + 1,
    exactDescription: current.exactDescription + (
      target.normalizedDescription &&
      sample.normalizedDescription &&
      target.normalizedDescription === sample.normalizedDescription
        ? 1
        : 0
    ),
    strongText: current.strongText + (textScore >= 0.62 ? 1 : 0),
    closeAmount: current.closeAmount + (amountScore >= 0.8 ? 1 : 0),
    sameCounterparty: current.sameCounterparty + (
      target.counterpartyId != null &&
      sample.counterpartyId != null &&
      target.counterpartyId === sample.counterpartyId
        ? 1
        : 0
    ),
    sameAccount: current.sameAccount + (
      target.accountId != null &&
      sample.accountId != null &&
      target.accountId === sample.accountId
        ? 1
        : 0
    ),
    sameWeekday: current.sameWeekday + (target.weekday === sample.weekday ? 1 : 0),
    strongestSampleScore: Math.max(current.strongestSampleScore, sampleScore),
  };
}

function emptyCategoryScore(): CategoryScore {
  return {
    score: 0,
    samples: 0,
    exactDescription: 0,
    strongText: 0,
    closeAmount: 0,
    sameCounterparty: 0,
    sameAccount: 0,
    sameWeekday: 0,
    strongestSampleScore: 0,
  };
}

function buildReasons(score: CategoryScore) {
  const reasons: string[] = [];
  if (score.exactDescription > 0) reasons.push("misma descripción ya vista");
  else if (score.strongText > 0) reasons.push("texto muy parecido");
  if (score.sameCounterparty > 0) reasons.push("misma contraparte");
  if (score.closeAmount > 0) reasons.push("monto parecido");
  if (score.sameAccount > 0) reasons.push("misma cuenta");
  if (score.sameWeekday > 0 && reasons.length < 4) reasons.push("mismo día de la semana");
  if (score.samples >= 2) reasons.push(`${score.samples} casos parecidos en tu historial`);
  if (reasons.length === 0) reasons.push("patrón repetido en tu historial");
  return reasons.slice(0, 4);
}

export function buildCategorySuggestionCandidates<TMovement extends AnalyticsMovementLike>({
  movements,
  categories,
  isCashflow,
  isIncomeLike,
  getAmount,
  limit = 4,
  targetLimit = 10,
}: BuildCategorySuggestionOptions<TMovement>): CategorySuggestionCandidate[] {
  const categoryMap = new Map(categories.map((category) => [category.id, category.name]));
  const categorizedHistory = movements
    .filter((movement) => movement.status === "posted")
    .filter(isCashflow)
    .filter((movement) => movement.categoryId != null)
    .sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime());

  const uncategorizedTargets = movements
    .filter((movement) => movement.status === "posted")
    .filter(isCashflow)
    .filter((movement) => movement.categoryId == null)
    .sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime())
    .slice(0, targetLimit);

  if (categorizedHistory.length === 0 || uncategorizedTargets.length === 0) return [];

  const featureMap = new Map<number, MovementFeature>();
  for (const movement of [...categorizedHistory, ...uncategorizedTargets]) {
    featureMap.set(movement.id, buildMovementFeature(movement));
  }
  const idf = buildInverseDocumentFrequency(Array.from(featureMap.values()));

  const suggestions: CategorySuggestionCandidate[] = [];
  for (const target of uncategorizedTargets) {
    const targetFeature = featureMap.get(target.id);
    if (!targetFeature) continue;

    const targetAmount = getAmount(target);
    const targetIsIncome = isIncomeLike(target);
    const categoryScores = new Map<number, CategoryScore>();

    for (const sample of categorizedHistory) {
      if (sample.id === target.id || sample.categoryId == null) continue;
      if (isIncomeLike(sample) !== targetIsIncome) continue;

      const sampleFeature = featureMap.get(sample.id);
      if (!sampleFeature) continue;

      const sampleAmount = getAmount(sample);
      const textScore = weightedJaccardSimilarity(targetFeature, sampleFeature, idf);
      const amountScore = amountSimilarity(targetAmount, sampleAmount);
      const sameCounterparty =
        targetFeature.counterpartyId != null &&
        sampleFeature.counterpartyId != null &&
        targetFeature.counterpartyId === sampleFeature.counterpartyId;
      const sameAccount =
        targetFeature.accountId != null &&
        sampleFeature.accountId != null &&
        targetFeature.accountId === sampleFeature.accountId;
      const sameWeekday = targetFeature.weekday === sampleFeature.weekday;
      const exactDescription =
        targetFeature.normalizedDescription &&
        sampleFeature.normalizedDescription &&
        targetFeature.normalizedDescription === sampleFeature.normalizedDescription;

      let sampleScore = 0;
      if (exactDescription) sampleScore += 5.2;
      sampleScore += textScore * 4.2;
      sampleScore += amountScore * 1.8;
      if (sameCounterparty) sampleScore += 2.4;
      if (sameAccount) sampleScore += 0.75;
      if (sameWeekday) sampleScore += 0.45;

      const daysAgo = Math.max(0, (Date.now() - sampleFeature.timestamp) / 86_400_000);
      if (daysAgo <= 30) sampleScore += 0.35;
      else if (daysAgo <= 90) sampleScore += 0.18;

      if (sampleScore < 1.55) continue;

      const current = categoryScores.get(sample.categoryId) ?? emptyCategoryScore();
      categoryScores.set(
        sample.categoryId,
        addCategoryScore(current, sampleScore, targetFeature, sampleFeature, amountScore, textScore),
      );
    }

    const ranked = Array.from(categoryScores.entries()).sort((a, b) => b[1].score - a[1].score);
    if (ranked.length === 0) continue;

    const [bestCategoryId, best] = ranked[0];
    const secondScore = ranked[1]?.[1].score ?? 0;
    const scoreGap = Math.max(0, best.score - secondScore);
    const confidence = Math.max(
      0.44,
      Math.min(
        0.98,
        0.34 +
          Math.min(best.samples, 5) * 0.065 +
          Math.min(best.exactDescription, 2) * 0.14 +
          Math.min(best.strongText, 3) * 0.065 +
          Math.min(best.closeAmount, 2) * 0.045 +
          Math.min(best.sameCounterparty, 1) * 0.09 +
          Math.min(best.sameAccount, 1) * 0.035 +
          Math.min(scoreGap / 8, 0.16) +
          Math.min(best.strongestSampleScore / 24, 0.09),
      ),
    );

    if (best.score < 3.8 || confidence < 0.6) continue;

    suggestions.push({
      movementId: target.id,
      description: target.description.trim() || "Movimiento sin descripción",
      occurredAt: target.occurredAt,
      amount: targetAmount,
      suggestedCategoryId: bestCategoryId,
      suggestedCategoryName: categoryMap.get(bestCategoryId) ?? "Categoría sugerida",
      confidence,
      matchedSamples: best.samples,
      reasons: buildReasons(best),
    });
  }

  return suggestions
    .sort((a, b) => b.confidence - a.confidence || new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime())
    .slice(0, limit);
}
