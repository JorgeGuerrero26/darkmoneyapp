import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowDownCircle, ArrowUpCircle, ArrowLeftRight, AlertCircle } from "lucide-react-native";
import type { TextInput } from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

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
  useUpdateMovementMutation,
  useDashboardAnalyticsQuery,
  usePersistLearningFeedbackMutation,
  useSyncExchangeRatePairMutation,
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
import { BottomSheet } from "../ui/BottomSheet";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";
import { CurrencyInput } from "../ui/CurrencyInput";
import { BalanceImpactPreview } from "../domain/BalanceImpactPreview";
import { AttachmentPicker, type Attachment } from "../domain/AttachmentPicker";
import { DatePickerInput } from "../ui/DatePickerInput";
import { SmartSuggestion } from "../ui/SmartSuggestion";
import { buildCategorySuggestionCandidates } from "../../services/analytics/category-suggestions";
import { findProbableDuplicateGroups } from "../../services/analytics/duplicate-detection";
import { normalizeAnalyticsText } from "../../services/analytics/movement-features";
import { sortByName } from "../../lib/sort-locale";
import { COLORS, FONT_FAMILY, FONT_SIZE, GLASS, RADIUS, SPACING } from "../../constants/theme";
import type { MovementType, MovementStatus, MovementRecord, AccountSummary, CategorySummary, CounterpartySummary, ExchangeRateSummary } from "../../types/domain";

type Props = {
  visible: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  defaultType?: MovementType;
  initialAccountId?: number;
  editMovement?: MovementRecord;
};

type Step = 1 | 2 | 3;

type FormState = {
  movementType: MovementType;
  status: MovementStatus;
  sourceAccountId: number | null;
  destinationAccountId: number | null;
  sourceAmount: string;
  destinationAmount: string;
  description: string;
  categoryId: number | null;
  counterpartyId: number | null;
  occurredAt: string;
  notes: string;
};

type MovementSuggestionLike = {
  id: number;
  movementType: string;
  status: string;
  occurredAt: string;
  sourceAccountId: number | null;
  destinationAccountId: number | null;
  categoryId: number | null;
  counterpartyId: number | null;
  description: string;
  amount: number;
};

type CategorySuggestionState = {
  categoryId: number;
  categoryName: string;
  confidence: number;
  reasons: string[];
};

type DuplicateWarningState = {
  movementIds: number[];
  reasons: string[];
};

type TransferFxState = {
  rate: number;
  effectiveAt: string | null;
  label: string;
  source: "api" | "local" | "manual";
  provider?: string;
};

type CategoryFeedbackIntent = {
  kind: "accepted_category_suggestion" | "manual_category_change";
  categoryId: number;
  categoryName?: string | null;
  confidence?: number | null;
  reasons?: string[];
};

function readMovementLinkedEventId(metadata: unknown): number | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  const raw = metadata as Record<string, unknown>;
  const eventId = Number(raw.obligation_event_id ?? 0);
  return Number.isFinite(eventId) && eventId > 0 ? eventId : null;
}

function patternMovementAmount(movement: Pick<PatternMovement, "movement_type" | "source_amount" | "destination_amount">) {
  const source = Math.abs(Number(movement.source_amount ?? 0));
  const destination = Math.abs(Number(movement.destination_amount ?? 0));
  if (movement.movement_type === "income" || movement.movement_type === "refund") return destination || source;
  return source || destination;
}

function isSuggestionCashflow(movement: MovementSuggestionLike) {
  return (
    movement.movementType === "income" ||
    movement.movementType === "refund" ||
    movement.movementType === "expense" ||
    movement.movementType === "subscription_payment" ||
    movement.movementType === "obligation_payment"
  );
}

function suggestionActsAsIncome(movement: MovementSuggestionLike) {
  return movement.movementType === "income" || movement.movementType === "refund";
}

function movementFormTextSimilarity(left: string, right: string) {
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

function formatTransferAmount(value: number) {
  if (!Number.isFinite(value)) return "";
  return String(Math.round(value * 100) / 100);
}

function formatExchangeRateInput(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "";
  return String(Math.round(value * 1_000_000) / 1_000_000);
}

function parseDecimalInput(value: string) {
  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function formatShortDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("es-PE", { day: "2-digit", month: "short" });
}

function findTransferExchangeRate(
  exchangeRates: ExchangeRateSummary[],
  fromCurrencyCode: string,
  toCurrencyCode: string,
) {
  const from = fromCurrencyCode.trim().toUpperCase();
  const to = toCurrencyCode.trim().toUpperCase();
  if (!from || !to || from === to) return null;

  const candidates = exchangeRates
    .filter((rate) => {
      const rateFrom = rate.fromCurrencyCode.trim().toUpperCase();
      const rateTo = rate.toCurrencyCode.trim().toUpperCase();
      return (
        rate.rate > 0 &&
        ((rateFrom === from && rateTo === to) || (rateFrom === to && rateTo === from))
      );
    })
    .sort((left, right) => new Date(right.effectiveAt).getTime() - new Date(left.effectiveAt).getTime());

  const best = candidates[0];
  if (!best) return null;
  const direct = best.fromCurrencyCode.trim().toUpperCase() === from;
  const resolvedRate = direct ? best.rate : 1 / best.rate;
  if (!Number.isFinite(resolvedRate) || resolvedRate <= 0) return null;
  return {
    rate: resolvedRate,
    effectiveAt: best.effectiveAt,
    label: `1 ${from} = ${resolvedRate.toLocaleString("es-PE", { maximumFractionDigits: 6 })} ${to}`,
  };
}

const TYPE_OPTIONS: { type: MovementType; label: string; Icon: typeof ArrowDownCircle; color: string }[] = [
  { type: "expense",  label: "Gasto",        Icon: ArrowDownCircle, color: COLORS.expense  },
  { type: "income",   label: "Ingreso",       Icon: ArrowUpCircle,   color: COLORS.income   },
  { type: "transfer", label: "Transferencia", Icon: ArrowLeftRight,  color: COLORS.transfer },
];

const STATUS_OPTIONS: { status: MovementStatus; label: string }[] = [
  { status: "posted",  label: "Confirmado" },
  { status: "pending", label: "Pendiente"  },
  { status: "planned", label: "Planificado" },
];

function getInitialForm(defaultType: MovementType): FormState {
  return {
    movementType: defaultType,
    status: "posted",
    sourceAccountId: null,
    destinationAccountId: null,
    sourceAmount: "",
    destinationAmount: "",
    description: "",
    categoryId: null,
    counterpartyId: null,
    occurredAt: todayPeru(),
    notes: "",
  };
}

export function MovementForm({ visible, onClose, onSuccess, defaultType = "expense", initialAccountId, editMovement }: Props) {
  const { profile } = useAuth();
  const { activeWorkspaceId, activeWorkspace } = useWorkspace();
  const { showToast } = useToast();
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
  const updateMovement = useUpdateMovementMutation(activeWorkspaceId);
  const syncExchangeRatePair = useSyncExchangeRatePairMutation();
  const { data: dashboardAnalytics } = useDashboardAnalyticsQuery(activeWorkspaceId, profile?.id);
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
  const [submitError, setSubmitError] = useState("");
  const [isClosingAfterSubmit, setIsClosingAfterSubmit] = useState(false);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [savedMovementId, setSavedMovementId] = useState<number | undefined>(editMovement?.id);
  const [categoryFeedbackIntent, setCategoryFeedbackIntent] = useState<CategoryFeedbackIntent | null>(null);
  const [transferDestinationEdited, setTransferDestinationEdited] = useState(false);
  const [transferRateInput, setTransferRateInput] = useState("");
  const [transferRateEdited, setTransferRateEdited] = useState(false);
  const [transferLiveRate, setTransferLiveRate] = useState<TransferFxState | null>(null);
  const [transferRateError, setTransferRateError] = useState<string | null>(null);
  const attachmentsHydratedRef = useRef<string | null>(null);
  const initialAttachmentSignatureRef = useRef("::ready");

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
  const categories = snapshot?.categories ?? [];
  const counterparties = snapshot?.counterparties ?? [];
  const exchangeRates = snapshot?.exchangeRates ?? [];

  const activeAccountsSorted = useMemo(
    () => sortByName(accounts.filter((a) => !a.isArchived)),
    [accounts],
  );
  /** En transferencia: destino ? origen. En ingreso no hay cuenta origen en el flujo: mostrar todas las activas. */
  const destinationAccountsSorted = useMemo(() => {
    const active = sortByName(accounts.filter((a) => !a.isArchived));
    if (form.movementType === "transfer" && form.sourceAccountId != null) {
      return active.filter((a) => a.id !== form.sourceAccountId);
    }
    return active;
  }, [accounts, form.sourceAccountId, form.movementType]);
  const categoriesForPicker = useMemo(() => {
    const filtered = categories.filter(
      (c) =>
        c.isActive &&
        (c.kind === "both" ||
          (form.movementType === "income" && c.kind === "income") ||
          (form.movementType !== "income" && c.kind === "expense")),
    );
    return sortByName(filtered);
  }, [categories, form.movementType]);
  const counterpartiesSorted = useMemo(() => sortByName(counterparties), [counterparties]);
  const sourceAmountNum = parseFloat(form.sourceAmount) || 0;
  const destinationAmountNum = parseFloat(form.destinationAmount) || 0;

  const currentSuggestionMovement = useMemo<MovementSuggestionLike | null>(() => {
    const amount = form.movementType === "income" ? destinationAmountNum : sourceAmountNum;
    if (form.movementType === "transfer") return null;
    return {
      id: editMovement?.id ? -editMovement.id : -1,
      movementType: form.movementType,
      status: "posted",
      occurredAt: dateStrToISO(form.occurredAt),
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
    form.occurredAt,
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
    return {
      categoryId: category.id,
      categoryName: category.name,
      confidence: Math.max(0.68, Math.min(0.98, 0.62 + best.similarity * 0.28)),
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

  const bestCategorySuggestion = learnedCategorySuggestion ?? algorithmicCategorySuggestion;

  const duplicateWarning = useMemo<DuplicateWarningState | null>(() => {
    if (!currentSuggestionMovement || currentSuggestionMovement.amount <= 0.009 || !currentSuggestionMovement.description.trim()) return null;
    const groups = findProbableDuplicateGroups<MovementSuggestionLike>({
      movements: [...suggestionHistory, currentSuggestionMovement],
      getAmount: (movement) => movement.amount,
      maxDaysApart: 2,
    });
    const group = groups.find((item) => item.movementIds.includes(currentSuggestionMovement.id));
    if (!group) return null;
    return {
      movementIds: group.movementIds.filter((id) => id !== currentSuggestionMovement.id),
      reasons: group.reasons,
    };
  }, [currentSuggestionMovement, suggestionHistory]);

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
      setForm(initial);
    }
    setErrors({});
    setSubmitError("");
    setAttachments([]);
    setSavedMovementId(editMovement?.id);
    setCategoryFeedbackIntent(null);
    setTransferDestinationEdited(Boolean(editMovement?.destinationAmount));
    setTransferRateInput("");
    setTransferRateEdited(false);
    setTransferLiveRate(null);
    setTransferRateError(null);
  }, [visible, editMovement, defaultType, initialAccountId, isClosingAfterSubmit]);

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

  function applyCategorySuggestion(suggestion: CategorySuggestionState) {
    patch({ categoryId: suggestion.categoryId });
    setCategoryFeedbackIntent({
      kind: "accepted_category_suggestion",
      categoryId: suggestion.categoryId,
      categoryName: suggestion.categoryName,
      confidence: suggestion.confidence,
      reasons: suggestion.reasons,
    });
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
      source: "movement-form",
      metadata: {
        categoryName: intent.categoryName ?? category?.name ?? null,
        reasons: intent.reasons ?? [],
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

  // --- Balance impact preview ---
  const sourceAccount = accounts.find((a) => a.id === form.sourceAccountId) ?? null;
  const destinationAccount = accounts.find((a) => a.id === form.destinationAccountId) ?? null;
  const originalSourceAccount = accounts.find((a) => a.id === (editMovement?.sourceAccountId ?? null)) ?? null;
  const originalDestinationAccount = accounts.find((a) => a.id === (editMovement?.destinationAccountId ?? null)) ?? null;
  // Transfer: destination amount only needed when currencies differ
  const transferCurrenciesDiffer =
    form.movementType === "transfer" &&
    sourceAccount !== null &&
    destinationAccount !== null &&
    sourceAccount.currencyCode !== destinationAccount.currencyCode;

  const transferFxSuggestion = useMemo(() => {
    if (!transferCurrenciesDiffer || !sourceAccount || !destinationAccount) return null;
    const local = findTransferExchangeRate(
      exchangeRates,
      sourceAccount.currencyCode,
      destinationAccount.currencyCode,
    );
    return local
      ? { ...local, source: "local" as const, provider: undefined }
      : null;
  }, [destinationAccount, exchangeRates, sourceAccount, transferCurrenciesDiffer]);

  const transferPairKey = useMemo(() => {
    if (!transferCurrenciesDiffer || !sourceAccount || !destinationAccount) return null;
    return `${sourceAccount.currencyCode.toUpperCase()}:${destinationAccount.currencyCode.toUpperCase()}`;
  }, [destinationAccount, sourceAccount, transferCurrenciesDiffer]);

  useEffect(() => {
    if (!visible || !transferPairKey || !sourceAccount || !destinationAccount) {
      setTransferLiveRate(null);
      setTransferRateError(null);
      return;
    }

    let cancelled = false;
    const fromCurrencyCode = sourceAccount.currencyCode.toUpperCase();
    const toCurrencyCode = destinationAccount.currencyCode.toUpperCase();
    setTransferRateError(null);
    setTransferLiveRate(null);
    setTransferRateEdited(false);

    void syncExchangeRatePair.mutateAsync({ fromCurrencyCode, toCurrencyCode })
      .then((result) => {
        if (cancelled) return;
        setTransferLiveRate({
          rate: result.rate,
          effectiveAt: result.effectiveAt,
          source: "api",
          provider: result.provider,
          label: `1 ${fromCurrencyCode} = ${result.rate.toLocaleString("es-PE", { maximumFractionDigits: 6 })} ${toCurrencyCode}`,
        });
      })
      .catch((error) => {
        if (cancelled) return;
        setTransferRateError(error instanceof Error ? error.message : "No se pudo actualizar el tipo de cambio");
      });

    return () => {
      cancelled = true;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transferPairKey, visible]);

  const transferBaseFxSuggestion = transferLiveRate ?? transferFxSuggestion;
  const transferManualRate = parseDecimalInput(transferRateInput);
  const effectiveTransferFxSuggestion = useMemo<TransferFxState | null>(() => {
    if (!transferCurrenciesDiffer || !sourceAccount || !destinationAccount) return null;
    const from = sourceAccount.currencyCode.toUpperCase();
    const to = destinationAccount.currencyCode.toUpperCase();
    if (transferRateEdited) {
      if (!transferManualRate) return null;
      return {
        rate: transferManualRate,
        effectiveAt: null,
        source: "manual",
        label: `1 ${from} = ${transferManualRate.toLocaleString("es-PE", { maximumFractionDigits: 6 })} ${to}`,
      };
    }
    return transferBaseFxSuggestion ?? null;
  }, [
    destinationAccount,
    sourceAccount,
    transferBaseFxSuggestion,
    transferCurrenciesDiffer,
    transferManualRate,
    transferRateEdited,
  ]);

  useEffect(() => {
    if (!transferCurrenciesDiffer) {
      if (transferRateInput) setTransferRateInput("");
      setTransferRateEdited(false);
      setTransferLiveRate(null);
      setTransferRateError(null);
      return;
    }
    if (transferRateEdited || !transferBaseFxSuggestion) return;
    const nextRate = formatExchangeRateInput(transferBaseFxSuggestion.rate);
    if (nextRate && nextRate !== transferRateInput) {
      setTransferRateInput(nextRate);
    }
  }, [transferBaseFxSuggestion, transferCurrenciesDiffer, transferRateEdited, transferRateInput]);

  useEffect(() => {
    if (form.movementType !== "transfer" || !transferCurrenciesDiffer || transferDestinationEdited) return;
    if (sourceAmountNum <= 0) {
      if (form.destinationAmount) patch({ destinationAmount: "" });
      return;
    }
    if (!effectiveTransferFxSuggestion) {
      if (form.destinationAmount) patch({ destinationAmount: "" });
      return;
    }
    const nextDestinationAmount = formatTransferAmount(sourceAmountNum * effectiveTransferFxSuggestion.rate);
    if (nextDestinationAmount && nextDestinationAmount !== form.destinationAmount) {
      patch({ destinationAmount: nextDestinationAmount });
    }
  }, [
    form.destinationAmount,
    form.movementType,
    sourceAmountNum,
    transferCurrenciesDiffer,
    transferDestinationEdited,
    effectiveTransferFxSuggestion,
  ]);

  // When editing a posted movement, currentBalance already reflects the original movement.
  // We must reverse it first, then apply the new amount to get the correct projection.
  const editOriginalSourceAmt =
    isEditing && editMovement?.status === "posted" ? (editMovement.sourceAmount ?? 0) : 0;
  const editOriginalDestAmt =
    isEditing && editMovement?.status === "posted" ? (editMovement.destinationAmount ?? 0) : 0;

  const projectedSourceBalance = useMemo(() => {
    if (!sourceAccount || sourceAmountNum <= 0) return null;
    if (form.movementType === "income") {
      return sourceAccount.currentBalance + sourceAmountNum;
    }
    // expense / transfer source:
    // if we kept the same account, reverse original amount and apply the new one;
    // if we changed account, only apply the new outgoing amount here.
    if (isEditing && originalSourceAccount && originalSourceAccount.id === sourceAccount.id) {
      return (sourceAccount.currentBalance + editOriginalSourceAmt) - sourceAmountNum;
    }
    return sourceAccount.currentBalance - sourceAmountNum;
  }, [sourceAccount, sourceAmountNum, form.movementType, editOriginalSourceAmt, isEditing, originalSourceAccount]);

  const projectedDestBalance = useMemo(() => {
    if (!destinationAccount) return null;
    const effectiveNewAmt =
      form.movementType === "transfer" && !transferCurrenciesDiffer
        ? sourceAmountNum
        : destinationAmountNum;
    if (effectiveNewAmt <= 0) return null;
    // destination:
    // if we kept the same account, reverse original amount and apply the new one;
    // if we changed account, only apply the new incoming amount here.
    if (isEditing && originalDestinationAccount && originalDestinationAccount.id === destinationAccount.id) {
      return (destinationAccount.currentBalance - editOriginalDestAmt) + effectiveNewAmt;
    }
    return destinationAccount.currentBalance + effectiveNewAmt;
  }, [destinationAccount, destinationAmountNum, sourceAmountNum, form.movementType, transferCurrenciesDiffer, editOriginalDestAmt, isEditing, originalDestinationAccount]);
  const revertedOriginalSourceBalance = useMemo(() => {
    if (!isEditing || !originalSourceAccount || editOriginalSourceAmt <= 0) return null;
    if (originalSourceAccount.id === sourceAccount?.id) return null;
    return originalSourceAccount.currentBalance + editOriginalSourceAmt;
  }, [isEditing, originalSourceAccount, editOriginalSourceAmt, sourceAccount?.id]);
  const revertedOriginalDestBalance = useMemo(() => {
    if (!isEditing || !originalDestinationAccount || editOriginalDestAmt <= 0) return null;
    if (originalDestinationAccount.id === destinationAccount?.id) return null;
    return originalDestinationAccount.currentBalance - editOriginalDestAmt;
  }, [isEditing, originalDestinationAccount, editOriginalDestAmt, destinationAccount?.id]);
  const hasAttachmentChanges = attachmentSignature !== initialAttachmentSignatureRef.current;

  // --- Validation per step ---
  function validateStep1(): boolean {
    return true; // type is always selected
  }

  function validateStep2(): boolean {
    const newErrors: typeof errors = {};
    if (!form.sourceAccountId && form.movementType !== "income") {
      newErrors.sourceAccountId = "Selecciona una cuenta";
    }
    if (form.movementType === "income" && !form.destinationAccountId) {
      newErrors.destinationAccountId = "Selecciona una cuenta de destino";
    }
    if (form.movementType === "transfer") {
      if (!form.destinationAccountId) newErrors.destinationAccountId = "Selecciona cuenta destino";
      if (form.sourceAccountId === form.destinationAccountId) {
        newErrors.destinationAccountId = "Debe ser una cuenta diferente";
      }
      if (transferCurrenciesDiffer) {
        if (!transferManualRate && !transferBaseFxSuggestion) {
          newErrors.destinationAmount = "No se pudo resolver el tipo de cambio";
        } else if (!form.destinationAmount) {
          newErrors.destinationAmount = "Ingresa monto destino";
        }
      }
    }
    if (!form.sourceAmount && form.movementType !== "income") {
      newErrors.sourceAmount = "Ingresa un monto";
    }
    if (form.movementType === "income" && !form.destinationAmount) {
      newErrors.destinationAmount = "Ingresa un monto";
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
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

    try {
      setIsClosingAfterSubmit(true);
      const autoDesc = buildDescription();
      let backgroundAttachmentSync: (() => void) | null = null;
      const isIncome = form.movementType === "income";
      const isTransfer = form.movementType === "transfer";
      const effectiveDestAmount = isTransfer && !transferCurrenciesDiffer
        ? sourceAmountNum
        : destinationAmountNum;
      const effectiveFxRate = isTransfer && transferCurrenciesDiffer && sourceAmountNum > 0
        ? effectiveDestAmount / sourceAmountNum
        : null;
      if (isEditing && editMovement) {
        await updateMovement.mutateAsync({
          id: editMovement.id,
          input: {
            status: form.status,
            description: autoDesc,
            notes: form.notes.trim() || null,
            categoryId: form.categoryId,
            counterpartyId: form.counterpartyId,
            occurredAt: dateStrToISO(form.occurredAt),
            sourceAccountId: form.movementType === "income" ? null : form.sourceAccountId,
            destinationAccountId:
              form.movementType === "income" || form.movementType === "transfer"
                ? form.destinationAccountId
                : null,
            sourceAmount: form.sourceAmount ? sourceAmountNum : undefined,
            destinationAmount: isIncome ? destinationAmountNum : isTransfer ? effectiveDestAmount : undefined,
            fxRate: effectiveFxRate,
          },
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
        const payload = {
          movementType: form.movementType,
          status: isTransfer ? "posted" as const : form.status,
          occurredAt: dateStrToISO(form.occurredAt),
          description: autoDesc,
          notes: form.notes.trim() || null,
          sourceAccountId: isIncome ? null : form.sourceAccountId,
          sourceAmount: isIncome ? null : sourceAmountNum,
          destinationAccountId: isIncome || isTransfer ? form.destinationAccountId : null,
          destinationAmount: isIncome ? destinationAmountNum : isTransfer ? effectiveDestAmount : null,
          fxRate: effectiveFxRate,
          categoryId: form.categoryId,
          counterpartyId: form.counterpartyId,
        };
        const created = await createMovement.mutateAsync(payload);
        setSavedMovementId(created.id);
        persistCategoryLearning(created.id, autoDesc);
        // Los comprobantes se sincronizan después de cerrar el formulario para no bloquear la UI.
        showToast("Movimiento guardado", "success");
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
        <View style={styles.stepRow}>
          {([1, 2, 3] as Step[]).map((s) => (
            <View key={s} style={[styles.stepDot, step >= s && styles.stepDotActive]} />
          ))}
        </View>
      ) : null}

      {/* -- STEP 1: type + status -- */}
      {step === 1 && (
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Tipo</Text>
          <View style={styles.typeGrid}>
            {TYPE_OPTIONS.map((opt) => {
              const isActive = form.movementType === opt.type;
              return (
                <View
                  key={opt.type}
                  style={[
                    styles.typeButtonWrap,
                    isActive && {
                      borderColor: opt.color + "AA",
                      borderTopColor: opt.color + "CC",
                    },
                  ]}
                >
                  <TouchableOpacity
                    style={styles.typeButtonInner}
                    onPress={() => {
                      setTransferDestinationEdited(false);
                      patch({ movementType: opt.type });
                    }}
                    activeOpacity={0.75}
                  >
                    <opt.Icon size={26} color={isActive ? opt.color : COLORS.storm} />
                    <Text style={[styles.typeLabel, isActive && { color: opt.color }]}>
                      {opt.label}
                    </Text>
                    {isActive && <View style={[styles.typeActiveDot, { backgroundColor: opt.color }]} />}
                  </TouchableOpacity>
                </View>
              );
            })}
          </View>

          {/* Status · hidden for transfers (always posted) */}
          {form.movementType !== "transfer" ? (
            <>
              <Text style={[styles.sectionLabel, { marginTop: SPACING.md }]}>Estado</Text>
              <View style={styles.statusRow}>
                {STATUS_OPTIONS.map((opt) => (
                  <TouchableOpacity
                    key={opt.status}
                    style={[styles.statusPill, form.status === opt.status && styles.statusPillActive]}
                    onPress={() => patch({ status: opt.status })}
                    activeOpacity={0.75}
                  >
                    <Text style={[styles.statusText, form.status === opt.status && styles.statusTextActive]}>
                      {opt.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </>
          ) : null}

          <Button label="Siguiente →" onPress={goNext} style={styles.btn} />
        </View>
      )}

      {/* -- STEP 2: amount + accounts -- */}
      {step === 2 && (
        <View style={styles.section}>
          {/* Source amount / account (for expense and transfer) */}
          {form.movementType !== "income" && (
            <>
              <CurrencyInput
                label={form.movementType === "transfer" ? "Monto origen" : "Monto"}
                value={form.sourceAmount}
                onChangeText={(v) => patch({ sourceAmount: v })}
                currencyCode={sourceAccount?.currencyCode ?? baseCurrency}
                error={errors.sourceAmount}
              />
              <AccountPicker
                label="Cuenta origen"
                accounts={activeAccountsSorted}
                selectedId={form.sourceAccountId}
                onSelect={(id) => {
                  if (form.movementType === "transfer") setTransferDestinationEdited(false);
                  patch({ sourceAccountId: id });
                }}
                error={errors.sourceAccountId as string | undefined}
              />
            </>
          )}

          {/* Destination account + amount (income, transfer) */}
          {(form.movementType === "income" || form.movementType === "transfer") && (
            <>
              <AccountPicker
                label="Cuenta destino"
                accounts={destinationAccountsSorted}
                selectedId={form.destinationAccountId}
                onSelect={(id) => {
                  if (form.movementType === "transfer") setTransferDestinationEdited(false);
                  patch({ destinationAccountId: id });
                }}
                error={errors.destinationAccountId as string | undefined}
              />
              {/* Income amount */}
              {form.movementType === "income" && (
                <CurrencyInput
                  label="Monto"
                  value={form.destinationAmount}
                  onChangeText={(v) => patch({ destinationAmount: v })}
                  currencyCode={destinationAccount?.currencyCode ?? baseCurrency}
                  error={errors.destinationAmount}
                />
              )}
              {/* Transfer destination amount · only when currencies differ */}
              {form.movementType === "transfer" && transferCurrenciesDiffer && (
                <CurrencyInput
                  label={`Monto destino (${destinationAccount?.currencyCode ?? ""})`}
                  value={form.destinationAmount}
                  onChangeText={(v) => {
                    setTransferDestinationEdited(true);
                    patch({ destinationAmount: v });
                  }}
                  currencyCode={destinationAccount?.currencyCode ?? baseCurrency}
                  error={errors.destinationAmount}
                />
              )}
              {form.movementType === "transfer" && transferCurrenciesDiffer && sourceAccount && destinationAccount ? (
                <Input
                  label={`Tipo de cambio (${sourceAccount.currencyCode} → ${destinationAccount.currencyCode})`}
                  value={transferRateInput}
                  onChangeText={(value) => {
                    setTransferRateEdited(true);
                    setTransferDestinationEdited(false);
                    setTransferRateInput(value);
                  }}
                  placeholder="0.0000"
                  keyboardType="decimal-pad"
                  hint={
                    syncExchangeRatePair.isPending
                      ? "Actualizando desde la API..."
                      : effectiveTransferFxSuggestion?.source === "api"
                        ? `Actualizado con ${effectiveTransferFxSuggestion.provider ?? "API"}${effectiveTransferFxSuggestion.effectiveAt ? ` · ${formatShortDate(effectiveTransferFxSuggestion.effectiveAt)}` : ""}`
                        : effectiveTransferFxSuggestion?.source === "manual"
                          ? "Usaremos esta tasa solo para este movimiento."
                          : transferRateError && transferBaseFxSuggestion
                            ? "No se pudo actualizar en línea; usamos el tipo de cambio guardado."
                            : undefined
                  }
                />
              ) : null}
              {form.movementType === "transfer" && transferCurrenciesDiffer && sourceAccount && destinationAccount ? (
                <View style={[
                  styles.fxRateNote,
                  !effectiveTransferFxSuggestion && styles.fxRateNoteMissing,
                ]}>
                  <Text style={[
                    styles.fxRateNoteText,
                    !effectiveTransferFxSuggestion && styles.fxRateNoteTextMissing,
                  ]}>
                    {effectiveTransferFxSuggestion
                      ? `Monto destino calculado con ${effectiveTransferFxSuggestion.label}. Puedes editar la tasa o el monto.`
                      : transferRateError
                        ? `No pude obtener tipo de cambio ${sourceAccount.currencyCode} → ${destinationAccount.currencyCode}. Ingresa la tasa o el monto destino manualmente.`
                        : `Buscando tipo de cambio ${sourceAccount.currencyCode} → ${destinationAccount.currencyCode}...`}
                  </Text>
                </View>
              ) : null}
              {form.movementType === "transfer" && !transferCurrenciesDiffer && sourceAccount && destinationAccount && (
                <View style={styles.sameCurrencyNote}>
                  <Text style={styles.sameCurrencyText}>
                    Misma moneda ({sourceAccount.currencyCode}) · el monto se transfiere igual.
                  </Text>
                </View>
              )}
            </>
          )}

          {/* Balance impact preview */}
          {sourceAccount && projectedSourceBalance !== null && (
            <BalanceImpactPreview
              label={isEditing && originalSourceAccount && originalSourceAccount.id !== sourceAccount.id
                ? `Cuenta seleccionada: ${sourceAccount.name}`
                : sourceAccount.name}
              currentBalance={sourceAccount.currentBalance}
              projectedBalance={projectedSourceBalance}
              currencyCode={sourceAccount.currencyCode}
            />
          )}
          {originalSourceAccount && revertedOriginalSourceBalance !== null && (
            <BalanceImpactPreview
              label={`Cuenta anterior: ${originalSourceAccount.name}`}
              currentBalance={originalSourceAccount.currentBalance}
              projectedBalance={revertedOriginalSourceBalance}
              currencyCode={originalSourceAccount.currencyCode}
            />
          )}
          {destinationAccount && projectedDestBalance !== null && (
            <BalanceImpactPreview
              label={isEditing && originalDestinationAccount && originalDestinationAccount.id !== destinationAccount.id
                ? `Cuenta seleccionada: ${destinationAccount.name}`
                : destinationAccount.name}
              currentBalance={destinationAccount.currentBalance}
              projectedBalance={projectedDestBalance}
              currencyCode={destinationAccount.currencyCode}
            />
          )}
          {originalDestinationAccount && revertedOriginalDestBalance !== null && (
            <BalanceImpactPreview
              label={`Cuenta anterior: ${originalDestinationAccount.name}`}
              currentBalance={originalDestinationAccount.currentBalance}
              projectedBalance={revertedOriginalDestBalance}
              currencyCode={originalDestinationAccount.currencyCode}
            />
          )}

          <View style={styles.navRow}>
            <Button label="← Atrás" variant="ghost" onPress={goBack} style={styles.btnHalf} />
            <Button label="Siguiente →" onPress={goNext} style={styles.btnHalf} />
          </View>
        </View>
      )}

      {/* -- STEP 3: description + category + counterparty + date -- */}
      {step === 3 && (() => {
        const catSuggestion = catSuggestionId !== null
          ? categoriesForPicker.find((c) => c.id === catSuggestionId) ?? null
          : null;
        const cpSuggestion = cpSuggestionId !== null
          ? counterpartiesSorted.find((c) => c.id === cpSuggestionId) ?? null
          : null;
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
        <View style={styles.section}>
          {duplicateWarning ? (
            <View style={styles.duplicateWarning}>
              <AlertCircle size={16} color={COLORS.gold} strokeWidth={2} />
              <View style={{ flex: 1 }}>
                <Text style={styles.duplicateWarningTitle}>Podría estar repetido</Text>
                <Text style={styles.duplicateWarningText}>
                  Hay {duplicateWarning.movementIds.length} movimiento{duplicateWarning.movementIds.length === 1 ? "" : "s"} parecido{duplicateWarning.movementIds.length === 1 ? "" : "s"} por {duplicateWarning.reasons.join(", ") || "fecha y monto cercanos"}.
                </Text>
              </View>
            </View>
          ) : null}

          <Input
            label="Descripción (opcional)"
            placeholder="Se genera automáticamente si la dejas vacía"
            value={form.description}
            onChangeText={(v) => patch({ description: v })}
            autoFocus
            ref={descriptionRef}
            returnKeyType="next"
            onSubmitEditing={() => notesRef.current?.focus()}
          />

          <CategoryPicker
            label="Categoría (opcional)"
            categories={categoriesForPicker}
            selectedId={form.categoryId}
            onSelect={selectCategoryManually}
          />
          {categorySuggestionToShow ? (
            <SmartSuggestion
              label={categorySuggestionToShow.categoryName}
              detail={`${Math.round(categorySuggestionToShow.confidence * 100)}% · ${categorySuggestionToShow.reasons.join(" · ")}`}
              onApply={() => applyCategorySuggestion(categorySuggestionToShow)}
            />
          ) : null}

          <CounterpartyPicker
            label="Contraparte (opcional)"
            counterparties={counterpartiesSorted}
            selectedId={form.counterpartyId}
            onSelect={(id) => patch({ counterpartyId: id })}
          />
          {cpSuggestion ? (
            <SmartSuggestion
              label={cpSuggestion.name}
              onApply={() => patch({ counterpartyId: cpSuggestion.id })}
            />
          ) : null}
          {accountSuggestion ? (
            <SmartSuggestion
              label={`Usar ${accountSuggestion.name}`}
              detail="Normalmente usas esta cuenta con esa persona o comercio"
              onApply={() => {
                if (form.movementType === "income") patch({ destinationAccountId: accountSuggestion.id });
                else patch({ sourceAccountId: accountSuggestion.id });
              }}
            />
          ) : null}

          <DatePickerInput
            label="Fecha"
            value={form.occurredAt}
            onChange={(v) => patch({ occurredAt: v })}
          />

          <Input
            label="Notas (opcional)"
            placeholder="Notas adicionales…"
            value={form.notes}
            onChangeText={(v) => patch({ notes: v })}
            multiline
            numberOfLines={3}
            style={styles.notesInput}
            ref={notesRef}
            returnKeyType="done"
            blurOnSubmit
          />

          <AttachmentPicker
            movementId={savedMovementId}
            attachments={attachments}
            onChange={setAttachments}
            isHydratingExisting={isEditing && editMovementAttachmentsLoading}
          />

          {submitError ? (
            <View style={styles.submitErrorBanner}>
              <AlertCircle size={16} color={COLORS.danger} strokeWidth={2} />
              <Text style={styles.submitErrorText}>{submitError}</Text>
            </View>
          ) : null}

          <View style={styles.navRow}>
            <Button label="← Atrás" variant="ghost" onPress={goBack} style={styles.btnHalf} />
            <Button
              label={isEditing ? "Actualizar" : "Guardar"}
              onPress={handleSubmit}
              loading={createMovement.isPending || updateMovement.isPending}
              style={styles.btnHalf}
            />
          </View>
        </View>
        );
      })()}
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

function AccountPicker({
  label,
  accounts,
  selectedId,
  onSelect,
  error,
}: {
  label: string;
  accounts: AccountSummary[];
  selectedId: number | null;
  onSelect: (id: number) => void;
  error?: string;
}) {
  return (
    <View style={styles.pickerWrap}>
      <Text style={styles.sectionLabel}>{label}</Text>
      {error ? <Text style={styles.fieldError}>{error}</Text> : null}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.accountRow}>
        {accounts.map((acc) => (
          <TouchableOpacity
            key={acc.id}
            style={[
              styles.accountChip,
              selectedId === acc.id && { borderColor: acc.color, backgroundColor: acc.color + "22" },
            ]}
            onPress={() => onSelect(acc.id)}
          >
            <Text style={[styles.accountChipName, selectedId === acc.id && { color: acc.color }]}>
              {acc.name}
            </Text>
            <Text style={styles.accountChipBalance}>
              {acc.currencyCode}
            </Text>
          </TouchableOpacity>
        ))}
        {accounts.length === 0 && (
          <Text style={styles.emptyPicker}>Sin cuentas activas</Text>
        )}
      </ScrollView>
    </View>
  );
}

function CounterpartyPicker({
  label,
  counterparties,
  selectedId,
  onSelect,
}: {
  label: string;
  counterparties: CounterpartySummary[];
  selectedId: number | null;
  onSelect: (id: number | null) => void;
}) {
  if (counterparties.length === 0) return null;
  return (
    <View style={styles.pickerWrap}>
      <Text style={styles.sectionLabel}>{label}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.accountRow}>
        <TouchableOpacity
          style={[styles.categoryChip, selectedId === null && styles.categoryChipActive]}
          onPress={() => onSelect(null)}
        >
          <Text style={[styles.categoryChipText, selectedId === null && styles.categoryChipTextActive]}>
            Ninguna
          </Text>
        </TouchableOpacity>
        {counterparties.map((cp) => (
          <TouchableOpacity
            key={cp.id}
            style={[styles.categoryChip, selectedId === cp.id && styles.categoryChipActive]}
            onPress={() => onSelect(cp.id)}
          >
            <Text style={[styles.categoryChipText, selectedId === cp.id && styles.categoryChipTextActive]}>
              {cp.name}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

function CategoryPicker({
  label,
  categories,
  selectedId,
  onSelect,
}: {
  label: string;
  categories: CategorySummary[];
  selectedId: number | null;
  onSelect: (id: number | null) => void;
}) {
  return (
    <View style={styles.pickerWrap}>
      <Text style={styles.sectionLabel}>{label}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.accountRow}>
        <TouchableOpacity
          style={[styles.categoryChip, selectedId === null && styles.categoryChipActive]}
          onPress={() => onSelect(null)}
        >
          <Text style={[styles.categoryChipText, selectedId === null && styles.categoryChipTextActive]}>
            Sin categoría
          </Text>
        </TouchableOpacity>
        {categories.map((cat) => (
          <TouchableOpacity
            key={cat.id}
            style={[styles.categoryChip, selectedId === cat.id && styles.categoryChipActive]}
            onPress={() => onSelect(cat.id)}
          >
            <Text style={[styles.categoryChipText, selectedId === cat.id && styles.categoryChipTextActive]}>
              {cat.name}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

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
    backgroundColor: "rgba(255,255,255,0.12)",
  },
  stepDotActive: {
    backgroundColor: COLORS.pine,
    width: 32,
    shadowColor: COLORS.pine,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 6,
  },
  section: { gap: SPACING.md },
  sectionLabel: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.storm,
    fontFamily: FONT_FAMILY.bodySemibold,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  typeGrid: {
    flexDirection: "row",
    gap: SPACING.sm,
  },
  typeButtonWrap: {
    flex: 1,
    borderRadius: RADIUS.lg,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: GLASS.card,
  },
  typeButtonInner: {
    flex: 1,
    alignItems: "center",
    paddingVertical: SPACING.xl,
    gap: SPACING.sm,
    backgroundColor: "transparent",
  },
  typeActiveDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    marginTop: 2,
  },
  typeLabel: {
    fontSize: FONT_SIZE.sm,
    fontFamily: FONT_FAMILY.bodySemibold,
    color: COLORS.storm,
    letterSpacing: 0.2,
  },
  statusRow: {
    flexDirection: "row",
    gap: SPACING.sm,
  },
  statusPill: {
    flex: 1,
    alignItems: "center",
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs + 3,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.11)",
    backgroundColor: GLASS.card,
  },
  statusPillActive: {
    backgroundColor: COLORS.pine + "28",
    borderColor: COLORS.pine + "99",
    shadowColor: COLORS.pine,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.20,
    shadowRadius: 8,
  },
  statusText: { fontSize: FONT_SIZE.sm, color: COLORS.storm, fontFamily: FONT_FAMILY.bodyMedium },
  statusTextActive: { color: COLORS.pine, fontFamily: FONT_FAMILY.bodySemibold },
  btn: { marginTop: SPACING.sm },
  navRow: {
    flexDirection: "row",
    gap: SPACING.sm,
    marginTop: SPACING.sm,
  },
  btnHalf: { flex: 1 },
  pickerWrap: { gap: SPACING.sm },
  accountRow: {
    gap: SPACING.sm,
    paddingVertical: SPACING.xs,
  },
  accountChip: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: GLASS.card,
    gap: 2,
    minWidth: 100,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 3,
  },
  accountChipName: {
    fontSize: FONT_SIZE.sm,
    fontFamily: FONT_FAMILY.bodySemibold,
    color: COLORS.ink,
  },
  accountChipBalance: { fontSize: FONT_SIZE.xs, color: COLORS.storm },
  emptyPicker: { fontSize: FONT_SIZE.sm, color: COLORS.storm },
  categoryChip: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs + 3,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.11)",
    backgroundColor: GLASS.card,
  },
  categoryChipActive: {
    backgroundColor: COLORS.pine + "28",
    borderColor: COLORS.pine + "99",
    shadowColor: COLORS.pine,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.18,
    shadowRadius: 8,
  },
  categoryChipText: { fontSize: FONT_SIZE.sm, color: COLORS.storm },
  categoryChipTextActive: { color: COLORS.pine, fontFamily: FONT_FAMILY.bodySemibold },
  notesInput: { height: 72, textAlignVertical: "top" },
  fieldError: { fontSize: FONT_SIZE.xs, color: COLORS.danger },
  duplicateWarning: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: SPACING.sm,
    padding: SPACING.md,
    borderRadius: RADIUS.lg,
    backgroundColor: COLORS.gold + "16",
    borderWidth: 1,
    borderColor: COLORS.gold + "44",
  },
  duplicateWarningTitle: {
    fontFamily: FONT_FAMILY.bodySemibold,
    fontSize: FONT_SIZE.sm,
    color: COLORS.ink,
  },
  duplicateWarningText: {
    marginTop: 2,
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.xs,
    color: COLORS.storm,
    lineHeight: 17,
  },
  fxRateNote: {
    marginTop: -SPACING.xs,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.primary + "12",
    borderWidth: 1,
    borderColor: COLORS.primary + "2E",
  },
  fxRateNoteMissing: {
    backgroundColor: COLORS.gold + "14",
    borderColor: COLORS.gold + "3D",
  },
  fxRateNoteText: {
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.xs,
    color: COLORS.storm,
    lineHeight: 17,
  },
  fxRateNoteTextMissing: {
    color: COLORS.ink,
  },
  sameCurrencyNote: {
    backgroundColor: GLASS.card,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderWidth: 1,
    borderColor: GLASS.cardBorder,
  },
  sameCurrencyText: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.storm,
    fontFamily: FONT_FAMILY.body,
  },
  submitErrorBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: SPACING.sm,
    padding: SPACING.md,
    borderRadius: RADIUS.lg,
    backgroundColor: COLORS.danger + "18",
    borderWidth: 1,
    borderColor: COLORS.danger + "44",
  },
  submitErrorText: {
    flex: 1,
    fontFamily: FONT_FAMILY.bodyMedium,
    fontSize: FONT_SIZE.sm,
    color: COLORS.danger,
    lineHeight: 20,
  },
});
