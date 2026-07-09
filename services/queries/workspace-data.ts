import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { InteractionManager, Platform } from "react-native";
import type { WorkspaceInvitationStatus } from "../../types/domain";

import { UNIVERSAL_LINK_HOST } from "../../constants/config";
import { supabase, supabaseAnonKey, supabaseUrl } from "../../lib/supabase";
import { STALE } from "../../lib/query-client";
import { patchSnapshotWithCreatedMovement } from "./snapshot-cache";
import { INTERACTIVE_AI_TIMEOUT_MS, isInteractiveAiEdgeFunction } from "../../lib/ai-request-utils";
import { dateStrToISO, filterDateFrom, filterDateTo } from "../../lib/date";
import {
  mirrorObligationEventAttachmentsToMovement,
  type AttachmentLike,
} from "../../lib/entity-attachments";
import { sortObligationEventsNewestFirst } from "../../lib/sort-obligation-events";
import { fetchLiveExchangeRate, type LiveExchangeRate } from "../../lib/exchange-rate-providers";
import { useUiStore } from "../../store/ui-store";
import {
  convertAmountToWorkspaceBase,
  computeNextRecurringDate,
  movementAmountForSubscriptionAnalytics,
  subscriptionFrequencyListLabel,
} from "../../lib/subscription-helpers";
import type { AppProfile } from "../../lib/auth-context";
import type {
  AccountSummary,
  BudgetOverview,
  CategoryOverview,
  CategorySummary,
  CounterpartyOverview,
  CounterpartyRoleType,
  CounterpartySummary,
  ExchangeRateSummary,
  JsonValue,
  MovementRecord,
  MovementAnalyticsSignal,
  MovementLearningFeedback,
  MovementType,
  MovementStatus,
  ObligationDirection,
  ObligationOriginType,
  ObligationStatus,
  ObligationSummary,
  ObligationEventSummary,
  ObligationShareSummary,
  SharedObligationSummary,
  PendingObligationShareInviteItem,
  ObligationPaymentRequest,
  ObligationEventViewerLink,
  UserEntitlementSummary,
  WorkspaceAnalyticsSnapshot,
  RecurringIncomeFrequency,
  RecurringIncomeStatus,
  RecurringIncomeOccurrenceSummary,
  SubscriptionFrequency,
  CategoryPostedMovement,
  RecurringIncomeSummary,
  SubscriptionPostedMovement,
  SubscriptionSummary,
  Workspace,
  WorkspaceKind,
  WorkspaceRole,
} from "../../types/domain";

import {
  attachMovementToObligationEvent,
  fetchNextObligationInstallmentNo,
  fetchObligationEventsByObligationId,
  fetchObligationWorkspaceId,
  insertObligationPaymentEventWithFallback,
  mapObligation,
  mapObligationEventRowsToSummaries,
  movementTypeForObligationEvent,
  notifyAcceptedViewersObligationEventUpdated,
  readMovementMetadataEventId,
  resolveMovementAccountId,
  resolveOwnerDeleteRequestNotification,
  resolveOwnerEditRequestNotification,
  resolveOwnerMovementIdForObligationEvent,
  resolveViewerDeletePendingNotification,
  resolveViewerEditPendingNotification,
  syncViewerLinkedMovementsForEvent,
  updateObligationEventAndSyncMovements,
  type UpdateObligationEventInput,
} from "./obligations-impl";

type NumericLike = number | string | null;

export function toNum(val: NumericLike): number {
  if (val === null || val === undefined) return 0;
  const n = Number(val);
  return isNaN(n) ? 0 : n;
}

function joinNotes(...parts: Array<string | null | undefined>) {
  const normalized = parts
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part));
  return normalized.length > 0 ? normalized.join("\n") : null;
}

function formatAmountWithCurrency(amount: number, currencyCode: string) {
  return `${currencyCode.trim().toUpperCase()} ${amount.toLocaleString("es-PE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatSupabaseError(error: {
  code?: string | null;
  message?: string | null;
  details?: string | null;
  hint?: string | null;
}) {
  return [error.code, error.message, error.details, error.hint]
    .filter((part): part is string => Boolean(part && part.trim()))
    .join(" | ");
}

export function isDuplicateConstraintMessage(message: string | null | undefined): boolean {
  const normalized = message?.toLowerCase() ?? "";
  return (
    normalized.includes("23505") ||
    normalized.includes("unique") ||
    normalized.includes("duplicate") ||
    normalized.includes("duplicado") ||
    normalized.includes("already exists") ||
    normalized.includes("ya existe") ||
    normalized.includes("ya existen") ||
    normalized.includes("registro existente")
  );
}

function isMissingRelationError(
  error: { message?: string | null; details?: string | null; hint?: string | null } | null | undefined,
  relationName: string,
): boolean {
  const joined = [error?.message, error?.details, error?.hint].filter(Boolean).join(" ").toLowerCase();
  const relation = relationName.trim().toLowerCase();
  return (
    joined.includes(relation) &&
    (
      joined.includes("does not exist") ||
      joined.includes("could not find") ||
      joined.includes("schema cache") ||
      joined.includes("no existe")
    )
  );
}

function buildHostedAppUrl(): string | null {
  const host = UNIVERSAL_LINK_HOST.trim();
  if (!host) return null;
  if (/^https?:\/\//i.test(host)) return host.replace(/\/+$/, "");
  return `https://${host.replace(/^\/+/, "").replace(/\/+$/, "")}`;
}

// Lista de emails con acceso Pro de fallback (cuando el cliente no puede llegar
// a Supabase o el entitlement aun no esta seteado). Configurable via env var
// EXPO_PUBLIC_FALLBACK_PRO_EMAILS como CSV sin rebuild.
function parseFallbackProEmails(): Set<string> {
  const raw = process.env.EXPO_PUBLIC_FALLBACK_PRO_EMAILS;
  const source = raw && raw.trim().length > 0 ? raw : "joradrianmori@gmail.com";
  const set = new Set<string>();
  for (const part of source.split(",")) {
    const normalized = part.trim().toLowerCase();
    if (normalized) set.add(normalized);
  }
  return set;
}

const FALLBACK_PRO_EMAILS = parseFallbackProEmails();

function hasFallbackProAccess(email?: string | null): boolean {
  return Boolean(email && FALLBACK_PRO_EMAILS.has(email.trim().toLowerCase()));
}

type BackgroundRefreshNotice = {
  message: string;
  description?: string;
};

const DEFAULT_BACKGROUND_REFRESH_NOTICE: BackgroundRefreshNotice = {
  message: "Actualizando datos",
  description: "Puedes seguir usando la app mientras sincronizamos balances y listados.",
};

export function runBackgroundQueryRefresh(
  queryClient: QueryClient,
  queryKeys: Array<readonly unknown[]>,
  notice: BackgroundRefreshNotice = DEFAULT_BACKGROUND_REFRESH_NOTICE,
) {
  let noticeId: string | null = null;
  const showTimer = setTimeout(() => {
    noticeId = useUiStore.getState().showActivityNotice(notice.message, notice.description);
  }, 220);

  InteractionManager.runAfterInteractions(() => {
    void Promise.all(queryKeys.map((queryKey) => queryClient.invalidateQueries({ queryKey })))
      .catch(() => undefined)
      .finally(() => {
        clearTimeout(showTimer);
        if (noticeId) {
          useUiStore.getState().dismissActivityNotice(noticeId);
        }
      });
  });
}

function buildFallbackEntitlement(
  userId: string | null | undefined,
  email?: string | null,
): UserEntitlementSummary {
  const proAccessEnabled = hasFallbackProAccess(email);
  return {
    userId: userId ?? "",
    planCode: proAccessEnabled ? "pro" : "free",
    proAccessEnabled,
    billingStatus: null,
    billingProvider: null,
    providerCustomerId: null,
    providerSubscriptionId: null,
    currentPeriodStart: null,
    currentPeriodEnd: null,
    cancelAtPeriodEnd: false,
    manualOverride: proAccessEnabled,
  };
}

function edgeFunctionFallbackMessage(name: string, response?: Response): string {
  const status = response?.status ?? null;
  if (status === 404) return `La función ${name} no está disponible.`;
  if (status === 401) return "Tu sesión expiró. Vuelve a iniciar sesión.";
  if (status === 403) return `La función ${name} devolvió 403. Puede ser permisos o plan Pro.`;
  if (status != null) return `La función ${name} devolvió error (${status}).`;
  return `No se pudo completar la función ${name}.`;
}

function logEdgeFunctionDebug(name: string, meta: Record<string, unknown>) {
  const stage = typeof meta.stage === "string" ? meta.stage : "";
  const responseStatus = typeof meta.responseStatus === "number" ? meta.responseStatus : null;
  const isFailureStage =
    stage.includes("error") ||
    stage.includes("mismatch") ||
    stage.includes("missing-token") ||
    stage.includes("invalid") ||
    stage.includes("failed");
  const shouldWarn = isFailureStage || (responseStatus != null && responseStatus >= 400);
  if (!shouldWarn) return;
  if (__DEV__) console.warn(`[EdgeFunction:${name}]`, meta);
}

function decodeJwtPayload(token: string | null | undefined): Record<string, unknown> | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length < 2) return null;
  try {
    const normalized = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized + "=".repeat((4 - (normalized.length % 4 || 4)) % 4);
    const decoded = globalThis.atob ? globalThis.atob(padded) : null;
    if (!decoded) return null;
    return JSON.parse(decoded) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function extractSupabaseProjectRef(rawUrl: string | null | undefined): string | null {
  if (!rawUrl?.trim()) return null;
  try {
    const hostname = new URL(rawUrl).hostname.trim().toLowerCase();
    const projectRef = hostname.split(".")[0]?.trim();
    return projectRef || null;
  } catch {
    const match = rawUrl.match(/^https?:\/\/([^.]+)\./i);
    return match?.[1]?.trim().toLowerCase() || null;
  }
}

function extractJwtProjectRef(payload: Record<string, unknown> | null): string | null {
  if (!payload) return null;
  const directRef =
    typeof payload.ref === "string" && payload.ref.trim()
      ? payload.ref.trim().toLowerCase()
      : null;
  if (directRef) return directRef;

  const issuer = typeof payload.iss === "string" ? payload.iss.trim() : "";
  if (!issuer) return null;
  return extractSupabaseProjectRef(issuer);
}

async function clearLocalSessionSilently() {
  if (!supabase) return;
  try {
    await supabase.auth.signOut({ scope: "local" });
  } catch {
    try {
      await supabase.auth.signOut();
    } catch {
      // Ignore cleanup failures.
    }
  }
}

async function readEdgeFunctionErrorMessage(
  name: string,
  error: unknown,
  response?: Response,
): Promise<string> {
  const targetResponse =
    response ??
    (typeof error === "object" &&
    error !== null &&
    "context" in error &&
    (error as { context?: unknown }).context instanceof Response
      ? (error as { context: Response }).context
      : undefined);

  if (targetResponse) {
    try {
      const contentType = targetResponse.headers.get("content-type")?.toLowerCase() ?? "";
      if (contentType.includes("application/json")) {
        const payload = (await targetResponse.clone().json()) as Record<string, unknown>;
        const jsonMessage = [
          typeof payload.error === "string" ? payload.error : null,
          typeof payload.message === "string" ? payload.message : null,
          typeof payload.details === "string" ? payload.details : null,
          typeof payload.hint === "string" ? payload.hint : null,
        ].find((value): value is string => Boolean(value?.trim()));
        if (jsonMessage) return jsonMessage;
      }

      const text = (await targetResponse.clone().text()).trim();
      if (text) return text;
    } catch {
      // Ignore parse failures and fallback below.
    }
  }

  if (error instanceof Error && error.message?.trim()) {
    return error.message;
  }

  return edgeFunctionFallbackMessage(name, targetResponse);
}

function isEdgeFunctionAuthSessionError(message: string) {
  const normalized = message.trim().toLowerCase();
  if (!normalized) return false;
  return normalized.includes("auth session missing") ||
    normalized.includes("session missing") ||
    normalized.includes("invalid jwt") ||
    normalized.includes("jwt expired");
}

// ─── Row types ────────────────────────────────────────────────────────────────

type WorkspaceMemberRow = {
  workspace_id: number;
  role: WorkspaceRole;
  is_default_workspace: boolean;
  joined_at: string;
};

type WorkspaceRow = {
  id: number;
  owner_user_id: string;
  name: string;
  kind: WorkspaceKind;
  base_currency_code: string | null;
  description: string | null;
  is_archived: boolean;
};

type AccountBalanceRow = {
  account_id: number;
  workspace_id: number;
  current_balance: NumericLike;
};

type BudgetProgressRow = {
  id: number;
  workspace_id: number;
  created_by_user_id: string | null;
  updated_by_user_id: string | null;
  name: string;
  period_start: string;
  period_end: string;
  currency_code: string;
  category_id: number | null;
  category_name: string | null;
  account_id: number | null;
  account_name: string | null;
  scope_kind: BudgetOverview["scopeKind"];
  scope_label: string;
  limit_amount: NumericLike;
  spent_amount: NumericLike;
  remaining_amount: NumericLike;
  used_percent: NumericLike;
  alert_percent: NumericLike;
  movement_count: number | null;
  rollover_enabled: boolean;
  notes: string | null;
  is_active: boolean;
  is_near_limit: boolean;
  is_over_limit: boolean;
  is_pinned?: boolean | null;
  created_at: string;
  updated_at: string;
};

export type ObligationSummaryRow = {
  id: number;
  workspace_id: number;
  direction: ObligationSummary["direction"];
  origin_type: ObligationOriginType;
  status: ObligationStatus;
  title: string;
  counterparty_id: number | null;
  settlement_account_id: number | null;
  currency_code: string;
  principal_initial_amount: NumericLike;
  principal_increase_total: NumericLike;
  principal_decrease_total: NumericLike;
  principal_current_amount: NumericLike;
  interest_total: NumericLike;
  fee_total: NumericLike;
  adjustment_total: NumericLike;
  discount_total: NumericLike;
  writeoff_total: NumericLike;
  payment_total: NumericLike;
  pending_amount: NumericLike;
  progress_percent: NumericLike;
  start_date: string;
  due_date: string | null;
  installment_amount: NumericLike;
  installment_count: number | null;
  interest_rate: NumericLike;
  description: string | null;
  notes: string | null;
  payment_count: number;
  last_payment_date: string | null;
  last_event_date: string | null;
  created_at: string;
  updated_at: string;
};

export type ObligationEventRow = {
  id: number;
  obligation_id: number;
  event_type: ObligationEventSummary["eventType"];
  event_date: string;
  created_at?: string | null;
  amount: NumericLike;
  installment_no: number | null;
  reason: string | null;
  description: string | null;
  notes: string | null;
  movement_id: number | null;
  created_by_user_id: string | null;
  metadata: JsonValue | null;
};

type SubscriptionRow = {
  id: number;
  workspace_id: number;
  name: string;
  vendor_party_id: number | null;
  account_id: number | null;
  category_id: number | null;
  currency_code: string;
  amount: NumericLike;
  frequency: SubscriptionFrequency;
  interval_count: number;
  day_of_month: number | null;
  day_of_week: number | null;
  start_date: string;
  next_due_date: string;
  end_date: string | null;
  status: SubscriptionSummary["status"];
  remind_days_before: number;
  auto_create_movement: boolean;
  description: string | null;
  notes: string | null;
  is_pinned?: boolean | null;
};

type RecurringIncomeRow = {
  id: number;
  workspace_id: number;
  name: string;
  payer_party_id: number | null;
  account_id: number | null;
  category_id: number | null;
  currency_code: string;
  amount: NumericLike;
  frequency: RecurringIncomeFrequency;
  interval_count: number;
  day_of_month: number | null;
  day_of_week: number | null;
  start_date: string;
  next_expected_date: string;
  end_date: string | null;
  status: RecurringIncomeStatus;
  remind_days_before: number;
  description: string | null;
  notes: string | null;
  is_pinned?: boolean | null;
};

type ExchangeRateRow = {
  from_currency_code: string;
  to_currency_code: string;
  rate: NumericLike;
  effective_at: string;
};

// ─── Mappers ──────────────────────────────────────────────────────────────────

function mapWorkspace(row: WorkspaceRow, memberRow: WorkspaceMemberRow): Workspace {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind,
    role: memberRow.role,
    description: row.description ?? "",
    baseCurrencyCode: row.base_currency_code ?? "PEN",
    isDefaultWorkspace: memberRow.is_default_workspace,
    isArchived: row.is_archived,
    joinedAt: memberRow.joined_at,
    ownerUserId: row.owner_user_id,
  };
}

function mapBudget(row: BudgetProgressRow): BudgetOverview {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    createdByUserId: row.created_by_user_id,
    updatedByUserId: row.updated_by_user_id,
    name: row.name,
    periodStart: row.period_start,
    periodEnd: row.period_end,
    currencyCode: row.currency_code,
    categoryId: row.category_id,
    categoryName: row.category_name,
    accountId: row.account_id,
    accountName: row.account_name,
    scopeKind: row.scope_kind,
    scopeLabel: row.scope_label,
    limitAmount: toNum(row.limit_amount),
    spentAmount: toNum(row.spent_amount),
    remainingAmount: toNum(row.remaining_amount),
    usedPercent: toNum(row.used_percent),
    alertPercent: toNum(row.alert_percent),
    movementCount: row.movement_count ?? 0,
    rolloverEnabled: row.rollover_enabled,
    notes: row.notes,
    isActive: row.is_active,
    isNearLimit: row.is_near_limit,
    isOverLimit: row.is_over_limit,
    isPinned: row.is_pinned ?? false,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapSubscription(
  row: SubscriptionRow,
  categoryMap: Map<number, string>,
  counterpartyMap: Map<number, string>,
  accountMap: Map<number, string>,
  frequencyLabels: Record<SubscriptionFrequency, string>,
  baseCurrency: string,
  exchangeRates: ExchangeRateSummary[],
): SubscriptionSummary {
  const amount = toNum(row.amount);
  const amountInBaseCurrency = convertAmountToWorkspaceBase(
    amount,
    row.currency_code,
    baseCurrency,
    exchangeRates,
  );
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    name: row.name,
    vendorPartyId: row.vendor_party_id,
    vendor: row.vendor_party_id ? (counterpartyMap.get(row.vendor_party_id) ?? "") : "",
    accountId: row.account_id,
    categoryId: row.category_id,
    categoryName: row.category_id ? (categoryMap.get(row.category_id) ?? null) : null,
    status: row.status,
    amount,
    amountInBaseCurrency,
    currencyCode: row.currency_code,
    frequency: row.frequency,
    frequencyLabel: subscriptionFrequencyListLabel(row.interval_count, row.frequency, frequencyLabels),
    intervalCount: row.interval_count,
    dayOfMonth: row.day_of_month,
    dayOfWeek: row.day_of_week,
    startDate: row.start_date,
    nextDueDate: row.next_due_date,
    endDate: row.end_date,
    remindDaysBefore: row.remind_days_before,
    accountName: row.account_id ? (accountMap.get(row.account_id) ?? null) : null,
    autoCreateMovement: row.auto_create_movement,
    description: row.description,
    notes: row.notes,
    isPinned: row.is_pinned ?? false,
  };
}

type CounterpartyDbRow = {
  id: number;
  workspace_id: number;
  name: string;
  type: CounterpartySummary["type"];
  is_archived: boolean;
  is_pinned?: boolean | null;
  phone: string | null;
  email: string | null;
  document_number: string | null;
  notes: string | null;
};

/** Fila de `counterparties` → overview para snapshot (métricas financieras: 0 hasta enlazar v_counterparty_summary). */
function mapCounterpartyFromRow(row: CounterpartyDbRow): CounterpartyOverview {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    isArchived: row.is_archived,
    isPinned: row.is_pinned ?? false,
    workspaceId: row.workspace_id,
    phone: row.phone ?? null,
    email: row.email ?? null,
    documentNumber: row.document_number ?? null,
    notes: row.notes ?? null,
    roles: [] as CounterpartyRoleType[],
    receivableCount: 0,
    receivablePrincipalTotal: 0,
    receivablePendingTotal: 0,
    payableCount: 0,
    payablePrincipalTotal: 0,
    payablePendingTotal: 0,
    netPendingAmount: 0,
    movementCount: 0,
    inflowTotal: 0,
    outflowTotal: 0,
    netFlowAmount: 0,
  };
}

const FREQUENCY_LABELS: Record<SubscriptionFrequency, string> = {
  daily: "Diario",
  weekly: "Semanal",
  monthly: "Mensual",
  quarterly: "Trimestral",
  yearly: "Anual",
  custom: "Personalizado",
};

// ─── Snapshot query ───────────────────────────────────────────────────────────

export type WorkspaceSnapshot = {
  workspaces: Workspace[];
  accounts: AccountSummary[];
  /** Catálogo completo (activas e inactivas), orden sort_order + name. */
  categories: CategorySummary[];
  budgets: BudgetOverview[];
  obligations: ObligationSummary[];
  subscriptions: SubscriptionSummary[];
  recurringIncome: RecurringIncomeSummary[];
  /** Movimientos posted con subscription_id (analíticas sin query extra). */
  subscriptionPostedMovements: SubscriptionPostedMovement[];
  /** Movimientos posted con category_id (analíticas categorías). */
  categoryPostedMovements: CategoryPostedMovement[];
  counterparties: CounterpartyOverview[];
  exchangeRates: ExchangeRateSummary[];
};

export function useUserEntitlementQuery(userId?: string | null, email?: string | null) {
  return useQuery({
    queryKey: ["user-entitlement", userId ?? null, email?.trim().toLowerCase() ?? null],
    enabled: Boolean(supabase && userId),
    staleTime: STALE.medium,
    placeholderData: (previousData) => previousData,
    queryFn: async (): Promise<UserEntitlementSummary> => {
      const fallback = buildFallbackEntitlement(userId, email);
      if (!supabase || !userId) return fallback;

      const { data, error } = await supabase
        .from("user_entitlements")
        .select(
          "user_id, plan_code, pro_access_enabled, billing_status, billing_provider, provider_customer_id, provider_subscription_id, current_period_start, current_period_end, cancel_at_period_end, manual_override",
        )
        .eq("user_id", userId)
        .maybeSingle();

      if (error) {
        const normalized = error.message?.toLowerCase() ?? "";
        const relationMissing =
          normalized.includes("user_entitlements") &&
          (
            normalized.includes("does not exist") ||
            normalized.includes("could not find") ||
            normalized.includes("schema cache")
          );
        if (relationMissing) return fallback;
        throw new Error(error.message ?? "No se pudo comprobar tu plan.");
      }

      if (!data) return fallback;

      const row = data as Record<string, unknown>;
      const planCode = row.plan_code === "pro" ? "pro" : fallback.planCode;
      const proAccessEnabled =
        typeof row.pro_access_enabled === "boolean"
          ? row.pro_access_enabled
          : planCode === "pro" || fallback.proAccessEnabled;

      return {
        userId: typeof row.user_id === "string" ? row.user_id : fallback.userId,
        planCode,
        proAccessEnabled,
        billingStatus: typeof row.billing_status === "string" ? row.billing_status : null,
        billingProvider: typeof row.billing_provider === "string" ? row.billing_provider : null,
        providerCustomerId:
          typeof row.provider_customer_id === "string" ? row.provider_customer_id : null,
        providerSubscriptionId:
          typeof row.provider_subscription_id === "string" ? row.provider_subscription_id : null,
        currentPeriodStart:
          typeof row.current_period_start === "string" ? row.current_period_start : null,
        currentPeriodEnd:
          typeof row.current_period_end === "string" ? row.current_period_end : null,
        cancelAtPeriodEnd: Boolean(row.cancel_at_period_end),
        manualOverride: Boolean(row.manual_override),
      } satisfies UserEntitlementSummary;
    },
  });
}

async function fetchWorkspaceSnapshot(
  userId: string,
  activeWorkspaceId: number,
): Promise<WorkspaceSnapshot> {
  if (!supabase) throw new Error("Supabase no está configurado.");

  // Limit movement history to last 2 years to keep payload manageable
  const twoYearsAgo = new Date();
  twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);
  const twoYearsAgoIso = twoYearsAgo.toISOString().slice(0, 10);

  // Parallel fetch of all workspace data
  const [
    membershipsResult,
    workspacesResult,
    accountsResult,
    accountBalancesResult,
    categoriesResult,
    budgetsResult,
    counterpartiesResult,
    obligationsResult,
    obligationTextMetaResult,
    subscriptionsResult,
    recurringIncomeResult,
    subscriptionMovementsResult,
    categoryMovementsResult,
    exchangeRatesResult,
  ] = await Promise.all([
    supabase
      .from("workspace_members")
      .select("workspace_id, role, is_default_workspace, joined_at")
      .eq("user_id", userId),
    supabase.from("workspaces").select("id, owner_user_id, name, kind, base_currency_code, description, is_archived"),
    supabase
      .from("accounts")
      .select("id, workspace_id, name, type, currency_code, opening_balance, include_in_net_worth, color, icon, is_archived, sort_order, institution_code, created_at, updated_at")
      .eq("workspace_id", activeWorkspaceId)
      .order("sort_order", { ascending: true }),
    supabase
      .from("v_account_balances")
      .select("account_id, workspace_id, current_balance")
      .eq("workspace_id", activeWorkspaceId),
    supabase
      .from("categories")
      .select("id, workspace_id, name, kind, parent_id, color, icon, sort_order, is_system, is_active, is_pinned, created_at, updated_at")
      .eq("workspace_id", activeWorkspaceId)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true }),
    supabase
      .from("v_budget_progress")
      .select("id, workspace_id, created_by_user_id, updated_by_user_id, name, period_start, period_end, currency_code, category_id, category_name, account_id, account_name, scope_kind, scope_label, limit_amount, spent_amount, remaining_amount, used_percent, alert_percent, movement_count, rollover_enabled, notes, is_active, is_near_limit, is_over_limit, created_at, updated_at")
      .eq("workspace_id", activeWorkspaceId)
      .eq("is_active", true),
    supabase
      .from("counterparties")
      .select("id, workspace_id, name, type, is_archived, is_pinned, phone, email, document_number, notes")
      .eq("workspace_id", activeWorkspaceId)
      .order("is_archived", { ascending: true })
      .order("is_pinned", { ascending: false })
      .order("name", { ascending: true }),
    supabase
      .from("v_obligation_summary")
      .select("*")
      .eq("workspace_id", activeWorkspaceId),
    // Descripción/notas desde la tabla base: v_obligation_summary a veces no incluye estas columnas.
    supabase
      .from("obligations")
      .select("id, description, notes")
      .eq("workspace_id", activeWorkspaceId),
    supabase
      .from("subscriptions")
      .select("id, workspace_id, name, vendor_party_id, account_id, category_id, currency_code, amount, frequency, interval_count, day_of_month, day_of_week, start_date, next_due_date, end_date, status, remind_days_before, auto_create_movement, description, notes, is_pinned")
      .eq("workspace_id", activeWorkspaceId)
      .order("next_due_date", { ascending: true }),
    supabase
      .from("recurring_income")
      .select("id, workspace_id, name, payer_party_id, account_id, category_id, currency_code, amount, frequency, interval_count, day_of_month, day_of_week, start_date, next_expected_date, end_date, status, remind_days_before, description, notes, is_pinned")
      .eq("workspace_id", activeWorkspaceId)
      .order("next_expected_date", { ascending: true }),
    supabase
      .from("movements")
      .select("id, subscription_id, status, occurred_at, source_amount, destination_amount, source_account_id, destination_account_id")
      .eq("workspace_id", activeWorkspaceId)
      .not("subscription_id", "is", null)
      .eq("status", "posted")
      .gte("occurred_at", twoYearsAgoIso)
      .order("occurred_at", { ascending: false })
      .limit(1000),
    supabase
      .from("movements")
      .select("id, category_id, status, occurred_at, source_amount, destination_amount, source_account_id, destination_account_id")
      .eq("workspace_id", activeWorkspaceId)
      .not("category_id", "is", null)
      .eq("status", "posted")
      .gte("occurred_at", twoYearsAgoIso)
      .order("occurred_at", { ascending: false })
      .limit(1000),
    supabase
      .from("v_latest_exchange_rates")
      .select("from_currency_code, to_currency_code, rate, effective_at"),
  ]);

  if (accountsResult.error) {
    throw new Error(accountsResult.error.message ?? "Error al cargar cuentas");
  }
  if (subscriptionsResult.error) {
    throw new Error(subscriptionsResult.error.message ?? "Error al cargar suscripciones");
  }
  if (recurringIncomeResult.error) {
    throw new Error(recurringIncomeResult.error.message ?? "Error al cargar ingresos fijos");
  }

  // obligation_events no tiene workspace_id en el esquema: filtrar eventos por obligaciones del workspace
  const obligationRowsForEvents = (obligationsResult.data ?? []) as ObligationSummaryRow[];
  const obligationIdsForEvents = obligationRowsForEvents.map((r) => r.id);
  let obligationEventRows: ObligationEventRow[] = [];
  if (obligationIdsForEvents.length > 0) {
    const { data: evData, error: evError } = await supabase
      .from("obligation_events")
      .select(
        "id, obligation_id, event_type, event_date, created_at, amount, installment_no, reason, description, notes, movement_id, created_by_user_id, metadata",
      )
      .in("obligation_id", obligationIdsForEvents)
      .order("event_date", { ascending: false })
      .order("id", { ascending: false });
    if (evError) throw new Error(evError.message ?? "Error al cargar eventos de obligaciones");
    obligationEventRows = (evData ?? []) as ObligationEventRow[];
  }

  // Build workspace list
  const memberRows = (membershipsResult.data ?? []) as WorkspaceMemberRow[];
  const workspaceRows = (workspacesResult.data ?? []) as WorkspaceRow[];
  const memberWorkspaceIds = new Set(memberRows.map((m) => m.workspace_id));
  const workspaces: Workspace[] = workspaceRows
    .filter((w) => memberWorkspaceIds.has(w.id))
    .map((w) => {
      const member = memberRows.find((m) => m.workspace_id === w.id)!;
      return mapWorkspace(w, member);
    });

  // Build lookup maps
  const balanceMap = new Map<number, AccountBalanceRow>();
  for (const row of (accountBalancesResult.data ?? []) as AccountBalanceRow[]) {
    balanceMap.set(row.account_id, row);
  }

  const categoryRowsRaw = (categoriesResult.data ?? []) as {
    id: number;
    workspace_id: number;
    name: string;
    kind: CategorySummary["kind"];
    parent_id: number | null;
    color: string | null;
    icon: string | null;
    sort_order: number;
    is_system: boolean;
    is_active: boolean;
    is_pinned?: boolean | null;
    created_at: string;
    updated_at: string;
  }[];
  const categoryIdToName = new Map<number, string>();
  for (const row of categoryRowsRaw) categoryIdToName.set(row.id, row.name);
  const categoryMap = categoryIdToName;
  const categories: CategorySummary[] = categoryRowsRaw.map((row) => ({
    id: row.id,
    name: row.name,
    kind: row.kind,
    isActive: row.is_active,
    workspaceId: row.workspace_id,
    parentId: row.parent_id,
    parentName: row.parent_id != null ? categoryIdToName.get(row.parent_id) ?? null : null,
    color: row.color,
    icon: row.icon,
    sortOrder: row.sort_order ?? 0,
    isSystem: row.is_system ?? false,
    isPinned: row.is_pinned ?? false,
  }));

  const counterpartyMap = new Map<number, string>();
  const counterparties: CounterpartyOverview[] = (counterpartiesResult.data ?? []).map((row: any) => {
    const mapped = mapCounterpartyFromRow(row as CounterpartyDbRow);
    counterpartyMap.set(mapped.id, mapped.name);
    return mapped;
  });

  const accounts: AccountSummary[] = (accountsResult.data ?? []).map((row: any) => {
    const balance = balanceMap.get(row.id);
    return {
      id: row.id,
      workspaceId: row.workspace_id,
      name: row.name,
      type: row.type,
      currencyCode: row.currency_code,
      openingBalance: toNum(row.opening_balance),
      currentBalance: toNum(balance?.current_balance ?? null),
      currentBalanceInBaseCurrency: toNum(balance?.current_balance ?? null),
      includeInNetWorth: row.include_in_net_worth,
      lastActivity: row.updated_at,
      color: row.color ?? "#6366F1",
      icon: row.icon ?? "wallet",
      isArchived: row.is_archived,
      institutionCode: row.institution_code ?? null,
    };
  });

  const accountMap = new Map<number, string>();
  for (const acc of accounts) accountMap.set(acc.id, acc.name);
  const accountCurrencyMap = new Map<number, string>();
  for (const acc of accounts) accountCurrencyMap.set(acc.id, acc.currencyCode.toUpperCase());

  const budgets: BudgetOverview[] = (budgetsResult.data ?? []).map((row: any) =>
    mapBudget(row as BudgetProgressRow),
  );

  const obligationTextMetaById = new Map<
    number,
    { description: string | null; notes: string | null }
  >();
  for (const r of obligationTextMetaResult.data ?? []) {
    const row = r as { id: number; description: string | null; notes: string | null };
    obligationTextMetaById.set(row.id, {
      description: row.description,
      notes: row.notes,
    });
  }

  const obligations: ObligationSummary[] = (obligationsResult.data ?? []).map((row: any) => {
    const mapped = mapObligation(row as ObligationSummaryRow, obligationEventRows, counterpartyMap);
    const meta = obligationTextMetaById.get(row.id as number);
    if (!meta) return mapped;
    return {
      ...mapped,
      description: meta.description ?? mapped.description ?? null,
      notes: meta.notes ?? mapped.notes ?? null,
    };
  });

  const exchangeRates: ExchangeRateSummary[] = (exchangeRatesResult.data ?? []).map(
    (row: any) => ({
      fromCurrencyCode: (row as ExchangeRateRow).from_currency_code,
      toCurrencyCode: (row as ExchangeRateRow).to_currency_code,
      rate: toNum((row as ExchangeRateRow).rate),
      effectiveAt: (row as ExchangeRateRow).effective_at,
    }),
  );

  const activeWsRow = workspaceRows.find((w) => w.id === activeWorkspaceId);
  const baseCurrency = (activeWsRow?.base_currency_code ?? "PEN").toUpperCase();

  // Build exchange rate map and apply currency conversion to account balances
  const _rateMap = new Map<string, number>();
  for (const r of exchangeRates) {
    const key = `${r.fromCurrencyCode.toUpperCase()}:${r.toCurrencyCode.toUpperCase()}`;
    if (!_rateMap.has(key) && r.rate > 0) _rateMap.set(key, r.rate);
  }
  function _resolveRate(from: string, to: string): number {
    if (from === to) return 1;
    const direct = _rateMap.get(`${from}:${to}`);
    if (direct) return direct;
    const inverse = _rateMap.get(`${to}:${from}`);
    if (inverse) return 1 / inverse;
    return 1;
  }
  for (const acc of accounts) {
    const from = acc.currencyCode.toUpperCase();
    if (from === baseCurrency) continue;
    acc.currentBalanceInBaseCurrency = acc.currentBalance * _resolveRate(from, baseCurrency);
  }

  const subscriptionPostedMovements: SubscriptionPostedMovement[] = subscriptionMovementsResult.error
    ? []
    : (subscriptionMovementsResult.data ?? []).map((row: any) => {
        const sourceAmount = row.source_amount != null ? toNum(row.source_amount) : null;
        const destinationAmount = row.destination_amount != null ? toNum(row.destination_amount) : null;
        const amount = movementAmountForSubscriptionAnalytics({ sourceAmount, destinationAmount });
        const amountCurrencyCode =
          sourceAmount != null && sourceAmount !== 0
            ? accountCurrencyMap.get(row.source_account_id as number) ?? baseCurrency
            : destinationAmount != null && destinationAmount !== 0
              ? accountCurrencyMap.get(row.destination_account_id as number) ?? baseCurrency
              : baseCurrency;
        return {
          id: row.id as number,
          subscriptionId: row.subscription_id as number,
          occurredAt: row.occurred_at as string,
          sourceAmount,
          destinationAmount,
          amountCurrencyCode,
          amountInBaseCurrency: convertAmountToWorkspaceBase(amount, amountCurrencyCode, baseCurrency, exchangeRates),
        };
      });

  const categoryPostedMovements: CategoryPostedMovement[] = categoryMovementsResult.error
    ? []
    : (categoryMovementsResult.data ?? []).map((row: any) => {
        const sourceAmount = row.source_amount != null ? toNum(row.source_amount) : null;
        const destinationAmount = row.destination_amount != null ? toNum(row.destination_amount) : null;
        const amount = movementAmountForSubscriptionAnalytics({ sourceAmount, destinationAmount });
        const amountCurrencyCode =
          sourceAmount != null && sourceAmount !== 0
            ? accountCurrencyMap.get(row.source_account_id as number) ?? baseCurrency
            : destinationAmount != null && destinationAmount !== 0
              ? accountCurrencyMap.get(row.destination_account_id as number) ?? baseCurrency
              : baseCurrency;
        return {
          id: row.id as number,
          categoryId: row.category_id as number,
          occurredAt: row.occurred_at as string,
          sourceAmount,
          destinationAmount,
          amountCurrencyCode,
          amountInBaseCurrency: convertAmountToWorkspaceBase(amount, amountCurrencyCode, baseCurrency, exchangeRates),
        };
      });

  const subscriptions: SubscriptionSummary[] = (subscriptionsResult.data ?? []).map(
    (row: any) =>
      mapSubscription(
        row as SubscriptionRow,
        categoryMap,
        counterpartyMap,
        accountMap,
        FREQUENCY_LABELS,
        baseCurrency,
        exchangeRates,
      ),
  );
  const recurringIncome: RecurringIncomeSummary[] = (recurringIncomeResult.data ?? []).map(
    (row: any) =>
      mapRecurringIncome(
        row as RecurringIncomeRow,
        categoryMap,
        counterpartyMap,
        accountMap,
        FREQUENCY_LABELS,
        baseCurrency,
        exchangeRates,
      ),
  );

  return {
    workspaces,
    accounts,
    categories,
    budgets,
    obligations,
    subscriptions,
    recurringIncome,
    subscriptionPostedMovements,
    categoryPostedMovements,
    counterparties,
    exchangeRates,
  };
}

function maxIsoDate(a: string | null | undefined, b: string | null | undefined): string | null {
  if (!a) return b ?? null;
  if (!b) return a;
  return a >= b ? a : b;
}

/** Lista enriquecida (conteos, última actividad) — pantalla Categorías. */
async function fetchCategoriesOverview(workspaceId: number): Promise<CategoryOverview[]> {
  if (!supabase) throw new Error("Supabase no está configurado.");

  const [catRes, movRes, subRes] = await Promise.all([
    supabase
      .from("categories")
      .select("id, workspace_id, name, kind, parent_id, color, icon, sort_order, is_system, is_active, is_pinned, created_at, updated_at")
      .eq("workspace_id", workspaceId)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true }),
    supabase
      .from("movements")
      .select("category_id, occurred_at")
      .eq("workspace_id", workspaceId)
      .not("category_id", "is", null),
    supabase
      .from("subscriptions")
      .select("category_id, updated_at")
      .eq("workspace_id", workspaceId)
      .not("category_id", "is", null),
  ]);

  if (catRes.error) throw new Error(catRes.error.message ?? "Error al cargar categorías");

  const rows = (catRes.data ?? []) as {
    id: number;
    workspace_id: number;
    name: string;
    kind: CategorySummary["kind"];
    parent_id: number | null;
    color: string | null;
    icon: string | null;
    sort_order: number;
    is_system: boolean;
    is_active: boolean;
    is_pinned?: boolean | null;
    created_at: string;
    updated_at: string;
  }[];

  const idToName = new Map<number, string>();
  for (const r of rows) idToName.set(r.id, r.name);

  const movementCount = new Map<number, number>();
  const movementLast = new Map<number, string>();
  if (!movRes.error) {
    for (const m of movRes.data ?? []) {
      const row = m as { category_id: number; occurred_at: string };
      const cid = row.category_id;
      movementCount.set(cid, (movementCount.get(cid) ?? 0) + 1);
      const prev = movementLast.get(cid);
      if (!prev || row.occurred_at > prev) movementLast.set(cid, row.occurred_at);
    }
  }

  const subscriptionCount = new Map<number, number>();
  const subscriptionLast = new Map<number, string>();
  if (!subRes.error) {
    for (const s of subRes.data ?? []) {
      const row = s as { category_id: number; updated_at: string };
      const cid = row.category_id;
      subscriptionCount.set(cid, (subscriptionCount.get(cid) ?? 0) + 1);
      const prev = subscriptionLast.get(cid);
      if (!prev || row.updated_at > prev) subscriptionLast.set(cid, row.updated_at);
    }
  }

  return rows.map((row): CategoryOverview => {
    const mc = movementCount.get(row.id) ?? 0;
    const sc = subscriptionCount.get(row.id) ?? 0;
    let lastActivityAt = maxIsoDate(movementLast.get(row.id), subscriptionLast.get(row.id));
    lastActivityAt = maxIsoDate(lastActivityAt, row.updated_at);

    return {
      id: row.id,
      name: row.name,
      kind: row.kind,
      isActive: row.is_active,
      workspaceId: row.workspace_id,
      parentId: row.parent_id,
      parentName: row.parent_id != null ? idToName.get(row.parent_id) ?? null : null,
      color: row.color,
      icon: row.icon,
      sortOrder: row.sort_order ?? 0,
      isSystem: row.is_system ?? false,
      isPinned: row.is_pinned ?? false,
      movementCount: mc,
      subscriptionCount: sc,
      lastActivityAt,
    };
  });
}

export function useCategoriesOverviewQuery(profile: AppProfile | null, workspaceId: number | null) {
  return useQuery({
    queryKey: ["categories-overview", workspaceId, profile?.id],
    queryFn: () => fetchCategoriesOverview(workspaceId!),
    enabled: Boolean(profile?.id && workspaceId),
    staleTime: STALE.medium,
    retry: 1,
  });
}

// ─── Workspace list init (no activeWorkspaceId needed) ────────────────────────

export async function fetchUserWorkspaces(userId: string) {
  if (!supabase) throw new Error("Supabase no está configurado.");
  const [membershipsResult, workspacesResult] = await Promise.all([
    supabase.from("workspace_members").select("workspace_id, role, is_default_workspace, joined_at").eq("user_id", userId),
    supabase.from("workspaces").select("id, owner_user_id, name, kind, base_currency_code, description, is_archived"),
  ]);
  const memberRows = (membershipsResult.data ?? []) as WorkspaceMemberRow[];
  const workspaceRows = (workspacesResult.data ?? []) as WorkspaceRow[];
  const memberIds = new Set(memberRows.map((m) => m.workspace_id));
  return workspaceRows
    .filter((w) => memberIds.has(w.id))
    .map((w) => mapWorkspace(w, memberRows.find((m) => m.workspace_id === w.id)!));
}

export function useUserWorkspacesQuery(userId: string | null | undefined) {
  return useQuery({
    queryKey: ["user-workspaces", userId],
    queryFn: () => fetchUserWorkspaces(userId!),
    enabled: Boolean(userId),
    staleTime: STALE.medium,
    retry: 1,
  });
}

export function useWorkspaceSnapshotQuery(
  profile: AppProfile | null,
  activeWorkspaceId: number | null,
) {
  return useQuery({
    queryKey: ["workspace-snapshot", activeWorkspaceId, profile?.id],
    queryFn: () => fetchWorkspaceSnapshot(profile!.id, activeWorkspaceId!),
    enabled: Boolean(profile?.id && activeWorkspaceId),
    // 30s: snapshot core (saldos, categorías, presupuestos). Al entrar a un módulo, si pasaron
    // >30s refetch en background mostrando lo previo (placeholderData global). Realtime lo
    // mantiene fresco con la app abierta; esto cubre el hueco al volver de background / otra
    // pantalla / otro dispositivo, sin polling.
    staleTime: STALE.short,
    refetchOnReconnect: true,
    retry: 3,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 10_000),
  });
}

// ─── Dashboard movements query ────────────────────────────────────────────────

import type { DashboardAnalyticsBundle, DashboardMovementRow } from "../../features/dashboard/lib/dashboard-row";
export type { DashboardAnalyticsBundle, DashboardMovementRow };

export type PersistMovementAnalyticsSignalInput = {
  movementId: number;
  normalizedDescription?: string | null;
  merchantGuess?: string | null;
  suggestedCategoryId?: number | null;
  suggestedCategoryConfidence?: number | null;
  anomalyScore?: number | null;
  signalReasons?: string[];
  analyticsVersion?: string;
};

export type PersistWorkspaceAnalyticsSnapshotInput = {
  snapshotKind: string;
  periodKey: string;
  expectedBalance?: number | null;
  conservativeBalance?: number | null;
  optimisticBalance?: number | null;
  committedInflow?: number | null;
  committedOutflow?: number | null;
  variableIncomeProjection?: number | null;
  variableExpenseProjection?: number | null;
  confidence?: number | null;
  metadata?: JsonValue | null;
  analyticsVersion?: string;
};

export type PersistDashboardAnalyticsInput = {
  signals: PersistMovementAnalyticsSignalInput[];
  snapshot?: PersistWorkspaceAnalyticsSnapshotInput | null;
};

export type PersistLearningFeedbackInput = {
  movementId: number;
  feedbackKind: "accepted_category_suggestion" | "rejected_category_suggestion" | "manual_category_change";
  normalizedDescription?: string | null;
  previousCategoryId?: number | null;
  acceptedCategoryId?: number | null;
  confidence?: number | null;
  source?: string;
  metadata?: JsonValue | null;
};

export function useDashboardMovementsQuery(
  workspaceId: number | null,
  userScopeKey?: string | null,
) {
  return useQuery({
    queryKey: ["dashboard-movements", userScopeKey ?? null, workspaceId],
    queryFn: async (): Promise<DashboardMovementRow[]> => {
      if (!supabase || !workspaceId) return [];
      const since = new Date();
      since.setDate(since.getDate() - 90);
      const { data, error } = await supabase
        .from("movements")
        .select("id, movement_type, status, occurred_at, source_amount, destination_amount, source_account_id, destination_account_id, category_id, counterparty_id, description")
        .eq("workspace_id", workspaceId)
        .gte("occurred_at", since.toISOString())
        .order("occurred_at", { ascending: false })
        .order("id", { ascending: false });
      if (error) throw new Error(error.message ?? "Error al cargar movimientos");
      return (data ?? []).map((row: any): DashboardMovementRow => ({
        id: row.id,
        movementType: row.movement_type,
        status: row.status,
        occurredAt: row.occurred_at,
        sourceAmount: toNum(row.source_amount),
        destinationAmount: toNum(row.destination_amount),
        sourceAccountId: row.source_account_id ?? null,
        destinationAccountId: row.destination_account_id ?? null,
        categoryId: row.category_id ?? null,
        counterpartyId: row.counterparty_id ?? null,
        description: typeof row.description === "string" ? row.description : "",
      }));
    },
    enabled: Boolean(workspaceId),
    staleTime: STALE.short,
    retry: 1,
  });
}

/**
 * Movimientos del año seleccionado + año anterior (24 meses) para los widgets de
 * historial anual y comparación estacional del dashboard avanzado. La query base
 * de 90 días no alcanza para estas métricas.
 */
export function useDashboardYearMovementsQuery(
  workspaceId: number | null,
  year: number,
  userScopeKey?: string | null,
) {
  return useQuery({
    queryKey: ["dashboard-year-movements", userScopeKey ?? null, workspaceId, year],
    queryFn: async (): Promise<DashboardMovementRow[]> => {
      if (!supabase || !workspaceId) return [];
      const from = `${year - 1}-01-01T00:00:00.000Z`;
      const to = `${year + 1}-01-01T00:00:00.000Z`;
      const { data, error } = await supabase
        .from("movements")
        .select("id, movement_type, status, occurred_at, source_amount, destination_amount, source_account_id, destination_account_id, category_id, counterparty_id, description")
        .eq("workspace_id", workspaceId)
        .gte("occurred_at", from)
        .lt("occurred_at", to)
        .order("occurred_at", { ascending: false })
        .order("id", { ascending: false });
      if (error) throw new Error(error.message ?? "Error al cargar historial anual");
      return (data ?? []).map((row: any): DashboardMovementRow => ({
        id: row.id,
        movementType: row.movement_type,
        status: row.status,
        occurredAt: row.occurred_at,
        sourceAmount: toNum(row.source_amount),
        destinationAmount: toNum(row.destination_amount),
        sourceAccountId: row.source_account_id ?? null,
        destinationAccountId: row.destination_account_id ?? null,
        categoryId: row.category_id ?? null,
        counterpartyId: row.counterparty_id ?? null,
        description: typeof row.description === "string" ? row.description : "",
      }));
    },
    enabled: Boolean(workspaceId) && Number.isFinite(year),
    staleTime: STALE.long,
    retry: 1,
  });
}

export function useDashboardAnalyticsQuery(
  workspaceId: number | null,
  userScopeKey?: string | null,
) {
  return useQuery({
    queryKey: ["dashboard-analytics", userScopeKey ?? null, workspaceId],
    queryFn: async (): Promise<DashboardAnalyticsBundle> => {
      const fallback: DashboardAnalyticsBundle = {
        signals: [],
        learningFeedback: [],
        projectionSnapshot: null,
        available: false,
      };
      if (!supabase || !workspaceId) return fallback;

      const [signalsResult, feedbackResult, snapshotResult] = await Promise.all([
        supabase
          .from("movement_analytics_signals")
          .select("id, workspace_id, movement_id, normalized_description, merchant_guess, suggested_category_id, suggested_category_confidence, anomaly_score, signal_reasons, analytics_version, created_at, updated_at")
          .eq("workspace_id", workspaceId)
          .order("updated_at", { ascending: false })
          .limit(300),
        supabase
          .from("movement_learning_feedback")
          .select("id, workspace_id, user_id, movement_id, feedback_kind, normalized_description, previous_category_id, accepted_category_id, confidence, source, metadata, created_at")
          .eq("workspace_id", workspaceId)
          .order("created_at", { ascending: false })
          .limit(300),
        supabase
          .from("workspace_analytics_snapshots")
          .select("id, workspace_id, snapshot_kind, period_key, expected_balance, conservative_balance, optimistic_balance, committed_inflow, committed_outflow, variable_income_projection, variable_expense_projection, confidence, metadata, analytics_version, generated_at, updated_at")
          .eq("workspace_id", workspaceId)
          .eq("snapshot_kind", "month_projection")
          .order("period_key", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);

      const missingSignals =
        signalsResult.error && isMissingRelationError(signalsResult.error, "movement_analytics_signals");
      const missingFeedback =
        feedbackResult.error && isMissingRelationError(feedbackResult.error, "movement_learning_feedback");
      const missingSnapshot =
        snapshotResult.error && isMissingRelationError(snapshotResult.error, "workspace_analytics_snapshots");

      if (signalsResult.error && !missingSignals) {
        throw new Error(signalsResult.error.message ?? "No se pudieron cargar las señales analíticas.");
      }
      if (feedbackResult.error && !missingFeedback) {
        throw new Error(feedbackResult.error.message ?? "No se pudo cargar el aprendizaje persistido.");
      }
      if (snapshotResult.error && !missingSnapshot) {
        throw new Error(snapshotResult.error.message ?? "No se pudo cargar la proyección persistida.");
      }

      const signals: MovementAnalyticsSignal[] = missingSignals
        ? []
        : (signalsResult.data ?? []).map((row: any) => ({
          id: Number(row.id),
          workspaceId: Number(row.workspace_id),
          movementId: Number(row.movement_id),
          normalizedDescription:
            typeof row.normalized_description === "string" ? row.normalized_description : null,
          merchantGuess: typeof row.merchant_guess === "string" ? row.merchant_guess : null,
          suggestedCategoryId:
            row.suggested_category_id == null ? null : Number(row.suggested_category_id),
          suggestedCategoryConfidence:
            row.suggested_category_confidence == null
              ? null
              : Number(row.suggested_category_confidence),
          anomalyScore: row.anomaly_score == null ? null : Number(row.anomaly_score),
          signalReasons: Array.isArray(row.signal_reasons)
            ? row.signal_reasons.map((item: unknown) => String(item))
            : [],
          analyticsVersion: String(row.analytics_version ?? "v1"),
          createdAt: String(row.created_at ?? ""),
          updatedAt: String(row.updated_at ?? ""),
        }));

      const learningFeedback: MovementLearningFeedback[] = missingFeedback
        ? []
        : (feedbackResult.data ?? []).map((row: any) => ({
          id: Number(row.id),
          workspaceId: Number(row.workspace_id),
          userId: typeof row.user_id === "string" ? row.user_id : null,
          movementId: Number(row.movement_id),
          feedbackKind: String(row.feedback_kind ?? ""),
          normalizedDescription:
            typeof row.normalized_description === "string" ? row.normalized_description : null,
          previousCategoryId:
            row.previous_category_id == null ? null : Number(row.previous_category_id),
          acceptedCategoryId:
            row.accepted_category_id == null ? null : Number(row.accepted_category_id),
          confidence: row.confidence == null ? null : Number(row.confidence),
          source: String(row.source ?? "dashboard"),
          metadata: row.metadata == null ? null : (row.metadata as JsonValue),
          createdAt: String(row.created_at ?? ""),
        }));

      const projectionSnapshot: WorkspaceAnalyticsSnapshot | null =
        missingSnapshot || !snapshotResult.data
          ? null
          : {
            id: Number(snapshotResult.data.id),
            workspaceId: Number(snapshotResult.data.workspace_id),
            snapshotKind: String(snapshotResult.data.snapshot_kind ?? ""),
            periodKey: String(snapshotResult.data.period_key ?? ""),
            expectedBalance:
              snapshotResult.data.expected_balance == null
                ? null
                : Number(snapshotResult.data.expected_balance),
            conservativeBalance:
              snapshotResult.data.conservative_balance == null
                ? null
                : Number(snapshotResult.data.conservative_balance),
            optimisticBalance:
              snapshotResult.data.optimistic_balance == null
                ? null
                : Number(snapshotResult.data.optimistic_balance),
            committedInflow:
              snapshotResult.data.committed_inflow == null
                ? null
                : Number(snapshotResult.data.committed_inflow),
            committedOutflow:
              snapshotResult.data.committed_outflow == null
                ? null
                : Number(snapshotResult.data.committed_outflow),
            variableIncomeProjection:
              snapshotResult.data.variable_income_projection == null
                ? null
                : Number(snapshotResult.data.variable_income_projection),
            variableExpenseProjection:
              snapshotResult.data.variable_expense_projection == null
                ? null
                : Number(snapshotResult.data.variable_expense_projection),
            confidence:
              snapshotResult.data.confidence == null
                ? null
                : Number(snapshotResult.data.confidence),
            metadata:
              snapshotResult.data.metadata == null
                ? null
                : (snapshotResult.data.metadata as JsonValue),
            analyticsVersion: String(snapshotResult.data.analytics_version ?? "v1"),
            generatedAt: String(snapshotResult.data.generated_at ?? ""),
            updatedAt: String(snapshotResult.data.updated_at ?? ""),
          };

      return {
        signals,
        learningFeedback,
        projectionSnapshot,
        available: !missingSignals || !missingFeedback || !missingSnapshot,
      };
    },
    enabled: Boolean(workspaceId),
    staleTime: STALE.short,
    retry: 1,
  });
}

export type DashboardAiSummaryInput = {
  workspaceId: number;
  summary: Record<string, unknown>;
  tone: "managerial" | "personal";
};

export type DashboardAiSummaryResponse = {
  ok: boolean;
  reply: string;
  complexTerms?: Array<{
    term: string;
    explanation: string;
  }>;
  model?: string | null;
  tone?: string | null;
};

export function useDashboardAiSummaryMutation() {
  return useMutation({
    mutationFn: async (input: DashboardAiSummaryInput): Promise<DashboardAiSummaryResponse> => {
      if (!input.workspaceId) throw new Error("No se encontró el workspace activo.");
      if (!input.summary || typeof input.summary !== "object") {
        throw new Error("No hay resumen suficiente para enviar a la IA.");
      }
      if (input.tone !== "managerial" && input.tone !== "personal") {
        throw new Error("No se encontró el estilo de explicación.");
      }
      return invokeEdgeFunction<DashboardAiSummaryResponse>("dashboard-advanced-ai-summary", input);
    },
  });
}

export type DashboardAiPatternsInput = DashboardAiSummaryInput;
export type DashboardAiPatternsResponse = DashboardAiSummaryResponse;

export function useDashboardAiPatternsMutation() {
  return useMutation({
    mutationFn: async (input: DashboardAiPatternsInput): Promise<DashboardAiPatternsResponse> => {
      if (!input.workspaceId) throw new Error("No se encontró el workspace activo.");
      if (!input.summary || typeof input.summary !== "object") {
        throw new Error("No hay patrones suficientes para enviar a la IA.");
      }
      if (input.tone !== "managerial" && input.tone !== "personal") {
        throw new Error("No se encontró el estilo de explicación.");
      }
      return invokeEdgeFunction<DashboardAiPatternsResponse>("dashboard-advanced-ai-patterns", input);
    },
  });
}

export type DashboardAiFlowInput = DashboardAiSummaryInput;
export type DashboardAiFlowResponse = DashboardAiSummaryResponse;

export function useDashboardAiFlowMutation() {
  return useMutation({
    mutationFn: async (input: DashboardAiFlowInput): Promise<DashboardAiFlowResponse> => {
      if (!input.workspaceId) throw new Error("No se encontró el workspace activo.");
      if (!input.summary || typeof input.summary !== "object") {
        throw new Error("No hay datos de flujo suficientes para enviar a la IA.");
      }
      if (input.tone !== "managerial" && input.tone !== "personal") {
        throw new Error("No se encontró el estilo de explicación.");
      }
      return invokeEdgeFunction<DashboardAiFlowResponse>("dashboard-advanced-ai-flow", input);
    },
  });
}

export type DashboardAiHistoryInput = DashboardAiSummaryInput;
export type DashboardAiHistoryResponse = DashboardAiSummaryResponse;

export function useDashboardAiHistoryMutation() {
  return useMutation({
    mutationFn: async (input: DashboardAiHistoryInput): Promise<DashboardAiHistoryResponse> => {
      if (!input.workspaceId) throw new Error("No se encontró el workspace activo.");
      if (!input.summary || typeof input.summary !== "object") {
        throw new Error("No hay datos históricos suficientes para enviar a la IA.");
      }
      if (input.tone !== "managerial" && input.tone !== "personal") {
        throw new Error("No se encontró el estilo de explicación.");
      }
      return invokeEdgeFunction<DashboardAiHistoryResponse>("dashboard-advanced-ai-history", input);
    },
  });
}

export type DashboardAiHealthInput = DashboardAiSummaryInput;
export type DashboardAiHealthResponse = DashboardAiSummaryResponse;

export function useDashboardAiHealthMutation() {
  return useMutation({
    mutationFn: async (input: DashboardAiHealthInput): Promise<DashboardAiHealthResponse> => {
      if (!input.workspaceId) throw new Error("No se encontró el workspace activo.");
      if (!input.summary || typeof input.summary !== "object") {
        throw new Error("No hay datos de salud suficientes para enviar a la IA.");
      }
      if (input.tone !== "managerial" && input.tone !== "personal") {
        throw new Error("No se encontró el estilo de explicación.");
      }
      return invokeEdgeFunction<DashboardAiHealthResponse>("dashboard-advanced-ai-health", input);
    },
  });
}

export type MovementCategoryAiSurface = "movement_form" | "notification_form" | "android_overlay";

export type MovementCategoryAiCategoryInput = {
  id: number;
  name: string;
  kind: "expense" | "income" | "both";
};

export type MovementCategoryAiLocalSuggestion = {
  categoryId: number | null;
  categoryName: string | null;
  confidence: number | null;
  reasons: string[];
} | null;

export type MovementCategoryAiRecommendation = {
  type: "existing_category" | "new_category" | "none";
  categoryId: number | null;
  categoryName: string | null;
  newCategoryName: string | null;
  confidence: number;
  reasons: string[];
};

export type MovementCategoryAiSuggestionInput = {
  workspaceId: number;
  surface: MovementCategoryAiSurface;
  movementType: "expense" | "income";
  amount?: number | null;
  currencyCode?: string | null;
  description: string;
  occurredAt?: string | null;
  categories: MovementCategoryAiCategoryInput[];
  localSuggestion?: MovementCategoryAiLocalSuggestion;
};

export type MovementCategoryAiSuggestionResponse = {
  ok: boolean;
  recommendation: MovementCategoryAiRecommendation | null;
  model?: string | null;
  error?: string | null;
};

export async function requestMovementCategoryAiSuggestion(
  input: MovementCategoryAiSuggestionInput,
): Promise<MovementCategoryAiSuggestionResponse> {
  if (!input.workspaceId) throw new Error("No se encontró el workspace activo.");
  if (!input.description.trim()) throw new Error("No hay descripción suficiente para sugerir categoría.");
  if (!input.categories.length) throw new Error("No hay categorías disponibles para sugerir.");
  return invokeEdgeFunction<MovementCategoryAiSuggestionResponse>("movement-category-ai-suggestion", input);
}

export function useMovementCategoryAiSuggestionMutation() {
  return useMutation({
    mutationFn: requestMovementCategoryAiSuggestion,
  });
}

export type MovementDescriptionCleanupSurface = "movement_form" | "notification_form" | "android_overlay";

export type MovementDescriptionCleanupInput = {
  workspaceId: number;
  surface: MovementDescriptionCleanupSurface;
  rawDescription: string;
  appLabel?: string | null;
  financialAppKey?: string | null;
  amount?: number | null;
  currencyCode?: string | null;
  localCleanup?: {
    cleanedDescription: string;
    confidence: number;
    reasons: string[];
  } | null;
};

export type MovementDescriptionCleanupResponse = {
  ok: boolean;
  cleanedDescription: string | null;
  confidence: number;
  reasons: string[];
  model?: string | null;
  error?: string | null;
};

export async function requestMovementDescriptionCleanup(
  input: MovementDescriptionCleanupInput,
): Promise<MovementDescriptionCleanupResponse> {
  if (!input.workspaceId) throw new Error("No se encontró el workspace activo.");
  if (!input.rawDescription.trim()) throw new Error("No hay descripción suficiente para limpiar.");
  return invokeEdgeFunction<MovementDescriptionCleanupResponse>("movement-description-ai-cleanup", input);
}

export function useMovementDescriptionCleanupMutation() {
  return useMutation({
    mutationFn: requestMovementDescriptionCleanup,
  });
}

export type MovementCounterpartyAiSurface = "movement_form" | "notification_form" | "android_overlay";

export type MovementCounterpartyAiInput = {
  workspaceId: number;
  surface: MovementCounterpartyAiSurface;
  description: string;
  movementType: "expense" | "income";
  amount?: number | null;
  currencyCode?: string | null;
  counterparties: Array<{
    id: number;
    name: string;
    type: CounterpartySummary["type"];
  }>;
  localSuggestion?: {
    type: "existing_counterparty" | "new_counterparty" | "none";
    counterpartyId: number | null;
    counterpartyName: string | null;
    newCounterpartyName: string | null;
    counterpartyType?: CounterpartySummary["type"] | null;
    confidence: number;
    reasons: string[];
  } | null;
};

export type MovementCounterpartyAiRecommendation = {
  type: "existing_counterparty" | "new_counterparty" | "none";
  counterpartyId: number | null;
  counterpartyName: string | null;
  newCounterpartyName: string | null;
  counterpartyType: CounterpartySummary["type"];
  confidence: number;
  reasons: string[];
};

export type MovementCounterpartyAiResponse = {
  ok: boolean;
  recommendation: MovementCounterpartyAiRecommendation | null;
  model?: string | null;
  error?: string | null;
};

export async function requestMovementCounterpartyAiSuggestion(
  input: MovementCounterpartyAiInput,
): Promise<MovementCounterpartyAiResponse> {
  if (!input.workspaceId) throw new Error("No se encontró el workspace activo.");
  if (!input.description.trim()) throw new Error("No hay descripción suficiente para sugerir contraparte.");
  return invokeEdgeFunction<MovementCounterpartyAiResponse>("movement-counterparty-ai-suggestion", input);
}

export function useMovementCounterpartyAiSuggestionMutation() {
  return useMutation({
    mutationFn: requestMovementCounterpartyAiSuggestion,
  });
}

export type MovementRecurringAiSurface = "movement_form" | "notification_form" | "android_overlay";
export type MovementRecurringAiFrequency = "weekly" | "biweekly" | "monthly" | "quarterly" | "yearly";

export type MovementRecurringAiRecommendation = {
  type: "subscription" | "recurring_income" | "none";
  name: string | null;
  frequency: MovementRecurringAiFrequency | null;
  intervalCount: number | null;
  confidence: number;
  reasons: string[];
};

export type MovementRecurringAiInput = {
  workspaceId: number;
  surface: MovementRecurringAiSurface;
  movementType: "expense" | "income";
  description: string;
  amount?: number | null;
  currencyCode?: string | null;
  occurredAt: string;
  category?: { id: number; name: string } | null;
  counterparty?: { id: number; name: string } | null;
  recentMovements: Array<{
    id: number;
    movementType: string;
    occurredAt: string;
    description: string;
    amount: number;
    currencyCode?: string | null;
    categoryId?: number | null;
    counterpartyId?: number | null;
  }>;
  subscriptions: Array<{
    id: number;
    name: string;
    amount: number;
    currencyCode: string;
    frequency: SubscriptionFrequency;
    intervalCount: number;
    vendorPartyId?: number | null;
    categoryId?: number | null;
  }>;
  recurringIncome: Array<{
    id: number;
    name: string;
    amount: number;
    currencyCode: string;
    frequency: RecurringIncomeFrequency;
    intervalCount: number;
    payerPartyId?: number | null;
    categoryId?: number | null;
  }>;
  localSuggestion?: MovementRecurringAiRecommendation | null;
};

export type MovementRecurringAiResponse = {
  ok: boolean;
  recommendation: MovementRecurringAiRecommendation | null;
  model?: string | null;
  error?: string | null;
};

export async function requestMovementRecurringAiSuggestion(
  input: MovementRecurringAiInput,
): Promise<MovementRecurringAiResponse> {
  if (!input.workspaceId) throw new Error("No se encontró el workspace activo.");
  if (!input.description.trim()) throw new Error("No hay descripción suficiente para detectar recurrentes.");
  return invokeEdgeFunction<MovementRecurringAiResponse>("movement-recurring-ai-suggestion", input);
}

export function useMovementRecurringAiSuggestionMutation() {
  return useMutation({
    mutationFn: requestMovementRecurringAiSuggestion,
  });
}

export type NotificationMovementAiClassificationInput = {
  workspaceId: number;
  packageName?: string | null;
  appLabel?: string | null;
  financialAppKey?: string | null;
  title?: string | null;
  text?: string | null;
  subText?: string | null;
  amountLabel?: string | null;
  movementType?: "expense" | "income" | "unknown" | string | null;
  localConfidence?: "high" | "medium" | "low" | string | null;
};

export type NotificationMovementAiClassificationResponse = {
  ok: boolean;
  classification: {
    isMovement: boolean;
    movementType: "expense" | "income" | "unknown";
    confidence: number;
    reason: string;
  } | null;
  model?: string | null;
  error?: string | null;
};

export async function requestNotificationMovementAiClassification(
  input: NotificationMovementAiClassificationInput,
): Promise<NotificationMovementAiClassificationResponse> {
  if (!input.workspaceId) throw new Error("No se encontró el workspace activo.");
  const text = [input.title, input.text, input.subText].filter(Boolean).join(" ").trim();
  if (!text) throw new Error("No hay texto suficiente para clasificar la notificación.");
  return invokeEdgeFunction<NotificationMovementAiClassificationResponse>("notification-movement-ai-classifier", input);
}

export type MovementRiskAiExplanationInput = {
  workspaceId: number;
  surface: "movement_form" | "notification_form" | "android_overlay";
  currentMovement: {
    movementType: string;
    occurredAt: string;
    description: string;
    amount: number;
    categoryName?: string | null;
    counterpartyName?: string | null;
    accountName?: string | null;
  };
  relatedMovements: Array<{
    id: number;
    movementType: string;
    occurredAt: string;
    description: string;
    amount: number;
    categoryName?: string | null;
    counterpartyName?: string | null;
    accountName?: string | null;
  }>;
  localRisk?: {
    kind: "duplicate" | "amount_anomaly";
    severity: "low" | "medium" | "high";
    confidence: number;
    title: string;
    explanation: string;
    reasons: string[];
    relatedMovementIds: number[];
  } | null;
};

export type MovementRiskAiExplanationResponse = {
  ok: boolean;
  explanation: {
    kind: "duplicate" | "amount_anomaly";
    severity: "low" | "medium" | "high";
    confidence: number;
    title: string;
    explanation: string;
    reasons: string[];
    relatedMovementIds: number[];
  } | null;
  model?: string | null;
  error?: string | null;
};

export async function requestMovementRiskAiExplanation(
  input: MovementRiskAiExplanationInput,
): Promise<MovementRiskAiExplanationResponse> {
  if (!input.workspaceId) throw new Error("No se encontró el workspace activo.");
  if (!input.currentMovement.description.trim()) throw new Error("No hay descripción suficiente para explicar el riesgo.");
  return invokeEdgeFunction<MovementRiskAiExplanationResponse>("movement-risk-ai-explanation", input);
}

export type MovementBudgetAiRecommendationInput = {
  workspaceId: number;
  surface: "movement_form" | "notification_form" | "android_overlay";
  movement: {
    movementType: string;
    occurredAt: string;
    description: string;
    amount: number;
    currencyCode: string;
    categoryName?: string | null;
    counterpartyName?: string | null;
    accountName?: string | null;
  };
  budgetImpact: {
    budgetId: number;
    budgetName: string;
    currencyCode: string;
    impactAmount: number;
    previousSpentAmount: number;
    projectedSpentAmount: number;
    limitAmount: number;
    previousUsedPercent: number;
    projectedUsedPercent: number;
    overAmount: number;
    severity: "low" | "medium" | "high";
    confidence: number;
    reasons: string[];
  };
};

export type MovementBudgetAiRecommendationResponse = {
  ok: boolean;
  recommendation: {
    budgetId: number;
    budgetName: string;
    severity: "low" | "medium" | "high";
    confidence: number;
    title: string;
    recommendation: string;
    reasons: string[];
  } | null;
  model?: string | null;
  error?: string | null;
};

export async function requestMovementBudgetAiRecommendation(
  input: MovementBudgetAiRecommendationInput,
): Promise<MovementBudgetAiRecommendationResponse> {
  if (!input.workspaceId) throw new Error("No se encontró el workspace activo.");
  return invokeEdgeFunction<MovementBudgetAiRecommendationResponse>("movement-budget-ai-recommendation", input);
}

export function usePersistDashboardAnalyticsMutation(workspaceId: number | null) {
  return useMutation({
    mutationFn: async (input: PersistDashboardAnalyticsInput) => {
      if (!supabase || !workspaceId) return { persisted: false };
      const nowIso = new Date().toISOString();

      if (input.signals.length > 0) {
        const payload = input.signals.map((signal) => ({
          workspace_id: workspaceId,
          movement_id: signal.movementId,
          normalized_description: signal.normalizedDescription ?? null,
          merchant_guess: signal.merchantGuess ?? null,
          suggested_category_id: signal.suggestedCategoryId ?? null,
          suggested_category_confidence: signal.suggestedCategoryConfidence ?? null,
          anomaly_score: signal.anomalyScore ?? null,
          signal_reasons: signal.signalReasons ?? [],
          analytics_version: signal.analyticsVersion ?? "v1",
          updated_at: nowIso,
        }));

        const { error } = await supabase
          .from("movement_analytics_signals")
          .upsert(payload, { onConflict: "workspace_id,movement_id" });

        if (error && !isMissingRelationError(error, "movement_analytics_signals")) {
          throw new Error(error.message ?? "No se pudieron persistir las señales analíticas.");
        }
      }

      if (input.snapshot) {
        const payload = {
          workspace_id: workspaceId,
          snapshot_kind: input.snapshot.snapshotKind,
          period_key: input.snapshot.periodKey,
          expected_balance: input.snapshot.expectedBalance ?? null,
          conservative_balance: input.snapshot.conservativeBalance ?? null,
          optimistic_balance: input.snapshot.optimisticBalance ?? null,
          committed_inflow: input.snapshot.committedInflow ?? null,
          committed_outflow: input.snapshot.committedOutflow ?? null,
          variable_income_projection: input.snapshot.variableIncomeProjection ?? null,
          variable_expense_projection: input.snapshot.variableExpenseProjection ?? null,
          confidence: input.snapshot.confidence ?? null,
          metadata: input.snapshot.metadata ?? {},
          analytics_version: input.snapshot.analyticsVersion ?? "v1",
          generated_at: nowIso,
          updated_at: nowIso,
        };

        const { error } = await supabase
          .from("workspace_analytics_snapshots")
          .upsert(payload, { onConflict: "workspace_id,snapshot_kind,period_key" });

        if (error && !isMissingRelationError(error, "workspace_analytics_snapshots")) {
          throw new Error(error.message ?? "No se pudo persistir el snapshot analítico.");
        }
      }

      return { persisted: true };
    },
  });
}

export function usePersistLearningFeedbackMutation(
  workspaceId: number | null,
  userId?: string | null,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: PersistLearningFeedbackInput) => {
      if (!supabase || !workspaceId) return { persisted: false };
      const payload = {
        workspace_id: workspaceId,
        user_id: userId ?? null,
        movement_id: input.movementId,
        feedback_kind: input.feedbackKind,
        normalized_description: input.normalizedDescription ?? null,
        previous_category_id: input.previousCategoryId ?? null,
        accepted_category_id: input.acceptedCategoryId ?? null,
        confidence: input.confidence ?? null,
        source: input.source ?? "dashboard",
        metadata: input.metadata ?? {},
      };

      const { error } = await supabase
        .from("movement_learning_feedback")
        .insert(payload);

      if (error && !isMissingRelationError(error, "movement_learning_feedback")) {
        throw new Error(error.message ?? "No se pudo persistir el aprendizaje.");
      }

      return { persisted: !error };
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["dashboard-analytics"] });
    },
  });
}

// ─── Movement mutations ───────────────────────────────────────────────────────

import type { MovementFormInput } from "../../features/movements/lib/movement-input-types";
export type { MovementFormInput };

const MOVEMENT_RECORD_COLUMNS =
  "id, workspace_id, movement_type, status, occurred_at, description, notes, source_account_id, source_amount, destination_account_id, destination_amount, fx_rate, category_id, counterparty_id, obligation_id, subscription_id, metadata";

export async function createMovement(
  workspaceId: number,
  input: MovementFormInput,
): Promise<MovementRecord> {
  if (!supabase) throw new Error("Supabase no está configurado.");

  const dedupeKey = input.dedupeKey ?? null;
  const payload: Record<string, unknown> = {
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
    client_dedupe_key: dedupeKey,
  };

  let { data, error } = await supabase
    .from("movements")
    .insert(payload)
    .select(MOVEMENT_RECORD_COLUMNS)
    .single();

  // Idempotencia: si este intento ya insertó antes (doble submit, retry tras timeout,
  // carrera overlay-headless vs React con la misma sugerencia), el unique parcial por
  // (workspace_id, client_dedupe_key) responde 23505. Se devuelve la fila existente
  // como éxito en lugar de propagar el error.
  if (error && dedupeKey && (error as { code?: string }).code === "23505") {
    const existing = await supabase
      .from("movements")
      .select(MOVEMENT_RECORD_COLUMNS)
      .eq("workspace_id", workspaceId)
      .eq("client_dedupe_key", dedupeKey)
      .maybeSingle();
    if (existing.data) {
      data = existing.data;
      error = null;
    }
  }

  if (error) throw new Error(formatSupabaseError(error) || "Error al guardar el movimiento");
  const row = data as any;
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
    sourceAmount: toNum(row.source_amount),
    destinationAccountId: row.destination_account_id,
    destinationAccountName: null,
    destinationAmount: toNum(row.destination_amount),
    fxRate: toNum(row.fx_rate),
    obligationId: row.obligation_id,
    subscriptionId: row.subscription_id,
    metadata: row.metadata,
  };
}

export function useCreateMovementMutation(workspaceId: number | null) {
  const queryClient = useQueryClient();
  return useMutation({
    // Key global: permite a la lista de movimientos mostrar "Guardando movimiento…"
    // (useIsMutating) mientras un create sigue en vuelo, incluso si el usuario ya
    // cerró el formulario — antes no había señal y lo registraba de nuevo a mano.
    mutationKey: ["create-movement"],
    mutationFn: (input: MovementFormInput) => createMovement(workspaceId!, input),
    onSuccess: (_data, variables) => {
      // Primero el parche quirúrgico del cache: saldo y listas cambian en este
      // frame; el refetch de abajo confirma/corrige en segundo plano.
      if (workspaceId) patchSnapshotWithCreatedMovement(queryClient, workspaceId, _data);
      // Invalidación INMEDIATA (no diferida por InteractionManager): tras guardar un movimiento,
      // la lista y los saldos deben reflejarlo al instante. runBackgroundQueryRefresh difería el
      // refetch hasta terminar interacciones/animaciones, dejando la UI desactualizada hasta un
      // pull-to-refresh manual. Disparamos el refetch ya y sin bloquear el cierre del sheet.
      void queryClient.invalidateQueries({ queryKey: ["movements"] });
      void queryClient.invalidateQueries({ queryKey: ["workspace-snapshot"] });
      // Registro originado en una detección de notificación: refrescar también la campana y la
      // sugerencia. Cubre la ventana entre crear el movimiento y marcar la sugerencia (si el
      // mark falla, la notificación no queda "pendiente" stale en pantalla).
      const metadata = variables.metadata as { source?: unknown; suggestionId?: unknown } | null | undefined;
      if (typeof metadata?.source === "string" && metadata.source.startsWith("notification_detection")) {
        void queryClient.invalidateQueries({ queryKey: ["notifications"] });
        const suggestionId = Number(metadata.suggestionId);
        if (Number.isFinite(suggestionId) && suggestionId > 0) {
          void queryClient.invalidateQueries({ queryKey: ["detected-movement-suggestion", suggestionId] });
        }
      }
    },
  });
}

// --- Accounts ---
// Movido a ./accounts.ts. Se re-exporta para preservar imports existentes.

export {
  type AccountFormInput,
  type AccountMovementAnalytics,
  useCreateAccountMutation,
  useUpdateAccountMutation,
  useArchiveAccountMutation,
  useDeleteAccountMutation,
  useAccountAnalyticsQuery,
} from "./accounts";

// --- Budgets ---
// Movido a ./budgets.ts. Se re-exporta para preservar imports existentes.

export {
  type BudgetFormInput,
  type BudgetUpdateInput,
  useCreateBudgetMutation,
  useUpdateBudgetMutation,
  useDeleteBudgetMutation,
} from "./budgets";

// ─── Movement mutations (update / void) ──────────────────────────────────────

import type { MovementUpdateInput } from "../../features/movements/lib/movement-input-types";
export type { MovementUpdateInput };

export function useUpdateMovementMutation(workspaceId: number | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, input }: { id: number; input: MovementUpdateInput }) => {
      if (!supabase || !workspaceId) throw new Error("Workspace no disponible.");
      const payload: Record<string, unknown> = {};
      if (input.description !== undefined) payload.description = input.description;
      if (input.notes !== undefined) payload.notes = input.notes;
      if (input.categoryId !== undefined) payload.category_id = input.categoryId;
      if (input.counterpartyId !== undefined) payload.counterparty_id = input.counterpartyId;
      if (input.occurredAt !== undefined) payload.occurred_at = input.occurredAt;
      if (input.status !== undefined) payload.status = input.status;
      if (input.sourceAmount !== undefined) payload.source_amount = input.sourceAmount;
      if (input.destinationAmount !== undefined) payload.destination_amount = input.destinationAmount;
      if (input.fxRate !== undefined) payload.fx_rate = input.fxRate;
      if (input.sourceAccountId !== undefined) payload.source_account_id = input.sourceAccountId;
      if (input.destinationAccountId !== undefined) payload.destination_account_id = input.destinationAccountId;
      const { error } = await supabase
        .from("movements")
        .update(payload)
        .eq("id", id)
        .eq("workspace_id", workspaceId);
      if (error) throw new Error(error.message ?? "Error de base de datos");
    },
    onMutate: async ({ id, input }) => {
      await queryClient.cancelQueries({ queryKey: ["movement", id] });
      const previous = queryClient.getQueryData(["movement", id]);
      queryClient.setQueryData(["movement", id], (old: Record<string, unknown> | undefined) => {
        if (!old) return old;
        return {
          ...old,
          ...(input.description !== undefined && { description: input.description }),
          ...(input.notes !== undefined && { notes: input.notes }),
          ...(input.categoryId !== undefined && { categoryId: input.categoryId }),
          ...(input.counterpartyId !== undefined && { counterpartyId: input.counterpartyId }),
          ...(input.occurredAt !== undefined && { occurredAt: input.occurredAt }),
          ...(input.status !== undefined && { status: input.status }),
          ...(input.sourceAmount !== undefined && { sourceAmount: input.sourceAmount }),
          ...(input.destinationAmount !== undefined && { destinationAmount: input.destinationAmount }),
          ...(input.fxRate !== undefined && { fxRate: input.fxRate }),
          ...(input.sourceAccountId !== undefined && { sourceAccountId: input.sourceAccountId }),
          ...(input.destinationAccountId !== undefined && { destinationAccountId: input.destinationAccountId }),
        };
      });
      return { previous };
    },
    onError: (_err, { id }, context) => {
      if (context?.previous !== undefined) {
        queryClient.setQueryData(["movement", id], context.previous);
      }
    },
    onSuccess: (_data, { id }) => {
      // Invalidación inmediata (no diferida por InteractionManager): la lista y los saldos deben
      // reflejar la edición al instante, igual que en create. El onMutate optimista ya pintó el
      // detalle, así que esto reconcilia lista/snapshot sin parpadeo.
      void queryClient.invalidateQueries({ queryKey: ["movements"] });
      void queryClient.invalidateQueries({ queryKey: ["workspace-snapshot"] });
      void queryClient.invalidateQueries({ queryKey: ["movement", id] });
    },
  });
}

export function useVoidMovementMutation(workspaceId: number | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      if (!supabase || !workspaceId) throw new Error("Workspace no disponible.");
      const { error } = await supabase
        .from("movements")
        .update({ status: "voided" })
        .eq("id", id)
        .eq("workspace_id", workspaceId);
      if (error) throw new Error(error.message ?? "Error de base de datos");
    },
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ["movement", id] });
      const previous = queryClient.getQueryData(["movement", id]);
      queryClient.setQueryData(["movement", id], (old: Record<string, unknown> | undefined) => {
        if (!old) return old;
        return { ...old, status: "voided" };
      });
      return { previous };
    },
    onError: (_err, id, context) => {
      if (context?.previous !== undefined) {
        queryClient.setQueryData(["movement", id], context.previous);
      }
    },
    onSuccess: (_data, id) => {
      void queryClient.invalidateQueries({ queryKey: ["movements"] });
      void queryClient.invalidateQueries({ queryKey: ["workspace-snapshot"] });
      void queryClient.invalidateQueries({ queryKey: ["movement", id] });
    },
  });
}

// ─── Movement delete mutation ─────────────────────────────────────────────────

export function useDeleteMovementMutation(workspaceId: number | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      if (!supabase || !workspaceId) throw new Error("Workspace no disponible.");
      const { error } = await supabase
        .from("movements")
        .delete()
        .eq("id", id)
        .eq("workspace_id", workspaceId);
      if (error) throw new Error(error.message ?? "Error de base de datos");
    },
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ["movements"] });
      const previousPages = queryClient.getQueriesData<{ pages: { data: { id: number }[] }[] }>({ queryKey: ["movements"] });
      queryClient.setQueriesData<{ pages: { data: { id: number }[] }[]; pageParams: unknown[] }>(
        { queryKey: ["movements"] },
        (old) => {
          if (!old) return old;
          return {
            ...old,
            pages: old.pages.map((page) => ({
              ...page,
              data: page.data.filter((m) => m.id !== id),
            })),
          };
        },
      );
      return { previousPages };
    },
    onError: (_err, _id, context) => {
      for (const [key, value] of (context?.previousPages ?? [])) {
        queryClient.setQueryData(key, value);
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["movements"] });
      void queryClient.invalidateQueries({ queryKey: ["workspace-snapshot"] });
    },
  });
}

// ─── Obligation mutations ─────────────────────────────────────────────────────

export async function markNotificationReadByEntity(
  userId: string | null | undefined,
  kind: string,
  entityType: string,
  entityId: number,
) {
  if (!supabase || !userId) return;
  await supabase
    .from("notifications")
    .update({ status: "read", read_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("kind", kind)
    .eq("related_entity_type", entityType)
    .eq("related_entity_id", entityId);
}

export type NotificationRefreshInput = {
  user_id: string;
  channel: "in_app";
  status: "pending" | "sent" | "read" | "failed";
  kind: string;
  title: string;
  body: string;
  scheduled_for: string;
  related_entity_type: string;
  related_entity_id: number;
  payload?: JsonValue | null;
};

export type ViewerEventLinkRow = {
  id: number;
  movement_id: number | null;
  linked_by_user_id: string | null;
  account_id: number | null;
  viewer_workspace_id: number | null;
};

export type OwnerMovementLookupRow = {
  id: number;
  movement_type: MovementType;
  source_amount: NumericLike;
  destination_amount: NumericLike;
  description: string | null;
  metadata: JsonValue | null;
};

export async function createOrRefreshNotificationRow(row: NotificationRefreshInput) {
  if (!supabase) throw new Error("Supabase no disponible.");

  const { data: existing, error: findErr } = await supabase
    .from("notifications")
    .select("id")
    .eq("user_id", row.user_id)
    .eq("kind", row.kind)
    .eq("related_entity_type", row.related_entity_type)
    .eq("related_entity_id", row.related_entity_id)
    .order("id", { ascending: false });
  if (findErr) {
    throw new Error(findErr.message ?? "Error al comprobar la notificación");
  }

  if ((existing?.length ?? 0) > 0) {
    const { error: updateErr } = await supabase
      .from("notifications")
      .update({
        channel: row.channel,
        status: row.status,
        title: row.title,
        body: row.body,
        scheduled_for: row.scheduled_for,
        payload: row.payload ?? null,
        read_at: row.status === "read" ? row.scheduled_for : null,
      })
      .eq("user_id", row.user_id)
      .eq("kind", row.kind)
      .eq("related_entity_type", row.related_entity_type)
      .eq("related_entity_id", row.related_entity_id);
    if (updateErr) {
      throw new Error(updateErr.message ?? "Error al actualizar la notificación");
    }
    return;
  }

  const { error: insertErr } = await supabase
    .from("notifications")
    .insert({
      ...row,
      payload: row.payload ?? null,
    });
  if (insertErr) {
    throw new Error(insertErr.message ?? "Error al crear la notificación");
  }
}

export function formatNotificationCurrency(amount: number | null | undefined, currencyCode: string | null | undefined) {
  if (amount == null) return "";
  const normalizedCode = currencyCode?.trim().toUpperCase();
  if (!normalizedCode) return ` de ${amount}`;
  try {
    return ` de ${new Intl.NumberFormat("es-PE", {
      style: "currency",
      currency: normalizedCode,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount)}`;
  } catch {
    return ` de ${normalizedCode} ${amount.toFixed(2)}`;
  }
}

// --- Subscriptions + Recurring Income ---
// Movido a ./subscriptions-recurring-income.ts. Se re-exporta para preservar imports existentes.
// useConfirmRecurringIncomeArrivalMutation se queda aquí porque depende de createMovement (interno).

export {
  type SubscriptionFormInput,
  type RecurringIncomeFormInput,
  useCreateRecurringIncomeMutation,
  useUpdateRecurringIncomeMutation,
  useDeleteRecurringIncomeMutation,
  useRecurringIncomeOccurrencesQuery,
  useCreateSubscriptionMutation,
  useUpdateSubscriptionMutation,
  useDeleteSubscriptionMutation,
} from "./subscriptions-recurring-income";

export function useConfirmRecurringIncomeArrivalMutation(workspaceId: number | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      recurringIncomeId: number;
      recurringIncomeName: string;
      expectedDate: string;
      actualDate: string;
      amount: number;
      accountId: number;
      currentAccountId?: number | null;
      categoryId?: number | null;
      payerPartyId?: number | null;
      description?: string | null;
      currencyCode: string;
      frequency: RecurringIncomeFrequency;
      intervalCount: number;
      currentBaseAmount: number;
      newBaseAmount?: number | null;
      baseChangeKind?: "bonus" | "discount" | null;
      notes?: string | null;
      movementId?: number | null;
    }) => {
      if (!supabase || !workspaceId) throw new Error("Workspace no disponible.");
      const actual = input.actualDate.trim();
      const expected = input.expectedDate.trim();
      if (!actual) throw new Error("La fecha real de llegada es obligatoria.");
      if (!input.accountId) throw new Error("Debes elegir una cuenta destino para crear el movimiento.");
      const nextExpectedDate = computeNextRecurringDate(expected, input.frequency, input.intervalCount);
      const status = actual <= expected ? "on_time" : "late";
      const normalizedNotes = input.notes?.trim() || null;
      const requestedBaseAmount = input.newBaseAmount != null ? Number(input.newBaseAmount) : null;
      const shouldUpdateBaseAmount =
        requestedBaseAmount != null &&
        Number.isFinite(requestedBaseAmount) &&
        requestedBaseAmount > 0 &&
        Math.abs(requestedBaseAmount - input.currentBaseAmount) > 0.000001;

      const baseChangeSummary = shouldUpdateBaseAmount
        ? `${input.baseChangeKind === "discount" ? "Descuento" : "Bonificación"} permanente: base ${formatAmountWithCurrency(input.currentBaseAmount, input.currencyCode)} -> ${formatAmountWithCurrency(requestedBaseAmount!, input.currencyCode)}.`
        : null;

      const movementNotes = joinNotes(
        normalizedNotes,
        baseChangeSummary,
      );
      const movement = await createMovement(workspaceId, {
        movementType: "income",
        status: "posted",
        occurredAt: dateStrToISO(actual),
        description: input.description?.trim() || input.recurringIncomeName.trim(),
        notes: movementNotes,
        sourceAccountId: null,
        sourceAmount: null,
        destinationAccountId: input.accountId,
        destinationAmount: input.amount,
        categoryId: input.categoryId ?? null,
        counterpartyId: input.payerPartyId ?? null,
        metadata: {
          recurring_income_id: input.recurringIncomeId,
          recurring_income_expected_date: expected,
          recurring_income_actual_date: actual,
          recurring_income_confirmed_arrival: true,
          recurring_income_base_change_kind: input.baseChangeKind ?? null,
          recurring_income_base_amount_before: input.currentBaseAmount,
          recurring_income_base_amount_after: shouldUpdateBaseAmount ? requestedBaseAmount : null,
        },
      });

      const { error: occError } = await supabase
        .from("recurring_income_occurrences")
        .insert({
          workspace_id: workspaceId,
          recurring_income_id: input.recurringIncomeId,
          expected_date: expected,
          actual_date: actual,
          amount: input.amount,
          currency_code: input.currencyCode,
          movement_id: movement.id,
          status,
          notes: movementNotes,
        });
      if (occError) throw new Error(occError.message ?? "Error al registrar llegada");

      const recurringIncomePatch: Record<string, unknown> = {
        next_expected_date: nextExpectedDate,
      };
      if (shouldUpdateBaseAmount) recurringIncomePatch.amount = requestedBaseAmount;
      if (!input.currentAccountId && input.accountId) recurringIncomePatch.account_id = input.accountId;

      const { error: updateError } = await supabase
        .from("recurring_income")
        .update(recurringIncomePatch)
        .eq("id", input.recurringIncomeId)
        .eq("workspace_id", workspaceId);
      if (updateError) throw new Error(updateError.message ?? "Error al actualizar proxima llegada");

      return {
        nextExpectedDate,
        movementId: movement.id,
        updatedBaseAmount: shouldUpdateBaseAmount ? requestedBaseAmount : null,
      };
    },
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: ["workspace-snapshot"] });
      void queryClient.invalidateQueries({ queryKey: ["movements"] });
      void queryClient.invalidateQueries({
        queryKey: ["recurring-income-occurrences", workspaceId ?? null, variables.recurringIncomeId],
      });
    },
  });
}

// --- Categories + Counterparties ---
// Movido a ./categories-counterparties.ts. Se re-exporta para preservar imports existentes.

export {
  type CategoryFormInput,
  useCreateCategoryMutation,
  useUpdateCategoryMutation,
  useToggleCategoryMutation,
  useDeleteCategoryMutation,
  type CounterpartyFormInput,
  useCreateCounterpartyMutation,
  useUpdateCounterpartyMutation,
  useToggleCounterpartyPinMutation,
  useDeleteCounterpartyMutation,
} from "./categories-counterparties";

// --- Notifications ---
// Movido a ./notifications.ts. Se re-exporta para preservar imports existentes.

export {
  useNotificationsQuery,
  type NotificationPreferenceSummary,
  useNotificationPreferencesQuery,
  useUpdateNotificationPreferencesMutation,
  useMarkNotificationReadMutation,
  useMarkAllNotificationsReadMutation,
  useMarkNotificationUnreadMutation,
  useMarkAllNotificationsUnreadMutation,
  useMarkNotificationsReadMutation,
  useMarkNotificationsUnreadMutation,
  useDeleteNotificationMutation,
  useDeleteNotificationsMutation,
} from "./notifications";

// ─── Edge Function helper ─────────────────────────────────────────────────────

export async function invokeEdgeFunction<T>(name: string, body: Record<string, unknown>): Promise<T> {
  if (!supabase) throw new Error("Supabase no está configurado.");
  let accessToken: string | null = null;
  let activeSession: Awaited<ReturnType<typeof supabase.auth.getSession>>["data"]["session"] | null = null;
  const configuredProjectRef = extractSupabaseProjectRef(supabaseUrl);
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) {
    logEdgeFunctionDebug(name, {
      stage: "get-session-error",
      error: sessionError.message ?? String(sessionError),
    });
    throw new Error(sessionError.message ?? "No se pudo validar tu sesión.");
  }
  activeSession = sessionData.session ?? null;
  accessToken = activeSession?.access_token ?? null;

  const currentExp =
    Number(activeSession?.expires_at ?? decodeJwtPayload(accessToken)?.exp ?? 0) || 0;
  const shouldRefreshSoon = currentExp > 0 && currentExp <= Math.floor(Date.now() / 1000) + 60;
  const initialTokenPayload = decodeJwtPayload(accessToken);
  const initialTokenProjectRef = extractJwtProjectRef(initialTokenPayload);
  const shouldRefreshForProjectMismatch =
    Boolean(configuredProjectRef && initialTokenProjectRef && configuredProjectRef !== initialTokenProjectRef);

  if (accessToken && (shouldRefreshSoon || shouldRefreshForProjectMismatch)) {
    if (shouldRefreshForProjectMismatch) {
      logEdgeFunctionDebug(name, {
        stage: "token-project-mismatch-before-refresh",
        configuredProjectRef,
        tokenProjectRef: initialTokenProjectRef,
        tokenIssuer:
          typeof initialTokenPayload?.iss === "string" ? initialTokenPayload.iss : null,
        userId: activeSession?.user?.id ?? null,
      });
    }
    const { data: refreshedData, error: refreshError } = await supabase.auth.refreshSession();
    if (refreshError) {
      logEdgeFunctionDebug(name, {
        stage: "refresh-session-before-invoke-error",
        error: refreshError.message ?? String(refreshError),
        userId: activeSession?.user?.id ?? null,
        expiresAt: activeSession?.expires_at ?? null,
      });
      throw new Error(refreshError.message ?? "Tu sesión expiró. Vuelve a iniciar sesión.");
    }
    activeSession = refreshedData.session ?? activeSession;
    accessToken = activeSession?.access_token ?? accessToken;
  }

  if (!accessToken) {
    logEdgeFunctionDebug(name, {
      stage: "missing-token-before-refresh",
      userId: activeSession?.user?.id ?? null,
      expiresAt: activeSession?.expires_at ?? null,
      bodyKeys: Object.keys(body),
    });
    const { data: refreshedData, error: refreshError } = await supabase.auth.refreshSession();
    if (refreshError) {
      logEdgeFunctionDebug(name, {
        stage: "refresh-session-error",
        error: refreshError.message ?? String(refreshError),
        userId: activeSession?.user?.id ?? null,
        expiresAt: activeSession?.expires_at ?? null,
      });
      throw new Error(refreshError.message ?? "Tu sesión expiró. Vuelve a iniciar sesión.");
    }
    activeSession = refreshedData.session ?? null;
    accessToken = activeSession?.access_token ?? null;
  }

  if (!accessToken) {
    logEdgeFunctionDebug(name, {
      stage: "missing-token-after-refresh",
      userId: activeSession?.user?.id ?? null,
      expiresAt: activeSession?.expires_at ?? null,
      bodyKeys: Object.keys(body),
    });
    throw new Error("Tu sesión expiró. Vuelve a iniciar sesión.");
  }

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Falta configurar Supabase en esta app.");
  }

  let tokenPayload = decodeJwtPayload(accessToken);
  let tokenProjectRef = extractJwtProjectRef(tokenPayload);
  if (configuredProjectRef && tokenProjectRef && configuredProjectRef !== tokenProjectRef) {
    logEdgeFunctionDebug(name, {
      stage: "token-project-mismatch-after-refresh",
      configuredProjectRef,
      tokenProjectRef,
      tokenIssuer: typeof tokenPayload?.iss === "string" ? tokenPayload.iss : null,
      userId: activeSession?.user?.id ?? null,
      expiresAt: activeSession?.expires_at ?? null,
    });
    await clearLocalSessionSilently();
    throw new Error(
      "La sesión guardada pertenece a otro proyecto de Supabase. Cierra sesión e ingresa otra vez.",
    );
  }

  const validateCurrentAuth = async (stage: string) => {
    const { data: authData, error: authError } = await supabase!.auth.getUser();
    logEdgeFunctionDebug(name, {
      stage,
      authError: authError?.message ?? null,
      authUserId: authData.user?.id ?? null,
      sessionUserId: activeSession?.user?.id ?? null,
      configuredProjectRef,
      tokenProjectRef,
      tokenIssuer: typeof tokenPayload?.iss === "string" ? tokenPayload.iss : null,
      expiresAt: activeSession?.expires_at ?? null,
    });
    return { authData, authError };
  };

  let { authData, authError } = await validateCurrentAuth("validate-user-before-invoke");
  if (authError || !authData.user) {
    const { data: refreshedData, error: refreshError } = await supabase.auth.refreshSession();
    if (refreshError) {
      logEdgeFunctionDebug(name, {
        stage: "refresh-session-after-get-user-error",
        error: refreshError.message ?? String(refreshError),
        userId: activeSession?.user?.id ?? null,
        configuredProjectRef,
        tokenProjectRef,
      });
      throw new Error(refreshError.message ?? authError?.message ?? "Tu sesión expiró. Vuelve a iniciar sesión.");
    }
    activeSession = refreshedData.session ?? activeSession;
    accessToken = activeSession?.access_token ?? accessToken;
    tokenPayload = decodeJwtPayload(accessToken);
    tokenProjectRef = extractJwtProjectRef(tokenPayload);

    if (configuredProjectRef && tokenProjectRef && configuredProjectRef !== tokenProjectRef) {
      logEdgeFunctionDebug(name, {
        stage: "token-project-mismatch-after-get-user-refresh",
        configuredProjectRef,
        tokenProjectRef,
        tokenIssuer: typeof tokenPayload?.iss === "string" ? tokenPayload.iss : null,
        userId: activeSession?.user?.id ?? null,
      });
      await clearLocalSessionSilently();
      throw new Error(
        "La sesión guardada pertenece a otro proyecto de Supabase. Cierra sesión e ingresa otra vez.",
      );
    }

    ({ authData, authError } = await validateCurrentAuth("validate-user-after-refresh"));
    if (authError || !authData.user) {
      if ((authError?.message ?? "").toLowerCase().includes("invalid jwt")) {
        await clearLocalSessionSilently();
      }
      throw new Error(authError?.message ?? "Tu sesión expiró. Vuelve a iniciar sesión.");
    }
  }

  if (activeSession?.user?.id && authData.user?.id && activeSession.user.id !== authData.user.id) {
    logEdgeFunctionDebug(name, {
      stage: "session-user-mismatch",
      sessionUserId: activeSession.user.id,
      authUserId: authData.user.id,
      configuredProjectRef,
      tokenProjectRef,
    });
  }

  const { data: latestSessionData } = await supabase.auth.getSession();
  activeSession = latestSessionData.session ?? activeSession;
  accessToken = activeSession?.access_token ?? accessToken;
  tokenPayload = decodeJwtPayload(accessToken);
  tokenProjectRef = extractJwtProjectRef(tokenPayload);

  const endpoint = `${supabaseUrl.replace(/\/+$/, "")}/functions/v1/${name}`;
  const fetchEdgeResponse = async (token: string) => {
    const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timeoutMs = isInteractiveAiEdgeFunction(name) ? INTERACTIVE_AI_TIMEOUT_MS : 15_000;
    const timeoutId = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;

    try {
      return await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: supabaseAnonKey,
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
        signal: controller?.signal,
      });
    } catch (error) {
      const message =
        error instanceof Error && error.name === "AbortError"
          ? "La solicitud tardó demasiado. Intenta de nuevo."
          : "No pudimos conectarnos al servidor. Revisa tu internet e intenta de nuevo.";
      logEdgeFunctionDebug(name, {
        stage: "network-error",
        message,
        rawError: error instanceof Error ? error.message : String(error),
        userId: activeSession?.user?.id ?? null,
        expiresAt: activeSession?.expires_at ?? null,
        configuredProjectRef,
        tokenProjectRef,
        tokenIssuer: typeof tokenPayload?.iss === "string" ? tokenPayload.iss : null,
        invitedEmail: typeof body.invitedEmail === "string" ? body.invitedEmail : null,
        workspaceId: typeof body.workspaceId === "number" ? body.workspaceId : body.workspaceId ?? null,
        obligationId: typeof body.obligationId === "number" ? body.obligationId : body.obligationId ?? null,
        appUrl: typeof body.appUrl === "string" ? body.appUrl : body.appUrl ?? null,
      });
      throw new Error(message);
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }
  };

  let response = await fetchEdgeResponse(accessToken);

  if (!response.ok) {
    let message = await readEdgeFunctionErrorMessage(name, undefined, response);
    const shouldRetryWithFreshSession =
      response.status === 401 &&
      isEdgeFunctionAuthSessionError(message);

    if (shouldRetryWithFreshSession) {
      logEdgeFunctionDebug(name, {
        stage: "invoke-error-retrying-after-session-refresh",
        message,
        responseStatus: response.status ?? null,
        userId: activeSession?.user?.id ?? null,
        expiresAt: activeSession?.expires_at ?? null,
        configuredProjectRef,
        tokenProjectRef,
        tokenIssuer: typeof tokenPayload?.iss === "string" ? tokenPayload.iss : null,
        invitedEmail: typeof body.invitedEmail === "string" ? body.invitedEmail : null,
        workspaceId: typeof body.workspaceId === "number" ? body.workspaceId : body.workspaceId ?? null,
        obligationId: typeof body.obligationId === "number" ? body.obligationId : body.obligationId ?? null,
        appUrl: typeof body.appUrl === "string" ? body.appUrl : body.appUrl ?? null,
      });

      const { data: refreshedData, error: refreshError } = await supabase.auth.refreshSession();
      if (!refreshError && refreshedData.session?.access_token) {
        activeSession = refreshedData.session;
        accessToken = refreshedData.session.access_token;
        tokenPayload = decodeJwtPayload(accessToken);
        tokenProjectRef = extractJwtProjectRef(tokenPayload);

        if (configuredProjectRef && tokenProjectRef && configuredProjectRef !== tokenProjectRef) {
          logEdgeFunctionDebug(name, {
            stage: "token-project-mismatch-after-invoke-refresh",
            configuredProjectRef,
            tokenProjectRef,
            tokenIssuer: typeof tokenPayload?.iss === "string" ? tokenPayload.iss : null,
            userId: activeSession?.user?.id ?? null,
          });
          await clearLocalSessionSilently();
          throw new Error(
            "La sesión guardada pertenece a otro proyecto de Supabase. Cierra sesión e ingresa otra vez.",
          );
        }

        response = await fetchEdgeResponse(accessToken);
        if (response.ok) {
          const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
          if (!contentType.includes("application/json")) {
            return {} as T;
          }
          return (await response.json()) as T;
        }

        message = await readEdgeFunctionErrorMessage(name, undefined, response);
      } else {
        logEdgeFunctionDebug(name, {
          stage: "refresh-session-before-retry-error",
          error: refreshError?.message ?? null,
          userId: activeSession?.user?.id ?? null,
          configuredProjectRef,
          tokenProjectRef,
        });
      }
    }

    if (response.status === 401 && isEdgeFunctionAuthSessionError(message)) {
      logEdgeFunctionDebug(name, {
        stage: "invoke-auth-session-error",
        message,
        responseStatus: response.status ?? null,
        userId: activeSession?.user?.id ?? null,
        expiresAt: activeSession?.expires_at ?? null,
        configuredProjectRef,
        tokenProjectRef,
        tokenIssuer: typeof tokenPayload?.iss === "string" ? tokenPayload.iss : null,
      });
      await clearLocalSessionSilently();
      throw new Error("Tu sesión expiró. Cierra sesión e ingresa nuevamente.");
    }

    const shouldRetryViaClient =
      response.status === 401 &&
      message.toLowerCase().includes("invalid jwt");

    if (shouldRetryViaClient) {
      const { data: clientData, error: clientError } = await supabase.functions.invoke<T>(name, {
        body,
      });

      if (!clientError) {
        logEdgeFunctionDebug(name, {
          stage: "client-invoke-success",
          userId: activeSession?.user?.id ?? null,
          expiresAt: activeSession?.expires_at ?? null,
          configuredProjectRef,
          tokenProjectRef,
          tokenIssuer: typeof tokenPayload?.iss === "string" ? tokenPayload.iss : null,
          invitedEmail: typeof body.invitedEmail === "string" ? body.invitedEmail : null,
          workspaceId: typeof body.workspaceId === "number" ? body.workspaceId : body.workspaceId ?? null,
          obligationId: typeof body.obligationId === "number" ? body.obligationId : body.obligationId ?? null,
          appUrl: typeof body.appUrl === "string" ? body.appUrl : body.appUrl ?? null,
        });
        return clientData as T;
      }

      logEdgeFunctionDebug(name, {
        stage: "client-invoke-error",
        message: clientError.message ?? String(clientError),
        userId: activeSession?.user?.id ?? null,
        expiresAt: activeSession?.expires_at ?? null,
        configuredProjectRef,
        tokenProjectRef,
        tokenIssuer: typeof tokenPayload?.iss === "string" ? tokenPayload.iss : null,
        invitedEmail: typeof body.invitedEmail === "string" ? body.invitedEmail : null,
        workspaceId: typeof body.workspaceId === "number" ? body.workspaceId : body.workspaceId ?? null,
        obligationId: typeof body.obligationId === "number" ? body.obligationId : body.obligationId ?? null,
        appUrl: typeof body.appUrl === "string" ? body.appUrl : body.appUrl ?? null,
      });
    }

    logEdgeFunctionDebug(name, {
      stage: "invoke-error",
      message,
      responseStatus: response.status ?? null,
      contentType: response.headers.get("content-type") ?? null,
      relayError: response.headers.get("x-relay-error") ?? null,
      userId: activeSession?.user?.id ?? null,
      expiresAt: activeSession?.expires_at ?? null,
      configuredProjectRef,
      tokenProjectRef,
      tokenIssuer: typeof tokenPayload?.iss === "string" ? tokenPayload.iss : null,
      invitedEmail: typeof body.invitedEmail === "string" ? body.invitedEmail : null,
      workspaceId: typeof body.workspaceId === "number" ? body.workspaceId : body.workspaceId ?? null,
      obligationId: typeof body.obligationId === "number" ? body.obligationId : body.obligationId ?? null,
      appUrl: typeof body.appUrl === "string" ? body.appUrl : body.appUrl ?? null,
    });
    throw new Error(message);
  }

  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.includes("application/json")) {
    return {} as T;
  }
  return (await response.json()) as T;
}

// ─── Workspace creation ───────────────────────────────────────────────────────

export type CreateSharedWorkspaceInput = {
  name: string;
  description?: string | null;
  baseCurrencyCode?: string | null;
};

export function useCreateSharedWorkspaceMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateSharedWorkspaceInput) => {
      const response = await invokeEdgeFunction<{ ok: boolean; error?: string; workspace?: Workspace }>(
        "create-shared-workspace",
        { name: input.name, description: input.description ?? null, baseCurrencyCode: input.baseCurrencyCode ?? null },
      );
      if (!response.ok || !response.workspace) {
        throw new Error(response.error ?? "No se pudo crear el workspace.");
      }
      return response.workspace;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["workspace-snapshot"] });
    },
  });
}

// ─── Workspace invitation ─────────────────────────────────────────────────────

export type WorkspaceInvitationInput = {
  workspaceId: number;
  invitedEmail: string;
  role: Exclude<WorkspaceRole, "owner">;
  note?: string | null;
};

export type WorkspaceInvitationResult = {
  invitationId?: number | null;
  status?: WorkspaceInvitationStatus | null;
  role: Exclude<WorkspaceRole, "owner">;
  inviteUrl?: string | null;
  emailSent: boolean;
  invitedEmail: string;
  invitedDisplayName?: string | null;
  alreadyMember: boolean;
};

export function useCreateWorkspaceInvitationMutation(workspaceId?: number | null) {
  const queryClient = useQueryClient();
  const appUrl = buildHostedAppUrl();
  return useMutation({
    mutationFn: async (input: WorkspaceInvitationInput) => {
      const response = await invokeEdgeFunction<{
        ok: boolean; error?: string;
        invitationId?: number; status?: string; role?: string;
        inviteUrl?: string; emailSent?: boolean;
        invitedEmail?: string; invitedDisplayName?: string;
        alreadyMember?: boolean;
      }>(
        "create-workspace-invitation",
        {
          workspaceId: input.workspaceId,
          invitedEmail: input.invitedEmail,
          role: input.role,
          note: input.note ?? null,
          appUrl,
        },
      );
      if (!response.ok || !response.invitedEmail) {
        throw new Error(response.error ?? "No se pudo enviar la invitación.");
      }
      return {
        invitationId: response.invitationId ?? null,
        status: (response.status ?? null) as WorkspaceInvitationStatus | null,
        role: (response.role ?? input.role) as Exclude<WorkspaceRole, "owner">,
        inviteUrl: response.inviteUrl ?? null,
        emailSent: Boolean(response.emailSent),
        invitedEmail: response.invitedEmail,
        invitedDisplayName: response.invitedDisplayName ?? null,
        alreadyMember: Boolean(response.alreadyMember),
      } satisfies WorkspaceInvitationResult;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["workspace-snapshot"] });
    },
  });
}

// ─── Obligation active share (pending / accepted) ───────────────────────────────

/** Todas las filas pending/accepted del workspace (p. ej. lista de tarjetas + badges). */
// ─── Obligaciones compartidas contigo (edge list-shared-obligations) ─────────

/** Normaliza fila share snake_case si la edge devolvió camelCase. */
/** Combina obligaciones del workspace activo con las compartidas contigo (sin duplicar por id). */
/** Eventos de una obligación (útil cuando el resumen compartido no trae `events` completos). */
/** Invitaciones pendientes donde el usuario actual es el invitado (correo o user id). */
// ─── Obligation share invite ──────────────────────────────────────────────────

// ─── Exchange Rates CRUD ──────────────────────────────────────────────────────────────────────
// Movido a ./exchange-rates.ts. Se re-exporta para preservar imports existentes.

export {
  type ExchangeRateRecord,
  useExchangeRatesQuery,
  useCreateExchangeRateMutation,
  useUpdateExchangeRateMutation,
  useSyncExchangeRatePairMutation,
  useDeleteExchangeRateMutation,
  useToggleExchangeRatePinMutation,
} from "./exchange-rates";

// ─── Obligation Payment Requests ──────────────────────────────────────────────

/** Todas las solicitudes pendientes del workspace (para mostrar badges en la lista). */
/** Solicitudes enviadas por el viewer para una obligación (vista del shared viewer). */
/** Solicitudes de pago pendientes para una obligación (vista del owner). */
/** Shared viewer envía una solicitud de pago/cobro al owner. */
/** Owner acepta la solicitud → crea evento + movimiento del owner + movimiento del viewer → actualiza status. */
/** Owner rechaza la solicitud. */
// ─── Obligation Event Viewer Links ────────────────────────────────────────────

/** Links ya creados por el viewer para esta obligación (qué eventos ya vinculó a sus cuentas). */
function mapRecurringIncome(
  row: RecurringIncomeRow,
  categoryMap: Map<number, string>,
  counterpartyMap: Map<number, string>,
  accountMap: Map<number, string>,
  frequencyLabels: Record<SubscriptionFrequency, string>,
  baseCurrency: string,
  exchangeRates: ExchangeRateSummary[],
): RecurringIncomeSummary {
  const amount = toNum(row.amount);
  const amountInBaseCurrency = convertAmountToWorkspaceBase(
    amount,
    row.currency_code,
    baseCurrency,
    exchangeRates,
  );
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    name: row.name,
    payerPartyId: row.payer_party_id,
    payer: row.payer_party_id ? (counterpartyMap.get(row.payer_party_id) ?? "") : "",
    accountId: row.account_id,
    accountName: row.account_id ? (accountMap.get(row.account_id) ?? null) : null,
    categoryId: row.category_id,
    categoryName: row.category_id ? (categoryMap.get(row.category_id) ?? null) : null,
    status: row.status,
    amount,
    amountInBaseCurrency,
    currencyCode: row.currency_code,
    frequency: row.frequency,
    frequencyLabel: subscriptionFrequencyListLabel(row.interval_count, row.frequency, frequencyLabels),
    intervalCount: row.interval_count,
    dayOfMonth: row.day_of_month,
    dayOfWeek: row.day_of_week,
    startDate: row.start_date,
    nextExpectedDate: row.next_expected_date,
    endDate: row.end_date,
    remindDaysBefore: row.remind_days_before,
    description: row.description,
    notes: row.notes,
    isPinned: row.is_pinned ?? false,
  };
}

/**
 * Shared viewer asocia un evento de pago a una de sus cuentas.
 * Crea un movimiento en el workspace del viewer y registra el link.
 */
