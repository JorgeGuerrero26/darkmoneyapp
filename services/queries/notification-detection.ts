import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "../../lib/supabase";
import {
  FINANCIAL_APPS,
  getFinancialAppByKey,
  resolveFinancialAppByPackage,
  type FinancialAppKey,
} from "../../lib/notification-detection-apps";
import type { MovementFormInput } from "./workspace-data";
import type { JsonValue, MovementRecord, MovementType } from "../../types/domain";

export type DetectedMovementStatus = "pending" | "registered" | "discarded";
export type DetectedMovementConfidence = "high" | "medium" | "low";

export type NotificationDetectionAppSetting = {
  financialAppKey: FinancialAppKey;
  enabled: boolean;
  defaultAccountId: number | null;
};

export type DetectedMovementSuggestion = {
  id: number;
  userId: string;
  workspaceId: number;
  financialAppKey: FinancialAppKey;
  packageName: string;
  appLabel: string;
  movementType: "expense" | "income" | "transfer" | "unknown";
  amount: number;
  currencyCode: "PEN" | "USD";
  description: string;
  occurredAt: string;
  confidence: DetectedMovementConfidence;
  dedupeKey: string;
  notificationKey: string | null;
  status: DetectedMovementStatus;
  movementId: number | null;
  metadata: JsonValue | null;
  createdAt: string;
  updatedAt: string;
};

export type NativeDetectedMovementSuggestion = {
  id: string;
  status: string;
  packageName: string;
  financialAppKey?: string;
  appName: string;
  title?: string;
  text?: string;
  subText?: string;
  postTime?: number;
  notificationKey?: string;
  amountLabel?: string;
  movementType?: string;
  confidence?: string;
  aiCategoryRecommendation?: unknown;
  descriptionCleanup?: unknown;
  counterpartyRecommendation?: unknown;
  recurringRecommendation?: unknown;
  riskExplanation?: unknown;
  budgetImpact?: unknown;
  createdAt?: number;
  updatedAt?: number;
  notificationId?: number;
};

export type DuplicateMovementInput = {
  workspaceId: number;
  movementType: MovementType;
  accountId: number | null;
  amount: number;
  occurredAt: string;
  description: string;
};

function isPackageName(s?: string | null): boolean {
  return Boolean(s && s.includes(".") && /^[a-z]/.test(s));
}

function humanizeDescription(description: string, fallback: string): string {
  return isPackageName(description) ? fallback : description;
}

function normalizeDescription(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .trim();
}

function dateKey(value: string | number | null | undefined) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return new Date().toISOString().slice(0, 10);
  return date.toISOString().slice(0, 10);
}

function parseAmountLabel(amountLabel?: string | null): { amount: number; currencyCode: "PEN" | "USD" } | null {
  if (!amountLabel) return null;
  const currencyCode = /usd|\$/i.test(amountLabel) && !/S\//i.test(amountLabel) ? "USD" : "PEN";
  const match = amountLabel.match(/([0-9]+(?:[.,][0-9]{1,2})?)/);
  if (!match) return null;
  const amount = Number(match[1].replace(",", "."));
  return Number.isFinite(amount) && amount > 0 ? { amount, currencyCode } : null;
}

function mapSuggestion(row: any): DetectedMovementSuggestion {
  return {
    id: Number(row.id),
    userId: row.user_id,
    workspaceId: Number(row.workspace_id),
    financialAppKey: row.financial_app_key,
    packageName: row.package_name,
    appLabel: row.app_label,
    movementType: row.movement_type,
    amount: Number(row.amount),
    currencyCode: row.currency_code,
    description: row.description,
    occurredAt: row.occurred_at,
    confidence: row.confidence,
    dedupeKey: row.dedupe_key,
    notificationKey: row.notification_key ?? null,
    status: row.status,
    movementId: row.movement_id == null ? null : Number(row.movement_id),
    metadata: row.metadata ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function buildDedupeKey(input: {
  userId: string;
  workspaceId: number;
  financialAppKey: string;
  packageName: string;
  movementType: string;
  amount: number;
  currencyCode: string;
  description: string;
  occurredAt: string;
  notificationKey?: string | null;
}) {
  const base = [
    input.userId,
    input.workspaceId,
    input.financialAppKey,
    input.packageName,
    input.movementType,
    input.currencyCode,
    input.amount.toFixed(2),
    normalizeDescription(input.description),
    dateKey(input.occurredAt),
  ].join("|");
  return input.notificationKey ? `${base}|${input.notificationKey}` : base;
}

export function useNotificationDetectionSettingsQuery(userId?: string | null, workspaceId?: number | null) {
  return useQuery({
    queryKey: ["notification-detection-settings", userId ?? null, workspaceId ?? null],
    enabled: Boolean(supabase && userId && workspaceId),
    queryFn: async (): Promise<NotificationDetectionAppSetting[]> => {
      if (!supabase || !userId || !workspaceId) return [];
      const { data, error } = await supabase
        .from("notification_detection_app_settings")
        .select("financial_app_key, enabled, default_account_id")
        .eq("user_id", userId)
        .eq("workspace_id", workspaceId);
      if (error) throw new Error(error.message ?? "Error al cargar detección automática");
      const rows = new Map((data ?? []).map((row: any) => [row.financial_app_key, row]));
      return FINANCIAL_APPS.map((app) => {
        const row = rows.get(app.key) as any | undefined;
        return {
          financialAppKey: app.key,
          enabled: row?.enabled !== false,
          defaultAccountId: row?.default_account_id == null ? null : Number(row.default_account_id),
        };
      });
    },
  });
}

export function useUpsertNotificationDetectionSettingMutation(userId?: string | null, workspaceId?: number | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: NotificationDetectionAppSetting) => {
      if (!supabase || !userId || !workspaceId) throw new Error("Workspace no disponible.");
      const { error } = await supabase
        .from("notification_detection_app_settings")
        .upsert({
          user_id: userId,
          workspace_id: workspaceId,
          financial_app_key: input.financialAppKey,
          enabled: input.enabled,
          default_account_id: input.defaultAccountId,
          updated_at: new Date().toISOString(),
        }, { onConflict: "user_id,workspace_id,financial_app_key" });
      if (error) throw new Error(error.message ?? "No se pudo guardar la configuración");
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["notification-detection-settings", userId ?? null, workspaceId ?? null] });
    },
  });
}

export async function syncNativeDetectedSuggestion(input: {
  userId: string;
  workspaceId: number;
  nativeSuggestion: NativeDetectedMovementSuggestion;
}) {
  if (!supabase) throw new Error("Supabase no está configurado.");
  const parsedAmount = parseAmountLabel(input.nativeSuggestion.amountLabel);
  if (!parsedAmount) return null;

  const financialApp =
    getFinancialAppByKey(input.nativeSuggestion.financialAppKey) ??
    resolveFinancialAppByPackage(input.nativeSuggestion.packageName);
  const occurredAt = new Date(input.nativeSuggestion.postTime ?? input.nativeSuggestion.createdAt ?? Date.now()).toISOString();
  const movementType = input.nativeSuggestion.movementType === "income" ? "income" : "expense";
  const description = (
    input.nativeSuggestion.text ||
    input.nativeSuggestion.title ||
    (!isPackageName(input.nativeSuggestion.appName) ? input.nativeSuggestion.appName : null) ||
    financialApp?.label ||
    "Movimiento detectado"
  ).slice(0, 160);
  const appKey = financialApp?.key ?? "yape";
  const appLabel = financialApp?.label
    ?? (!isPackageName(input.nativeSuggestion.appName) ? input.nativeSuggestion.appName : null)
    ?? "App financiera";
  const dedupeKey = buildDedupeKey({
    userId: input.userId,
    workspaceId: input.workspaceId,
    financialAppKey: appKey,
    packageName: input.nativeSuggestion.packageName,
    movementType,
    amount: parsedAmount.amount,
    currencyCode: parsedAmount.currencyCode,
    description,
    occurredAt,
    notificationKey: input.nativeSuggestion.notificationKey ?? null,
  });

  const { data: suggestionRow, error: suggestionError } = await supabase
    .from("notification_detected_movement_suggestions")
    .upsert({
      user_id: input.userId,
      workspace_id: input.workspaceId,
      financial_app_key: appKey,
      package_name: input.nativeSuggestion.packageName,
      app_label: appLabel,
      movement_type: movementType,
      amount: parsedAmount.amount,
      currency_code: parsedAmount.currencyCode,
      description,
      occurred_at: occurredAt,
      confidence: input.nativeSuggestion.confidence === "high" ? "high" : "medium",
      status: input.nativeSuggestion.status === "discarded" ? "discarded" : "pending",
      dedupe_key: dedupeKey,
      notification_key: input.nativeSuggestion.notificationKey ?? null,
      metadata: {
        nativeSuggestionId: input.nativeSuggestion.id,
        notificationId: input.nativeSuggestion.notificationId ?? null,
        descriptionCleanup: input.nativeSuggestion.descriptionCleanup ?? null,
        counterpartyRecommendation: input.nativeSuggestion.counterpartyRecommendation ?? null,
        recurringRecommendation: input.nativeSuggestion.recurringRecommendation ?? null,
        riskExplanation: input.nativeSuggestion.riskExplanation ?? null,
        budgetImpact: input.nativeSuggestion.budgetImpact ?? null,
      },
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id,workspace_id,dedupe_key" })
    .select("*")
    .single();
  if (suggestionError) throw new Error(suggestionError.message ?? "No se pudo sincronizar la sugerencia");
  const suggestion = mapSuggestion(suggestionRow);

  if (suggestion.status === "pending") {
    await upsertDetectedMovementNotification(input.userId, suggestion);
  }
  return suggestion;
}

export async function upsertDetectedMovementNotification(userId: string, suggestion: DetectedMovementSuggestion) {
  if (!supabase) throw new Error("Supabase no está configurado.");
  const app = getFinancialAppByKey(suggestion.financialAppKey);
  const appLabel = app?.label ?? humanizeDescription(suggestion.appLabel, "App financiera");
  const title = `Movimiento detectado en ${appLabel}`;
  const descriptionDisplay = humanizeDescription(suggestion.description, appLabel);
  const body = `${suggestion.currencyCode === "PEN" ? "S/" : "USD"} ${suggestion.amount.toFixed(2)} · ${descriptionDisplay}`;
  const { error } = await supabase
    .from("notifications")
    .upsert({
      user_id: userId,
      title,
      body,
      status: "sent",
      scheduled_for: suggestion.createdAt,
      kind: "detected_movement_suggestion",
      channel: "in_app",
      related_entity_type: "detected_movement_suggestion",
      related_entity_id: suggestion.id,
      payload: {
        suggestionId: suggestion.id,
        amount: suggestion.amount,
        currencyCode: suggestion.currencyCode,
        appLabel: app?.label ?? suggestion.appLabel,
        status: suggestion.status,
      },
    }, { onConflict: "user_id,related_entity_type,related_entity_id,kind" });
  if (error) throw new Error(error.message ?? "No se pudo crear la notificación interna");
}

export function useDetectedMovementSuggestionQuery(suggestionId?: number | null) {
  return useQuery({
    queryKey: ["detected-movement-suggestion", suggestionId ?? null],
    enabled: Boolean(supabase && suggestionId),
    queryFn: async () => {
      if (!supabase || !suggestionId) return null;
      const { data, error } = await supabase
        .from("notification_detected_movement_suggestions")
        .select("*")
        .eq("id", suggestionId)
        .maybeSingle();
      if (error) throw new Error(error.message ?? "No se pudo cargar la sugerencia");
      return data ? mapSuggestion(data) : null;
    },
  });
}

export function useMarkDetectedMovementSuggestionMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { suggestionId: number; status: DetectedMovementStatus; movementId?: number | null }) => {
      if (!supabase) throw new Error("Supabase no está configurado.");
      const { error } = await supabase
        .from("notification_detected_movement_suggestions")
        .update({
          status: input.status,
          movement_id: input.movementId ?? null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", input.suggestionId);
      if (error) throw new Error(error.message ?? "No se pudo actualizar la sugerencia");
    },
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: ["detected-movement-suggestion", variables.suggestionId] });
      void queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });
}

export async function findPossibleDuplicateMovement(input: DuplicateMovementInput): Promise<MovementRecord | null> {
  if (!supabase) throw new Error("Supabase no está configurado.");
  const date = new Date(input.occurredAt);
  const day = Number.isNaN(date.getTime()) ? new Date().toISOString().slice(0, 10) : date.toISOString().slice(0, 10);
  const from = `${day}T00:00:00.000Z`;
  const to = `${day}T23:59:59.999Z`;
  const amountColumn = input.movementType === "income" ? "destination_amount" : "source_amount";
  const accountColumn = input.movementType === "income" ? "destination_account_id" : "source_account_id";

  let query = supabase
    .from("movements")
    .select("id, workspace_id, movement_type, status, occurred_at, description, notes, source_account_id, source_amount, destination_account_id, destination_amount, fx_rate, category_id, counterparty_id, obligation_id, subscription_id, metadata")
    .eq("workspace_id", input.workspaceId)
    .eq("movement_type", input.movementType)
    .eq("status", "posted")
    .gte("occurred_at", from)
    .lte("occurred_at", to)
    .eq(amountColumn, input.amount);

  if (input.accountId) query = query.eq(accountColumn, input.accountId);

  const { data, error } = await query.limit(10);
  if (error) throw new Error(error.message ?? "No se pudo validar duplicados");
  const normalizedDescription = normalizeDescription(input.description);
  const row = (data ?? []).find((item: any) => normalizeDescription(item.description ?? "") === normalizedDescription);
  if (!row) return null;
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    movementType: row.movement_type,
    status: row.status,
    description: row.description,
    notes: row.notes,
    category: "",
    categoryId: row.category_id,
    counterparty: "",
    counterpartyId: row.counterparty_id,
    occurredAt: row.occurred_at,
    sourceAccountId: row.source_account_id,
    sourceAccountName: null,
    sourceAmount: row.source_amount == null ? null : Number(row.source_amount),
    destinationAccountId: row.destination_account_id,
    destinationAccountName: null,
    destinationAmount: row.destination_amount == null ? null : Number(row.destination_amount),
    fxRate: row.fx_rate == null ? null : Number(row.fx_rate),
    obligationId: row.obligation_id,
    subscriptionId: row.subscription_id,
    metadata: row.metadata,
  };
}

export function buildMovementInputFromDetectedSuggestion(input: {
  suggestion: DetectedMovementSuggestion;
  accountId: number;
  categoryId: number | null;
  description: string;
  movementType: "expense" | "income";
}): MovementFormInput {
  return {
    movementType: input.movementType,
    status: "posted",
    occurredAt: input.suggestion.occurredAt,
    description: input.description.trim() || input.suggestion.description,
    notes: null,
    sourceAccountId: input.movementType === "expense" ? input.accountId : null,
    sourceAmount: input.movementType === "expense" ? input.suggestion.amount : null,
    destinationAccountId: input.movementType === "income" ? input.accountId : null,
    destinationAmount: input.movementType === "income" ? input.suggestion.amount : null,
    fxRate: null,
    categoryId: input.categoryId,
    counterpartyId: null,
    metadata: {
      source: "notification_detection",
      suggestionId: input.suggestion.id,
      financialAppKey: input.suggestion.financialAppKey,
      confidence: input.suggestion.confidence,
    },
  };
}
