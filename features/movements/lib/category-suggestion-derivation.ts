import { normalizeAnalyticsText } from "../../../services/analytics/movement-features";
import { LOCAL_CATEGORY_AI_CONFIDENCE_THRESHOLD } from "../../../lib/movement-ai-orchestrator";
import type { MovementCategoryAiRecommendation } from "../../../services/queries/workspace-data";
import type { CategorySummary } from "../../../types/domain";
import { learnedConfidence, movementTextSimilarity } from "./pattern-heuristics";

/**
 * Núcleo compartido de derivación de sugerencias de categoría (cierre del
 * hallazgo R6: MovementForm y QuickDetectedMovementEntry lo duplicaban línea a
 * línea). Solo la MATEMÁTICA vive aquí; cada superficie arma su propio copy
 * (reasons/detail) sobre el resultado.
 */

type LearningFeedbackLike = {
  feedbackKind: string;
  acceptedCategoryId?: number | null;
  normalizedDescription?: string | null;
  createdAt: string;
};

export type LearnedCategoryMatch = {
  categoryId: number;
  categoryName: string;
  confidence: number;
  similarity: number;
};

/**
 * Mejor categoría aprendida de correcciones previas del usuario: similitud de
 * texto >= 0.58 contra el feedback aceptado, desempate por recencia, y umbral
 * LOCAL_CATEGORY_AI_CONFIDENCE_THRESHOLD sobre la confianza resultante.
 */
export function deriveLearnedCategoryMatch(params: {
  description: string;
  learningFeedback: LearningFeedbackLike[] | undefined;
  categories: CategorySummary[];
}): LearnedCategoryMatch | null {
  const { description, learningFeedback, categories } = params;
  if (!description.trim()) return null;
  const accepted = (learningFeedback ?? []).filter((feedback) =>
    feedback.acceptedCategoryId != null &&
    (feedback.feedbackKind === "accepted_category_suggestion" || feedback.feedbackKind === "manual_category_change"),
  );
  const normalized = normalizeAnalyticsText(description);
  if (!normalized || accepted.length === 0) return null;
  const best = accepted
    .map((feedback) => {
      const learnedText = feedback.normalizedDescription ?? "";
      const similarity = learnedText === normalized ? 1 : movementTextSimilarity(normalized, learnedText);
      return { feedback, similarity };
    })
    .filter((item) => item.similarity >= 0.58)
    .sort((a, b) => b.similarity - a.similarity || new Date(b.feedback.createdAt).getTime() - new Date(a.feedback.createdAt).getTime())[0];
  if (!best?.feedback.acceptedCategoryId) return null;
  const category = categories.find((item) => item.id === best.feedback.acceptedCategoryId);
  if (!category) return null;
  const confidence = learnedConfidence(normalized, best.feedback.normalizedDescription ?? "", best.similarity);
  if (confidence < LOCAL_CATEGORY_AI_CONFIDENCE_THRESHOLD) return null;
  return {
    categoryId: category.id,
    categoryName: category.name,
    confidence,
    similarity: best.similarity,
  };
}

export type AiCategorySuggestionBase = {
  categoryId: number | null;
  categoryName: string;
  newCategoryName?: string | null;
  confidence: number;
  reasons: string[];
};

/** Recomendación IA → forma presentable (existente o "crear categoría X"). */
export function mapAiCategoryRecommendation(
  recommendation: MovementCategoryAiRecommendation | null,
): AiCategorySuggestionBase | null {
  if (!recommendation) return null;
  if (recommendation.type === "existing_category" && recommendation.categoryId) {
    return {
      categoryId: recommendation.categoryId,
      categoryName: recommendation.categoryName ?? "Categoría sugerida",
      confidence: recommendation.confidence,
      reasons: recommendation.reasons,
    };
  }
  if (recommendation.type === "new_category" && recommendation.newCategoryName) {
    return {
      categoryId: null,
      categoryName: `Crear categoría "${recommendation.newCategoryName}"`,
      newCategoryName: recommendation.newCategoryName,
      confidence: recommendation.confidence,
      reasons: recommendation.reasons,
    };
  }
  return null;
}
