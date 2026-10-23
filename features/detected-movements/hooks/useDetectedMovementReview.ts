import { detectionFormFields } from "../lib/form-feedback";
import { applyPersonalProposal, buildDetectionDraft, detectionMissingFields, transferDestinationDraft, type DetectionDraft } from "../lib/review-draft";
import { reconciliationCandidateForDraft } from "../lib/reconciliation";
import { humanizeError } from "../../../lib/errors";
import type { MovementRecord } from "../../../types/domain";
import { useEffect, useMemo, useRef, useState } from "react";

import { useRouter } from "expo-router";

import { useAuth } from "../../../lib/auth-context";
import { useWorkspace } from "../../../lib/workspace-context";
import { useToast } from "../../../hooks/useToast";
import { useHaptics } from "../../../hooks/useHaptics";
import { findPossibleDuplicateMovement, countSameDayDetectionSignals, confirmDuplicateWithAi, recordSuggestionAction, useAiUsageTodayQuery, useNotificationDetectionSettingsQuery, useDetectedMovementSuggestionQuery, useMarkDetectedMovementSuggestionMutation, useUndoDetectedMovementRegistrationMutation, useRegisterDetectedSplitMutation, hideLocallyRegisteredSuggestion, showSuggestionAgain } from "../../../services/queries/notification-detection";
import { getFinancialAppByKey, resolveFinancialAppByPackage } from "../../../lib/notification-detection-apps";
import { useCreateCategoryMutation, useCreateCounterpartyMutation, useCreateMovementMutation, useCreateRecurringIncomeMutation, useCreateSubscriptionMutation, useMarkNotificationReadMutation, usePersistLearningFeedbackMutation, useUserEntitlementQuery, useWorkspaceSnapshotQuery } from "../../../services/queries/workspace-data";
import { useMovementPatternsQuery } from "../../../services/queries/movement-patterns";
import { useDetectionLearningQuery } from "../../../services/queries/detection-learning";
import { learningObject, proposeFromPersonalHistory, receiptAccountHints } from "../lib/personal-learning";
import { EMAIL_SOURCE_PACKAGE } from "../../../services/queries/inbound-email-alias";
import { offlineRuntime } from "../../../lib/offline/instance";
import { waitUntilSent } from "../../../lib/offline/ensure-sent";
import { assertEmailDetectionProAccess, ProAccessUnverifiedError, useEmailDetectionProAccessQuery } from "../../../services/queries/email-detection-access";
import { normalizeAnalyticsText } from "../../../services/analytics/movement-features";
import { useMovementCategoryAiSuggestion } from "../../../hooks/useMovementCategoryAiSuggestion";
import { useMovementDescriptionCleanup } from "../../../hooks/useMovementDescriptionCleanup";
import { useMovementCounterpartyAiSuggestion } from "../../../hooks/useMovementCounterpartyAiSuggestion";
import type { CounterpartySuggestionResult } from "../../../lib/movement-counterparty-suggestions";
import { useMovementRecurringAiSuggestion } from "../../../hooks/useMovementRecurringAiSuggestion";
import { useMovementRiskExplanation } from "../../../hooks/useMovementRiskExplanation";
import { useMovementBudgetImpact } from "../../../hooks/useMovementBudgetImpact";
import { recurringFrequencyToSubscriptionFields, type MovementRecurringHistoryItem, type MovementRecurringSuggestionResult } from "../../../lib/movement-recurring-suggestions";
import type { MovementRiskItem } from "../../../lib/movement-risk-analysis";
import type { CounterpartySummary } from "../../../types/domain";
import { useMovementCreationController } from "../../movements/hooks/useMovementCreationController";
import { buildMovementCreateInput } from "../../movements/lib/movement-save-contract";
import { parsePositiveAmountInput } from "../../../lib/amount-parsing";
import { dateTimeStrToISO, todayPeru } from "../../../lib/date";
import { validateMovementForm } from "../../movements/lib/form-validation";
import { patternMovementAmount } from "../../movements/lib/pattern-heuristics";
import { mapAiCategoryRecommendation } from "../../movements/lib/category-suggestion-derivation";
import { validateSplit, type SplitLine } from "../../movements/lib/split-movement";
import { LOCAL_CATEGORY_AI_CONFIDENCE_THRESHOLD } from "../../../lib/movement-ai-orchestrator";
import { useSpendTypesQuery } from "../../../services/queries/spend-types";

// Heurísticas compartidas con MovementForm y el runtime sync (features/movements/lib).

type Props = {
  visible: boolean;
  suggestionId: number | null;
  notificationId?: number | null;
  onClose: () => void;
  onResolved?: (id: number, status: "registered" | "discarded" | "duplicate") => void;
  initialDraft?: DetectionDraft;
  previewEnabled?: boolean;
  origin?: "dashboard" | "notifications";
};

type CategorySuggestionState = {
  categoryId: number | null;
  categoryName: string;
  newCategoryName?: string | null;
  confidence: number;
  detail: string;
  reasons: string[];
  source?: "deepseek" | "local";
};

type CategoryFeedbackIntent = {
  kind: "accepted_category_suggestion" | "manual_category_change";
  categoryId: number;
  categoryName?: string | null;
  confidence?: number | null;
  reasons?: string[];
  source?: "deepseek" | "local";
};

export function useDetectedMovementReview({ visible, suggestionId, notificationId, onClose, onResolved, initialDraft, previewEnabled = false, origin = "notifications" }: Props) {
  const router = useRouter();
  const { profile } = useAuth();
  const { activeWorkspaceId, activeWorkspace } = useWorkspace();
  const { showToast, showRichToast, showErrorToast } = useToast();
  const haptics = useHaptics();
  const suggestionQuery = useDetectedMovementSuggestionQuery(suggestionId);
  const suggestion = suggestionQuery.data;
  const isPendingEmail = suggestion?.packageName === EMAIL_SOURCE_PACKAGE &&
    (suggestion.status === "pending" || suggestion.status === "needs_review");
  const emailProAccess = useEmailDetectionProAccessQuery(profile?.id ?? null, (visible || previewEnabled) && isPendingEmail);
  const snapshotQuery = useWorkspaceSnapshotQuery(profile, activeWorkspaceId);
  const snapshot = snapshotQuery.data;
  const { data: spendTypes = [] } = useSpendTypesQuery(activeWorkspaceId);
  const settingsQuery = useNotificationDetectionSettingsQuery(profile?.id, activeWorkspaceId);
  const settings = settingsQuery.data ?? [];
  const createMovement = useCreateMovementMutation(activeWorkspaceId);
  const undoDetectedRegistration = useUndoDetectedMovementRegistrationMutation();
  const registerDetectedSplit = useRegisterDetectedSplitMutation();
  const createCategory = useCreateCategoryMutation(activeWorkspaceId);
  const createCounterparty = useCreateCounterpartyMutation(activeWorkspaceId);
  const createSubscription = useCreateSubscriptionMutation(activeWorkspaceId);
  const createRecurringIncome = useCreateRecurringIncomeMutation(activeWorkspaceId);
  const markSuggestion = useMarkDetectedMovementSuggestionMutation(profile?.id ?? null);
  const markNotificationRead = useMarkNotificationReadMutation(profile?.id ?? null);
  const entitlementQuery = useUserEntitlementQuery(profile?.id ?? null, profile?.email ?? null);
  const aiUsageQuery = useAiUsageTodayQuery(profile?.id ?? null);
  const persistLearningFeedback = usePersistLearningFeedbackMutation(activeWorkspaceId, profile?.id);
  // La tarjeta necesita el historial para proponer categorías sin activar consultas de IA.
  const { data: patternMovements } = useMovementPatternsQuery(visible || previewEnabled ? activeWorkspaceId : null);
  const learningQuery = useDetectionLearningQuery(profile?.id ?? null, activeWorkspaceId, visible || previewEnabled);

  const [movementType, setMovementType] = useState<"expense" | "income" | "transfer">("expense");
  const [amount, setAmount] = useState("");
  const [accountId, setAccountId] = useState<number | null>(null);
  const [destinationAccountId, setDestinationAccountId] = useState<number | null>(null);
  const [destinationAmount, setDestinationAmount] = useState("");
  const [transferFxRate, setTransferFxRate] = useState("");
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [splitLines, setSplitLines] = useState<SplitLine[] | null>(null);
  const [splitSheetOpen, setSplitSheetOpen] = useState(false);
  const [counterpartyId, setCounterpartyId] = useState<number | null>(null);
  const [description, setDescription] = useState("");
  const [notes, setNotes] = useState("");
  const [cleanupAppliedText, setCleanupAppliedText] = useState<string | null>(null);
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [checkingDuplicate, setCheckingDuplicate] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [saveError, setSaveError] = useState<string | null>(null);
  // El controlador sigue montado para la tarjeta. El error del intento pertenece
  // a la revisión que se abre/cierra; conserva el borrador, pero no ese error.
  // Un fallo al guardar directamente desde la tarjeta permanece hasta reintentar
  // o abrir la revisión, porque no cambia `visible`.
  useEffect(() => { setSaveError(null); setFieldErrors({}); }, [visible]);
  const [duplicateCandidate, setDuplicateCandidate] = useState<MovementRecord | null>(null);
  const reconciliationCandidateId = useRef<number | null>(null);
  const [isDiscarding, setIsDiscarding] = useState(false);
  // Guard anti-doble-tap SÍNCRONO: el botón se deshabilita con loading, pero hay una ventana
  // entre el primer tap y el re-render donde un segundo tap (o doble-tap rápido) dispara otro
  // submit → movimiento duplicado/triplicado. Este ref bloquea al instante, sin esperar render.
  const submittingRef = useRef(false);
  const lastActionRef = useRef<"save" | "discard">("save");
  const [categoryFeedbackIntent, setCategoryFeedbackIntent] = useState<CategoryFeedbackIntent | null>(null);
  const [linkedSubscriptionId, setLinkedSubscriptionId] = useState<number | null>(null);
  const [linkedRecurringIncomeId, setLinkedRecurringIncomeId] = useState<number | null>(null);

  useEffect(() => {
    if (movementType !== "expense" && movementType !== "income" && splitLines) setSplitLines(null);
  }, [movementType, splitLines]);

  const {
    activeAccountsSorted: activeAccounts,
    destinationAccountsSorted,
    categoriesForPicker: categories,
    sourceAccount: transferSourceAccount,
    destinationAccount: transferDestAccount,
    transferCurrenciesDiffer,
  } = useMovementCreationController({
    accounts: snapshot?.accounts ?? [],
    categories: snapshot?.categories ?? [],
    movementType,
    sourceAccountId: accountId,
    destinationAccountId,
    sourceAmount: amount,
    destinationAmount,
  });
  const isTransfer = movementType === "transfer";
  const aiMovementType: "income" | "expense" = movementType === "income" ? "income" : "expense";
  const counterparties = useMemo<CounterpartySummary[]>(() => {
    return (snapshot?.counterparties ?? []).filter((counterparty) => !counterparty.isArchived);
  }, [snapshot?.counterparties]);
  const selectedRecurringCategory = categoryId != null
    ? categories.find((category) => category.id === categoryId) ?? null
    : null;
  const selectedRecurringCounterparty = counterpartyId != null
    ? counterparties.find((counterparty) => counterparty.id === counterpartyId) ?? null
    : null;
  const recurringSuggestionHistory = useMemo<MovementRecurringHistoryItem[]>(() => {
    return (patternMovements ?? []).map((movement) => ({
      id: movement.id,
      movementType: movement.movement_type,
      occurredAt: movement.occurred_at,
      description: movement.description ?? "",
      amount: patternMovementAmount(movement),
      categoryId: movement.category_id ?? null,
      counterpartyId: movement.counterparty_id ?? null,
    }));
  }, [patternMovements]);
  const riskHistory = useMemo<MovementRiskItem[]>(() => {
    return (patternMovements ?? []).map((movement) => {
      const category = (snapshot?.categories ?? []).find((item) => item.id === movement.category_id) ?? null;
      const counterparty = (snapshot?.counterparties ?? []).find((item) => item.id === movement.counterparty_id) ?? null;
      const accountId = movement.destination_account_id ?? movement.source_account_id ?? null;
      const account = (snapshot?.accounts ?? []).find((item) => item.id === accountId) ?? null;
      return {
        id: movement.id,
        movementType: movement.movement_type,
        occurredAt: movement.occurred_at,
        description: movement.description ?? "",
        amount: patternMovementAmount(movement),
        categoryId: movement.category_id ?? null,
        categoryName: category?.name ?? null,
        counterpartyId: movement.counterparty_id ?? null,
        counterpartyName: counterparty?.name ?? null,
        accountId,
        accountName: account?.name ?? null,
      };
    });
  }, [patternMovements, snapshot?.accounts, snapshot?.categories, snapshot?.counterparties]);
  // Memoize to avoid new Date().toISOString() producing a new string each render.
  const occurredAtISO = useMemo(
    () => date ? dateTimeStrToISO(date, time) : suggestion?.occurredAt ?? new Date().toISOString(),
    [date, time, suggestion?.occurredAt],
  );
  const currentRiskMovement = useMemo<MovementRiskItem | null>(() => {
    const parsedAmount = (parsePositiveAmountInput(amount) ?? NaN) || suggestion?.amount || 0;
    if (!parsedAmount || !description.trim()) return null;
    const category = categoryId == null ? null : categories.find((item) => item.id === categoryId) ?? null;
    const counterparty = counterpartyId == null ? null : counterparties.find((item) => item.id === counterpartyId) ?? null;
    const account = accountId == null ? null : activeAccounts.find((item) => item.id === accountId) ?? null;
    return {
      id: -1,
      movementType,
      occurredAt: occurredAtISO,
      description,
      amount: parsedAmount,
      categoryId,
      categoryName: category?.name ?? null,
      counterpartyId,
      counterpartyName: counterparty?.name ?? null,
      accountId,
      accountName: account?.name ?? null,
    };
  }, [accountId, activeAccounts, amount, categories, categoryId, counterparties, counterpartyId, date, description, movementType, suggestion]);

  const personalProposal = useMemo(() => proposeFromPersonalHistory({
    history: learningQuery.data ?? [], description, movementType,
    currencyCode: suggestion?.currencyCode ?? "PEN", financialAppKey: suggestion?.financialAppKey ?? "",
    accountHints: learningObject(suggestion?.metadata).accountHints, accountId,
    accounts: snapshot?.accounts ?? [], categories: snapshot?.categories ?? [],
  }), [learningQuery.data, description, movementType, suggestion?.metadata, suggestion?.currencyCode, suggestion?.financialAppKey, accountId, snapshot?.accounts, snapshot?.categories]);
  const localCategorySuggestion = useMemo<CategorySuggestionState | null>(() => {
    if (categoryId !== null || !description.trim()) return null;

    const category = categories.find((c) => c.id === personalProposal.categoryId);
    return category ? { categoryId: category.id, categoryName: category.name, confidence: 0.9,
      detail: "Según tus movimientos anteriores", reasons: ["Según tus movimientos anteriores"], source: "local" } : null;
  }, [categoryId, description, categories, personalProposal.categoryId]);

  const aiCategoryInput = useMemo(() => {
    if (isTransfer || !activeWorkspaceId || categoryId !== null || !description.trim() || !categories.length) return null;
    return {
      workspaceId: activeWorkspaceId,
      surface: "notification_form" as const,
      movementType: aiMovementType,
      amount: (parsePositiveAmountInput(amount) ?? NaN) || suggestion?.amount || null,
      currencyCode: suggestion?.currencyCode ?? "PEN",
      description: description.trim(),
      occurredAt: occurredAtISO,
      categories: categories.map((category) => ({
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
  }, [activeWorkspaceId, amount, categories, categoryId, date, description, localCategorySuggestion, movementType]);
  const shouldRequestAiCategorySuggestion = Boolean(
    visible &&
      !learningQuery.isPending &&
      entitlementQuery.data?.proAccessEnabled &&
      aiCategoryInput &&
      (!localCategorySuggestion || localCategorySuggestion.confidence < LOCAL_CATEGORY_AI_CONFIDENCE_THRESHOLD),
  );
  const {
    recommendation: aiCategoryRecommendation,
  } = useMovementCategoryAiSuggestion({
    enabled: shouldRequestAiCategorySuggestion,
    input: aiCategoryInput,
    proAccessEnabled: entitlementQuery.data?.proAccessEnabled,
  });
  const aiCategorySuggestion = useMemo<CategorySuggestionState | null>(() => {
    const base = mapAiCategoryRecommendation(aiCategoryRecommendation);
    if (!base) return null;
    return {
      ...base,
      detail: `Mejor sugerencia · ${Math.round(base.confidence * 100)}% · ${base.reasons.join(" · ")}`,
      source: "deepseek",
    };
  }, [aiCategoryRecommendation]);
  const categorySuggestion = localCategorySuggestion ?? aiCategorySuggestion;
  const { cleanup: descriptionCleanup } = useMovementDescriptionCleanup({
    enabled: Boolean(visible && !isTransfer && description !== cleanupAppliedText),
    workspaceId: activeWorkspaceId,
    surface: "notification_form",
    rawDescription: description,
    appLabel: suggestion?.appLabel ?? null,
    financialAppKey: suggestion?.financialAppKey ?? null,
    amount: (parsePositiveAmountInput(amount) ?? NaN) || suggestion?.amount || null,
    currencyCode: suggestion?.currencyCode ?? "PEN",
    proAccessEnabled: entitlementQuery.data?.proAccessEnabled,
  });
  const {
    suggestion: counterpartySuggestion,
    aiAttempted: counterpartySuggestionAttempted,
  } = useMovementCounterpartyAiSuggestion({
    enabled: Boolean(visible && !isTransfer && counterpartyId == null),
    workspaceId: activeWorkspaceId,
    surface: "notification_form",
    description: descriptionCleanup?.cleanedDescription ?? description,
    movementType: aiMovementType,
    amount: (parsePositiveAmountInput(amount) ?? NaN) || suggestion?.amount || null,
    currencyCode: suggestion?.currencyCode ?? "PEN",
    counterparties,
    proAccessEnabled: entitlementQuery.data?.proAccessEnabled,
  });
  const {
    suggestion: recurringSuggestion,
    aiAttempted: recurringSuggestionAttempted,
  } = useMovementRecurringAiSuggestion({
    enabled: Boolean(visible && !isTransfer),
    workspaceId: activeWorkspaceId,
    surface: "notification_form",
    description: descriptionCleanup?.cleanedDescription ?? description,
    movementType: aiMovementType,
    amount: (parsePositiveAmountInput(amount) ?? NaN) || suggestion?.amount || null,
    currencyCode: suggestion?.currencyCode ?? "PEN",
    occurredAt: occurredAtISO,
    category: selectedRecurringCategory,
    counterparty: selectedRecurringCounterparty,
    recentMovements: recurringSuggestionHistory,
    subscriptions: snapshot?.subscriptions ?? [],
    recurringIncome: snapshot?.recurringIncome ?? [],
    proAccessEnabled: entitlementQuery.data?.proAccessEnabled,
  });
  const { risk: movementRisk } = useMovementRiskExplanation({
    enabled: Boolean(visible && !isTransfer),
    workspaceId: activeWorkspaceId,
    surface: "notification_form",
    current: currentRiskMovement,
    history: riskHistory,
    proAccessEnabled: entitlementQuery.data?.proAccessEnabled,
  });
  const selectedBudgetAccount = accountId == null ? null : activeAccounts.find((account) => account.id === accountId) ?? null;
  const { impact: budgetImpact } = useMovementBudgetImpact({
    enabled: Boolean(visible && movementType === "expense" && categoryId != null),
    workspaceId: activeWorkspaceId,
    surface: "notification_form",
    movement: (parsePositiveAmountInput(amount) ?? NaN) > 0
      ? {
        movementType: "expense",
        occurredAt: occurredAtISO,
        description: descriptionCleanup?.cleanedDescription ?? description,
        amount: (parsePositiveAmountInput(amount) ?? NaN) || suggestion?.amount || 0,
        currencyCode: selectedBudgetAccount?.currencyCode ?? suggestion?.currencyCode ?? "PEN",
        categoryId,
        categoryName: selectedRecurringCategory?.name ?? null,
        counterpartyName: selectedRecurringCounterparty?.name ?? null,
        accountId,
        accountName: selectedBudgetAccount?.name ?? null,
      }
      : null,
    budgets: snapshot?.budgets ?? [],
    exchangeRates: snapshot?.exchangeRates ?? [],
    workspaceBaseCurrencyCode: activeWorkspace?.baseCurrencyCode ?? "PEN",
    proAccessEnabled: entitlementQuery.data?.proAccessEnabled,
  });

  const initializedId = useRef<number | null>(null);
  const categoryEdited = useRef(false);
  const accountEdited = useRef(false);
  const destinationEdited = useRef(false);
  const [, refreshManualFields] = useState(0);
  const lastLearned = useRef({ accountId: null as number | null, destinationAccountId: null as number | null, categoryId: null as number | null });
  useEffect(() => {
    // Los ajustes solo aportan una cuenta sugerida. Una petición lenta no debe
    // ocultar la detección ni impedir que el usuario elija la cuenta al revisarla.
    if (!suggestion || (!visible && !previewEnabled) || !snapshot) return;
    if (initializedId.current === suggestion.id) return;
    initializedId.current = suggestion.id;
    categoryEdited.current = initialDraft ? (initialDraft.manualFields?.includes("category") ?? true) : false;
    accountEdited.current = initialDraft ? (initialDraft.manualFields?.includes("account") ?? true) : false;
    destinationEdited.current = initialDraft ? (initialDraft.manualFields?.includes("destination") ?? true) : false;
    lastLearned.current = { accountId: null, destinationAccountId: null, categoryId: null };
    const draft = initialDraft ?? buildDetectionDraft(suggestion, activeAccounts, snapshot.categories, settings);
    setMovementType(draft.movementType);
    setAmount(draft.amount); setDescription(draft.description); setNotes("");
    setDate(draft.date); setTime(draft.time); setCategoryId(draft.categoryId);
    setAccountId(draft.accountId); setDestinationAccountId(draft.destinationAccountId);
    setDestinationAmount(draft.destinationAmount); setTransferFxRate(draft.fxRate);
    setCounterpartyId(null); setSplitLines(null); setSplitSheetOpen(false); setCategoryFeedbackIntent(null);
    setLinkedSubscriptionId(null); setLinkedRecurringIncomeId(null);
    const candidate = reconciliationCandidateForDraft(suggestion, draft, activeAccounts);
    reconciliationCandidateId.current = candidate?.id ?? null;
    setSaveError(null); setDuplicateCandidate(candidate);
  }, [activeAccounts, categories, initialDraft, previewEnabled, settings, snapshot, suggestion, visible]);

  useEffect(() => {
    if (!suggestion || !snapshot || initializedId.current !== suggestion.id || submittingRef.current) return;
    const baseline = buildDetectionDraft({ ...suggestion, movementType }, activeAccounts, snapshot.categories, settings);
    const manualFields: NonNullable<DetectionDraft["manualFields"]> = [];
    if (accountEdited.current) manualFields.push("account");
    if (categoryEdited.current) manualFields.push("category");
    if (destinationEdited.current) manualFields.push("destination");
    const current: DetectionDraft = { movementType, amount, accountId, destinationAccountId, destinationAmount, fxRate: transferFxRate, description, categoryId, date, time, manualFields };
    const { draft: next, applied } = applyPersonalProposal(current, baseline, personalProposal, lastLearned.current, suggestion.metadata);
    lastLearned.current = applied;
    if (next.accountId !== accountId) setAccountId(next.accountId);
    if (next.categoryId !== categoryId) setCategoryId(next.categoryId);
    if (movementType === "transfer" && (next.destinationAccountId !== destinationAccountId || next.accountId !== accountId)) {
      const transfer = transferDestinationDraft(next, next.destinationAccountId, activeAccounts, snapshot.exchangeRates ?? [], activeWorkspace?.baseCurrencyCode ?? "PEN");
      setDestinationAccountId(transfer.destinationAccountId); setDestinationAmount(transfer.destinationAmount); setTransferFxRate(transfer.fxRate);
    }
  }, [suggestion, snapshot, personalProposal, movementType, activeAccounts, settings, accountId, destinationAccountId, amount, activeWorkspace?.baseCurrencyCode]);

  useEffect(() => {
    if (initializedId.current !== suggestion?.id || categoryEdited.current || categoryId != null) return;
    if (categorySuggestion?.categoryId != null && categories.some((c) => c.id === categorySuggestion.categoryId)) {
      setCategoryId(categorySuggestion.categoryId);
      setCategoryFeedbackIntent({ kind: "accepted_category_suggestion", categoryId: categorySuggestion.categoryId,
        categoryName: categorySuggestion.categoryName, confidence: categorySuggestion.confidence,
        reasons: categorySuggestion.reasons, source: categorySuggestion.source });
    }
  }, [categoryId, categorySuggestion, categories, suggestion?.id]);

  /**
   * Cambio de tipo con limpieza de campos contextuales: sin esto, valores del tipo anterior
   * (contraparte de un gasto, monto destino/FX de una transferencia) quedaban "fantasma" y
   * se registraban sin estar visibles en pantalla (auditoría, hallazgo R2).
   */
  function switchMovementType(next: "expense" | "income" | "transfer") {
    if (next === movementType) return;
    setDuplicateCandidate(null);
    setMovementType(next);
    categoryEdited.current = false;
    destinationEdited.current = false;
    lastLearned.current = { accountId: null, destinationAccountId: null, categoryId: null };
    setCategoryId(null);
    setCategoryFeedbackIntent(null);
    if (next === "transfer") {
      // Las transferencias no usan contraparte.
      setCounterpartyId(null);
      // Default para multi-moneda: el monto detectado (mismo criterio que el efecto inicial).
      setDestinationAmount("");
    } else {
      setDestinationAmount("");
      setTransferFxRate("");
    }
  }

  function selectCategoryManually(id: number | null) {
    categoryEdited.current = true;
    refreshManualFields((version) => version + 1);
    setCategoryId(id);
    if (id == null) {
      setCategoryFeedbackIntent(null);
      return;
    }
    const category = categories.find((item) => item.id === id);
    setCategoryFeedbackIntent({
      kind: "manual_category_change",
      categoryId: id,
      categoryName: category?.name ?? null,
      confidence: null,
      reasons: ["elegida manualmente en el formulario"],
    });
  }

  async function applyCategorySuggestion(suggestionState: CategorySuggestionState) {
    let nextCategoryId = suggestionState.categoryId;
    let nextCategoryName = suggestionState.categoryName;

    if (nextCategoryId == null && suggestionState.newCategoryName) {
      const normalizedNewName = normalizeAnalyticsText(suggestionState.newCategoryName);
      const existing = categories.find((category) => normalizeAnalyticsText(category.name) === normalizedNewName);
      if (existing) {
        nextCategoryId = existing.id;
        nextCategoryName = existing.name;
      } else {
        const created = await createCategory.mutateAsync({
          name: suggestionState.newCategoryName,
          kind: movementType === "income" ? "income" : "expense",
        });
        nextCategoryId = created.id;
        nextCategoryName = suggestionState.newCategoryName;
        showToast("Categoría creada", "success");
      }
    }

    if (nextCategoryId == null) return;
    categoryEdited.current = true;
    refreshManualFields((version) => version + 1);
    setCategoryId(nextCategoryId);
    setCategoryFeedbackIntent({
      kind: "accepted_category_suggestion",
      categoryId: nextCategoryId,
      categoryName: nextCategoryName,
      confidence: suggestionState.confidence,
      reasons: suggestionState.reasons,
      source: suggestionState.source,
    });
  }

  async function applyCounterpartySuggestion(suggestionState: CounterpartySuggestionResult) {
    if (createCounterparty.isPending) return;
    if (suggestionState.type === "existing_counterparty" && suggestionState.counterpartyId) {
      setCounterpartyId(suggestionState.counterpartyId);
      return;
    }
    if (suggestionState.type !== "new_counterparty" || !suggestionState.newCounterpartyName) return;
    const normalizedNewName = normalizeAnalyticsText(suggestionState.newCounterpartyName);
    const existing = counterparties.find((counterparty) => normalizeAnalyticsText(counterparty.name) === normalizedNewName);
    if (existing) {
      setCounterpartyId(existing.id);
      return;
    }
    try {
      const created = await createCounterparty.mutateAsync({
        name: suggestionState.newCounterpartyName,
        type: suggestionState.counterpartyType,
      });
      setCounterpartyId(created.id);
      showToast("Contacto creado", "success", suggestionState.newCounterpartyName);
    } catch (error) {
      showErrorToast("No se pudo crear el contacto", error);
    }
  }

  async function applyRecurringSuggestion(suggestionState: MovementRecurringSuggestionResult) {
    if (!suggestionState.name || !suggestionState.frequency) return;
    const parsedAmount = (parsePositiveAmountInput(amount) ?? NaN) || suggestion?.amount || 0;
    if (!parsedAmount) return;
    const fields = recurringFrequencyToSubscriptionFields(suggestionState.frequency);
    const ymd = date || todayPeru();
    const day = new Date(`${ymd}T12:00:00`).getDay();
    const dayOfMonth = Math.max(1, Math.min(31, Number(ymd.slice(8, 10)) || 1));
    try {
      if (suggestionState.type === "subscription") {
        const created = await createSubscription.mutateAsync({
          name: suggestionState.name,
          vendorPartyId: counterpartyId,
          accountId,
          categoryId,
          amount: parsedAmount,
          currencyCode: suggestion?.currencyCode ?? "PEN",
          frequency: fields.frequency,
          intervalCount: fields.intervalCount,
          dayOfMonth: fields.frequency === "monthly" || fields.frequency === "quarterly" || fields.frequency === "yearly" ? dayOfMonth : null,
          dayOfWeek: fields.frequency === "weekly" ? day : null,
          startDate: ymd,
          nextDueDate: ymd,
          endDate: null,
          remindDaysBefore: 3,
          autoCreateMovement: false,
          description: description.trim() || null,
          notes: `Creada desde sugerencia recurrente (${Math.round(suggestionState.confidence * 100)}%).`,
        });
        setLinkedSubscriptionId(created.id);
        showToast("Suscripción creada", "success");
      } else if (suggestionState.type === "recurring_income") {
        const created = await createRecurringIncome.mutateAsync({
          name: suggestionState.name,
          payerPartyId: counterpartyId,
          accountId,
          categoryId,
          amount: parsedAmount,
          currencyCode: suggestion?.currencyCode ?? "PEN",
          frequency: fields.frequency,
          intervalCount: fields.intervalCount,
          dayOfMonth: fields.frequency === "monthly" || fields.frequency === "quarterly" || fields.frequency === "yearly" ? dayOfMonth : null,
          dayOfWeek: fields.frequency === "weekly" ? day : null,
          startDate: ymd,
          nextExpectedDate: ymd,
          endDate: null,
          remindDaysBefore: 3,
          description: description.trim() || null,
          notes: `Creado desde sugerencia recurrente (${Math.round(suggestionState.confidence * 100)}%).`,
        });
        setLinkedRecurringIncomeId(created.id);
        showToast("Ingreso fijo creado", "success");
      }
    } catch (error) {
      showErrorToast("No se pudo crear el pago recurrente", error);
    }
  }

  const selectedCounterparty = useMemo(() => {
    return counterpartyId == null ? null : counterparties.find((counterparty) => counterparty.id === counterpartyId) ?? null;
  }, [counterparties, counterpartyId]);

  async function discard() {
    if (!suggestion || submittingRef.current) return;
    lastActionRef.current = "discard";
    submittingRef.current = true; setSaveError(null);
    setIsDiscarding(true);
    try {
      await markSuggestion.mutateAsync({ suggestionId: suggestion.id, status: "discarded", expectedStatus: suggestion.status });
      if (profile?.id && activeWorkspaceId) {
        void recordSuggestionAction({
          userId: profile.id,
          workspaceId: activeWorkspaceId,
          suggestionId: suggestion.id,
          dedupeKey: suggestion.dedupeKey,
          action: "discard",
          surface: "quick_entry",
          confidenceAtDecision: suggestion.confidence,
          metadata: { financialAppKey: suggestion.financialAppKey },
        });
      }
      if (notificationId) markNotificationRead.mutate(notificationId);
      showRichToast({ type: "delete", title: "Detección omitida", subtitle: suggestion.description,
        onUndo: () => { void markSuggestion.mutateAsync({ suggestionId: suggestion.id,
          status: suggestion.status === "needs_review" ? "needs_review" : "pending", expectedStatus: "discarded" })
          .catch((error) => showErrorToast("No se pudo deshacer", error)); } });
      if (onResolved) onResolved(suggestion.id, "discarded"); else onClose();
    } catch (error) {
      setSaveError(humanizeError(error));
      showErrorToast("No se pudo omitir la detección", error);
    } finally {
      setIsDiscarding(false); submittingRef.current = false;
    }
  }

  async function submit(force = false) {
    if (!suggestion || !activeWorkspaceId) return;
    // Anti-doble-tap: si ya hay un submit en vuelo, ignorar. Bloquea al instante (síncrono),
    // evitando los registros duplicados/triplicados por taps rápidos. El try/finally garantiza
    // que TODA salida (validación, diálogo de duplicado, error de red) libera el guard — antes
    // había 6 resets dispersos y una ruta nueva podía dejarlo trabado.
    if (submittingRef.current) return;
    lastActionRef.current = "save";
    submittingRef.current = true;
    setIsSaving(true); setSaveError(null); setDuplicateCandidate(null);
    try {
      if (suggestion.packageName === EMAIL_SOURCE_PACKAGE) {
        try {
          await assertEmailDetectionProAccess();
        } catch (error) {
          // Con poca señal la verificación puede fallar aunque el plan esté bien. Si ya se había confirmado el acceso se sigue:
          // el servidor vuelve a exigir PRO al registrar y rechazaría el guardado si de verdad no lo hubiera.
          if (!(error instanceof ProAccessUnverifiedError && emailProAccess.data === true)) throw error;
        }
      }
      await submitInner(force);
    } catch (error) {
      setSaveError(humanizeError(error));
      showErrorToast("No se pudo guardar el movimiento", error);
    } finally {
      submittingRef.current = false; setIsSaving(false);
    }
  }

  async function submitInner(force: boolean) {
    if (!suggestion || !activeWorkspaceId) return;
    const fields = detectionFormFields({ movementType, amount, description, accountId, destinationAccountId,
      destinationAmount, fxRate: transferFxRate, categoryId, date, time }, activeAccounts, todayPeru());
    const issues = Object.fromEntries(Object.entries(fields).filter(([, rule]) => rule.missing || rule.invalid)
      .map(([id, rule]) => [id, rule.missing ?? rule.invalid!]));
    setFieldErrors(issues);
    if (Object.keys(issues).length) { haptics.error(); return; }
    const parsedAmount = (parsePositiveAmountInput(amount) ?? NaN);

    // Validación compartida con MovementForm (cierra R3: criterios divergentes).
    // Mapeo al esquema del validador: QuickEntry usa UNA cuenta/monto para gasto e
    // ingreso, y el validador espera el ingreso en destino.
    const manualFx = parsePositiveAmountInput(transferFxRate, { kind: "rate" });
    const validation = validateMovementForm(
      {
        movementType,
        status: "posted",
        sourceAccountId: movementType === "income" ? null : accountId,
        destinationAccountId: movementType === "income"
          ? accountId
          : movementType === "transfer" ? destinationAccountId : null,
        sourceAmount: movementType === "income" ? "" : amount,
        destinationAmount: movementType === "income"
          ? amount
          : movementType === "transfer" && transferCurrenciesDiffer ? destinationAmount : "",
        occurredAt: date,
      },
      {
        sourceCurrencyCode: transferSourceAccount?.currencyCode ?? null,
        destinationCurrencyCode: movementType === "transfer" ? transferDestAccount?.currencyCode ?? null : null,
        hasTransferFxAvailable: Boolean(manualFx),
        // Overdraft es warning y QuickEntry no tiene UI de warnings: se omite.
        sourceAccountBalance: null,
        todayYmd: todayPeru(),
      },
    );
    if (!validation.valid) {
      haptics.error();
      setFieldErrors(validation.errors);
      return;
    }

    const occurredAt = dateTimeStrToISO(date, time);

    if (!force) {
      setCheckingDuplicate(true);
      try {
        const duplicate = await findPossibleDuplicateMovement({
          workspaceId: activeWorkspaceId,
          movementType,
          accountId,
          amount: parsedAmount,
          occurredAt,
          description,
          destinationAccountId: movementType === "transfer" ? destinationAccountId : null,
          destinationAmount: movementType === "transfer" ? (transferCurrenciesDiffer ? parsePositiveAmountInput(destinationAmount) : parsedAmount) : null,
        });
        if (duplicate) {
          // Conserva la verificación existente de IA; si no confirma que es distinto,
          // la decisión queda dentro de la tarjeta y la revisión.
          let confirmedDistinct = false;
          if (entitlementQuery.data?.proAccessEnabled) {
            const counts = await countSameDayDetectionSignals({
              userId: profile?.id ?? suggestion.userId,
              currencyCode: suggestion.currencyCode,
              workspaceId: activeWorkspaceId,
              amount: parsedAmount,
              movementType,
              occurredAt,
              accountId,
            }).catch(() => null);
            const aiResult = counts && counts.sameDayMatchingMovements > 0 ? await confirmDuplicateWithAi({
              workspaceId: activeWorkspaceId,
              suggestion: {
                description: description.trim() || suggestion.description,
                amountLabel: String(parsedAmount),
                occurredAt,
                sourceApp: suggestion.financialAppKey,
                rawText: suggestion.description ?? null,
              },
              candidateMovement: {
                id: duplicate.id,
                description: duplicate.description ?? null,
                occurredAt: duplicate.occurredAt,
                amount: parsedAmount,
              },
              counts,
            }) : { verdict: "unknown" as const, reason: null };
            if (aiResult.verdict === "distinct") {
              confirmedDistinct = true;
            }
          }
          if (!confirmedDistinct) {
            reconciliationCandidateId.current = null;
            setDuplicateCandidate(duplicate);
            return;
          }
        }
      } finally {
        setCheckingDuplicate(false);
      }
    }

    if (movementType === "transfer") {
      if (!destinationAccountId) return; // ya validado; guard para TypeScript
      let destAmt = parsedAmount;
      let fx: number | null = null;
      if (transferCurrenciesDiffer) {
        destAmt = parsePositiveAmountInput(destinationAmount) ?? NaN;
        // El validador compartido no cubre la tasa manual (en MovementForm viene del
        // resolver); QuickEntry la exige explícita cuando las monedas difieren.
        fx = manualFx ?? NaN;
        if (!Number.isFinite(fx) || fx <= 0) {
          setFieldErrors({ fxRate: "Ingresa un tipo de cambio válido" });
          return;
        }
      }
      try {
        const created = await createMovement.mutateAsync(buildMovementCreateInput({
          movementType: "transfer",
          status: "posted",
          occurredAt,
          description: description.trim() || suggestion.description,
          notes: notes.trim() || null,
          sourceAccountId: accountId,
          sourceAmount: parsedAmount,
          destinationAccountId,
          destinationAmount: destAmt,
          transferCurrenciesDiffer,
          fxRate: fx,
          categoryId: null,
          counterpartyId: null,
          subscriptionId: linkedSubscriptionId,
          metadata: {
            source: "notification_detection",
            suggestionId: suggestion.id,
            financialAppKey: suggestion.financialAppKey,
            confidence: suggestion.confidence,
            detectionLearning: learningDecision(),
          },
          // Misma clave que usa el headless para esta sugerencia: si ambas vías corren
          // (app abierta + overlay), la segunda recibe el movimiento ya creado.
          dedupeKey: `suggestion:${suggestion.id}`,
        }));
        // En segundo plano: espera a que el movimiento llegue al servidor y no debe frenar el guardado.
        void markRegistered(created.id);
        if (profile?.id && activeWorkspaceId) {
          void recordSuggestionAction({
            userId: profile.id,
            workspaceId: activeWorkspaceId,
            suggestionId: suggestion.id,
            dedupeKey: suggestion.dedupeKey,
            action: "register",
            surface: "quick_entry",
            confidenceAtDecision: suggestion.confidence,
            metadata: { movementType: "transfer", financialAppKey: suggestion.financialAppKey },
          });
        }
        if (notificationId) markNotificationRead.mutate(notificationId);
        haptics.success();
        showRichToast({
          type: "transfer",
          title: "Transferencia guardada",
          subtitle: "Toca deshacer si fue un error",
          onUndo: () => undoRegistration(created.id),
        });
        if (onResolved) onResolved(suggestion.id, "registered"); else onClose();
      } catch (error) {
        haptics.error();
        setSaveError(humanizeError(error));
        showErrorToast("No se pudo guardar la transferencia", error);
      }
      return;
    }



    const detectionMetadata = {
      source: "notification_detection",
      suggestionId: suggestion.id,
      financialAppKey: suggestion.financialAppKey,
      confidence: suggestion.confidence,
      detectionLearning: learningDecision(),
      counterpartyAi: counterpartySuggestion?.source === "deepseek" ? counterpartySuggestion : null,
      recurring_income_id: linkedRecurringIncomeId,
      recurringAi: recurringSuggestion?.source === "deepseek" ? recurringSuggestion : null,
      riskAi: movementRisk?.source === "deepseek" ? movementRisk : null,
      budgetAi: budgetImpact?.source === "deepseek" ? budgetImpact : null,
    };

    /* También para ingresos desde la fase 38: el builder pone el monto en el lado que
       corresponde según el tipo, y aquí ya se le pasan los dos. */
    if (splitLines) {
      const splitValidation = validateSplit(splitLines, parsedAmount);
      if (!splitValidation.valid) {
        showToast(splitValidation.error ?? "Revisa la división de montos", "error");
        return;
      }
      // Una sola transacción en el servidor: guarda todas las partes y resuelve la detección, o no guarda nada.
      // Sin plan B parte por parte: si falla se reintenta la misma operación completa.
      let registered: { movementId: number } | null = null;
      try {
        registered = await registerDetectedSplit.mutateAsync({
          userId: suggestion.userId,
          workspaceId: suggestion.workspaceId,
          suggestionId: suggestion.id,
          expectedUpdatedAt: suggestion.updatedAt,
          header: {
            movementType: movementType as "expense" | "income",
            accountId: accountId!,
            currencyCode: (suggestion.currencyCode ?? "PEN").toUpperCase(),
            amount: parsedAmount,
            description: description.trim() || suggestion.description,
            notes: notes.trim() || null,
            occurredAt,
            counterpartyId,
            metadata: detectionMetadata as unknown as Record<string, never>,
            ...(movementType === "expense" && linkedSubscriptionId != null ? { subscriptionId: linkedSubscriptionId } : {}),
            ...(movementType === "income" && linkedRecurringIncomeId != null ? { recurringIncomeId: linkedRecurringIncomeId } : {}),
          },
          parts: splitLines.map((line) => ({
            amount: parsePositiveAmountInput(line.amount)!,
            categoryId: line.categoryId!,
            ...(movementType === "expense" && line.spendTypeId != null ? { spendTypeId: line.spendTypeId } : {}),
          })),
        });
      } catch (error) {
        haptics.error();
        setSaveError(humanizeError(error));
        showErrorToast("No se pudo guardar el movimiento", error);
        return;
      }
      // El dinero ya quedó guardado y la detección resuelta: un fallo posterior (avisos, métricas) no es un fallo de guardado.
      try {
        // Feedback de categoría omitido: la división usa varias categorías, no una sola.
        await finishRegistration(registered.movementId, null, { alreadyResolved: true });
      } catch {
        void suggestionQuery.refetch();
      }
      return;
    }

    try {
      const created = await createMovement.mutateAsync(buildMovementCreateInput({
        movementType,
        status: "posted",
        occurredAt,
        description: description.trim() || suggestion.description,
        notes: notes.trim() || null,
        sourceAccountId: accountId,
        sourceAmount: parsedAmount,
        destinationAccountId: accountId,
        destinationAmount: parsedAmount,
        transferCurrenciesDiffer: false,
        fxRate: null,
        categoryId,
        counterpartyId,
        subscriptionId: linkedSubscriptionId,
        metadata: detectionMetadata,
        // Misma clave que usa el headless para esta sugerencia: si ambas vías corren
        // (app abierta + overlay), la segunda recibe el movimiento ya creado.
        dedupeKey: `suggestion:${suggestion.id}`,
      }));
      await finishRegistration(created.id, categoryFeedbackIntent);
    } catch (error) {
      haptics.error();
      setSaveError(humanizeError(error));
      showErrorToast("No se pudo guardar el movimiento", error);
    }
  }

  async function retry() {
    if (lastActionRef.current === "discard") await discard();
    else await submit(false);
  }

  /**
   * Post-procesamiento común a la vía única y a la vía split (marcar sugerencia, telemetría,
   * feedback de categoría, toast y cierre) para que ambas se mantengan sincronizadas.
   */
  async function finishRegistration(movementId: number, feedbackIntent: CategoryFeedbackIntent | null, options?: { alreadyResolved?: boolean }) {
    if (!suggestion) return;
    // La división la resuelve el servidor dentro de su transacción: no se vuelve a marcar.
    // En segundo plano: espera a que el movimiento llegue al servidor (con el modo sin conexión puede tardar unos segundos) y
    // no debe frenar el guardado ni el aviso de «Movimiento guardado».
    if (!options?.alreadyResolved) {
      // La tarjeta del inicio se quita al instante; si no, seguía ahí hasta que el servidor recibía el movimiento.
      hideLocallyRegisteredSuggestion(suggestion, movementId);
      void markRegistered(movementId);
    }
    if (profile?.id && activeWorkspaceId) {
      if (feedbackIntent) {
        const isAccept = feedbackIntent.kind === "accepted_category_suggestion";
        void recordSuggestionAction({
          userId: profile.id,
          workspaceId: activeWorkspaceId,
          suggestionId: suggestion.id,
          dedupeKey: suggestion.dedupeKey,
          action: isAccept ? "accept_category" : "override_category",
          surface: "quick_entry",
          confidenceAtDecision: feedbackIntent.confidence ?? null,
          modelAtDecision: feedbackIntent.source === "deepseek" ? "deepseek" : null,
          suggestedValue: feedbackIntent.categoryName ?? null,
          finalValue: categoryId != null ? String(categoryId) : null,
          metadata: { kind: feedbackIntent.kind },
        });
      }
      const initialDescription = suggestion.description ?? "";
      const finalDescription = description.trim() || initialDescription;
      if (finalDescription !== initialDescription) {
        void recordSuggestionAction({
          userId: profile.id,
          workspaceId: activeWorkspaceId,
          suggestionId: suggestion.id,
          dedupeKey: suggestion.dedupeKey,
          action: "edit_description",
          surface: "quick_entry",
          suggestedValue: initialDescription,
          finalValue: finalDescription,
        });
      }
      void recordSuggestionAction({
        userId: profile.id,
        workspaceId: activeWorkspaceId,
        suggestionId: suggestion.id,
        dedupeKey: suggestion.dedupeKey,
        action: "register",
        surface: "quick_entry",
        confidenceAtDecision: suggestion.confidence,
        metadata: { movementType, financialAppKey: suggestion.financialAppKey },
      });
    }
    if (categoryId != null && feedbackIntent) {
      // La mutación espera sola a que el movimiento llegue al servidor (aunque sea al volver el internet).
      void persistLearningFeedback.mutateAsync({
        movementId,
        feedbackKind: feedbackIntent.kind,
        normalizedDescription: normalizeAnalyticsText(description.trim() || suggestion.description) || null,
        previousCategoryId: null,
        acceptedCategoryId: categoryId,
        confidence: feedbackIntent.confidence ?? (feedbackIntent.kind === "accepted_category_suggestion" ? 0.7 : null),
        source: feedbackIntent.source === "deepseek" ? "notification-form-ai" : "notification-form",
        metadata: {
          categoryName: feedbackIntent.categoryName ?? null,
          reasons: feedbackIntent.reasons ?? [],
          aiProvider: feedbackIntent.source === "deepseek" ? "deepseek" : null,
          suggestionId: suggestion.id,
          financialAppKey: suggestion.financialAppKey,
        },
      }).catch(() => undefined);
    }
    if (notificationId) markNotificationRead.mutate(notificationId);
    haptics.success();
    showRichToast({
      type: "success",
      title: "Movimiento guardado",
      subtitle: "Toca deshacer si fue un error",
      onUndo: () => undoRegistration(movementId),
    });
    if (onResolved) onResolved(suggestion.id, "registered"); else onClose();
  }

  /**
   * Elimina el registro completo y reabre su detección en una sola transacción.
   * Captura el espacio original: una acción del toast no debe usar el espacio actual.
   */
  function undoRegistration(movementId: number) {
    if (!suggestion) return;
    const { workspaceId, id: suggestionId, userId } = suggestion;
    void (async () => {
      // Si el movimiento todavía no salió del teléfono, deshacer es borrarlo AQUÍ (el servidor no lo conoce y la detección sigue
      // pendiente). Con el movimiento ya en el servidor se usa la operación atómica de siempre.
      if (await offlineRuntime.hasPendingInsert(workspaceId, "movements", movementId).catch(() => false)) {
        if (await offlineRuntime.deleteMovement(workspaceId, movementId).catch(() => false)) {
          showSuggestionAgain({ id: suggestionId, userId, workspaceId });
          void suggestionQuery.refetch();
          showToast("Registro deshecho", "success");
          return;
        }
      }
      showSuggestionAgain({ id: suggestionId, userId, workspaceId });
      await undoDetectedRegistration.mutateAsync({ movementId, suggestionId, workspaceId, userId });
    })().catch((error) => showErrorToast("No se pudo deshacer el registro", error));
  }

  /**
   * ¿Ya existe este movimiento en el servidor? Con el modo sin conexión el movimiento se guarda primero en el teléfono y
   * viaja un instante después: marcar la detección o guardar el aprendizaje ANTES chocaba con la llave foránea
   * (movement_id → movements) y fallaba en cada registro. Si no ha llegado (sin internet), se omite: el servidor resuelve la
   * detección al recibir el movimiento (su clave `suggestion:<id>`).
   */
  async function movementOnServer(movementId: number): Promise<boolean> {
    if (!suggestion) return true;
    return waitUntilSent(offlineRuntime, suggestion.workspaceId, "movements", movementId).catch(() => true);
  }

  async function markRegistered(movementId: number) {
    if (!suggestion) return;
    if (!(await movementOnServer(movementId))) return;
    try {
      await markSuggestion.mutateAsync({ suggestionId: suggestion.id, status: "registered", movementId });
    } catch (error) {
      // El trigger ya resolvió el registro simple. Fallar al marcar el aviso no cambia
      // un movimiento guardado en un error de guardado.
      void suggestionQuery.refetch();
    }
  }

  const baseAppLabel = suggestion
    ? (getFinancialAppByKey(suggestion.financialAppKey)?.label
        ?? resolveFinancialAppByPackage(suggestion.packageName)?.label
        ?? suggestion.appLabel)
    : "Movimiento detectado";

  // Las sugerencias por correo no vienen de una notificación de app. Decirlo evita que el
  // usuario crea que la detección de Android dejó de funcionar en su iPhone (en iOS no existe,
  // y el correo es justamente el sustituto).
  const displayAppLabel =
    suggestion?.packageName === EMAIL_SOURCE_PACKAGE
      ? `${baseAppLabel} · por correo`
      : baseAppLabel;

  function learningDecision() {
    const hints = receiptAccountHints(learningObject(suggestion?.metadata).accountHints);
    return { originalDescription: suggestion?.description ?? description, movementType: suggestion?.movementType ?? movementType,
      financialAppKey: suggestion?.financialAppKey ?? "", accountHints: { source: hints.source ?? null, destination: hints.destination ?? null },
      manualChoices: { account: accountEdited.current, destination: destinationEdited.current, category: categoryEdited.current } };
  }
  const manualFields: NonNullable<DetectionDraft["manualFields"]> = [];
  if (accountEdited.current) manualFields.push("account");
  if (destinationEdited.current) manualFields.push("destination");
  if (categoryEdited.current) manualFields.push("category");
  const draft: DetectionDraft = { movementType, amount, description, accountId, destinationAccountId,
    destinationAmount, fxRate: transferFxRate, categoryId, date, time, manualFields };
  function chooseDestination(id: number | null) {
    destinationEdited.current = true;
    refreshManualFields((version) => version + 1);
    setDuplicateCandidate(null);
    const next = transferDestinationDraft(draft, id, activeAccounts, snapshot?.exchangeRates ?? [], activeWorkspace?.baseCurrencyCode ?? "PEN");
    setDestinationAccountId(id); setDestinationAmount(next.destinationAmount); setTransferFxRate(next.fxRate);
  }
  function chooseAccount(id: number | null) {
    setDuplicateCandidate(null);
    accountEdited.current = true;
    refreshManualFields((version) => version + 1);
    setAccountId(id);
    if (movementType === "transfer") {
      const next = transferDestinationDraft({ ...draft, accountId: id }, destinationAccountId === id ? null : destinationAccountId, activeAccounts, snapshot?.exchangeRates ?? [], activeWorkspace?.baseCurrencyCode ?? "PEN");
      setDestinationAccountId(next.destinationAccountId); setDestinationAmount(next.destinationAmount); setTransferFxRate(next.fxRate);
    }
  }
  function changeAmount(value: string) {
    setDuplicateCandidate(null);
    setAmount(value);
    const parsed = parsePositiveAmountInput(value);
    const rate = parsePositiveAmountInput(transferFxRate, { kind: "rate" });
    if (transferCurrenciesDiffer && parsed != null && rate != null) setDestinationAmount((parsed * rate).toFixed(2));
  }
  function changeDestinationAmount(value: string) {
    setDestinationAmount(value);
    const sourceAmount = parsePositiveAmountInput(amount);
    const parsed = parsePositiveAmountInput(value);
    if (sourceAmount != null && parsed != null) setTransferFxRate(String(Number((parsed / sourceAmount).toFixed(6))));
  }
  function changeFxRate(value: string) {
    setTransferFxRate(value);
    const sourceAmount = parsePositiveAmountInput(amount);
    const parsed = parsePositiveAmountInput(value, { kind: "rate" });
    if (sourceAmount != null && parsed != null) setDestinationAmount((sourceAmount * parsed).toFixed(2));
  }
  const missing = detectionMissingFields(draft, activeAccounts, false);
  const readyToSave = detectionMissingFields(draft, activeAccounts).length === 0 &&
    initializedId.current === suggestion?.id && suggestion?.movementType !== "unknown" &&
    suggestion?.status !== "needs_review";
  const busy = isSaving || isDiscarding || createMovement.isPending || markSuggestion.isPending;
  useEffect(() => {
    if (!suggestion || initializedId.current !== suggestion.id || busy) return;
    const candidate = reconciliationCandidateForDraft(suggestion, draft, activeAccounts);
    if (candidate) {
      reconciliationCandidateId.current = candidate.id;
      setDuplicateCandidate((previous) => previous ?? candidate);
    } else if (reconciliationCandidateId.current != null) {
      const previousId = reconciliationCandidateId.current;
      reconciliationCandidateId.current = null;
      setDuplicateCandidate((previous) => previous?.id === previousId ? null : previous);
    }
  }, [suggestion, activeAccounts, amount, movementType, description, date, time, accountId, destinationAccountId, busy]);
  async function useExistingDuplicate() {
    if (!suggestion || !duplicateCandidate || submittingRef.current) return;
    submittingRef.current = true; setIsSaving(true); setSaveError(null);
    try {
      await markSuggestion.mutateAsync({ suggestionId: suggestion.id, status: "duplicate",
        movementId: duplicateCandidate.id, expectedStatus: suggestion.status });
      showToast("Era el mismo movimiento", "success", duplicateCandidate.description);
      if (onResolved) onResolved(suggestion.id, "duplicate"); else onClose();
    } catch (error) { setSaveError(humanizeError(error)); }
    finally { submittingRef.current = false; setIsSaving(false); }
  }
  function openDuplicate() {
    if (!duplicateCandidate) return;
    onClose(); router.push(`/movement/${duplicateCandidate.id}?from=${origin}` as never);
  }


  const learningHint = (personalProposal.accountId != null && accountId === personalProposal.accountId && !accountEdited.current) ||
    (personalProposal.categoryId != null && categoryId === personalProposal.categoryId && !categoryEdited.current) ||
    (personalProposal.destinationAccountId != null && destinationAccountId === personalProposal.destinationAccountId && !destinationEdited.current)
    ? "Según tus movimientos anteriores" : null;
  return { suggestion, suggestionQuery, isPendingEmail, emailProAccess, learningHint,
    draft, missing, cardMissing: detectionMissingFields(draft, activeAccounts), readyToSave, busy, isSaving, saveError, fieldErrors, duplicateCandidate, useExistingDuplicate, openDuplicate,
    movementType, switchMovementType, amount, setAmount: changeAmount, accountId, setAccountId: chooseAccount,
    destinationAccountId, setDestinationAccountId: chooseDestination, destinationAmount, setDestinationAmount: changeDestinationAmount,
    transferFxRate, setTransferFxRate: changeFxRate, categoryId, selectCategoryManually, description,
    setDescription: (value: string) => { setDuplicateCandidate(null); setDescription(value); },
    date, setDate: (value: string) => { setDuplicateCandidate(null); setDate(value); },
    time, setTime: (value: string) => { setDuplicateCandidate(null); setTime(value); }, notes, setNotes, activeAccounts, destinationAccountsSorted, categories,
    transferCurrenciesDiffer, transferSourceAccount, transferDestAccount, displayAppLabel,
    isDiscarding, checkingDuplicate, createMovement, markSuggestion, submit, discard, retry,
    splitLines, setSplitLines, splitSheetOpen, setSplitSheetOpen, selectedBudgetAccount, spendTypes,
    categorySuggestion, applyCategorySuggestion, descriptionCleanup, cleanupAppliedText, setCleanupAppliedText,
    selectedCounterparty, counterpartySuggestion, applyCounterpartySuggestion, recurringSuggestion,
    linkedSubscriptionId, linkedRecurringIncomeId, applyRecurringSuggestion, movementRisk, budgetImpact,
    initialized: initializedId.current === suggestion?.id && Boolean(suggestion),
    aiUsage: aiUsageQuery.data,
    dataError: !snapshot && snapshotQuery.isError,
    retryData: () => { void snapshotQuery.refetch(); },
  };
}

export type DetectedMovementReview = ReturnType<typeof useDetectedMovementReview>;
