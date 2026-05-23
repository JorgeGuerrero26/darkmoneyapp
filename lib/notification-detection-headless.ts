import { NativeModules } from "react-native";

import { supabase } from "./supabase";
import {
  findPossibleDuplicateMovement,
  syncNativeDetectedSuggestion,
  type NativeDetectedMovementSuggestion,
} from "../services/queries/notification-detection";
import { scoreCategoryFromDescription, type PatternMaps } from "./movement-patterns";
import { requestMovementCategoryAiSuggestion, type MovementFormInput } from "../services/queries/workspace-data";
import { buildMovementCreateInput } from "../features/movements/lib/movement-save-contract";
import type { JsonValue } from "../types/domain";

const LOCAL_CATEGORY_AI_CONFIDENCE_THRESHOLD = 0.6;

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
    counterpartyToCategory: new Map(),
    categoryToCounterparty: new Map(),
    counterpartyToAccount: new Map(),
  };
}

async function enrichAiCategorySuggestion(payload: HeadlessPayload) {
  if (!supabase || !payload.suggestionId) return;
  const runtimeContext = parseRuntimeContext(payload.runtimeContextJson);
  const workspaceId = Number(payload.workspaceId ?? runtimeContext?.workspaceId ?? 0);
  if (!workspaceId) return;

  const movementType = payload.movementType === "income" ? "income" : "expense";
  const compatibleKind = movementType === "income" ? "income" : "expense";
  const categories = Array.isArray(runtimeContext?.categories)
    ? runtimeContext.categories
      .filter((category: any) => category?.isActive !== false && (category?.kind === "both" || category?.kind === compatibleKind))
      .map((category: any) => ({ id: Number(category.id), name: String(category.name ?? ""), kind: String(category.kind ?? compatibleKind) }))
      .filter((category: any) => category.id > 0 && category.name.trim().length > 0)
    : [];
  const description = payload.description?.trim();
  if (!description || categories.length === 0) {
    setNativeAiCategoryRecommendation(payload.suggestionId, { status: "unavailable" });
    return;
  }

  const scoredLocal = scoreCategoryFromDescription(description, patternMapsFromRuntimeContext(runtimeContext));
  const localCategory = scoredLocal ? categories.find((category: any) => category.id === scoredLocal.categoryId) : null;
  const localSuggestion = scoredLocal && localCategory
    ? {
      categoryId: localCategory.id,
      categoryName: localCategory.name,
      confidence: scoredLocal.confidence,
      reasons: scoredLocal.reasons,
    }
    : null;
  if (localSuggestion && localSuggestion.confidence >= LOCAL_CATEGORY_AI_CONFIDENCE_THRESHOLD) {
    setNativeAiCategoryRecommendation(payload.suggestionId, { status: "unavailable" });
    return;
  }

  setNativeAiCategoryRecommendation(payload.suggestionId, { status: "pending" });
  const response = await requestMovementCategoryAiSuggestion({
    workspaceId,
    surface: "android_overlay",
    movementType,
    amount: parseAmountLabel(payload.amount),
    currencyCode: currencyFromAmountLabel(payload.amount),
    description,
    occurredAt: new Date().toISOString(),
    categories,
    localSuggestion,
  }).catch(() => null);

  if (!response?.ok || !response.recommendation) {
    setNativeAiCategoryRecommendation(payload.suggestionId, { status: "unavailable" });
    return;
  }
  setNativeAiCategoryRecommendation(payload.suggestionId, response.recommendation);
}

export async function notificationDetectionHeadlessTask(payload: HeadlessPayload) {
  if (!supabase || !payload.suggestionId) return;
  if (payload.taskMode === "aiCategoryEnrichment") {
    await enrichAiCategorySuggestion(payload);
    return;
  }
  const amount = Number(String(payload.amount ?? "").replace(",", "."));
  if (!Number.isFinite(amount) || amount <= 0 || !payload.accountId) return;

  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) return;

  const nativeSuggestions = await nativeDetection?.getSuggestions?.();
  const nativeSuggestion = nativeSuggestions?.find((item) => item.id === payload.suggestionId);
  if (!nativeSuggestion) return;

  let workspaceId = Number(payload.workspaceId ?? 0);
  if (!workspaceId) {
    const { data: workspaceRows } = await supabase
      .from("workspace_members")
      .select("workspace_id, is_default_workspace")
      .eq("user_id", userId)
      .order("is_default_workspace", { ascending: false })
      .limit(1);
    workspaceId = Number(workspaceRows?.[0]?.workspace_id);
  }
  if (!workspaceId) return;

  const suggestion = await syncNativeDetectedSuggestion({ userId, workspaceId, nativeSuggestion });
  if (!suggestion || suggestion.status === "registered" || suggestion.movementId) {
    nativeDetection?.markSuggestionRegistered?.(payload.suggestionId, payload.notificationId ?? 0);
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
    const { data: transferMovement, error: transferError } = await supabase
      .from("movements")
      .insert(movementInsertPayload(workspaceId, movementInput))
      .select("id")
      .single();
    if (transferError) {
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
    nativeDetection?.markSuggestionRegistered?.(payload.suggestionId, payload.notificationId ?? 0);
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
  const { data: movement, error: movementError } = await supabase
    .from("movements")
    .insert(movementInsertPayload(workspaceId, movementInput))
    .select("id")
    .single();
  if (movementError) {
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
  nativeDetection?.markSuggestionRegistered?.(payload.suggestionId, payload.notificationId ?? 0);
}
