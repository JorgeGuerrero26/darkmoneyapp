import { useMemo } from "react";

import { buildCategorySuggestionCandidates } from "../../../services/analytics/category-suggestions";
import type { PatternMovement } from "../../../services/queries/movement-patterns";
import { suggestAccountFromCounterparty, type PatternMaps } from "../../../lib/movement-patterns";
import { LOCAL_CATEGORY_AI_CONFIDENCE_THRESHOLD } from "../../../lib/movement-ai-orchestrator";
import { useMovementCategoryAiSuggestion } from "../../../hooks/useMovementCategoryAiSuggestion";
import { useMovementRiskExplanation } from "../../../hooks/useMovementRiskExplanation";
import type { MovementRiskItem } from "../../../lib/movement-risk-analysis";
import type {
  AccountSummary,
  CategorySummary,
  CounterpartySummary,
  MovementType,
} from "../../../types/domain";
import { patternMovementAmount } from "../lib/pattern-heuristics";
import {
  deriveLearnedCategoryMatch,
  mapAiCategoryRecommendation,
} from "../lib/category-suggestion-derivation";
import {
  isSuggestionCashflow,
  suggestionActsAsIncome,
  type CategorySuggestionState,
  type MovementSuggestionLike,
} from "../lib/movement-form-support";

type LearningFeedbackLike = {
  feedbackKind: string;
  acceptedCategoryId?: number | null;
  normalizedDescription?: string | null;
  createdAt: string;
};

type Params = {
  visible: boolean;
  movementType: MovementType;
  categoryId: number | null;
  counterpartyId: number | null;
  description: string;
  sourceAccountId: number | null;
  destinationAccountId: number | null;
  occurredAtISO: string;
  sourceAmountNum: number;
  destinationAmountNum: number;
  editMovementId: number | undefined;
  patternMovements: PatternMovement[] | undefined;
  patternMaps: PatternMaps | null;
  learningFeedback: LearningFeedbackLike[] | undefined;
  categoriesForPicker: CategorySummary[];
  categories: CategorySummary[];
  counterparties: CounterpartySummary[];
  accounts: AccountSummary[];
  baseCurrency: string;
  activeWorkspaceId: number | null;
  proAccessEnabled: boolean | undefined;
};

/**
 * Derivación de sugerencias del formulario de movimientos (fase 4 del refactor
 * R7): categoría aprendida de correcciones, categoría algorítmica por patrones,
 * categoría IA, explicación de riesgo y cuenta sugerida por contraparte.
 * Extraído tal cual de MovementForm; misma cascada: aprendida ?? algorítmica,
 * y la IA solo se consulta si lo local no llega al umbral de confianza.
 */
export function useMovementFormSuggestions({
  visible,
  movementType,
  categoryId,
  counterpartyId,
  description,
  sourceAccountId,
  destinationAccountId,
  occurredAtISO,
  sourceAmountNum,
  destinationAmountNum,
  editMovementId,
  patternMovements,
  patternMaps,
  learningFeedback,
  categoriesForPicker,
  categories,
  counterparties,
  accounts,
  baseCurrency,
  activeWorkspaceId,
  proAccessEnabled,
}: Params) {
  const currentSuggestionMovement = useMemo<MovementSuggestionLike | null>(() => {
    const amount = movementType === "income" ? destinationAmountNum : sourceAmountNum;
    if (movementType === "transfer") return null;
    return {
      id: editMovementId ? -editMovementId : -1,
      movementType,
      status: "posted",
      occurredAt: occurredAtISO,
      sourceAccountId: movementType === "income" ? null : sourceAccountId,
      destinationAccountId: movementType === "income" ? destinationAccountId : null,
      categoryId,
      counterpartyId,
      description: description.trim(),
      amount,
    };
  }, [
    destinationAmountNum,
    editMovementId,
    categoryId,
    counterpartyId,
    description,
    destinationAccountId,
    movementType,
    occurredAtISO,
    sourceAccountId,
    sourceAmountNum,
  ]);

  const suggestionHistory = useMemo<MovementSuggestionLike[]>(() => {
    return (patternMovements ?? [])
      .filter((movement) => movement.id !== editMovementId)
      .map((movement) => ({
        id: movement.id,
        movementType: movement.movement_type,
        status: movement.status,
        occurredAt: movement.occurred_at,
        sourceAccountId: movement.source_account_id ?? null,
        destinationAccountId: movement.destination_account_id ?? null,
        categoryId: movement.category_id ?? null,
        counterpartyId: movement.counterparty_id ?? null,
        description: movement.description ?? "",
        amount: patternMovementAmount(movement),
      }));
  }, [editMovementId, patternMovements]);

  const learnedCategorySuggestion = useMemo<CategorySuggestionState | null>(() => {
    if (!currentSuggestionMovement || categoryId != null) return null;
    const match = deriveLearnedCategoryMatch({
      description: currentSuggestionMovement.description,
      learningFeedback,
      categories: categoriesForPicker,
    });
    if (!match) return null;
    return {
      categoryId: match.categoryId,
      categoryName: match.categoryName,
      confidence: match.confidence,
      reasons: ["aprendido de una corrección tuya", match.similarity >= 0.92 ? "texto casi igual" : "texto parecido"],
    };
  }, [categoriesForPicker, currentSuggestionMovement, learningFeedback, categoryId]);

  const algorithmicCategorySuggestion = useMemo<CategorySuggestionState | null>(() => {
    if (!currentSuggestionMovement || categoryId != null || !currentSuggestionMovement.description.trim()) return null;
    const suggestions = buildCategorySuggestionCandidates<MovementSuggestionLike>({
      movements: [
        ...suggestionHistory.filter((movement) => movement.categoryId != null),
        { ...currentSuggestionMovement, categoryId: null },
      ],
      categories: categoriesForPicker,
      isCashflow: isSuggestionCashflow,
      isIncomeLike: suggestionActsAsIncome,
      getAmount: (movement) => movement.amount,
      limit: 1,
      targetLimit: 1,
    });
    const suggestion = suggestions.find((item) => item.movementId === currentSuggestionMovement.id);
    if (!suggestion) return null;
    return {
      categoryId: suggestion.suggestedCategoryId,
      categoryName: suggestion.suggestedCategoryName,
      confidence: suggestion.confidence,
      reasons: suggestion.reasons,
    };
  }, [categoriesForPicker, currentSuggestionMovement, categoryId, suggestionHistory]);

  const localCategorySuggestion = learnedCategorySuggestion ?? algorithmicCategorySuggestion;

  const aiCategoryInput = useMemo(() => {
    if (!activeWorkspaceId || !currentSuggestionMovement || categoryId !== null) return null;
    if (movementType === "transfer") return null;
    const trimmedDescription = currentSuggestionMovement.description.trim();
    if (trimmedDescription.length < 3 || categoriesForPicker.length === 0) return null;
    return {
      workspaceId: activeWorkspaceId,
      surface: "movement_form" as const,
      movementType: movementType === "income" ? "income" as const : "expense" as const,
      amount: currentSuggestionMovement.amount > 0 ? currentSuggestionMovement.amount : null,
      currencyCode: baseCurrency,
      description: trimmedDescription,
      occurredAt: currentSuggestionMovement.occurredAt,
      categories: categoriesForPicker.map((category) => ({
        id: category.id,
        name: category.name,
        kind: category.kind,
      })),
      localSuggestion: localCategorySuggestion
        ? {
          categoryId: localCategorySuggestion.categoryId,
          categoryName: localCategorySuggestion.categoryName,
          confidence: localCategorySuggestion.confidence,
          reasons: localCategorySuggestion.reasons,
        }
        : null,
    };
  }, [
    activeWorkspaceId,
    baseCurrency,
    categoriesForPicker,
    currentSuggestionMovement,
    categoryId,
    movementType,
    localCategorySuggestion,
  ]);

  const shouldRequestAiCategorySuggestion = Boolean(
    visible &&
      proAccessEnabled &&
      aiCategoryInput &&
      (!localCategorySuggestion || localCategorySuggestion.confidence < LOCAL_CATEGORY_AI_CONFIDENCE_THRESHOLD),
  );
  const {
    recommendation: aiCategoryRecommendation,
    isLoading: aiCategorySuggestionLoading,
    aiAttempted: aiCategorySuggestionAttempted,
    outcome: aiCategorySuggestionOutcome,
  } = useMovementCategoryAiSuggestion({
    enabled: shouldRequestAiCategorySuggestion,
    input: aiCategoryInput,
    proAccessEnabled,
  });

  const aiCategorySuggestion = useMemo<CategorySuggestionState | null>(() => {
    const base = mapAiCategoryRecommendation(aiCategoryRecommendation);
    return base ? { ...base, source: "deepseek" } : null;
  }, [aiCategoryRecommendation]);

  const bestCategorySuggestion = aiCategorySuggestion ?? localCategorySuggestion;

  const currentRiskMovement = useMemo<MovementRiskItem | null>(() => {
    if (!currentSuggestionMovement) return null;
    const category = categories.find((item) => item.id === currentSuggestionMovement.categoryId) ?? null;
    const counterparty = counterparties.find((item) => item.id === currentSuggestionMovement.counterpartyId) ?? null;
    const account = accounts.find((item) =>
      item.id === (currentSuggestionMovement.destinationAccountId ?? currentSuggestionMovement.sourceAccountId),
    ) ?? null;
    return {
      id: currentSuggestionMovement.id,
      movementType: currentSuggestionMovement.movementType,
      occurredAt: currentSuggestionMovement.occurredAt,
      description: currentSuggestionMovement.description,
      amount: currentSuggestionMovement.amount,
      categoryId: currentSuggestionMovement.categoryId,
      categoryName: category?.name ?? null,
      counterpartyId: currentSuggestionMovement.counterpartyId,
      counterpartyName: counterparty?.name ?? null,
      accountId: currentSuggestionMovement.destinationAccountId ?? currentSuggestionMovement.sourceAccountId,
      accountName: account?.name ?? null,
    };
  }, [accounts, categories, counterparties, currentSuggestionMovement]);

  const riskHistory = useMemo<MovementRiskItem[]>(() => {
    return suggestionHistory.map((movement) => {
      const category = categories.find((item) => item.id === movement.categoryId) ?? null;
      const counterparty = counterparties.find((item) => item.id === movement.counterpartyId) ?? null;
      const accountId = movement.destinationAccountId ?? movement.sourceAccountId;
      const account = accounts.find((item) => item.id === accountId) ?? null;
      return {
        id: movement.id,
        movementType: movement.movementType,
        occurredAt: movement.occurredAt,
        description: movement.description,
        amount: movement.amount,
        categoryId: movement.categoryId,
        categoryName: category?.name ?? null,
        counterpartyId: movement.counterpartyId,
        counterpartyName: counterparty?.name ?? null,
        accountId,
        accountName: account?.name ?? null,
      };
    });
  }, [accounts, categories, counterparties, suggestionHistory]);

  const { risk: movementRisk, isLoading: movementRiskLoading } = useMovementRiskExplanation({
    enabled: Boolean(visible && movementType !== "transfer"),
    workspaceId: activeWorkspaceId,
    surface: "movement_form",
    current: currentRiskMovement,
    history: riskHistory,
    proAccessEnabled,
  });

  const accountSuggestionId = useMemo(() => {
    if (!patternMaps || counterpartyId == null || movementType === "transfer") return null;
    const suggested = suggestAccountFromCounterparty(counterpartyId, patternMaps);
    if (suggested == null) return null;
    if (movementType === "income") {
      return suggested !== destinationAccountId ? suggested : null;
    }
    return suggested !== sourceAccountId ? suggested : null;
  }, [counterpartyId, destinationAccountId, movementType, sourceAccountId, patternMaps]);

  return {
    localCategorySuggestion,
    aiCategorySuggestion,
    aiCategorySuggestionLoading,
    aiCategorySuggestionAttempted,
    aiCategorySuggestionOutcome,
    bestCategorySuggestion,
    movementRisk,
    movementRiskLoading,
    accountSuggestionId,
  };
}
