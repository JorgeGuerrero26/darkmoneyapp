import {
  amountSimilarity,
  buildInverseDocumentFrequency,
  buildMovementFeature,
  normalizeAnalyticsText,
  type AnalyticsMovementLike,
  weightedJaccardSimilarity,
} from "./movement-features";
import { findProbableDuplicateGroups } from "./duplicate-detection";

export type MovementAnomalyKind =
  | "description_spike"
  | "category_spike"
  | "peer_spike"
  | "probable_duplicate";

export type MovementAnomalyCandidate = {
  key: string;
  movementId: number;
  kind: MovementAnomalyKind;
  score: number;
  level: "strong" | "review";
  amount: number;
  baselineAmount?: number;
  sampleCount: number;
  reasons: string[];
};

type DetectMovementAnomaliesOptions<TMovement extends AnalyticsMovementLike> = {
  movements: TMovement[];
  getAmount: (movement: TMovement) => number;
  limit?: number;
};

function mean(values: number[]) {
  return values.reduce((sum, value) => sum + value, 0) / Math.max(values.length, 1);
}

function standardDeviation(values: number[], avg: number) {
  if (values.length === 0) return 0;
  return Math.sqrt(values.reduce((sum, value) => sum + Math.pow(value - avg, 2), 0) / values.length);
}

function spikeScore(amount: number, samples: number[]) {
  if (samples.length < 3) return null;
  const avg = mean(samples);
  if (avg <= 0) return null;
  const std = standardDeviation(samples, avg);
  const z = (amount - avg) / Math.max(std, avg * 0.1);
  const ratio = amount / avg;
  if (z < 2 && ratio < 1.85) return null;
  return { z, avg, ratio };
}

function pushSpikeCandidate(
  findings: MovementAnomalyCandidate[],
  params: {
    movementId: number;
    kind: MovementAnomalyKind;
    amount: number;
    baselineAmount: number;
    sampleCount: number;
    z: number;
    ratio: number;
    reasons: string[];
  },
) {
  const score = Math.min(
    99,
    Math.round(43 + Math.min(params.z, 6) * 7 + Math.min(params.ratio, 4) * 4 + Math.min(params.sampleCount, 8)),
  );
  findings.push({
    key: `${params.kind}-${params.movementId}`,
    movementId: params.movementId,
    kind: params.kind,
    amount: params.amount,
    baselineAmount: params.baselineAmount,
    sampleCount: params.sampleCount,
    score,
    level: score >= 76 || params.z >= 3.2 || params.ratio >= 2.6 ? "strong" : "review",
    reasons: params.reasons,
  });
}

export function detectMovementAnomalies<TMovement extends AnalyticsMovementLike>({
  movements,
  getAmount,
  limit = 4,
}: DetectMovementAnomaliesOptions<TMovement>): MovementAnomalyCandidate[] {
  const expenses = movements
    .filter((movement) => movement.status === "posted")
    .filter((movement) => movement.description.trim())
    .sort((a, b) => new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime());
  if (expenses.length === 0) return [];

  const findings: MovementAnomalyCandidate[] = [];
  const descriptionHistory = new Map<string, number[]>();
  const categoryHistory = new Map<number, number[]>();
  const featureMap = new Map(expenses.map((movement) => [movement.id, buildMovementFeature(movement)]));
  const idf = buildInverseDocumentFrequency(Array.from(featureMap.values()));
  const processed: TMovement[] = [];

  for (const movement of expenses) {
    const amount = getAmount(movement);
    const feature = featureMap.get(movement.id);
    if (!feature || amount < 8) {
      processed.push(movement);
      continue;
    }

    const normalizedDescription = normalizeAnalyticsText(movement.description) || "sin-descripcion";
    const descriptionSamples = descriptionHistory.get(normalizedDescription) ?? [];
    const descriptionSpike = spikeScore(amount, descriptionSamples);
    if (descriptionSpike) {
      pushSpikeCandidate(findings, {
        movementId: movement.id,
        kind: "description_spike",
        amount,
        baselineAmount: descriptionSpike.avg,
        sampleCount: descriptionSamples.length,
        z: descriptionSpike.z,
        ratio: descriptionSpike.ratio,
        reasons: [
          "monto más alto que esta misma descripción",
          `${descriptionSamples.length} casos previos comparables`,
        ],
      });
    }

    const categorySamples = movement.categoryId != null ? categoryHistory.get(movement.categoryId) ?? [] : [];
    const categorySpike = spikeScore(amount, categorySamples);
    if (movement.categoryId != null && categorySpike) {
      pushSpikeCandidate(findings, {
        movementId: movement.id,
        kind: "category_spike",
        amount,
        baselineAmount: categorySpike.avg,
        sampleCount: categorySamples.length,
        z: categorySpike.z,
        ratio: categorySpike.ratio,
        reasons: [
          "monto más alto que su categoría",
          `${categorySamples.length} gastos previos de referencia`,
        ],
      });
    }

    const peerAmounts: number[] = [];
    let sameCounterpartyCount = 0;
    let sameAccountCount = 0;
    for (const sample of processed.slice(-40)) {
      const sampleFeature = featureMap.get(sample.id);
      if (!sampleFeature) continue;
      const textScore = weightedJaccardSimilarity(feature, sampleFeature, idf);
      const sameCategory = movement.categoryId != null && movement.categoryId === sample.categoryId;
      const sameCounterparty =
        feature.counterpartyId != null &&
        sampleFeature.counterpartyId != null &&
        feature.counterpartyId === sampleFeature.counterpartyId;
      const sameAccount =
        feature.accountId != null &&
        sampleFeature.accountId != null &&
        feature.accountId === sampleFeature.accountId;
      const amountNear = amountSimilarity(amount, getAmount(sample)) >= 0.25;
      const isPeer = textScore >= 0.35 || sameCounterparty || (sameCategory && (sameAccount || amountNear));
      if (!isPeer) continue;
      peerAmounts.push(getAmount(sample));
      if (sameCounterparty) sameCounterpartyCount += 1;
      if (sameAccount) sameAccountCount += 1;
    }

    const peerSpike = spikeScore(amount, peerAmounts);
    if (peerSpike && peerAmounts.length >= 4) {
      pushSpikeCandidate(findings, {
        movementId: movement.id,
        kind: "peer_spike",
        amount,
        baselineAmount: peerSpike.avg,
        sampleCount: peerAmounts.length,
        z: peerSpike.z,
        ratio: peerSpike.ratio,
        reasons: [
          "raro frente a movimientos parecidos",
          `${peerAmounts.length} referencias similares`,
          ...(sameCounterpartyCount > 0 ? ["misma contraparte en el historial"] : []),
          ...(sameAccountCount > 0 ? ["misma cuenta en el historial"] : []),
        ],
      });
    }

    descriptionHistory.set(normalizedDescription, [...descriptionSamples.slice(-9), amount]);
    if (movement.categoryId != null) {
      categoryHistory.set(movement.categoryId, [...categorySamples.slice(-12), amount]);
    }
    processed.push(movement);
  }

  for (const group of findProbableDuplicateGroups({ movements: expenses, getAmount })) {
    const movementId = group.movementIds[0];
    const movement = expenses.find((item) => item.id === movementId);
    if (!movement) continue;
    findings.push({
      key: `probable-duplicate-${group.key}`,
      movementId,
      kind: "probable_duplicate",
      amount: getAmount(movement),
      sampleCount: group.movementIds.length,
      score: Math.min(96, Math.round(55 + group.score * 4 + group.movementIds.length * 3)),
      level: group.score >= 7.5 || group.movementIds.length >= 3 ? "strong" : "review",
      reasons: group.reasons.length > 0 ? group.reasons : ["posible movimiento repetido"],
    });
  }

  const unique = new Map<number, MovementAnomalyCandidate>();
  for (const finding of findings.sort((a, b) => {
    if (a.score !== b.score) return b.score - a.score;
    if (a.level !== b.level) return a.level === "strong" ? -1 : 1;
    return b.movementId - a.movementId;
  })) {
    if (!unique.has(finding.movementId)) unique.set(finding.movementId, finding);
  }

  return Array.from(unique.values()).slice(0, limit);
}
