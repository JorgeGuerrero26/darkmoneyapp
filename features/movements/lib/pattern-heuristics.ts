import { normalizeAnalyticsText } from "../../../services/analytics/movement-features";

/**
 * Heurísticas compartidas de patrones de movimientos para las sugerencias locales de
 * categoría. Antes vivían duplicadas línea a línea en MovementForm,
 * QuickDetectedMovementEntry y useNotificationDetectionRuntimeSync (auditoría, hallazgo
 * R6): un ajuste del algoritmo de confianza había que replicarlo en tres lugares.
 *
 * El umbral de confianza compartido es LOCAL_CATEGORY_AI_CONFIDENCE_THRESHOLD de
 * lib/movement-ai-orchestrator (misma constante que usa el headless).
 */

/** Monto representativo de un movimiento histórico según su dirección. */
export function patternMovementAmount(movement: {
  movement_type: string;
  source_amount: number | null;
  destination_amount: number | null;
}) {
  const source = Math.abs(Number(movement.source_amount ?? 0));
  const destination = Math.abs(Number(movement.destination_amount ?? 0));
  if (movement.movement_type === "income" || movement.movement_type === "refund") return destination || source;
  return source || destination;
}

/** Similitud Jaccard de tokens (>=3 chars) entre dos descripciones normalizadas. */
export function movementTextSimilarity(left: string, right: string): number {
  const leftTokens = new Set(normalizeAnalyticsText(left).split(" ").filter((token) => token.length >= 3));
  const rightTokens = new Set(normalizeAnalyticsText(right).split(" ").filter((token) => token.length >= 3));
  const allTokens = new Set([...leftTokens, ...rightTokens]);
  if (allTokens.size === 0) return 0;
  let overlap = 0;
  for (const token of allTokens) {
    if (leftTokens.has(token) && rightTokens.has(token)) overlap += 1;
  }
  return overlap / allTokens.size;
}

/**
 * Confianza de una categoría aprendida (learning feedback) frente al texto actual:
 * match exacto puntúa alto (0.68-0.9), textos cortos se penalizan, y el resto escala
 * con la similitud de tokens.
 */
export function learnedConfidence(currentText: string, learnedText: string, similarity: number) {
  const currentTokens = normalizeAnalyticsText(currentText).split(" ").filter((token) => token.length >= 3);
  const learnedTokens = normalizeAnalyticsText(learnedText).split(" ").filter((token) => token.length >= 3);
  const exact = normalizeAnalyticsText(currentText) === normalizeAnalyticsText(learnedText);
  if (exact) return Math.min(0.9, currentTokens.length <= 1 ? 0.68 : 0.76 + Math.min(currentTokens.length, 4) * 0.03);
  if (currentTokens.length <= 1 || learnedTokens.length <= 1) return Math.min(0.58, 0.42 + similarity * 0.18);
  return Math.min(0.86, 0.38 + similarity * 0.48);
}
