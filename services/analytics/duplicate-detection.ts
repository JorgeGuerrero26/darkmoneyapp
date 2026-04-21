import {
  amountSimilarity,
  buildInverseDocumentFrequency,
  buildMovementFeature,
  type AnalyticsMovementLike,
  weightedJaccardSimilarity,
} from "./movement-features";

export type ProbableDuplicateGroup = {
  key: string;
  movementIds: number[];
  score: number;
  reasons: string[];
};

type FindProbableDuplicateGroupsOptions<TMovement extends AnalyticsMovementLike> = {
  movements: TMovement[];
  getAmount: (movement: TMovement) => number;
  maxDaysApart?: number;
};

function dayDistance(leftDate: string, rightDate: string) {
  const left = new Date(leftDate);
  const right = new Date(rightDate);
  return Math.abs(left.getTime() - right.getTime()) / 86_400_000;
}

function addReason(reasons: string[], condition: boolean, reason: string) {
  if (condition) reasons.push(reason);
}

export function findProbableDuplicateGroups<TMovement extends AnalyticsMovementLike>({
  movements,
  getAmount,
  maxDaysApart = 2,
}: FindProbableDuplicateGroupsOptions<TMovement>): ProbableDuplicateGroup[] {
  const candidates = movements
    .filter((movement) => movement.status === "posted")
    .sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime());
  if (candidates.length < 2) return [];

  const featureMap = new Map(candidates.map((movement) => [movement.id, buildMovementFeature(movement)]));
  const idf = buildInverseDocumentFrequency(Array.from(featureMap.values()));
  const parent = new Map<number, number>();
  for (const movement of candidates) parent.set(movement.id, movement.id);

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

  const pairScores = new Map<string, { score: number; reasons: string[] }>();
  for (let i = 0; i < candidates.length; i += 1) {
    const left = candidates[i];
    const leftFeature = featureMap.get(left.id);
    if (!leftFeature) continue;

    for (let j = i + 1; j < candidates.length; j += 1) {
      const right = candidates[j];
      const daysApart = dayDistance(left.occurredAt, right.occurredAt);
      if (daysApart > maxDaysApart) continue;

      const rightFeature = featureMap.get(right.id);
      if (!rightFeature) continue;

      const leftAmount = getAmount(left);
      const rightAmount = getAmount(right);
      const amountScore = amountSimilarity(leftAmount, rightAmount);
      if (amountScore < 0.72) continue;

      const textScore = weightedJaccardSimilarity(leftFeature, rightFeature, idf);
      const exactDescription =
        leftFeature.normalizedDescription &&
        rightFeature.normalizedDescription &&
        leftFeature.normalizedDescription === rightFeature.normalizedDescription;
      const sameAccount =
        leftFeature.accountId != null &&
        rightFeature.accountId != null &&
        leftFeature.accountId === rightFeature.accountId;
      const sameCounterparty =
        leftFeature.counterpartyId != null &&
        rightFeature.counterpartyId != null &&
        leftFeature.counterpartyId === rightFeature.counterpartyId;

      let score = amountScore * 3.6 + Math.max(textScore, exactDescription ? 1 : 0) * 4.4;
      if (sameAccount) score += 1;
      if (sameCounterparty) score += 1.2;
      if (daysApart < 0.75) score += 1.1;
      else if (daysApart <= 1.1) score += 0.65;

      if (score < 6.1) continue;

      const reasons: string[] = [];
      addReason(reasons, daysApart < 0.75, "mismo día");
      addReason(reasons, daysApart >= 0.75, "fecha cercana");
      addReason(reasons, amountScore >= 0.86, "monto casi igual");
      addReason(reasons, exactDescription || textScore >= 0.64, "texto parecido");
      addReason(reasons, sameAccount, "misma cuenta");
      addReason(reasons, sameCounterparty, "misma contraparte");

      const key = [left.id, right.id].sort((a, b) => a - b).join(":");
      pairScores.set(key, { score, reasons });
      union(left.id, right.id);
    }
  }

  const groupsByRoot = new Map<number, number[]>();
  for (const movement of candidates) {
    const root = find(movement.id);
    groupsByRoot.set(root, [...(groupsByRoot.get(root) ?? []), movement.id]);
  }

  return Array.from(groupsByRoot.values())
    .filter((movementIds) => movementIds.length > 1)
    .map((movementIds) => {
      const pairEntries = Array.from(pairScores.entries()).filter(([key]) => {
        const [left, right] = key.split(":").map(Number);
        return movementIds.includes(left) && movementIds.includes(right);
      });
      const strongest = pairEntries.reduce(
        (best, [, value]) => value.score > best.score ? value : best,
        { score: 0, reasons: [] as string[] },
      );
      return {
        key: movementIds.slice().sort((a, b) => a - b).join("-"),
        movementIds,
        score: strongest.score,
        reasons: Array.from(new Set(strongest.reasons)).slice(0, 4),
      };
    })
    .sort((a, b) => b.score - a.score || b.movementIds.length - a.movementIds.length);
}
