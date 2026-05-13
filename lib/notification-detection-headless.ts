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
  movementType?: "expense" | "income";
  amount?: string;
  accountId?: number;
  categoryId?: number;
  newCategoryName?: string;
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

  const movementType = payload.movementType === "income" ? "income" : "expense";
  const description = payload.description?.trim() || suggestion.description;
  let categoryId = payload.categoryId ?? null;
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
      counterparty_id: null,
      metadata: {
        source: "notification_detection_overlay",
        suggestionId: suggestion.id,
        financialAppKey: suggestion.financialAppKey,
        confidence: suggestion.confidence,
        categoryAi: nativeSuggestion.aiCategoryRecommendation ?? null,
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
