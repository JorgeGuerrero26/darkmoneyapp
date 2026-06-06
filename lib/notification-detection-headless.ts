import { NativeModules } from "react-native";

import { supabase } from "./supabase";
import {
  findPossibleDuplicateMovement,
  recordSuggestionAction,
  syncNativeDetectedSuggestion,
  type NativeDetectedMovementSuggestion,
} from "../services/queries/notification-detection";
import { type PatternMaps } from "./movement-patterns";
import { type MovementFormInput } from "../services/queries/workspace-data";
import { buildMovementCreateInput } from "../features/movements/lib/movement-save-contract";
import {
  filterCategoriesForMovementType,
  orchestrateCategoryAiRecommendation,
} from "./movement-ai-orchestrator";
import type { JsonValue } from "../types/domain";
import { logError, logWarn } from "./error-logger";
import { withRetry, withTimeout } from "./promise-utils";

const HEADLESS_QUERY_TIMEOUT_MS = 10_000;
const HEADLESS_RETRIES = 2;

function reportFailedAttempt(label: string, suggestionId: string | undefined) {
  return (attempt: number, error: unknown) => {
    logWarn("notification-detection-headless", `Retry attempt ${attempt + 1} failed at ${label}`, {
      suggestionId,
      attempt,
      error: error instanceof Error ? error.message : String(error),
    });
  };
}

async function verifyMovementExists(movementId: number): Promise<boolean> {
  if (!supabase) return false;
  try {
    const { data } = await withTimeout(
      supabase.from("movements").select("id").eq("id", movementId).maybeSingle(),
      HEADLESS_QUERY_TIMEOUT_MS,
      "movements.verify",
    );
    return Boolean(data && (data as { id?: unknown }).id);
  } catch {
    return false;
  }
}

type HeadlessPayload = {
  taskMode?: "aiCategoryEnrichment";
  suggestionId?: string;
  notificationId?: number;
  workspaceId?: number;
  movementType?: "expense" | "income" | "transfer";
  amount?: string;
  accountId?: number;
  destinationAccountId?: number;
  categoryId?: number;
  newCategoryName?: string;
  counterpartyId?: number;
  newCounterpartyName?: string;
  counterpartyType?: "person" | "company" | "merchant" | "service" | "bank" | "other";
  recurringType?: "subscription" | "recurring_income";
  recurringName?: string;
  recurringFrequency?: "weekly" | "biweekly" | "monthly" | "quarterly" | "yearly";
  recurringIntervalCount?: number;
  description?: string;
  runtimeContextJson?: string;
};

const nativeDetection = NativeModules.NotificationDetection as
  | {
      getSuggestions?: () => Promise<NativeDetectedMovementSuggestion[]>;
      markSuggestionRegistered?: (suggestionId: string, notificationId: number) => void;
      showSuggestionNotification?: (suggestionId: string) => void;
      setSuggestionAiCategoryRecommendation?: (suggestionId: string, recommendationJson: string) => void;
      setLastSaveError?: (suggestionId: string, message: string) => void;
      requestCancelBankNotification?: (suggestionId: string) => void;
      tryClaimSuggestionRegistration?: (suggestionId: string) => Promise<boolean>;
      releaseSuggestionRegistrationClaim?: (suggestionId: string) => void;
    }
  | undefined;

function parseAmountLabel(amountLabel?: string | null): number | null {
  if (!amountLabel) return null;
  const match = amountLabel.match(/([0-9]+(?:[.,][0-9]{1,2})?)/);
  if (!match) return null;
  const amount = Number(match[1].replace(",", "."));
  return Number.isFinite(amount) && amount > 0 ? amount : null;
}

function currencyFromAmountLabel(amountLabel?: string | null) {
  return /usd|\$/i.test(amountLabel ?? "") && !/S\//i.test(amountLabel ?? "") ? "USD" : "PEN";
}

function setNativeAiCategoryRecommendation(suggestionId: string, value: unknown) {
  nativeDetection?.setSuggestionAiCategoryRecommendation?.(suggestionId, JSON.stringify(value ?? null));
}

function movementInsertPayload(workspaceId: number, input: MovementFormInput) {
  return {
    workspace_id: workspaceId,
    movement_type: input.movementType,
    status: input.status,
    occurred_at: input.occurredAt,
    description: input.description,
    notes: input.notes ?? null,
    source_account_id: input.sourceAccountId,
    source_amount: input.sourceAmount,
    destination_account_id: input.destinationAccountId,
    destination_amount: input.destinationAmount,
    fx_rate: input.fxRate ?? null,
    category_id: input.categoryId ?? null,
    counterparty_id: input.counterpartyId ?? null,
    obligation_id: input.obligationId ?? null,
    subscription_id: input.subscriptionId ?? null,
    metadata: input.metadata ?? {},
  };
}

function jsonValueOrNull(value: unknown): JsonValue | null {
  if (value == null) return null;
  try {
    return JSON.parse(JSON.stringify(value)) as JsonValue;
  } catch {
    return null;
  }
}

function parseRuntimeContext(raw?: string): any {
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function deserializeNumericKeyedMap(raw: unknown): Map<number, { id: number; count: number }[]> {
  const out = new Map<number, { id: number; count: number }[]>();
  if (!raw || typeof raw !== "object") return out;
  for (const [key, entries] of Object.entries(raw as Record<string, unknown>)) {
    const numericKey = Number(key);
    if (!Number.isFinite(numericKey) || numericKey <= 0) continue;
    if (!Array.isArray(entries)) continue;
    const cleaned = entries
      .map((entry: any) => ({ id: Number(entry?.id), count: Number(entry?.count) }))
      .filter((entry) => entry.id > 0 && entry.count > 0);
    if (cleaned.length > 0) out.set(numericKey, cleaned);
  }
  return out;
}

function patternMapsFromRuntimeContext(runtimeContext: any): PatternMaps {
  const wordToCategory = new Map<string, { id: number; count: number }[]>();
  const rawWordMap = runtimeContext?.wordToCategory;
  if (rawWordMap && typeof rawWordMap === "object") {
    for (const [word, entries] of Object.entries(rawWordMap)) {
      if (!Array.isArray(entries)) continue;
      wordToCategory.set(
        word,
        entries
          .map((entry: any) => ({ id: Number(entry?.id), count: Number(entry?.count) }))
          .filter((entry) => entry.id > 0 && entry.count > 0),
      );
    }
  }
  return {
    wordToCategory,
    counterpartyToCategory: deserializeNumericKeyedMap(runtimeContext?.counterpartyToCategory),
    categoryToCounterparty: deserializeNumericKeyedMap(runtimeContext?.categoryToCounterparty),
    counterpartyToAccount: deserializeNumericKeyedMap(runtimeContext?.counterpartyToAccount),
  };
}

async function enrichAiCategorySuggestion(payload: HeadlessPayload) {
  if (!supabase || !payload.suggestionId) return;
  const runtimeContext = parseRuntimeContext(payload.runtimeContextJson);
  const workspaceId = Number(payload.workspaceId ?? runtimeContext?.workspaceId ?? 0);
  if (!workspaceId) return;

  const movementType = payload.movementType === "income" ? "income" : "expense";
  const categories = filterCategoriesForMovementType(
    Array.isArray(runtimeContext?.categories) ? runtimeContext.categories : [],
    movementType,
  );
  const description = payload.description?.trim() ?? "";
  if (!description || categories.length === 0) {
    setNativeAiCategoryRecommendation(payload.suggestionId, { status: "unavailable" });
    return;
  }

  setNativeAiCategoryRecommendation(payload.suggestionId, { status: "pending" });
  const result = await orchestrateCategoryAiRecommendation({
    workspaceId,
    surface: "android_overlay",
    movementType,
    description,
    amount: parseAmountLabel(payload.amount),
    currencyCode: currencyFromAmountLabel(payload.amount),
    occurredAt: new Date().toISOString(),
    categories,
    patternMaps: patternMapsFromRuntimeContext(runtimeContext),
    canCallAi: true,
  });

  if (result.status === "ai_resolved" && result.recommendation) {
    setNativeAiCategoryRecommendation(payload.suggestionId, result.recommendation);
  } else if (result.status === "local_confident" || result.status === "local_only") {
    // La IA NO falló: la sugerencia local ya era confiable (o no se llamó por diseño). El overlay
    // debe mostrar "IA confirmó tu categoría", no "IA no disponible".
    setNativeAiCategoryRecommendation(payload.suggestionId, { status: "local_confirmed" });
  } else {
    setNativeAiCategoryRecommendation(payload.suggestionId, { status: "unavailable" });
  }
}

export async function notificationDetectionHeadlessTask(payload: HeadlessPayload) {
  if (!supabase || !payload.suggestionId) return;
  if (payload.taskMode === "aiCategoryEnrichment") {
    await enrichAiCategorySuggestion(payload);
    return;
  }
  // Anti-doble-ejecución: si otro headless task (mismo suggestionId) ya está corriendo, abortamos.
  // Cubre: doble-tap accidental, re-disparo del bridge tras re-foreground, y el caso donde el
  // usuario toca "Registro rápido" + cuerpo de la notif en sucesión rápida.
  const claimed = await nativeDetection?.tryClaimSuggestionRegistration?.(payload.suggestionId).catch(() => false);
  if (claimed === false) {
    logWarn("notification-detection-headless", "Registration claim denied; another flow is in-flight or done", {
      suggestionId: payload.suggestionId,
    });
    return;
  }
  try {
    await runRegistrationFlow(payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logError("notification-detection-headless", "Registration flow failed permanently", {
      suggestionId: payload.suggestionId,
      message,
    });
    nativeDetection?.setLastSaveError?.(payload.suggestionId, message);
    nativeDetection?.showSuggestionNotification?.(payload.suggestionId);
    // Liberamos el claim ante fallo permanente para permitir un retry posterior desde la app.
    nativeDetection?.releaseSuggestionRegistrationClaim?.(payload.suggestionId);
  }
}

async function runRegistrationFlow(payload: HeadlessPayload) {
  if (!supabase || !payload.suggestionId) return;
  const amount = Number(String(payload.amount ?? "").replace(",", "."));
  if (!Number.isFinite(amount) || amount <= 0 || !payload.accountId) return;

  const userResult = await withTimeout(supabase.auth.getUser(), HEADLESS_QUERY_TIMEOUT_MS, "auth.getUser");
  const userId = userResult.data.user?.id;
  if (!userId) return;

  const nativeSuggestions = await nativeDetection?.getSuggestions?.();
  const nativeSuggestion = nativeSuggestions?.find((item) => item.id === payload.suggestionId);
  if (!nativeSuggestion) return;

  let workspaceId = Number(payload.workspaceId ?? 0);
  if (!workspaceId) {
    const { data: workspaceRows } = await withTimeout(
      supabase
        .from("workspace_members")
        .select("workspace_id, is_default_workspace")
        .eq("user_id", userId)
        .order("is_default_workspace", { ascending: false })
        .limit(1),
      HEADLESS_QUERY_TIMEOUT_MS,
      "workspace_members.select",
    );
    workspaceId = Number(workspaceRows?.[0]?.workspace_id);
  }
  if (!workspaceId) return;

  const suggestion = await withRetry(
    () => syncNativeDetectedSuggestion({ userId, workspaceId, nativeSuggestion }),
    {
      label: "syncNativeDetectedSuggestion",
      retries: HEADLESS_RETRIES,
      timeoutMs: HEADLESS_QUERY_TIMEOUT_MS,
      onAttemptFailed: reportFailedAttempt("syncNativeDetectedSuggestion", payload.suggestionId),
    },
  );
  if (!suggestion || suggestion.status === "registered" || suggestion.movementId) {
    nativeDetection?.markSuggestionRegistered?.(payload.suggestionId, payload.notificationId ?? 0);
    nativeDetection?.requestCancelBankNotification?.(payload.suggestionId);
    return;
  }

  const movementType =
    payload.movementType === "income"
      ? "income"
      : payload.movementType === "transfer"
        ? "transfer"
        : "expense";
  const description = payload.description?.trim() || suggestion.description;

  if (movementType === "transfer") {
    const destinationAccountId = Number(payload.destinationAccountId ?? 0);
    if (!destinationAccountId || destinationAccountId === payload.accountId) {
      nativeDetection?.showSuggestionNotification?.(payload.suggestionId);
      return;
    }
    const { data: accountRows } = await supabase
      .from("accounts")
      .select("id, currency_code")
      .eq("workspace_id", workspaceId)
      .in("id", [payload.accountId, destinationAccountId]);
    const srcCur = (accountRows ?? []).find((a: any) => Number(a.id) === Number(payload.accountId))?.currency_code;
    const dstCur = (accountRows ?? []).find((a: any) => Number(a.id) === destinationAccountId)?.currency_code;
    if (srcCur && dstCur && srcCur !== dstCur) {
      // Distinta moneda: requiere tipo de cambio. No inventamos tasa; se completa en la app.
      nativeDetection?.showSuggestionNotification?.(payload.suggestionId);
      return;
    }
    const movementInput = buildMovementCreateInput({
      movementType: "transfer",
      status: "posted",
      occurredAt: suggestion.occurredAt,
      description,
      notes: null,
      sourceAccountId: payload.accountId,
      sourceAmount: amount,
      destinationAccountId,
      destinationAmount: amount,
      transferCurrenciesDiffer: false,
      fxRate: null,
      metadata: {
        source: "notification_detection_overlay",
        suggestionId: suggestion.id,
        financialAppKey: suggestion.financialAppKey,
        confidence: suggestion.confidence,
      },
    });
    const { data: transferMovement, error: transferError } = await withRetry(
      () =>
        supabase!
          .from("movements")
          .insert(movementInsertPayload(workspaceId, movementInput))
          .select("id")
          .single(),
      {
        label: "movements.insert (transfer)",
        retries: HEADLESS_RETRIES,
        timeoutMs: HEADLESS_QUERY_TIMEOUT_MS,
        onAttemptFailed: reportFailedAttempt("movements.insert (transfer)", payload.suggestionId),
      },
    );
    if (transferError || !transferMovement?.id) {
      logError("notification-detection-headless", "Transfer insert failed after retries", {
        suggestionId: payload.suggestionId,
        error: transferError?.message ?? "no movement id returned",
      });
      nativeDetection?.setLastSaveError?.(payload.suggestionId, transferError?.message ?? "No se pudo guardar la transferencia");
      nativeDetection?.showSuggestionNotification?.(payload.suggestionId);
      return;
    }
    const transferVerified = await verifyMovementExists(transferMovement.id);
    if (!transferVerified) {
      logError("notification-detection-headless", "Transfer insert returned id but verify failed", {
        suggestionId: payload.suggestionId,
        movementId: transferMovement.id,
      });
      nativeDetection?.setLastSaveError?.(payload.suggestionId, "No se pudo confirmar la transferencia en el servidor");
      nativeDetection?.showSuggestionNotification?.(payload.suggestionId);
      return;
    }
    await supabase
      .from("notification_detected_movement_suggestions")
      .update({ status: "registered", movement_id: transferMovement.id, updated_at: new Date().toISOString() })
      .eq("id", suggestion.id);
    await supabase
      .from("notifications")
      .update({
        status: "read",
        read_at: new Date().toISOString(),
        payload: {
          suggestionId: suggestion.id,
          amount,
          currencyCode: srcCur ?? suggestion.currencyCode,
          appLabel: suggestion.appLabel,
          status: "registered",
        },
      })
      .eq("related_entity_type", "detected_movement_suggestion")
      .eq("related_entity_id", suggestion.id)
      .eq("kind", "detected_movement_suggestion");
    await recordSuggestionAction({
      userId,
      workspaceId,
      suggestionId: suggestion.id,
      dedupeKey: suggestion.dedupeKey,
      action: "register",
      surface: "overlay",
      confidenceAtDecision: suggestion.confidence,
      metadata: { movementType: "transfer", financialAppKey: suggestion.financialAppKey },
    });
    nativeDetection?.markSuggestionRegistered?.(payload.suggestionId, payload.notificationId ?? 0);
    nativeDetection?.requestCancelBankNotification?.(payload.suggestionId);
    return;
  }

  let categoryId = payload.categoryId ?? null;
  let counterpartyId = payload.counterpartyId ?? null;
  let subscriptionId: number | null = null;
  let recurringIncomeId: number | null = null;
  const { data: selectedAccountRow } = await supabase
    .from("accounts")
    .select("currency_code")
    .eq("workspace_id", workspaceId)
    .eq("id", payload.accountId)
    .maybeSingle();
  const selectedAccountCurrencyCode = String((selectedAccountRow as { currency_code?: unknown } | null)?.currency_code ?? suggestion.currencyCode);
  const newCategoryName = payload.newCategoryName?.trim().replace(/\s+/g, " ") ?? "";
  if (!categoryId && newCategoryName.length >= 3) {
    const normalizedNewName = newCategoryName
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();
    const { data: existingCategories } = await supabase
      .from("categories")
      .select("id, name")
      .eq("workspace_id", workspaceId)
      .eq("is_active", true);
    const existing = (existingCategories ?? []).find((category: any) => {
      const normalizedName = String(category.name ?? "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/\s+/g, " ")
        .trim();
      return normalizedName === normalizedNewName;
    });
    if (existing?.id) {
      categoryId = Number(existing.id);
    } else {
      const { data: maxRow } = await supabase
        .from("categories")
        .select("sort_order")
        .eq("workspace_id", workspaceId)
        .order("sort_order", { ascending: false })
        .limit(1)
        .maybeSingle();
      const maxSort = Number((maxRow as { sort_order?: unknown } | null)?.sort_order ?? 0);
      const { data: createdCategory } = await supabase
        .from("categories")
        .insert({
          workspace_id: workspaceId,
          created_by_user_id: userId,
          name: newCategoryName,
          kind: movementType,
          parent_id: null,
          color: null,
          icon: null,
          is_active: true,
          is_system: false,
          sort_order: Number.isFinite(maxSort) ? maxSort + 10 : 10,
        })
        .select("id")
        .single();
      if (createdCategory?.id) categoryId = Number(createdCategory.id);
    }
  }
  const newCounterpartyName = payload.newCounterpartyName?.trim().replace(/\s+/g, " ") ?? "";
  if (!counterpartyId && newCounterpartyName.length >= 3) {
    const normalizedNewName = newCounterpartyName
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();
    const { data: existingCounterparties } = await supabase
      .from("counterparties")
      .select("id, name")
      .eq("workspace_id", workspaceId)
      .eq("is_archived", false);
    const existing = (existingCounterparties ?? []).find((counterparty: any) => {
      const normalizedName = String(counterparty.name ?? "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/\s+/g, " ")
        .trim();
      return normalizedName === normalizedNewName;
    });
    if (existing?.id) {
      counterpartyId = Number(existing.id);
    } else {
      const type = payload.counterpartyType && ["person", "company", "merchant", "service", "bank", "other"].includes(payload.counterpartyType)
        ? payload.counterpartyType
        : "merchant";
      const { data: createdCounterparty } = await supabase
        .from("counterparties")
        .insert({
          workspace_id: workspaceId,
          name: newCounterpartyName,
          type,
          phone: null,
          email: null,
          document_number: null,
          notes: null,
          is_archived: false,
        })
        .select("id")
        .single();
      if (createdCounterparty?.id) counterpartyId = Number(createdCounterparty.id);
    }
  }
  const recurringName = payload.recurringName?.trim().replace(/\s+/g, " ") ?? "";
  const recurringFrequency = payload.recurringFrequency && ["weekly", "biweekly", "monthly", "quarterly", "yearly"].includes(payload.recurringFrequency)
    ? payload.recurringFrequency
    : null;
  const recurringIntervalCount = Math.max(1, Number(payload.recurringIntervalCount ?? (recurringFrequency === "biweekly" ? 2 : 1)) || 1);
  const scheduleFrequency = recurringFrequency === "biweekly" ? "weekly" : recurringFrequency;
  const scheduleInterval = recurringFrequency === "biweekly" ? 2 : recurringIntervalCount;
  const scheduleDate = String(suggestion.occurredAt ?? new Date().toISOString()).slice(0, 10);
  const dayOfMonth = Math.max(1, Math.min(31, Number(scheduleDate.slice(8, 10)) || 1));
  const dayOfWeek = new Date(`${scheduleDate}T12:00:00`).getDay();
  if (recurringName.length >= 3 && scheduleFrequency) {
    if (movementType === "expense" && payload.recurringType === "subscription") {
      const { data: createdSubscription } = await supabase
        .from("subscriptions")
        .insert({
          workspace_id: workspaceId,
          created_by_user_id: userId,
          name: recurringName,
          vendor_party_id: counterpartyId,
          account_id: payload.accountId,
          category_id: categoryId,
          amount,
          currency_code: selectedAccountCurrencyCode,
          frequency: scheduleFrequency,
          interval_count: scheduleInterval,
          day_of_month: ["monthly", "quarterly", "yearly"].includes(scheduleFrequency) ? dayOfMonth : null,
          day_of_week: scheduleFrequency === "weekly" ? dayOfWeek : null,
          start_date: scheduleDate,
          next_due_date: scheduleDate,
          end_date: null,
          remind_days_before: 3,
          auto_create_movement: false,
          description,
          notes: "Creada desde sugerencia recurrente del overlay.",
          status: "active",
        })
        .select("id")
        .single();
      if (createdSubscription?.id) subscriptionId = Number(createdSubscription.id);
    } else if (movementType === "income" && payload.recurringType === "recurring_income") {
      const { data: createdRecurringIncome } = await supabase
        .from("recurring_income")
        .insert({
          workspace_id: workspaceId,
          created_by_user_id: userId,
          name: recurringName,
          payer_party_id: counterpartyId,
          account_id: payload.accountId,
          category_id: categoryId,
          amount,
          currency_code: selectedAccountCurrencyCode,
          frequency: scheduleFrequency,
          interval_count: scheduleInterval,
          day_of_month: ["monthly", "quarterly", "yearly"].includes(scheduleFrequency) ? dayOfMonth : null,
          day_of_week: scheduleFrequency === "weekly" ? dayOfWeek : null,
          start_date: scheduleDate,
          next_expected_date: scheduleDate,
          end_date: null,
          remind_days_before: 3,
          description,
          notes: "Creado desde sugerencia recurrente del overlay.",
          status: "active",
        })
        .select("id")
        .single();
      if (createdRecurringIncome?.id) recurringIncomeId = Number(createdRecurringIncome.id);
    }
  }
  const duplicate = await findPossibleDuplicateMovement({
    workspaceId,
    movementType,
    accountId: payload.accountId,
    amount,
    occurredAt: suggestion.occurredAt,
    description,
  }).catch(() => null);
  if (duplicate) {
    nativeDetection?.showSuggestionNotification?.(payload.suggestionId);
    return;
  }

  const movementInput = buildMovementCreateInput({
    movementType,
    status: "posted",
    occurredAt: suggestion.occurredAt,
    description,
    notes: null,
    sourceAccountId: payload.accountId,
    sourceAmount: amount,
    destinationAccountId: payload.accountId,
    destinationAmount: amount,
    transferCurrenciesDiffer: false,
    fxRate: null,
    categoryId,
    counterpartyId,
    subscriptionId,
    metadata: {
        source: "notification_detection_overlay",
        suggestionId: suggestion.id,
        financialAppKey: suggestion.financialAppKey,
        confidence: suggestion.confidence,
        categoryAi: jsonValueOrNull(nativeSuggestion.aiCategoryRecommendation),
        counterpartyAi: jsonValueOrNull(nativeSuggestion.counterpartyRecommendation),
        recurringAi: jsonValueOrNull(nativeSuggestion.recurringRecommendation),
        riskAi: jsonValueOrNull(nativeSuggestion.riskExplanation),
        budgetAi: jsonValueOrNull(nativeSuggestion.budgetImpact),
        recurring_income_id: recurringIncomeId,
      },
  });
  const { data: movement, error: movementError } = await withRetry(
    () =>
      supabase!
        .from("movements")
        .insert(movementInsertPayload(workspaceId, movementInput))
        .select("id")
        .single(),
    {
      label: "movements.insert",
      retries: HEADLESS_RETRIES,
      timeoutMs: HEADLESS_QUERY_TIMEOUT_MS,
      onAttemptFailed: reportFailedAttempt("movements.insert", payload.suggestionId),
    },
  );
  if (movementError || !movement?.id) {
    logError("notification-detection-headless", "Movement insert failed after retries", {
      suggestionId: payload.suggestionId,
      error: movementError?.message ?? "no movement id returned",
    });
    nativeDetection?.setLastSaveError?.(payload.suggestionId, movementError?.message ?? "No se pudo guardar el movimiento");
    nativeDetection?.showSuggestionNotification?.(payload.suggestionId);
    return;
  }
  const verified = await verifyMovementExists(movement.id);
  if (!verified) {
    logError("notification-detection-headless", "Movement insert returned id but verify failed", {
      suggestionId: payload.suggestionId,
      movementId: movement.id,
    });
    nativeDetection?.setLastSaveError?.(payload.suggestionId, "No se pudo confirmar el movimiento en el servidor");
    nativeDetection?.showSuggestionNotification?.(payload.suggestionId);
    return;
  }

  await supabase
    .from("notification_detected_movement_suggestions")
    .update({
      status: "registered",
      movement_id: movement.id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", suggestion.id);
  await supabase
    .from("notifications")
    .update({
      status: "read",
      read_at: new Date().toISOString(),
      payload: {
          suggestionId: suggestion.id,
          amount,
          currencyCode: selectedAccountCurrencyCode,
          appLabel: suggestion.appLabel,
          status: "registered",
        },
    })
    .eq("related_entity_type", "detected_movement_suggestion")
    .eq("related_entity_id", suggestion.id)
    .eq("kind", "detected_movement_suggestion");
  const aiCategoryRec = nativeSuggestion.aiCategoryRecommendation as
    | { categoryId?: number | null; newCategoryName?: string | null; confidence?: number | null; type?: string | null }
    | null
    | undefined;
  const aiSuggestedCategoryId = aiCategoryRec?.categoryId != null ? Number(aiCategoryRec.categoryId) : null;
  const aiSuggestedNewName = aiCategoryRec?.newCategoryName?.trim() ?? null;
  const userKeptAiCategory =
    (aiSuggestedCategoryId != null && categoryId != null && aiSuggestedCategoryId === categoryId) ||
    (aiSuggestedNewName != null && (payload.newCategoryName?.trim() ?? "") === aiSuggestedNewName);
  if (aiCategoryRec && (aiSuggestedCategoryId != null || aiSuggestedNewName)) {
    await recordSuggestionAction({
      userId,
      workspaceId,
      suggestionId: suggestion.id,
      dedupeKey: suggestion.dedupeKey,
      action: userKeptAiCategory ? "accept_category" : "override_category",
      surface: "overlay",
      confidenceAtDecision: aiCategoryRec.confidence ?? null,
      suggestedValue: aiSuggestedCategoryId != null ? String(aiSuggestedCategoryId) : aiSuggestedNewName,
      finalValue: categoryId != null ? String(categoryId) : (payload.newCategoryName ?? null),
      metadata: { aiType: aiCategoryRec.type ?? null },
    });
  }
  await recordSuggestionAction({
    userId,
    workspaceId,
    suggestionId: suggestion.id,
    dedupeKey: suggestion.dedupeKey,
    action: "register",
    surface: "overlay",
    confidenceAtDecision: suggestion.confidence,
    metadata: { movementType, financialAppKey: suggestion.financialAppKey },
  });
  nativeDetection?.markSuggestionRegistered?.(payload.suggestionId, payload.notificationId ?? 0);
  nativeDetection?.requestCancelBankNotification?.(payload.suggestionId);
}
