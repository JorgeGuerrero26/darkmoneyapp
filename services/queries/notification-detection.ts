import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { STALE } from "../../lib/query-client";
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

const DEDUPE_STOPWORDS = new Set([
  "compra",
  "consumo",
  "pago",
  "pagaste",
  "tarjeta",
  "debito",
  "credito",
  "visa",
  "mastercard",
  "soles",
  "movimiento",
  "banco",
  "cuenta",
  "cuentas",
  "transferencia",
  "operacion",
  "yape",
  "yapeo",
  "yapear",
  "clasica",
  "detectado",
  "realizaste",
  "desde",
]);

function significantTokens(value: string): string[] {
  return normalizeDescription(value)
    .split(" ")
    .filter((token) => token.length >= 4 && !DEDUPE_STOPWORDS.has(token));
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
          enabled: row?.enabled ?? app.defaultEnabled ?? true,
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
  const nativeMovementType = input.nativeSuggestion.movementType;
  const movementType =
    nativeMovementType === "income" ? "income" : nativeMovementType === "transfer" ? "transfer" : "expense";
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

  // Dedupe cruzado: la misma compra puede llegar por 2 fuentes (Billetera Google + correo del banco).
  // Si existe una sugerencia pendiente reciente con mismo monto+moneda y comercio solapado, se suprime la 2da.
  const dedupeWindowStart = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const { data: recentRows } = await supabase
    .from("notification_detected_movement_suggestions")
    .select("*")
    .eq("workspace_id", input.workspaceId)
    .eq("currency_code", parsedAmount.currencyCode)
    .eq("amount", parsedAmount.amount)
    .eq("status", "pending")
    .gte("created_at", dedupeWindowStart)
    .limit(20);
  const newNorm = normalizeDescription(description);
  const newTokens = significantTokens(description);
  const duplicateRow = (recentRows ?? []).find((row: any) => {
    if (row.dedupe_key === dedupeKey) return false; // mismo origen: lo maneja el upsert onConflict
    const existingNorm = normalizeDescription(row.description ?? "");
    if (existingNorm && newNorm && (existingNorm.includes(newNorm) || newNorm.includes(existingNorm))) return true;
    const existingTokens = significantTokens(row.description ?? "");
    return newTokens.some((token) => existingTokens.includes(token));
  });
  if (duplicateRow) {
    return mapSuggestion(duplicateRow);
  }

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
  } else {
    await autoArchiveDetectedMovementNotification(input.userId, suggestion.id);
  }
  return suggestion;
}

async function autoArchiveDetectedMovementNotification(userId: string, suggestionId: number) {
  if (!supabase) return;
  await supabase
    .from("notifications")
    .update({ status: "read", read_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("kind", "detected_movement_suggestion")
    .eq("related_entity_id", suggestionId)
    .neq("status", "read");
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

export function useMarkDetectedMovementSuggestionMutation(userId?: string | null) {
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
      if (userId && input.status !== "pending") {
        await autoArchiveDetectedMovementNotification(userId, input.suggestionId);
      }
    },
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: ["detected-movement-suggestion", variables.suggestionId] });
      void queryClient.invalidateQueries({ queryKey: ["notifications", userId ?? null] });
    },
  });
}

export type SuggestionActionKind =
  | "accept_category"
  | "override_category"
  | "accept_description"
  | "edit_description"
  | "accept_counterparty"
  | "override_counterparty"
  | "register"
  | "discard";

export type SuggestionActionSurface = "overlay" | "quick_entry" | "headless" | "list";

export type RecordSuggestionActionInput = {
  userId: string;
  workspaceId: number;
  suggestionId: number | null;
  dedupeKey?: string | null;
  action: SuggestionActionKind;
  surface: SuggestionActionSurface;
  modelAtDecision?: string | null;
  confidenceAtDecision?: string | number | null;
  suggestedValue?: string | null;
  finalValue?: string | null;
  metadata?: Record<string, unknown>;
};

export async function recordSuggestionAction(input: RecordSuggestionActionInput): Promise<void> {
  if (!supabase) return;
  try {
    const confidence = input.confidenceAtDecision == null
      ? null
      : typeof input.confidenceAtDecision === "number"
        ? input.confidenceAtDecision.toString()
        : input.confidenceAtDecision;
    await supabase.from("notification_suggestion_actions").insert({
      user_id: input.userId,
      workspace_id: input.workspaceId,
      suggestion_id: input.suggestionId,
      dedupe_key: input.dedupeKey ?? null,
      action: input.action,
      surface: input.surface,
      model_at_decision: input.modelAtDecision ?? null,
      confidence_at_decision: confidence,
      suggested_value: input.suggestedValue ?? null,
      final_value: input.finalValue ?? null,
      metadata: input.metadata ?? {},
    });
  } catch {
    // Telemetry must not break the user flow.
  }
}

export type DetectionTelemetryEvent =
  | "suggestion_received"
  | "ai_classifier_called"
  | "ai_classifier_discarded"
  | "ai_category_pending"
  | "ai_category_resolved"
  | "ai_category_unavailable"
  | "user_registered"
  | "user_discarded";

export type DetectionTelemetrySurface = "headless" | "runtime_sync" | "overlay" | "quick_entry";

export type RecordDetectionEventInput = {
  userId?: string | null;
  workspaceId?: number | null;
  event: DetectionTelemetryEvent;
  suggestionId?: number | null;
  nativeSuggestionId?: string | null;
  financialAppKey?: string | null;
  surface?: DetectionTelemetrySurface | null;
  metadata?: Record<string, unknown>;
};

export async function recordDetectionEvent(input: RecordDetectionEventInput): Promise<void> {
  if (!supabase) return;
  try {
    await supabase.from("notification_detection_telemetry").insert({
      user_id: input.userId ?? null,
      workspace_id: input.workspaceId ?? null,
      event: input.event,
      suggestion_id: input.suggestionId ?? null,
      native_suggestion_id: input.nativeSuggestionId ?? null,
      financial_app_key: input.financialAppKey ?? null,
      surface: input.surface ?? null,
      metadata: input.metadata ?? {},
    });
  } catch {
    // Telemetry must not break the user flow.
  }
}

// Features que aparecen en el flujo de notificaciones y quick-entry.
// Cuando alguna pase el 85% de su limite diario, se muestra un banner de aviso.
export const AI_NOTIFICATION_FEATURE_LIMITS: Record<string, number> = {
  "movement-category-ai-suggestion": 100,
  "movement-counterparty-ai-suggestion": 100,
  "movement-description-ai-cleanup": 100,
  "movement-risk-ai-explanation": 100,
};

export type AiFeatureUsageToday = {
  featureKey: string;
  used: number;
  limit: number;
  ratio: number;
};

function usageDateLimaToday(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Lima",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export function useAiUsageTodayQuery(userId?: string | null) {
  return useQuery({
    queryKey: ["ai-usage-today", userId ?? null],
    enabled: Boolean(supabase && userId),
    staleTime: STALE.short,
    refetchOnWindowFocus: false,
    queryFn: async (): Promise<AiFeatureUsageToday[]> => {
      if (!supabase || !userId) return [];
      const usageDate = usageDateLimaToday();
      const featureKeys = Object.keys(AI_NOTIFICATION_FEATURE_LIMITS);
      const { data, error } = await supabase
        .from("ai_feature_usage_events")
        .select("feature_key")
        .eq("user_id", userId)
        .eq("usage_date", usageDate)
        .in("feature_key", featureKeys);
      if (error) {
        // Tabla puede no existir en algunos entornos; degradar a sin uso.
        return featureKeys.map((featureKey) => ({
          featureKey,
          used: 0,
          limit: AI_NOTIFICATION_FEATURE_LIMITS[featureKey],
          ratio: 0,
        }));
      }
      const counts = new Map<string, number>();
      for (const row of (data ?? []) as Array<{ feature_key?: unknown }>) {
        const key = typeof row.feature_key === "string" ? row.feature_key : null;
        if (!key) continue;
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
      return featureKeys.map((featureKey) => {
        const used = counts.get(featureKey) ?? 0;
        const limit = AI_NOTIFICATION_FEATURE_LIMITS[featureKey];
        return { featureKey, used, limit, ratio: limit > 0 ? used / limit : 0 };
      });
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

export async function findDetectedSuggestionIdByNativeId(
  workspaceId: number,
  nativeId: string,
): Promise<number | null> {
  if (!supabase || !nativeId) return null;
  const { data, error } = await supabase
    .from("notification_detected_movement_suggestions")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("metadata->>nativeSuggestionId", nativeId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return null;
  return data ? Number(data.id) : null;
}

/**
 * Dado un set de IDs de sugerencias nativas que el dispositivo aún tiene como `pending`,
 * devuelve cuáles YA están registradas en la base (status=registered o con movimiento).
 * Una sola lectura batched (sin writes) para usar al volver a primer plano: permite
 * marcar esas sugerencias como registradas en el dispositivo y cancelar su notificación,
 * evitando que la notificación bancaria vieja re-dispare "movimiento detectado".
 */
export async function findRegisteredNativeSuggestionIds(
  workspaceId: number | string | null,
  nativeIds: string[],
): Promise<Set<string>> {
  const result = new Set<string>();
  if (!supabase || !workspaceId || nativeIds.length === 0) return result;
  const { data, error } = await supabase
    .from("notification_detected_movement_suggestions")
    .select("status, movement_id, metadata")
    .eq("workspace_id", workspaceId)
    .in("metadata->>nativeSuggestionId", nativeIds);
  if (error || !data) return result;
  for (const row of data as any[]) {
    const nativeId = row?.metadata?.nativeSuggestionId;
    if (typeof nativeId !== "string") continue;
    if (row.status === "registered" || row.movement_id != null) result.add(nativeId);
  }
  return result;
}

export function buildMovementInputFromDetectedSuggestion(input: {
  suggestion: DetectedMovementSuggestion;
  accountId?: number | null;
  categoryId: number | null;
  counterpartyId?: number | null;
  description: string;
  movementType: "expense" | "income" | "transfer";
  sourceAccountId?: number | null;
  destinationAccountId?: number | null;
  destinationAmount?: number | null;
  fxRate?: number | null;
}): MovementFormInput {
  const metadata = {
    source: "notification_detection",
    suggestionId: input.suggestion.id,
    financialAppKey: input.suggestion.financialAppKey,
    confidence: input.suggestion.confidence,
  };
  const description = input.description.trim() || input.suggestion.description;

  if (input.movementType === "transfer") {
    const sourceAmount = input.suggestion.amount;
    return {
      movementType: "transfer",
      status: "posted",
      occurredAt: input.suggestion.occurredAt,
      description,
      notes: null,
      sourceAccountId: input.sourceAccountId ?? null,
      sourceAmount,
      destinationAccountId: input.destinationAccountId ?? null,
      destinationAmount: input.destinationAmount ?? sourceAmount,
      fxRate: input.fxRate ?? null,
      categoryId: null,
      counterpartyId: null,
      metadata,
    };
  }

  const accountId = input.accountId ?? null;
  return {
    movementType: input.movementType,
    status: "posted",
    occurredAt: input.suggestion.occurredAt,
    description,
    notes: null,
    sourceAccountId: input.movementType === "expense" ? accountId : null,
    sourceAmount: input.movementType === "expense" ? input.suggestion.amount : null,
    destinationAccountId: input.movementType === "income" ? accountId : null,
    destinationAmount: input.movementType === "income" ? input.suggestion.amount : null,
    fxRate: null,
    categoryId: input.categoryId,
    counterpartyId: input.counterpartyId ?? null,
    metadata,
  };
}

export async function getFrequentTransferPair(
  workspaceId: number | string | null,
): Promise<{ sourceAccountId: number; destinationAccountId: number } | null> {
  if (!supabase || !workspaceId) return null;
  const { data, error } = await supabase
    .from("movements")
    .select("source_account_id, destination_account_id")
    .eq("workspace_id", workspaceId)
    .eq("movement_type", "transfer")
    .not("source_account_id", "is", null)
    .not("destination_account_id", "is", null)
    .order("occurred_at", { ascending: false })
    .limit(100);
  if (error || !data?.length) return null;
  const freq = new Map<string, { sourceAccountId: number; destinationAccountId: number; count: number }>();
  for (const row of data) {
    const key = `${row.source_account_id}:${row.destination_account_id}`;
    const existing = freq.get(key);
    if (existing) existing.count++;
    else freq.set(key, { sourceAccountId: row.source_account_id, destinationAccountId: row.destination_account_id, count: 1 });
  }
  let best: { sourceAccountId: number; destinationAccountId: number; count: number } | null = null;
  for (const entry of freq.values()) {
    if (!best || entry.count > best.count) best = entry;
  }
  return best ? { sourceAccountId: best.sourceAccountId, destinationAccountId: best.destinationAccountId } : null;
}

/**
 * Par de transferencia (origen→destino) más frecuente, cacheado por workspace.
 * Fuente de verdad única para prellenar transferencias en TODAS las vías React
 * (registro rápido + formulario completo), igualando el default del overlay nativo.
 */
export function useFrequentTransferPairQuery(workspaceId?: number | null) {
  return useQuery({
    queryKey: ["frequent-transfer-pair", workspaceId ?? null],
    enabled: Boolean(supabase && workspaceId),
    staleTime: 5 * 60 * 1000,
    queryFn: () => getFrequentTransferPair(workspaceId ?? null),
  });
}
