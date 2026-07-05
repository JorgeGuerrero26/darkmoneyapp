import { useEffect, useMemo, useRef, useState } from "react";
import type { TextInput } from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import { StyleSheet, View } from "react-native";

import { useUiStore } from "../../store/ui-store";
import {
  mirrorMovementAttachmentsToObligationEvent,
  promoteDraftAttachmentsToEntity,
} from "../../lib/entity-attachments";
import { useWorkspace } from "../../lib/workspace-context";
import { humanizeError } from "../../lib/errors";
import { todayPeru, dateStrToISO, isoToDateStr } from "../../lib/date";
import {
  useWorkspaceSnapshotQuery,
  useCreateMovementMutation,
  useDeleteMovementMutation,
  useUpdateMovementMutation,
  useCreateCategoryMutation,
  useCreateCounterpartyMutation,
  useCreateRecurringIncomeMutation,
  useDashboardAnalyticsQuery,
  usePersistLearningFeedbackMutation,
  useCreateSubscriptionMutation,
  useUserEntitlementQuery,
} from "../../services/queries/workspace-data";
import { useMovementAttachmentsQuery } from "../../services/queries/movements";
import { useMovementPatternsQuery, type PatternMovement } from "../../services/queries/movement-patterns";
import {
  buildPatternMaps,
  suggestCategoryFromDescription,
  suggestCategoryFromCounterparty,
  suggestCounterpartyFromCategory,
  suggestAccountFromCounterparty,
} from "../../lib/movement-patterns";
import { useAuth } from "../../lib/auth-context";
import { useToast } from "../../hooks/useToast";
import { useHaptics } from "../../hooks/useHaptics";
import { useMovementCategoryAiSuggestion } from "../../hooks/useMovementCategoryAiSuggestion";
import { useMovementDescriptionCleanup } from "../../hooks/useMovementDescriptionCleanup";
import { useMovementCounterpartyAiSuggestion } from "../../hooks/useMovementCounterpartyAiSuggestion";
import type { CounterpartySuggestionResult } from "../../lib/movement-counterparty-suggestions";
import { useMovementRecurringAiSuggestion } from "../../hooks/useMovementRecurringAiSuggestion";
import { useMovementRiskExplanation } from "../../hooks/useMovementRiskExplanation";
import { useMovementBudgetImpact } from "../../hooks/useMovementBudgetImpact";
import {
  recurringFrequencyToSubscriptionFields,
  type MovementRecurringHistoryItem,
  type MovementRecurringSuggestionResult,
} from "../../lib/movement-recurring-suggestions";
import type { MovementRiskItem } from "../../lib/movement-risk-analysis";
import { BottomSheet } from "../ui/BottomSheet";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { type Attachment } from "../domain/AttachmentPicker";
import { buildCategorySuggestionCandidates } from "../../services/analytics/category-suggestions";
import { normalizeAnalyticsText } from "../../services/analytics/movement-features";
import { sortByName } from "../../lib/sort-locale";
import { newClientDedupeKey } from "../../lib/idempotency";
import { parsePositiveAmountInput } from "../../lib/amount-parsing";
import {
  learnedConfidence as movementFormLearnedConfidence,
  movementTextSimilarity as movementFormTextSimilarity,
  patternMovementAmount,
} from "../../features/movements/lib/pattern-heuristics";
import { LOCAL_CATEGORY_AI_CONFIDENCE_THRESHOLD } from "../../lib/movement-ai-orchestrator";
import { COLORS, SPACING, SURFACE } from "../../constants/theme";
import type { MovementType, MovementStatus, MovementRecord, ExchangeRateSummary } from "../../types/domain";
import { useMovementCreationController } from "../../features/movements/hooks/useMovementCreationController";
import { useTransferFxController } from "../../features/movements/hooks/useTransferFxController";
import { useBalanceImpactPreview } from "../../features/movements/hooks/useBalanceImpactPreview";
import { buildMovementCreateInput, buildMovementUpdateInput } from "../../features/movements/lib/movement-save-contract";
import { useFrequentTransferPairQuery } from "../../services/queries/notification-detection";
import {
  validateMovementForm,
  type MovementFormWarnings,
} from "../../features/movements/lib/form-validation";
import { StepTypeAndStatus } from "../../features/movements/components/form/steps/StepTypeAndStatus";
import { StepAccountsAndAmounts } from "../../features/movements/components/form/steps/StepAccountsAndAmounts";
import { StepDetails } from "../../features/movements/components/form/steps/StepDetails";

// Tipos y helpers puros extraídos a features/movements/lib/movement-form-support.ts
// (fase 1 del refactor R7). Alias locales para no tocar los ~100 usos internos.
import {
  findTransferExchangeRate,
  formatExchangeRateInput,
  formatExchangeRateLabel,
  formatTransferAmount,
  getInitialMovementForm as getInitialForm,
  isSuggestionCashflow,
  parseDecimalInput,
  readMovementLinkedEventId,
  suggestionActsAsIncome,
  type CategoryFeedbackIntent,
  type CategorySuggestionState,
  type MovementFormState as FormState,
  type MovementFormStep as Step,
  type MovementSuggestionLike,
} from "../../features/movements/lib/movement-form-support";

type Props = {
  visible: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  defaultType?: MovementType;
  initialAccountId?: number;
  editMovement?: MovementRecord;
};

export function MovementForm({ visible, onClose, onSuccess, defaultType = "expense", initialAccountId, editMovement }: Props) {
  const { profile } = useAuth();
  const { activeWorkspaceId, activeWorkspace } = useWorkspace();
  const { showToast, showRichToast } = useToast();
  const haptics = useHaptics();
  const queryClient = useQueryClient();

  const {
    lastMovementAccountId,
    setLastMovementAccountId,
    showActivityNotice,
    dismissActivityNotice,
  } = useUiStore();

  const { data: snapshot } = useWorkspaceSnapshotQuery(profile, activeWorkspaceId);
  const createMovement = useCreateMovementMutation(activeWorkspaceId);
  const deleteMovement = useDeleteMovementMutation(activeWorkspaceId);
  const updateMovement = useUpdateMovementMutation(activeWorkspaceId);
  const createCategory = useCreateCategoryMutation(activeWorkspaceId);
  const createCounterparty = useCreateCounterpartyMutation(activeWorkspaceId);
  const createSubscription = useCreateSubscriptionMutation(activeWorkspaceId);
  const createRecurringIncome = useCreateRecurringIncomeMutation(activeWorkspaceId);
  const { data: dashboardAnalytics } = useDashboardAnalyticsQuery(activeWorkspaceId, profile?.id);
  const entitlementQuery = useUserEntitlementQuery(profile?.id ?? null, profile?.email ?? null);
  const persistLearningFeedback = usePersistLearningFeedbackMutation(activeWorkspaceId, profile?.id);
  const {
    data: editMovementAttachments = [],
    isLoading: editMovementAttachmentsLoading,
  } = useMovementAttachmentsQuery(
    visible && editMovement ? editMovement.workspaceId : null,
    visible && editMovement ? editMovement.id : null,
  );

  // -- Smart suggestions -----------------------------------------------------
  const { data: patternMovements } = useMovementPatternsQuery(activeWorkspaceId);
  const patternMaps = useMemo(
    () => (patternMovements ? buildPatternMaps(patternMovements) : null),
    [patternMovements],
  );
  const [catSuggestionId, setCatSuggestionId] = useState<number | null>(null);
  const [cpSuggestionId, setCpSuggestionId] = useState<number | null>(null);
  const descDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isEditing = Boolean(editMovement);
  const linkedEventId = useMemo(
    () => readMovementLinkedEventId(editMovement?.metadata),
    [editMovement?.metadata],
  );

  const notesRef = useRef<TextInput>(null);
  const descriptionRef = useRef<TextInput>(null);

  const [step, setStep] = useState<Step>(1);
  const [discardVisible, setDiscardVisible] = useState(false);
  const [form, setForm] = useState<FormState>(() => getInitialForm(defaultType));
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const [warnings, setWarnings] = useState<MovementFormWarnings>({});
  const [submitError, setSubmitError] = useState("");
  const [cleanupAppliedText, setCleanupAppliedText] = useState<string | null>(null);
  const [isClosingAfterSubmit, setIsClosingAfterSubmit] = useState(false);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [savedMovementId, setSavedMovementId] = useState<number | undefined>(editMovement?.id);
  const [categoryFeedbackIntent, setCategoryFeedbackIntent] = useState<CategoryFeedbackIntent | null>(null);
  const [linkedSubscriptionId, setLinkedSubscriptionId] = useState<number | null>(editMovement?.subscriptionId ?? null);
  const [linkedRecurringIncomeId, setLinkedRecurringIncomeId] = useState<number | null>(null);
  const attachmentsHydratedRef = useRef<string | null>(null);
  const initialAttachmentSignatureRef = useRef("::ready");
  // Anti-doble-tap síncrono: evita crear el movimiento 2-3 veces si el usuario toca Guardar
  // rápido antes de que el botón refleje el estado loading.
  const submittingRef = useRef(false);
  // Clave de idempotencia por sesión de submit: se genera en el primer intento de guardar,
  // se reutiliza en reintentos del MISMO intento (error de red → volver a tocar Guardar)
  // y se descarta tras el éxito. Si el insert llegó al servidor pero la respuesta se perdió,
  // el retry devuelve el movimiento existente en lugar de duplicarlo.
  const submitDedupeKeyRef = useRef<string | null>(null);

  const attachmentSignature = useMemo(() => {
    const persisted = attachments
      .filter((attachment) => attachment.storagePath)
      .map((attachment) => attachment.storagePath as string)
      .sort()
      .join("|");
    return `${persisted}::${attachments.some((attachment) => attachment.isUploading) ? "uploading" : "ready"}`;
  }, [attachments]);

  const baseCurrency = activeWorkspace?.baseCurrencyCode ?? "PEN";
  const accounts = snapshot?.accounts ?? [];
  const frequentTransferPair = useFrequentTransferPairQuery(activeWorkspaceId).data ?? null;
  const categories = snapshot?.categories ?? [];
  const counterparties = snapshot?.counterparties ?? [];
  const exchangeRates = snapshot?.exchangeRates ?? [];

  const {
    activeAccountsSorted,
    destinationAccountsSorted,
    categoriesForPicker,
    sourceAccount,
    destinationAccount,
    sourceAmountNum,
    destinationAmountNum,
    transferCurrenciesDiffer,
  } = useMovementCreationController({
    accounts,
    categories,
    movementType: form.movementType,
    sourceAccountId: form.sourceAccountId,
    destinationAccountId: form.destinationAccountId,
    sourceAmount: form.sourceAmount,
    destinationAmount: form.destinationAmount,
  });
  // Tipo de cambio de transferencias multi-moneda (fase 2 del refactor R7).
  const fx = useTransferFxController({
    visible,
    movementType: form.movementType,
    transferCurrenciesDiffer,
    sourceAccount,
    destinationAccount,
    exchangeRates,
    sourceAmountNum,
    destinationAmountNum,
    destinationAmount: form.destinationAmount,
    onAutoDestinationAmount: (value: string) => patch({ destinationAmount: value }),
  });
  const counterpartiesSorted = useMemo(() => sortByName(counterparties), [counterparties]);
  const selectedRecurringCategory = form.categoryId != null
    ? categories.find((category) => category.id === form.categoryId) ?? null
    : null;
  const selectedRecurringCounterparty = form.counterpartyId != null
    ? counterparties.find((counterparty) => counterparty.id === form.counterpartyId) ?? null
    : null;
  const budgetImpactAccount = form.sourceAccountId != null
    ? accounts.find((account) => account.id === form.sourceAccountId) ?? null
    : null;
  const recurringSuggestionHistory = useMemo<MovementRecurringHistoryItem[]>(() => {
    return (patternMovements ?? [])
      .filter((movement) => movement.id !== editMovement?.id)
      .map((movement) => ({
        id: movement.id,
        movementType: movement.movement_type,
        occurredAt: movement.occurred_at,
        description: movement.description ?? "",
        amount: patternMovementAmount(movement),
        categoryId: movement.category_id ?? null,
        counterpartyId: movement.counterparty_id ?? null,
      }));
  }, [editMovement?.id, patternMovements]);
  const descriptionCleanupAmount = form.movementType === "income" ? destinationAmountNum : sourceAmountNum;
  // Memoize to avoid dateStrToISO (which includes current ms) from producing a
  // new string on every render and invalidating AI hook stable keys.
  const occurredAtISO = useMemo(() => dateStrToISO(form.occurredAt), [form.occurredAt]);
  const { cleanup: descriptionCleanup, isLoading: descriptionCleanupLoading } = useMovementDescriptionCleanup({
    enabled: Boolean(visible && form.movementType !== "transfer" && form.description !== cleanupAppliedText),
    workspaceId: activeWorkspaceId,
    surface: "movement_form",
    rawDescription: form.description,
    amount: descriptionCleanupAmount > 0 ? descriptionCleanupAmount : null,
    currencyCode: baseCurrency,
    proAccessEnabled: entitlementQuery.data?.proAccessEnabled,
  });
  const counterpartyDescriptionForSuggestion = descriptionCleanup?.cleanedDescription ?? form.description;
  const {
    suggestion: recurringSuggestion,
    isLoading: recurringSuggestionLoading,
    aiAttempted: recurringSuggestionAttempted,
  } = useMovementRecurringAiSuggestion({
    enabled: Boolean(visible && !isEditing && form.movementType !== "transfer"),
    workspaceId: activeWorkspaceId,
    surface: "movement_form",
    description: counterpartyDescriptionForSuggestion,
    movementType: form.movementType === "income" ? "income" : "expense",
    amount: descriptionCleanupAmount > 0 ? descriptionCleanupAmount : null,
    currencyCode: baseCurrency,
    occurredAt: occurredAtISO,
    category: selectedRecurringCategory,
    counterparty: selectedRecurringCounterparty,
    recentMovements: recurringSuggestionHistory,
    subscriptions: snapshot?.subscriptions ?? [],
    recurringIncome: snapshot?.recurringIncome ?? [],
    proAccessEnabled: entitlementQuery.data?.proAccessEnabled,
  });
  const { impact: budgetImpact, isLoading: budgetImpactLoading } = useMovementBudgetImpact({
    enabled: Boolean(visible && form.movementType === "expense" && form.categoryId != null),
    workspaceId: activeWorkspaceId,
    surface: "movement_form",
    movement: sourceAmountNum > 0
      ? {
        movementType: "expense",
        occurredAt: occurredAtISO,
        description: counterpartyDescriptionForSuggestion,
        amount: sourceAmountNum,
        currencyCode: budgetImpactAccount?.currencyCode ?? baseCurrency,
        categoryId: form.categoryId,
        categoryName: selectedRecurringCategory?.name ?? null,
        counterpartyName: selectedRecurringCounterparty?.name ?? null,
        accountId: form.sourceAccountId,
        accountName: budgetImpactAccount?.name ?? null,
      }
      : null,
    budgets: snapshot?.budgets ?? [],
    exchangeRates,
    workspaceBaseCurrencyCode: baseCurrency,
    proAccessEnabled: entitlementQuery.data?.proAccessEnabled,
  });
  const {
    suggestion: aiCounterpartySuggestion,
    isLoading: aiCounterpartySuggestionLoading,
    aiAttempted: aiCounterpartySuggestionAttempted,
  } = useMovementCounterpartyAiSuggestion({
    enabled: Boolean(visible && form.counterpartyId == null && form.movementType !== "transfer"),
    workspaceId: activeWorkspaceId,
    surface: "movement_form",
    description: counterpartyDescriptionForSuggestion,
    movementType: form.movementType === "income" ? "income" : "expense",
    amount: descriptionCleanupAmount > 0 ? descriptionCleanupAmount : null,
    currencyCode: baseCurrency,
    counterparties: counterpartiesSorted,
    proAccessEnabled: entitlementQuery.data?.proAccessEnabled,
  });

  const currentSuggestionMovement = useMemo<MovementSuggestionLike | null>(() => {
    const amount = form.movementType === "income" ? destinationAmountNum : sourceAmountNum;
    if (form.movementType === "transfer") return null;
    return {
      id: editMovement?.id ? -editMovement.id : -1,
      movementType: form.movementType,
      status: "posted",
      occurredAt: occurredAtISO,
      sourceAccountId: form.movementType === "income" ? null : form.sourceAccountId,
      destinationAccountId: form.movementType === "income" ? form.destinationAccountId : null,
      categoryId: form.categoryId,
      counterpartyId: form.counterpartyId,
      description: form.description.trim(),
      amount,
    };
  }, [
    destinationAmountNum,
    editMovement?.id,
    form.categoryId,
    form.counterpartyId,
    form.description,
    form.destinationAccountId,
    form.movementType,
    occurredAtISO,
    form.sourceAccountId,
    sourceAmountNum,
  ]);

  const suggestionHistory = useMemo<MovementSuggestionLike[]>(() => {
    return (patternMovements ?? [])
      .filter((movement) => movement.id !== editMovement?.id)
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
  }, [editMovement?.id, patternMovements]);

  const learnedCategorySuggestion = useMemo<CategorySuggestionState | null>(() => {
    if (!currentSuggestionMovement || form.categoryId != null || !currentSuggestionMovement.description.trim()) return null;
    const accepted = dashboardAnalytics?.learningFeedback.filter((feedback) =>
      feedback.acceptedCategoryId != null &&
      (feedback.feedbackKind === "accepted_category_suggestion" || feedback.feedbackKind === "manual_category_change")
    ) ?? [];
    const normalized = normalizeAnalyticsText(currentSuggestionMovement.description);
    if (!normalized || accepted.length === 0) return null;
    const best = accepted
      .map((feedback) => {
        const learnedText = feedback.normalizedDescription ?? "";
        const similarity = learnedText === normalized ? 1 : movementFormTextSimilarity(normalized, learnedText);
        return { feedback, similarity };
      })
      .filter((item) => item.similarity >= 0.58)
      .sort((a, b) => b.similarity - a.similarity || new Date(b.feedback.createdAt).getTime() - new Date(a.feedback.createdAt).getTime())[0];
    if (!best?.feedback.acceptedCategoryId) return null;
    const category = categoriesForPicker.find((item) => item.id === best.feedback.acceptedCategoryId);
    if (!category) return null;
    const confidence = movementFormLearnedConfidence(normalized, best.feedback.normalizedDescription ?? "", best.similarity);
    if (confidence < LOCAL_CATEGORY_AI_CONFIDENCE_THRESHOLD) return null;
    return {
      categoryId: category.id,
      categoryName: category.name,
      confidence,
      reasons: ["aprendido de una corrección tuya", best.similarity >= 0.92 ? "texto casi igual" : "texto parecido"],
    };
  }, [categoriesForPicker, currentSuggestionMovement, dashboardAnalytics?.learningFeedback, form.categoryId]);

  const algorithmicCategorySuggestion = useMemo<CategorySuggestionState | null>(() => {
    if (!currentSuggestionMovement || form.categoryId != null || !currentSuggestionMovement.description.trim()) return null;
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
  }, [categoriesForPicker, currentSuggestionMovement, form.categoryId, suggestionHistory]);

  const localCategorySuggestion = learnedCategorySuggestion ?? algorithmicCategorySuggestion;
  const aiCategoryInput = useMemo(() => {
    if (!activeWorkspaceId || !currentSuggestionMovement || form.categoryId !== null) return null;
    if (form.movementType === "transfer") return null;
    const description = currentSuggestionMovement.description.trim();
    if (description.length < 3 || categoriesForPicker.length === 0) return null;
    return {
      workspaceId: activeWorkspaceId,
      surface: "movement_form" as const,
      movementType: form.movementType === "income" ? "income" as const : "expense" as const,
      amount: currentSuggestionMovement.amount > 0 ? currentSuggestionMovement.amount : null,
      currencyCode: baseCurrency,
      description,
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
    form.categoryId,
    form.movementType,
    localCategorySuggestion,
  ]);
  const shouldRequestAiCategorySuggestion = Boolean(
    visible &&
      entitlementQuery.data?.proAccessEnabled &&
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
    proAccessEnabled: entitlementQuery.data?.proAccessEnabled,
  });
  const aiCategorySuggestion = useMemo<CategorySuggestionState | null>(() => {
    if (!aiCategoryRecommendation) return null;
    if (aiCategoryRecommendation.type === "existing_category" && aiCategoryRecommendation.categoryId) {
      return {
        categoryId: aiCategoryRecommendation.categoryId,
        categoryName: aiCategoryRecommendation.categoryName ?? "Categoría sugerida",
        confidence: aiCategoryRecommendation.confidence,
        reasons: aiCategoryRecommendation.reasons,
        source: "deepseek",
      };
    }
    if (aiCategoryRecommendation.type === "new_category" && aiCategoryRecommendation.newCategoryName) {
      return {
        categoryId: null,
        categoryName: `Crear categoría "${aiCategoryRecommendation.newCategoryName}"`,
        newCategoryName: aiCategoryRecommendation.newCategoryName,
        confidence: aiCategoryRecommendation.confidence,
        reasons: aiCategoryRecommendation.reasons,
        source: "deepseek",
      };
    }
    return null;
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
    enabled: Boolean(visible && form.movementType !== "transfer"),
    workspaceId: activeWorkspaceId,
    surface: "movement_form",
    current: currentRiskMovement,
    history: riskHistory,
    proAccessEnabled: entitlementQuery.data?.proAccessEnabled,
  });

  const accountSuggestionId = useMemo(() => {
    if (!patternMaps || form.counterpartyId == null || form.movementType === "transfer") return null;
    const suggested = suggestAccountFromCounterparty(form.counterpartyId, patternMaps);
    if (suggested == null) return null;
    if (form.movementType === "income") {
      return suggested !== form.destinationAccountId ? suggested : null;
    }
    return suggested !== form.sourceAccountId ? suggested : null;
  }, [form.counterpartyId, form.destinationAccountId, form.movementType, form.sourceAccountId, patternMaps]);

  // -- Suggestion effects ----------------------------------------------------

  // Description / counterparty ? suggest category (only when no category is selected yet)
  useEffect(() => {
    if (!patternMaps || form.categoryId !== null) {
      setCatSuggestionId(null);
      return;
    }
    if (descDebounceRef.current) clearTimeout(descDebounceRef.current);

    const trimmed = form.description.trim();
    if (trimmed.length > 2) {
      descDebounceRef.current = setTimeout(() => {
        let suggested = suggestCategoryFromDescription(trimmed, patternMaps);
        if (!suggested && form.counterpartyId !== null) {
          suggested = suggestCategoryFromCounterparty(form.counterpartyId, patternMaps);
        }
        setCatSuggestionId(suggested);
      }, 350);
    } else if (form.counterpartyId !== null) {
      const suggested = suggestCategoryFromCounterparty(form.counterpartyId, patternMaps);
      setCatSuggestionId(suggested);
    } else {
      setCatSuggestionId(null);
    }

    return () => { if (descDebounceRef.current) clearTimeout(descDebounceRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.description, form.categoryId, form.counterpartyId, patternMaps]);

  // Category ? suggest counterparty (only when no counterparty is selected yet)
  useEffect(() => {
    if (!patternMaps || form.counterpartyId !== null || form.categoryId === null) {
      setCpSuggestionId(null);
      return;
    }
    const suggested = suggestCounterpartyFromCategory(form.categoryId, patternMaps);
    setCpSuggestionId(suggested);
  }, [form.categoryId, form.counterpartyId, patternMaps]);

  // Reset suggestions when form closes or step changes
  useEffect(() => {
    if (!visible) { setCatSuggestionId(null); setCpSuggestionId(null); }
  }, [visible]);

  // Reset on open / populate when editing
  useEffect(() => {
    if (!visible) {
      setIsClosingAfterSubmit(false);
      return;
    }
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    if (isClosingAfterSubmit) return;
    attachmentsHydratedRef.current = null;
    initialAttachmentSignatureRef.current = "::ready";
    // Sesión nueva del formulario = intento de registro nuevo: si quedó una clave de un
    // intento fallido anterior, no debe deduplicar contra este movimiento distinto.
    submitDedupeKeyRef.current = null;
    if (editMovement) {
      const occurredDate = editMovement.occurredAt
        ? isoToDateStr(editMovement.occurredAt)
        : todayPeru();
      setForm({
        movementType: editMovement.movementType,
        status: editMovement.status,
        sourceAccountId: editMovement.sourceAccountId ?? null,
        destinationAccountId: editMovement.destinationAccountId ?? null,
        sourceAmount: editMovement.sourceAmount ? String(editMovement.sourceAmount) : "",
        destinationAmount: editMovement.destinationAmount ? String(editMovement.destinationAmount) : "",
        description: editMovement.description ?? "",
        categoryId: editMovement.categoryId ?? null,
        counterpartyId: null,
        occurredAt: occurredDate,
        notes: editMovement.notes ?? "",
      });
      setStep(2); // Edit opens on amount/account first
    } else {
      setStep(1);
      const initial = getInitialForm(defaultType);
      if (initialAccountId) {
        initial.sourceAccountId = initialAccountId;
      }
      // Si el form abre directo como transferencia, prellenar con el par más usado.
      if (defaultType === "transfer" && !initialAccountId && frequentTransferPair) {
        const source = accounts.find((account) => account.id === frequentTransferPair.sourceAccountId && !account.isArchived);
        const dest = accounts.find((account) => account.id === frequentTransferPair.destinationAccountId && !account.isArchived);
        if (source && dest && source.id !== dest.id) {
          initial.sourceAccountId = source.id;
          initial.destinationAccountId = dest.id;
        }
      }
      setForm(initial);
    }
    setErrors({});
    setWarnings({});
    setSubmitError("");
    setAttachments([]);
    setSavedMovementId(editMovement?.id);
    setCategoryFeedbackIntent(null);
    setLinkedSubscriptionId(editMovement?.subscriptionId ?? null);
    setLinkedRecurringIncomeId(null);
    fx.resetFxState(Boolean(editMovement?.destinationAmount));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, editMovement, defaultType, initialAccountId, isClosingAfterSubmit]);

  // El par frecuente puede llegar después de abrir el form (query async). Si el form está
  // en transferencia NUEVA sin cuentas elegidas, prellénalo cuando los datos estén listos.
  // No reinicia el form ni pisa una selección del usuario (guardas en setForm).
  useEffect(() => {
    if (!visible || isEditing || form.movementType !== "transfer") return;
    if (form.sourceAccountId != null || form.destinationAccountId != null) return;
    applyTransferDefaultsIfEmpty();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, isEditing, form.movementType, form.sourceAccountId, form.destinationAccountId, frequentTransferPair, accounts]);

  useEffect(() => {
    if (!visible || !isEditing || !editMovement || editMovementAttachmentsLoading) return;
    const sourceKey = `${editMovement.id}:${editMovementAttachments.map((attachment) => attachment.filePath).join("|")}`;
    if (attachmentsHydratedRef.current === sourceKey) return;

    const hydratedAttachments = editMovementAttachments.map((attachment) => ({
      uri: attachment.signedUrl,
      storagePath: attachment.filePath,
      isUploading: false,
    }));
    attachmentsHydratedRef.current = sourceKey;
    initialAttachmentSignatureRef.current = `${hydratedAttachments
      .map((attachment) => attachment.storagePath ?? "")
      .sort()
      .join("|")}::ready`;
    setAttachments(hydratedAttachments);
  }, [editMovement, editMovementAttachments, editMovementAttachmentsLoading, isEditing, visible]);

  function patch(partial: Partial<FormState>) {
    setForm((prev) => ({ ...prev, ...partial }));
  }

  // Prellena origen→destino con el par de transferencia más usado al cambiar a "transfer"
  // en un movimiento NUEVO, solo si el usuario aún no eligió cuentas (no pisa su selección).
  // Iguala el default del overlay nativo y del registro rápido (consistencia entre vías).
  function applyTransferDefaultsIfEmpty() {
    if (isEditing || !frequentTransferPair) return;
    const source = accounts.find((account) => account.id === frequentTransferPair.sourceAccountId && !account.isArchived);
    const dest = accounts.find((account) => account.id === frequentTransferPair.destinationAccountId && !account.isArchived);
    if (!source || !dest || source.id === dest.id) return;
    setForm((prev) => {
      if (prev.movementType !== "transfer" || prev.sourceAccountId != null || prev.destinationAccountId != null) return prev;
      return { ...prev, sourceAccountId: source.id, destinationAccountId: dest.id };
    });
  }

  function selectCategoryManually(id: number | null) {
    patch({ categoryId: id });
    if (id == null) {
      setCategoryFeedbackIntent(null);
      return;
    }
    const category = categoriesForPicker.find((item) => item.id === id);
    setCategoryFeedbackIntent({
      kind: "manual_category_change",
      categoryId: id,
      categoryName: category?.name ?? null,
      confidence: null,
      reasons: ["elegida manualmente en el formulario"],
    });
  }

  async function applyCategorySuggestion(suggestion: CategorySuggestionState) {
    let nextCategoryId = suggestion.categoryId;
    let nextCategoryName = suggestion.categoryName;

    if (nextCategoryId == null && suggestion.newCategoryName) {
      const normalizedNewName = normalizeAnalyticsText(suggestion.newCategoryName);
      const existing = categoriesForPicker.find((category) => normalizeAnalyticsText(category.name) === normalizedNewName);
      if (existing) {
        nextCategoryId = existing.id;
        nextCategoryName = existing.name;
      } else {
        const created = await createCategory.mutateAsync({
          name: suggestion.newCategoryName,
          kind: form.movementType === "income" ? "income" : "expense",
        });
        nextCategoryId = created.id;
        nextCategoryName = suggestion.newCategoryName;
        showToast("Categoría creada", "success");
      }
    }

    if (nextCategoryId == null) return;
    patch({ categoryId: nextCategoryId });
    setCategoryFeedbackIntent({
      kind: "accepted_category_suggestion",
      categoryId: nextCategoryId,
      categoryName: nextCategoryName,
      confidence: suggestion.confidence,
      reasons: suggestion.reasons,
      source: suggestion.source,
    });
  }

  async function applyCounterpartySuggestion(suggestion: CounterpartySuggestionResult) {
    if (createCounterparty.isPending) return;
    if (suggestion.type === "existing_counterparty" && suggestion.counterpartyId) {
      patch({ counterpartyId: suggestion.counterpartyId });
      haptics.success();
      return;
    }
    if (suggestion.type !== "new_counterparty" || !suggestion.newCounterpartyName) return;
    const normalizedNewName = normalizeAnalyticsText(suggestion.newCounterpartyName);
    const existing = counterpartiesSorted.find((counterparty) => normalizeAnalyticsText(counterparty.name) === normalizedNewName);
    if (existing) {
      patch({ counterpartyId: existing.id });
      haptics.success();
      return;
    }
    try {
      const created = await createCounterparty.mutateAsync({
        name: suggestion.newCounterpartyName,
        type: suggestion.counterpartyType,
      });
      patch({ counterpartyId: created.id });
      haptics.success();
      showToast(`Contraparte "${suggestion.newCounterpartyName}" creada`, "success");
    } catch (error) {
      showToast(humanizeError(error) || "No se pudo crear la contraparte.", "error");
    }
  }

  async function applyRecurringSuggestion(suggestion: MovementRecurringSuggestionResult) {
    if (!suggestion.name || !suggestion.frequency || !descriptionCleanupAmount) return;
    const fields = recurringFrequencyToSubscriptionFields(suggestion.frequency);
    const date = form.occurredAt;
    const day = new Date(`${date}T12:00:00`).getDay();
    const dayOfMonth = Math.max(1, Math.min(31, Number(date.slice(8, 10)) || 1));
    try {
      if (suggestion.type === "subscription") {
        const created = await createSubscription.mutateAsync({
          name: suggestion.name,
          vendorPartyId: form.counterpartyId,
          accountId: form.sourceAccountId,
          categoryId: form.categoryId,
          amount: descriptionCleanupAmount,
          currencyCode: baseCurrency,
          frequency: fields.frequency,
          intervalCount: fields.intervalCount,
          dayOfMonth: fields.frequency === "monthly" || fields.frequency === "quarterly" || fields.frequency === "yearly" ? dayOfMonth : null,
          dayOfWeek: fields.frequency === "weekly" ? day : null,
          startDate: date,
          nextDueDate: date,
          endDate: null,
          remindDaysBefore: 3,
          autoCreateMovement: false,
          description: form.description.trim() || null,
          notes: `Creada desde sugerencia recurrente (${Math.round(suggestion.confidence * 100)}%).`,
        });
        setLinkedSubscriptionId(created.id);
        showToast("Suscripción creada", "success");
      } else if (suggestion.type === "recurring_income") {
        const created = await createRecurringIncome.mutateAsync({
          name: suggestion.name,
          payerPartyId: form.counterpartyId,
          accountId: form.destinationAccountId,
          categoryId: form.categoryId,
          amount: descriptionCleanupAmount,
          currencyCode: baseCurrency,
          frequency: fields.frequency,
          intervalCount: fields.intervalCount,
          dayOfMonth: fields.frequency === "monthly" || fields.frequency === "quarterly" || fields.frequency === "yearly" ? dayOfMonth : null,
          dayOfWeek: fields.frequency === "weekly" ? day : null,
          startDate: date,
          nextExpectedDate: date,
          endDate: null,
          remindDaysBefore: 3,
          description: form.description.trim() || null,
          notes: `Creado desde sugerencia recurrente (${Math.round(suggestion.confidence * 100)}%).`,
        });
        setLinkedRecurringIncomeId(created.id);
        showToast("Ingreso fijo creado", "success");
      }
      haptics.success();
    } catch (error) {
      showToast(humanizeError(error) || "No se pudo crear el recurrente.", "error");
    }
  }

  function persistCategoryLearning(movementId: number, description: string) {
    if (form.categoryId == null) return;
    const previousCategoryId = editMovement?.categoryId ?? null;
    const categoryChanged = form.categoryId !== previousCategoryId;
    if (!categoryChanged && categoryFeedbackIntent?.kind !== "accepted_category_suggestion") return;

    const category = categoriesForPicker.find((item) => item.id === form.categoryId);
    const intent = categoryFeedbackIntent?.categoryId === form.categoryId
      ? categoryFeedbackIntent
      : {
        kind: "manual_category_change" as const,
        categoryId: form.categoryId,
        categoryName: category?.name ?? null,
        confidence: null,
        reasons: ["categoría final elegida en el formulario"],
      };

    void persistLearningFeedback.mutateAsync({
      movementId,
      feedbackKind: intent.kind,
      normalizedDescription: normalizeAnalyticsText(description) || null,
      previousCategoryId,
      acceptedCategoryId: form.categoryId,
      confidence: intent.confidence ?? (intent.kind === "accepted_category_suggestion" ? 0.7 : null),
      source: intent.source === "deepseek" ? "movement-form-ai" : "movement-form",
      metadata: {
        categoryName: intent.categoryName ?? category?.name ?? null,
        reasons: intent.reasons ?? [],
        aiProvider: intent.source === "deepseek" ? "deepseek" : null,
        movementType: form.movementType,
        counterpartyId: form.counterpartyId,
        sourceAccountId: form.sourceAccountId,
        destinationAccountId: form.destinationAccountId,
        amount: form.movementType === "income" ? destinationAmountNum : sourceAmountNum,
      },
    }).catch((error) => {
      if (__DEV__) console.warn("[MovementForm] learning feedback failed", error);
    });
  }

  // Proyecciones de saldo del preview (fase 3 del refactor R7).
  const {
    originalSourceAccount,
    originalDestinationAccount,
    projectedSourceBalance,
    projectedDestBalance,
    revertedOriginalSourceBalance,
    revertedOriginalDestBalance,
  } = useBalanceImpactPreview({
    accounts,
    editMovement,
    isEditing,
    movementType: form.movementType,
    sourceAccount,
    destinationAccount,
    sourceAmountNum,
    destinationAmountNum,
    transferCurrenciesDiffer,
  });
  const hasAttachmentChanges = attachmentSignature !== initialAttachmentSignatureRef.current;

  // Live warnings (overdraft, fecha futura) — barato, pura, sin re-render extra.
  useEffect(() => {
    const result = validateMovementForm(
      {
        movementType: form.movementType,
        status: form.status,
        sourceAccountId: form.sourceAccountId,
        destinationAccountId: form.destinationAccountId,
        sourceAmount: form.sourceAmount,
        destinationAmount: form.destinationAmount,
        occurredAt: form.occurredAt,
      },
      {
        sourceCurrencyCode: sourceAccount?.currencyCode ?? null,
        destinationCurrencyCode: destinationAccount?.currencyCode ?? null,
        hasTransferFxAvailable: Boolean(fx.transferManualRate || fx.transferBaseFxSuggestion),
        sourceAccountBalance: sourceAccount?.currentBalance ?? null,
        todayYmd: todayPeru(),
      },
    );
    setWarnings(result.warnings);
  }, [
    form,
    sourceAccount,
    destinationAccount,
    fx.transferManualRate,
    fx.transferBaseFxSuggestion,
  ]);

  // --- Validation per step ---
  function validateStep1(): boolean {
    return true; // type is always selected
  }

  function validateStep2(): boolean {
    const result = validateMovementForm(
      {
        movementType: form.movementType,
        status: form.status,
        sourceAccountId: form.sourceAccountId,
        destinationAccountId: form.destinationAccountId,
        sourceAmount: form.sourceAmount,
        destinationAmount: form.destinationAmount,
        occurredAt: form.occurredAt,
      },
      {
        sourceCurrencyCode: sourceAccount?.currencyCode ?? null,
        destinationCurrencyCode: destinationAccount?.currencyCode ?? null,
        hasTransferFxAvailable: Boolean(fx.transferManualRate || fx.transferBaseFxSuggestion),
        sourceAccountBalance: sourceAccount?.currentBalance ?? null,
        todayYmd: todayPeru(),
      },
    );
    setErrors(result.errors);
    setWarnings(result.warnings);
    return result.valid;
  }

  function validateStep3(): boolean {
    // Description is optional · auto-generated on submit if empty
    setErrors({});
    return true;
  }

  // Auto-generate description if user left it empty
  function buildDescription(): string {
    if (form.description.trim()) return form.description.trim();
    const parts: string[] = [];
    if (form.categoryId) {
      const cat = categories.find((c) => c.id === form.categoryId);
      if (cat) parts.push(cat.name);
    }
    if (form.counterpartyId) {
      const cp = counterparties.find((c) => c.id === form.counterpartyId);
      if (cp) parts.push(cp.name);
    }
    const account = form.movementType === "income" ? destinationAccount : sourceAccount;
    if (account) parts.push(account.name);
    if (parts.length > 0) return parts.join(" · ");
    const labels: Record<MovementType, string> = {
      expense: "Gasto",
      income: "Ingreso",
      transfer: "Transferencia",
      obligation_opening: "Apertura de obligación",
      obligation_payment: "Pago de obligación",
      subscription_payment: "Pago de suscripción",
      refund: "Reembolso",
      adjustment: "Ajuste",
    };
    return labels[form.movementType] ?? form.movementType;
  }

  function goNext() {
    if (step === 1 && validateStep1()) { haptics.selection(); setStep(2); }
    else if (step === 2 && validateStep2()) { haptics.selection(); setStep(3); }
    else haptics.error();
  }

  function goBack() {
    if (step === 2) { haptics.light(); setStep(1); }
    else if (step === 3) { haptics.light(); setStep(2); }
  }

  async function handleSubmit() {
    setSubmitError("");
    if (!validateStep3()) {
      haptics.error();
      descriptionRef.current?.focus();
      return;
    }
    // Anti-doble-tap: ignorar si ya hay un guardado en vuelo (evita movimientos duplicados).
    if (submittingRef.current) return;
    submittingRef.current = true;

    try {
      setIsClosingAfterSubmit(true);
      const autoDesc = buildDescription();
      let backgroundAttachmentSync: (() => void) | null = null;
      const isTransfer = form.movementType === "transfer";
      const effectiveDestAmount = isTransfer && !transferCurrenciesDiffer
        ? sourceAmountNum
        : destinationAmountNum;
      const effectiveFxRate = isTransfer && transferCurrenciesDiffer && sourceAmountNum > 0
        ? effectiveDestAmount / sourceAmountNum
        : null;
      const movementContract = {
        movementType: form.movementType,
        status: form.status,
        occurredAt: dateStrToISO(form.occurredAt),
        description: autoDesc,
        notes: form.notes.trim() || null,
        sourceAccountId: form.sourceAccountId,
        sourceAmount: sourceAmountNum,
        destinationAccountId: form.destinationAccountId,
        destinationAmount: effectiveDestAmount,
        transferCurrenciesDiffer,
        fxRate: effectiveFxRate,
        categoryId: form.categoryId,
        counterpartyId: form.counterpartyId,
        subscriptionId: linkedSubscriptionId,
      };
      if (isEditing && editMovement) {
        await updateMovement.mutateAsync({
          id: editMovement.id,
          input: buildMovementUpdateInput(movementContract),
        });
        persistCategoryLearning(editMovement.id, autoDesc);
        if (activeWorkspaceId && linkedEventId && hasAttachmentChanges) {
          backgroundAttachmentSync = () => {
            const noticeId = showActivityNotice(
              "Sincronizando comprobantes",
              "Puedes seguir usando la app mientras actualizamos el evento vinculado.",
            );
            void mirrorMovementAttachmentsToObligationEvent({
              workspaceId: activeWorkspaceId,
              movementId: editMovement.id,
              eventId: linkedEventId,
            })
              .then(() => {
                void Promise.all([
                  queryClient.invalidateQueries({
                    queryKey: ["movement-attachments", activeWorkspaceId, editMovement.id],
                  }),
                  queryClient.invalidateQueries({
                    queryKey: ["entity-attachments", activeWorkspaceId, "obligation-event", linkedEventId],
                  }),
                  queryClient.invalidateQueries({
                    queryKey: ["entity-attachment-counts", activeWorkspaceId, "obligation-event"],
                  }),
                ]);
              })
              .catch((attachmentError) => {
                showToast(humanizeError(attachmentError), "error");
              })
              .finally(() => dismissActivityNotice(noticeId));
          };
        }
        showToast("Movimiento actualizado", "warning");
        if (linkedEventId && activeWorkspaceId) {
          void queryClient.invalidateQueries({ queryKey: ["obligation-events"] });
          void queryClient.invalidateQueries({ queryKey: ["entity-attachments", activeWorkspaceId, "obligation-event", linkedEventId] });
        }
      } else {
        if (!submitDedupeKeyRef.current) {
          submitDedupeKeyRef.current = newClientDedupeKey("form");
        }
        const payload = buildMovementCreateInput({
          ...movementContract,
          metadata: {
            recurring_income_id: linkedRecurringIncomeId,
            riskAi: movementRisk?.source === "deepseek" ? movementRisk : null,
            budgetAi: budgetImpact?.source === "deepseek" ? budgetImpact : null,
          },
          dedupeKey: submitDedupeKeyRef.current,
        });
        const created = await createMovement.mutateAsync(payload);
        submitDedupeKeyRef.current = null;
        setSavedMovementId(created.id);
        persistCategoryLearning(created.id, autoDesc);
        // Los comprobantes se sincronizan después de cerrar el formulario para no bloquear la UI.
        // Deshacer elimina el movimiento recién creado (la dedupe key se libera con la fila).
        showRichToast({
          type: "success",
          title: "Movimiento guardado",
          subtitle: "Toca deshacer si fue un error",
          onUndo: () => deleteMovement.mutate(created.id),
        });
        setLastMovementAccountId(form.sourceAccountId);
        if (attachments.length > 0 && activeWorkspaceId) {
          backgroundAttachmentSync = () => {
            const noticeId = showActivityNotice(
              "Sincronizando comprobantes",
              "Puedes seguir usando la app mientras terminamos de copiar las imágenes.",
            );
            void promoteDraftAttachmentsToEntity({
              attachments,
              workspaceId: activeWorkspaceId,
              entityType: "movement",
              entityId: created.id,
            })
              .then(() => {
                void queryClient.invalidateQueries({
                  queryKey: ["movement-attachments", activeWorkspaceId, created.id],
                });
              })
              .catch((attachmentError) => {
                showToast(humanizeError(attachmentError), "error");
              })
              .finally(() => dismissActivityNotice(noticeId));
          };
        }
      }
      haptics.success();
      onSuccess?.();
      onClose();
      backgroundAttachmentSync?.();
    } catch (err: unknown) {
      setIsClosingAfterSubmit(false);
      haptics.error();
      setSubmitError(humanizeError(err));
    } finally {
      submittingRef.current = false;
    }
  }

  function handleClose() {
    let isDirty: boolean;
    if (isEditing && editMovement) {
      const origOccurredAt = editMovement.occurredAt ? isoToDateStr(editMovement.occurredAt) : todayPeru();
      isDirty =
        form.description !== (editMovement.description ?? "") ||
        form.sourceAccountId !== (editMovement.sourceAccountId ?? null) ||
        form.destinationAccountId !== (editMovement.destinationAccountId ?? null) ||
        form.sourceAmount !== (editMovement.sourceAmount ? String(editMovement.sourceAmount) : "") ||
        form.destinationAmount !== (editMovement.destinationAmount ? String(editMovement.destinationAmount) : "") ||
        form.status !== editMovement.status ||
        form.categoryId !== (editMovement.categoryId ?? null) ||
        form.counterpartyId !== (editMovement.counterpartyId ?? null) ||
        form.notes !== (editMovement.notes ?? "") ||
        form.occurredAt !== origOccurredAt ||
        attachmentSignature !== initialAttachmentSignatureRef.current;
    } else {
      isDirty = Boolean(
        form.description ||
        form.sourceAmount ||
        form.destinationAmount ||
        attachments.length > 0,
      );
    }

    if (isDirty) {
      setDiscardVisible(true);
    } else {
      onClose();
    }
  }

  const stepTitle = isEditing
    ? step === 1
      ? "Editar movimiento - tipo"
      : step === 2
        ? "Editar movimiento - monto y cuenta"
        : "Editar movimiento - descripcion y categoria"
    : step === 1 ? "Tipo de movimiento"
    : step === 2 ? "Monto y cuenta"
    : "Descripcion y categoria";

  return (
    <>
    <BottomSheet
      visible={visible}
      onClose={handleClose}
      title={stepTitle}
      snapHeight={0.85}
    >
      {/* Step indicator · hidden when editing */}
      {!isEditing ? (
        <View
          style={styles.stepRow}
          accessibilityRole="progressbar"
          accessibilityLabel={`Paso ${step} de 3: ${stepTitle}`}
          accessibilityValue={{ min: 1, max: 3, now: step }}
        >
          {([1, 2, 3] as Step[]).map((s) => (
            <View key={s} style={[styles.stepDot, step >= s && styles.stepDotActive]} />
          ))}
        </View>
      ) : null}

      {/* -- STEP 1: type + status -- */}
      {step === 1 ? (
        <StepTypeAndStatus
          movementType={form.movementType}
          status={form.status}
          onChangeType={(type) => {
            fx.setTransferDestinationEdited(false);
            patch({ movementType: type });
            if (type === "transfer") applyTransferDefaultsIfEmpty();
          }}
          onChangeStatus={(status) => patch({ status })}
          onNext={goNext}
        />
      ) : null}

      {/* -- STEP 2: amount + accounts -- */}
      {step === 2 ? (
        <StepAccountsAndAmounts
          movementType={form.movementType}
          isEditing={isEditing}
          sourceAmount={form.sourceAmount}
          destinationAmount={form.destinationAmount}
          onChangeSourceAmount={(v) => patch({ sourceAmount: v })}
          onChangeDestinationAmount={(v) => patch({ destinationAmount: v })}
          onChangeTransferDestinationAmount={(v) => {
            fx.setTransferDestinationEdited(true);
            patch({ destinationAmount: v });
          }}
          sourceAccountId={form.sourceAccountId}
          destinationAccountId={form.destinationAccountId}
          activeAccountsSorted={activeAccountsSorted}
          destinationAccountsSorted={destinationAccountsSorted}
          sourceAccount={sourceAccount}
          destinationAccount={destinationAccount}
          onChangeSourceAccount={(id) => {
            if (form.movementType === "transfer") fx.setTransferDestinationEdited(false);
            patch({ sourceAccountId: id });
          }}
          onChangeDestinationAccount={(id) => {
            if (form.movementType === "transfer") fx.setTransferDestinationEdited(false);
            patch({ destinationAccountId: id });
          }}
          transferCurrenciesDiffer={transferCurrenciesDiffer}
          transferRateInput={fx.transferRateInput}
          onChangeTransferRate={fx.onChangeTransferRate}
          effectiveTransferFxSuggestion={fx.effectiveTransferFxSuggestion}
          transferBaseFxSuggestion={fx.transferBaseFxSuggestion}
          transferInverseFxLabel={fx.transferInverseFxLabel}
          transferDestinationEdited={fx.transferDestinationEdited}
          syncExchangeRateIsPending={fx.syncExchangeRateIsPending}
          transferRateError={Boolean(fx.transferRateError)}
          projectedSourceBalance={projectedSourceBalance}
          revertedOriginalSourceBalance={revertedOriginalSourceBalance}
          projectedDestBalance={projectedDestBalance}
          revertedOriginalDestBalance={revertedOriginalDestBalance}
          originalSourceAccount={originalSourceAccount}
          originalDestinationAccount={originalDestinationAccount}
          baseCurrencyCode={baseCurrency}
          errors={errors}
          warnings={warnings}
          onBack={goBack}
          onNext={goNext}
        />
      ) : null}

      {/* -- STEP 3: description + category + counterparty + date -- */}
      {step === 3 ? (() => {
        const catSuggestion = catSuggestionId !== null
          ? categoriesForPicker.find((c) => c.id === catSuggestionId) ?? null
          : null;
        const cpSuggestion = cpSuggestionId !== null
          ? counterpartiesSorted.find((c) => c.id === cpSuggestionId) ?? null
          : null;
        const counterpartySuggestionToShow: CounterpartySuggestionResult | null = aiCounterpartySuggestion ?? (
          cpSuggestion
            ? {
              type: "existing_counterparty",
              counterpartyId: cpSuggestion.id,
              counterpartyName: cpSuggestion.name,
              newCounterpartyName: null,
              counterpartyType: cpSuggestion.type,
              confidence: 0.62,
              reasons: ["normalmente usas esta contraparte con esa categoría"],
              source: "local",
            }
            : null
        );
        const accountSuggestion = accountSuggestionId !== null
          ? activeAccountsSorted.find((account) => account.id === accountSuggestionId) ?? null
          : null;
        const categorySuggestionToShow = bestCategorySuggestion ?? (
          catSuggestion
            ? {
              categoryId: catSuggestion.id,
              categoryName: catSuggestion.name,
              confidence: 0.62,
              reasons: ["patrón repetido en tu historial"],
            }
            : null
        );
        return (
          <StepDetails
            isEditing={isEditing}
            descriptionRef={descriptionRef}
            notesRef={notesRef}
            description={form.description}
            onChangeDescription={(v) => {
              if (v !== cleanupAppliedText) setCleanupAppliedText(null);
              patch({ description: v });
            }}
            notes={form.notes}
            onChangeNotes={(v) => patch({ notes: v })}
            movementRiskLoading={movementRiskLoading}
            movementRisk={movementRisk}
            budgetImpactLoading={budgetImpactLoading}
            budgetImpact={budgetImpact}
            descriptionCleanupLoading={descriptionCleanupLoading}
            descriptionCleanup={descriptionCleanup}
            onApplyDescriptionCleanup={(cleaned) => {
              setCleanupAppliedText(cleaned);
              patch({ description: cleaned });
            }}
            categoriesForPicker={categoriesForPicker}
            categoryId={form.categoryId}
            onSelectCategory={selectCategoryManually}
            aiCategorySuggestionLoading={aiCategorySuggestionLoading}
            aiCategorySuggestionAttempted={aiCategorySuggestionAttempted}
            aiCategorySuggestionErrored={aiCategorySuggestionOutcome === "error"}
            hasLocalCategorySuggestion={Boolean(localCategorySuggestion)}
            categorySuggestionToShow={categorySuggestionToShow}
            onApplyCategorySuggestion={(sug) => void applyCategorySuggestion(sug)}
            counterpartiesSorted={counterpartiesSorted}
            counterpartyId={form.counterpartyId}
            onSelectCounterparty={(id) => patch({ counterpartyId: id })}
            aiCounterpartySuggestionLoading={aiCounterpartySuggestionLoading}
            aiCounterpartySuggestionAttempted={aiCounterpartySuggestionAttempted}
            counterpartySuggestionToShow={counterpartySuggestionToShow}
            onApplyCounterpartySuggestion={(sug) => void applyCounterpartySuggestion(sug)}
            recurringSuggestionLoading={recurringSuggestionLoading}
            recurringSuggestionAttempted={recurringSuggestionAttempted}
            recurringAlreadyLinked={Boolean(linkedSubscriptionId || linkedRecurringIncomeId)}
            recurringSuggestion={recurringSuggestion}
            onApplyRecurringSuggestion={(sug) => void applyRecurringSuggestion(sug)}
            accountSuggestion={accountSuggestion}
            movementType={form.movementType}
            onPickSuggestedAccount={(account) => {
              if (form.movementType === "income") patch({ destinationAccountId: account.id });
              else patch({ sourceAccountId: account.id });
            }}
            occurredAt={form.occurredAt}
            onChangeOccurredAt={(v) => patch({ occurredAt: v })}
            warnings={warnings}
            attachments={attachments}
            onChangeAttachments={setAttachments}
            savedMovementId={savedMovementId}
            isHydratingExistingAttachments={editMovementAttachmentsLoading}
            submitError={submitError}
            submitLoading={createMovement.isPending || updateMovement.isPending || createSubscription.isPending || createRecurringIncome.isPending}
            onBack={goBack}
            onSubmit={handleSubmit}
          />
        );
      })() : null}
    </BottomSheet>

    <ConfirmDialog
      visible={discardVisible}
      title="¿Descartar cambios?"
      body="Los datos ingresados se perderán."
      confirmLabel="Descartar"
      cancelLabel="Continuar editando"
      onCancel={() => setDiscardVisible(false)}
      onConfirm={() => { setDiscardVisible(false); onClose(); }}
    />
    </>
  );
}

// -- Sub-components ------------------------------------------------------------

// --- Styles -------------------------------------------------------------------
const styles = StyleSheet.create({
  stepRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 6,
    marginBottom: SPACING.md,
    alignItems: "center",
  },
  stepDot: {
    width: 24,
    height: 4,
    borderRadius: 2,
    backgroundColor: SURFACE.inputBorder,
  },
  stepDotActive: {
    backgroundColor: COLORS.pine,
    width: 32,
    shadowColor: COLORS.pine,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 6,
  },
});
