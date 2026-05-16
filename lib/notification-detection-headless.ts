import { NativeModules } from "react-native";

import { supabase } from "./supabase";
import {
  findPossibleDuplicateMovement,
  syncNativeDetectedSuggestion,
  type NativeDetectedMovementSuggestion,
} from "../services/queries/notification-detection";

type HeadlessPayload = {
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
};

const nativeDetection = NativeModules.NotificationDetection as
  | {
      getSuggestions?: () => Promise<NativeDetectedMovementSuggestion[]>;
      markSuggestionRegistered?: (suggestionId: string, notificationId: number) => void;
      showSuggestionNotification?: (suggestionId: string) => void;
    }
  | undefined;

export async function notificationDetectionHeadlessTask(payload: HeadlessPayload) {
  if (!supabase || !payload.suggestionId) return;
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
    const { data: transferMovement, error: transferError } = await supabase
      .from("movements")
      .insert({
        workspace_id: workspaceId,
        movement_type: "transfer",
        status: "posted",
        occurred_at: suggestion.occurredAt,
        description,
        notes: null,
        source_account_id: payload.accountId,
        source_amount: amount,
        destination_account_id: destinationAccountId,
        destination_amount: amount,
        fx_rate: null,
        category_id: null,
        counterparty_id: null,
        subscription_id: null,
        metadata: {
          source: "notification_detection_overlay",
          suggestionId: suggestion.id,
          financialAppKey: suggestion.financialAppKey,
          confidence: suggestion.confidence,
        },
      })
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
          currencyCode: suggestion.currencyCode,
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
          currency_code: suggestion.currencyCode,
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
          currency_code: suggestion.currencyCode,
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

  const { data: movement, error: movementError } = await supabase
    .from("movements")
    .insert({
      workspace_id: workspaceId,
      movement_type: movementType,
      status: "posted",
      occurred_at: suggestion.occurredAt,
      description,
      notes: null,
      source_account_id: movementType === "expense" ? payload.accountId : null,
      source_amount: movementType === "expense" ? amount : null,
      destination_account_id: movementType === "income" ? payload.accountId : null,
      destination_amount: movementType === "income" ? amount : null,
      fx_rate: null,
      category_id: categoryId,
      counterparty_id: counterpartyId,
      subscription_id: subscriptionId,
      metadata: {
        source: "notification_detection_overlay",
        suggestionId: suggestion.id,
        financialAppKey: suggestion.financialAppKey,
        confidence: suggestion.confidence,
        categoryAi: nativeSuggestion.aiCategoryRecommendation ?? null,
        counterpartyAi: nativeSuggestion.counterpartyRecommendation ?? null,
        recurringAi: nativeSuggestion.recurringRecommendation ?? null,
        riskAi: nativeSuggestion.riskExplanation ?? null,
        budgetAi: nativeSuggestion.budgetImpact ?? null,
        recurring_income_id: recurringIncomeId,
      },
    })
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
        currencyCode: suggestion.currencyCode,
        appLabel: suggestion.appLabel,
        status: "registered",
      },
    })
    .eq("related_entity_type", "detected_movement_suggestion")
    .eq("related_entity_id", suggestion.id)
    .eq("kind", "detected_movement_suggestion");
  nativeDetection?.markSuggestionRegistered?.(payload.suggestionId, payload.notificationId ?? 0);
}
