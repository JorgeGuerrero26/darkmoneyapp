import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { InteractionManager } from "react-native";
import type { WorkspaceInvitationStatus } from "../../types/domain";

import { UNIVERSAL_LINK_HOST } from "../../constants/config";
import { supabase, supabaseAnonKey, supabaseUrl } from "../../lib/supabase";
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
  SubscriptionFrequency,
  CategoryPostedMovement,
  RecurringIncomeSummary,
  SubscriptionPostedMovement,
  SubscriptionSummary,
  Workspace,
  WorkspaceKind,
  WorkspaceRole,
} from "../../types/domain";

type NumericLike = number | string | null;

function toNum(val: NumericLike): number {
  if (val === null || val === undefined) return 0;
  const n = Number(val);
  return isNaN(n) ? 0 : n;
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

function isDuplicateConstraintMessage(message: string | null | undefined): boolean {
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

const FALLBACK_PRO_EMAILS = new Set(["joradrianmori@gmail.com"]);

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

function runBackgroundQueryRefresh(
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
  if (status === 404) return `La funciÃ³n ${name} no estÃ¡ disponible.`;
  if (status === 401) return "Tu sesiÃ³n expirÃ³. Vuelve a iniciar sesiÃ³n.";
  if (status === 403) return `La funciÃ³n ${name} devolviÃ³ 403. Puede ser permisos o plan Pro.`;
  if (status != null) return `La funciÃ³n ${name} devolviÃ³ error (${status}).`;
  return `No se pudo completar la funciÃ³n ${name}.`;
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

async function fetchNextObligationInstallmentNo(obligationId: number): Promise<number> {
  if (!supabase) throw new Error("Supabase no disponible.");

  const { data, error } = await supabase
    .from("obligation_events")
    .select("installment_no")
    .eq("obligation_id", obligationId)
    .eq("event_type", "payment")
    .not("installment_no", "is", null)
    .order("installment_no", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message ?? "Error al calcular la siguiente cuota");
  return Number((data as { installment_no?: number | null } | null)?.installment_no ?? 0) + 1;
}

async function insertObligationPaymentEventWithFallback(input: {
  obligationId: number;
  paymentDate: string;
  amount: number;
  installmentNo?: number | null;
  description?: string | null;
  notes?: string | null;
  metadata?: JsonValue;
}): Promise<{ id: number; installmentNoApplied: boolean; appliedInstallmentNo: number | null }> {
  if (!supabase) throw new Error("Supabase no disponible.");

  const payload = {
    obligation_id: input.obligationId,
    event_type: "payment" as const,
    event_date: input.paymentDate,
    amount: input.amount,
    installment_no: input.installmentNo ?? null,
    description: input.description?.trim() || null,
    notes: input.notes ?? null,
    metadata: input.metadata ?? {},
  };

  const { data, error } = await supabase
    .from("obligation_events")
    .insert(payload)
    .select("id")
    .single();
  if (!error) {
    return {
      id: (data as { id: number }).id,
      installmentNoApplied: input.installmentNo != null,
      appliedInstallmentNo: input.installmentNo ?? null,
    };
  }

  if (input.installmentNo != null && isDuplicateConstraintMessage(error.message)) {
    const nextInstallmentNo = await fetchNextObligationInstallmentNo(input.obligationId);
    if (nextInstallmentNo > input.installmentNo) {
      const { data: nextData, error: nextErr } = await supabase
        .from("obligation_events")
        .insert({
          ...payload,
          installment_no: nextInstallmentNo,
        })
        .select("id")
        .single();
      if (!nextErr) {
        return {
          id: (nextData as { id: number }).id,
          installmentNoApplied: true,
          appliedInstallmentNo: nextInstallmentNo,
        };
      }
      if (!isDuplicateConstraintMessage(nextErr.message)) {
        throw new Error(nextErr.message ?? "Error de base de datos");
      }
    }

    const { data: retryData, error: retryErr } = await supabase
      .from("obligation_events")
      .insert({
        ...payload,
        installment_no: null,
      })
      .select("id")
      .single();
    if (!retryErr) {
      return {
        id: (retryData as { id: number }).id,
        installmentNoApplied: false,
        appliedInstallmentNo: null,
      };
    }
    throw new Error(retryErr.message ?? "Error de base de datos");
  }

  throw new Error(error.message ?? "Error de base de datos");
}

// â”€â”€â”€ Row types â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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
  created_at: string;
  updated_at: string;
};

type ObligationSummaryRow = {
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

type ObligationEventRow = {
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
};

type ExchangeRateRow = {
  from_currency_code: string;
  to_currency_code: string;
  rate: NumericLike;
  effective_at: string;
};

// â”€â”€â”€ Mappers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapObligation(
  row: ObligationSummaryRow,
  events: ObligationEventRow[],
  counterpartyMap: Map<number, string>,
): ObligationSummary {
  const obligationEvents: ObligationEventSummary[] = sortObligationEventsNewestFirst(
    events
      .filter((e) => e.obligation_id === row.id)
      .map((e) => ({
        id: e.id,
        eventType: e.event_type,
        eventDate: e.event_date,
        createdAt: e.created_at ?? null,
        amount: toNum(e.amount),
        installmentNo: e.installment_no,
        reason: e.reason,
        description: e.description,
        notes: e.notes,
        movementId: e.movement_id,
        createdByUserId: e.created_by_user_id,
        metadata: e.metadata,
      })),
  );

  return {
    id: row.id,
    workspaceId: row.workspace_id,
    title: row.title,
    direction: row.direction,
    originType: row.origin_type,
    counterparty: row.counterparty_id ? counterpartyMap.get(row.counterparty_id) ?? "" : "",
    counterpartyId: row.counterparty_id,
    settlementAccountId: row.settlement_account_id,
    settlementAccountName: null,
    status: row.status,
    currencyCode: row.currency_code,
    principalAmount: toNum(row.principal_initial_amount),
    principalAmountInBaseCurrency: toNum(row.principal_initial_amount),
    currentPrincipalAmount: toNum(row.principal_current_amount),
    currentPrincipalAmountInBaseCurrency: toNum(row.principal_current_amount),
    pendingAmount: toNum(row.pending_amount),
    pendingAmountInBaseCurrency: toNum(row.pending_amount),
    progressPercent: toNum(row.progress_percent),
    startDate: row.start_date,
    dueDate: row.due_date,
    installmentAmount: row.installment_amount ? toNum(row.installment_amount) : null,
    installmentCount: row.installment_count,
    interestRate: row.interest_rate ? toNum(row.interest_rate) : null,
    description: row.description,
    notes: row.notes,
    paymentCount: row.payment_count,
    lastPaymentDate: row.last_payment_date,
    installmentLabel: "",
    events: obligationEvents,
  };
}

function mapObligationEventRowsToSummaries(rows: ObligationEventRow[]): ObligationEventSummary[] {
  return sortObligationEventsNewestFirst(
    rows.map((e) => ({
      id: e.id,
      eventType: e.event_type,
      eventDate: e.event_date,
      createdAt: e.created_at ?? null,
      amount: toNum(e.amount),
      installmentNo: e.installment_no,
      reason: e.reason,
      description: e.description,
      notes: e.notes,
      movementId: e.movement_id,
      createdByUserId: e.created_by_user_id,
      metadata: e.metadata,
    })),
  );
}

async function fetchObligationEventsByObligationId(obligationId: number): Promise<ObligationEventSummary[]> {
  if (!supabase) throw new Error("Supabase no disponible.");
  const { data, error } = await supabase
    .from("obligation_events")
    .select(
      "id, obligation_id, event_type, event_date, created_at, amount, installment_no, reason, description, notes, movement_id, created_by_user_id, metadata",
    )
    .eq("obligation_id", obligationId);
  if (error) throw new Error(error.message ?? "Error al cargar eventos");
  return mapObligationEventRowsToSummaries((data ?? []) as ObligationEventRow[]);
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
  };
}

type CounterpartyDbRow = {
  id: number;
  workspace_id: number;
  name: string;
  type: CounterpartySummary["type"];
  is_archived: boolean;
  phone: string | null;
  email: string | null;
  document_number: string | null;
  notes: string | null;
};

/** Fila de `counterparties` â†’ overview para snapshot (mÃ©tricas financieras: 0 hasta enlazar v_counterparty_summary). */
function mapCounterpartyFromRow(row: CounterpartyDbRow): CounterpartyOverview {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    isArchived: row.is_archived,
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

// â”€â”€â”€ Snapshot query â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export type WorkspaceSnapshot = {
  workspaces: Workspace[];
  accounts: AccountSummary[];
  /** CatÃ¡logo completo (activas e inactivas), orden sort_order + name. */
  categories: CategorySummary[];
  budgets: BudgetOverview[];
  obligations: ObligationSummary[];
  subscriptions: SubscriptionSummary[];
  recurringIncome: RecurringIncomeSummary[];
  /** Movimientos posted con subscription_id (analÃ­ticas sin query extra). */
  subscriptionPostedMovements: SubscriptionPostedMovement[];
  /** Movimientos posted con category_id (analÃ­ticas categorÃ­as). */
  categoryPostedMovements: CategoryPostedMovement[];
  counterparties: CounterpartyOverview[];
  exchangeRates: ExchangeRateSummary[];
};

export function useUserEntitlementQuery(userId?: string | null, email?: string | null) {
  return useQuery({
    queryKey: ["user-entitlement", userId ?? null, email?.trim().toLowerCase() ?? null],
    enabled: Boolean(supabase && userId),
    staleTime: 60_000,
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
  if (!supabase) throw new Error("Supabase no estÃ¡ configurado.");

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
      .select("id, workspace_id, name, type, currency_code, opening_balance, include_in_net_worth, color, icon, is_archived, sort_order, created_at, updated_at")
      .eq("workspace_id", activeWorkspaceId)
      .order("sort_order", { ascending: true }),
    supabase
      .from("v_account_balances")
      .select("account_id, workspace_id, current_balance")
      .eq("workspace_id", activeWorkspaceId),
    supabase
      .from("categories")
      .select("id, workspace_id, name, kind, parent_id, color, icon, sort_order, is_system, is_active, created_at, updated_at")
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
      .select("id, workspace_id, name, type, is_archived, phone, email, document_number, notes")
      .eq("workspace_id", activeWorkspaceId)
      .order("is_archived", { ascending: true })
      .order("name", { ascending: true }),
    supabase
      .from("v_obligation_summary")
      .select("*")
      .eq("workspace_id", activeWorkspaceId),
    // DescripciÃ³n/notas desde la tabla base: v_obligation_summary a veces no incluye estas columnas.
    supabase
      .from("obligations")
      .select("id, description, notes")
      .eq("workspace_id", activeWorkspaceId),
    supabase
      .from("subscriptions")
      .select("id, workspace_id, name, vendor_party_id, account_id, category_id, currency_code, amount, frequency, interval_count, day_of_month, day_of_week, start_date, next_due_date, end_date, status, remind_days_before, auto_create_movement, description, notes")
      .eq("workspace_id", activeWorkspaceId)
      .order("next_due_date", { ascending: true }),
    supabase
      .from("recurring_income")
      .select("id, workspace_id, name, payer_party_id, account_id, category_id, currency_code, amount, frequency, interval_count, day_of_month, day_of_week, start_date, next_expected_date, end_date, status, remind_days_before, description, notes")
      .eq("workspace_id", activeWorkspaceId)
      .order("next_expected_date", { ascending: true }),
    supabase
      .from("movements")
      .select("id, subscription_id, status, occurred_at, source_amount, destination_amount")
      .eq("workspace_id", activeWorkspaceId)
      .not("subscription_id", "is", null)
      .eq("status", "posted")
      .gte("occurred_at", twoYearsAgoIso)
      .order("occurred_at", { ascending: false })
      .limit(1000),
    supabase
      .from("movements")
      .select("id, category_id, status, occurred_at, source_amount, destination_amount")
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
    };
  });

  const accountMap = new Map<number, string>();
  for (const acc of accounts) accountMap.set(acc.id, acc.name);

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
    : (subscriptionMovementsResult.data ?? []).map((row: any) => ({
        id: row.id as number,
        subscriptionId: row.subscription_id as number,
        occurredAt: row.occurred_at as string,
        sourceAmount: row.source_amount != null ? toNum(row.source_amount) : null,
        destinationAmount: row.destination_amount != null ? toNum(row.destination_amount) : null,
      }));

  const categoryPostedMovements: CategoryPostedMovement[] = categoryMovementsResult.error
    ? []
    : (categoryMovementsResult.data ?? []).map((row: any) => ({
        id: row.id as number,
        categoryId: row.category_id as number,
        occurredAt: row.occurred_at as string,
        sourceAmount: row.source_amount != null ? toNum(row.source_amount) : null,
        destinationAmount: row.destination_amount != null ? toNum(row.destination_amount) : null,
      }));

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

/** Lista enriquecida (conteos, Ãºltima actividad) â€” pantalla CategorÃ­as. */
async function fetchCategoriesOverview(workspaceId: number): Promise<CategoryOverview[]> {
  if (!supabase) throw new Error("Supabase no estÃ¡ configurado.");

  const [catRes, movRes, subRes] = await Promise.all([
    supabase
      .from("categories")
      .select("id, workspace_id, name, kind, parent_id, color, icon, sort_order, is_system, is_active, created_at, updated_at")
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

  if (catRes.error) throw new Error(catRes.error.message ?? "Error al cargar categorÃ­as");

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
    staleTime: 60_000,
    retry: 1,
  });
}

// â”€â”€â”€ Workspace list init (no activeWorkspaceId needed) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

async function fetchUserWorkspaces(userId: string) {
  if (!supabase) throw new Error("Supabase no estÃ¡ configurado.");
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
    staleTime: 120_000,
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
    staleTime: 5 * 60_000,
    retry: 1,
  });
}

// â”€â”€â”€ Dashboard movements query â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export type DashboardMovementRow = {
  id: number;
  movementType: string;
  status: string;
  occurredAt: string;
  sourceAmount: number;
  destinationAmount: number;
  sourceAccountId: number | null;
  destinationAccountId: number | null;
  categoryId: number | null;
  counterpartyId: number | null;
  /** Para listados en dashboard (detalle por dÃ­a) */
  description: string;
};

export type DashboardAnalyticsBundle = {
  signals: MovementAnalyticsSignal[];
  learningFeedback: MovementLearningFeedback[];
  projectionSnapshot: WorkspaceAnalyticsSnapshot | null;
  available: boolean;
};

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
    staleTime: 60_000,
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
        throw new Error(signalsResult.error.message ?? "No se pudieron cargar las seÃ±ales analÃ­ticas.");
      }
      if (feedbackResult.error && !missingFeedback) {
        throw new Error(feedbackResult.error.message ?? "No se pudo cargar el aprendizaje persistido.");
      }
      if (snapshotResult.error && !missingSnapshot) {
        throw new Error(snapshotResult.error.message ?? "No se pudo cargar la proyecciÃ³n persistida.");
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
    staleTime: 60_000,
    retry: 1,
  });
}

export type DashboardAiSummaryInput = {
  workspaceId: number;
  summary: Record<string, unknown>;
};

export type DashboardAiSummaryResponse = {
  ok: boolean;
  reply: string;
  model?: string | null;
};

export function useDashboardAiSummaryMutation() {
  return useMutation({
    mutationFn: async (input: DashboardAiSummaryInput): Promise<DashboardAiSummaryResponse> => {
      if (!input.workspaceId) throw new Error("No se encontró el workspace activo.");
      if (!input.summary || typeof input.summary !== "object") {
        throw new Error("No hay resumen suficiente para enviar a la IA.");
      }
      return invokeEdgeFunction<DashboardAiSummaryResponse>("dashboard-advanced-ai-summary", input);
    },
  });
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

// â”€â”€â”€ Movement mutations â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export type MovementFormInput = {
  movementType: MovementType;
  status: MovementStatus;
  occurredAt: string;
  description: string;
  notes?: string | null;
  sourceAccountId: number | null;
  sourceAmount: number | null;
  destinationAccountId: number | null;
  destinationAmount: number | null;
  fxRate?: number | null;
  categoryId?: number | null;
  counterpartyId?: number | null;
  obligationId?: number | null;
  subscriptionId?: number | null;
  metadata?: JsonValue | null;
};

async function createMovement(
  workspaceId: number,
  input: MovementFormInput,
): Promise<MovementRecord> {
  if (!supabase) throw new Error("Supabase no estÃ¡ configurado.");

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
  };

  const { data, error } = await supabase
    .from("movements")
    .insert(payload)
    .select(
      "id, workspace_id, movement_type, status, occurred_at, description, notes, source_account_id, source_amount, destination_account_id, destination_amount, fx_rate, category_id, counterparty_id, obligation_id, subscription_id, metadata",
    )
    .single();

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
    mutationFn: (input: MovementFormInput) => createMovement(workspaceId!, input),
    onSuccess: () => {
      runBackgroundQueryRefresh(queryClient, [
        ["workspace-snapshot"],
        ["movements"],
      ]);
    },
  });
}

// â”€â”€â”€ Account mutations â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export type AccountFormInput = {
  name: string;
  type: string;
  currencyCode: string;
  openingBalance: number;
  includeInNetWorth: boolean;
  color: string;
  icon: string;
};

export function useCreateAccountMutation(workspaceId: number | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: AccountFormInput) => {
      if (!supabase || !workspaceId) throw new Error("Workspace no disponible.");
      const { data, error } = await supabase
        .from("accounts")
        .insert({
          workspace_id: workspaceId,
          name: input.name,
          type: input.type,
          currency_code: input.currencyCode,
          opening_balance: input.openingBalance,
          include_in_net_worth: input.includeInNetWorth,
          color: input.color,
          icon: input.icon,
          sort_order: 0,
          is_archived: false,
        })
        .select("id")
        .single();
      if (error) throw new Error(formatSupabaseError(error) || "Error de base de datos");
      return data as { id: number };
    },
    onSuccess: () => {
      runBackgroundQueryRefresh(queryClient, [["workspace-snapshot"]]);
    },
  });
}

export function useUpdateAccountMutation(workspaceId: number | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, input }: { id: number; input: Partial<AccountFormInput> }) => {
      if (!supabase || !workspaceId) throw new Error("Workspace no disponible.");
      const { error } = await supabase
        .from("accounts")
        .update({
          name: input.name,
          type: input.type,
          currency_code: input.currencyCode,
          opening_balance: input.openingBalance,
          include_in_net_worth: input.includeInNetWorth,
          color: input.color,
          icon: input.icon,
        })
        .eq("id", id)
        .eq("workspace_id", workspaceId);
      if (error) throw new Error(error.message ?? "Error de base de datos");
    },
    onSuccess: () => {
      runBackgroundQueryRefresh(queryClient, [["workspace-snapshot"]]);
    },
  });
}

// â”€â”€â”€ Budget mutations â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export type BudgetFormInput = {
  name: string;
  periodStart: string;
  periodEnd: string;
  limitAmount: number;
  alertPercent: number;
  currencyCode: string;
  categoryId?: number | null;
  accountId?: number | null;
  rolloverEnabled?: boolean;
  notes?: string | null;
};

export function useCreateBudgetMutation(workspaceId: number | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: BudgetFormInput) => {
      if (!supabase || !workspaceId) throw new Error("Workspace no disponible.");
      const { data, error } = await supabase
        .from("budgets")
        .insert({
          workspace_id: workspaceId,
          name: input.name,
          period_start: input.periodStart,
          period_end: input.periodEnd,
          limit_amount: input.limitAmount,
          alert_percent: input.alertPercent,
          currency_code: input.currencyCode,
          category_id: input.categoryId ?? null,
          account_id: input.accountId ?? null,
          rollover_enabled: input.rolloverEnabled ?? false,
          notes: input.notes ?? null,
        })
        .select("id")
        .single();
      if (error) throw new Error(error.message ?? "Error de base de datos");
      return data as { id: number };
    },
    onSuccess: () => {
      runBackgroundQueryRefresh(queryClient, [["workspace-snapshot"]]);
    },
  });
}

// â”€â”€â”€ Movement mutations (update / void) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export type MovementUpdateInput = {
  description?: string;
  notes?: string | null;
  categoryId?: number | null;
  counterpartyId?: number | null;
  occurredAt?: string;
  status?: MovementStatus;
  sourceAmount?: number;
  destinationAmount?: number;
  fxRate?: number | null;
  sourceAccountId?: number | null;
  destinationAccountId?: number | null;
};

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
      runBackgroundQueryRefresh(queryClient, [
        ["workspace-snapshot"],
        ["movements"],
        ["movement", id],
      ]);
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
      runBackgroundQueryRefresh(queryClient, [
        ["workspace-snapshot"],
        ["movements"],
        ["movement", id],
      ]);
    },
  });
}

// â”€â”€â”€ Budget mutations (update / delete) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export type BudgetUpdateInput = Partial<BudgetFormInput>;

export function useUpdateBudgetMutation(workspaceId: number | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, input }: { id: number; input: BudgetUpdateInput }) => {
      if (!supabase || !workspaceId) throw new Error("Workspace no disponible.");
      const payload: Record<string, unknown> = {};
      if (input.name !== undefined) payload.name = input.name;
      if (input.limitAmount !== undefined) payload.limit_amount = input.limitAmount;
      if (input.alertPercent !== undefined) payload.alert_percent = input.alertPercent;
      if (input.periodStart !== undefined) payload.period_start = input.periodStart;
      if (input.periodEnd !== undefined) payload.period_end = input.periodEnd;
      if (input.currencyCode !== undefined) payload.currency_code = input.currencyCode;
      if (input.categoryId !== undefined) payload.category_id = input.categoryId;
      if (input.accountId !== undefined) payload.account_id = input.accountId;
      if (input.rolloverEnabled !== undefined) payload.rollover_enabled = input.rolloverEnabled;
      if (input.notes !== undefined) payload.notes = input.notes;
      const { error } = await supabase
        .from("budgets")
        .update(payload)
        .eq("id", id)
        .eq("workspace_id", workspaceId);
      if (error) throw new Error(error.message ?? "Error de base de datos");
    },
    onSuccess: () => {
      runBackgroundQueryRefresh(queryClient, [["workspace-snapshot"]]);
    },
  });
}

export function useDeleteBudgetMutation(workspaceId: number | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      if (!supabase || !workspaceId) throw new Error("Workspace no disponible.");
      const { error } = await supabase
        .from("budgets")
        .delete()
        .eq("id", id)
        .eq("workspace_id", workspaceId);
      if (error) throw new Error(error.message ?? "Error de base de datos");
    },
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ["workspace-snapshot"] });
      const previousEntries = queryClient.getQueriesData<WorkspaceSnapshot>({ queryKey: ["workspace-snapshot"] });
      queryClient.setQueriesData<WorkspaceSnapshot>({ queryKey: ["workspace-snapshot"] }, (old) => {
        if (!old) return old;
        return { ...old, budgets: old.budgets.filter((b) => b.id !== id) };
      });
      return { previousEntries };
    },
    onError: (_err, _id, context) => {
      for (const [key, value] of (context?.previousEntries ?? [])) {
        queryClient.setQueryData(key, value);
      }
    },
    onSuccess: () => {
      runBackgroundQueryRefresh(queryClient, [["workspace-snapshot"]]);
    },
  });
}

// â”€â”€â”€ Movement delete mutation â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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
      runBackgroundQueryRefresh(queryClient, [["workspace-snapshot"], ["movements"]]);
    },
  });
}

// â”€â”€â”€ Account mutations (archive) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export function useArchiveAccountMutation(workspaceId: number | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, archived }: { id: number; archived: boolean }) => {
      if (!supabase || !workspaceId) throw new Error("Workspace no disponible.");
      const { error } = await supabase
        .from("accounts")
        .update({ is_archived: archived })
        .eq("id", id)
        .eq("workspace_id", workspaceId);
      if (error) throw new Error(error.message ?? "Error de base de datos");
    },
    onMutate: async ({ id, archived }) => {
      await queryClient.cancelQueries({ queryKey: ["workspace-snapshot"] });
      const previousEntries = queryClient.getQueriesData<WorkspaceSnapshot>({ queryKey: ["workspace-snapshot"] });
      queryClient.setQueriesData<WorkspaceSnapshot>({ queryKey: ["workspace-snapshot"] }, (old) => {
        if (!old) return old;
        return {
          ...old,
          accounts: old.accounts.map((a) => a.id === id ? { ...a, isArchived: archived } : a),
        };
      });
      return { previousEntries };
    },
    onError: (_err, _vars, context) => {
      for (const [key, value] of (context?.previousEntries ?? [])) {
        queryClient.setQueryData(key, value);
      }
    },
    onSuccess: () => {
      runBackgroundQueryRefresh(queryClient, [["workspace-snapshot"]]);
    },
  });
}

export function useDeleteAccountMutation(workspaceId: number | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      if (!supabase || !workspaceId) throw new Error("Workspace no disponible.");
      const { error } = await supabase
        .from("accounts")
        .delete()
        .eq("id", id)
        .eq("workspace_id", workspaceId);
      if (error) throw new Error(error.message ?? "Error de base de datos");
    },
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ["workspace-snapshot"] });
      const previousEntries = queryClient.getQueriesData<WorkspaceSnapshot>({ queryKey: ["workspace-snapshot"] });
      queryClient.setQueriesData<WorkspaceSnapshot>({ queryKey: ["workspace-snapshot"] }, (old) => {
        if (!old) return old;
        return { ...old, accounts: old.accounts.filter((a) => a.id !== id) };
      });
      return { previousEntries };
    },
    onError: (_err, _id, context) => {
      for (const [key, value] of (context?.previousEntries ?? [])) {
        queryClient.setQueryData(key, value);
      }
    },
    onSuccess: () => {
      runBackgroundQueryRefresh(queryClient, [["workspace-snapshot"]]);
    },
  });
}

// â”€â”€â”€ Account analytics â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export type AccountMovementAnalytics = {
  id: number;
  movementType: string;
  status: string;
  occurredAt: string;
  description: string | null;
  sourceAccountId: number | null;
  sourceAmount: number | null;
  destinationAccountId: number | null;
  destinationAmount: number | null;
  categoryId: number | null;
  categoryName: string | null;
};

export function useAccountAnalyticsQuery(
  workspaceId: number | null,
  accountId: number | null,
) {
  return useQuery({
    queryKey: ["account-analytics", workspaceId, accountId],
    enabled: Boolean(workspaceId && accountId),
    queryFn: async () => {
      if (!supabase || !workspaceId || !accountId) return [];
      const { data, error } = await supabase
        .from("movements")
        .select(
          "id, movement_type, status, occurred_at, description, source_account_id, source_amount, destination_account_id, destination_amount, category_id, categories(name)",
        )
        .eq("workspace_id", workspaceId)
        .or(`source_account_id.eq.${accountId},destination_account_id.eq.${accountId}`)
        .eq("status", "posted")
        .order("occurred_at", { ascending: false })
        .limit(300);
      if (error) throw error;
      return ((data ?? []) as any[]).map((r) => ({
        id: r.id,
        movementType: r.movement_type,
        status: r.status,
        occurredAt: r.occurred_at,
        description: r.description,
        sourceAccountId: r.source_account_id,
        sourceAmount: r.source_amount ? Number(r.source_amount) : null,
        destinationAccountId: r.destination_account_id,
        destinationAmount: r.destination_amount ? Number(r.destination_amount) : null,
        categoryId: r.category_id,
        categoryName: r.categories?.name ?? null,
      })) as AccountMovementAnalytics[];
    },
  });
}

// â”€â”€â”€ Obligation mutations â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export type ObligationFormInput = {
  userId: string;
  title: string;
  direction: "receivable" | "payable";
  originType: "cash_loan" | "sale_financed" | "purchase_financed" | "manual";
  openingImpact?: "none" | "inflow" | "outflow";
  openingAccountId?: number | null;
  counterpartyId?: number | null;
  settlementAccountId?: number | null;
  currencyCode: string;
  principalAmount: number;
  startDate: string;
  dueDate?: string | null;
  installmentAmount?: number | null;
  installmentCount?: number | null;
  interestRate?: number | null;
  description?: string | null;
  notes?: string | null;
};

export function useDeleteObligationMutation(workspaceId: number | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      if (!supabase || !workspaceId) throw new Error("Workspace no disponible.");
      const { count, error: eventsError } = await supabase
        .from("obligation_events")
        .select("id", { head: true, count: "exact" })
        .eq("obligation_id", id)
        .neq("event_type", "opening");
      if (eventsError) throw new Error(eventsError.message ?? "Error al validar la obligaciÃ³n");
      if ((count ?? 0) > 0) {
        throw new Error("No puedes eliminar esta obligaciÃ³n porque tiene eventos. ArchÃ­vala o elimina sus eventos primero.");
      }
      const { error } = await supabase
        .from("obligations")
        .delete()
        .eq("id", id)
        .eq("workspace_id", workspaceId);
      if (error) throw new Error(error.message ?? "Error de base de datos");
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["workspace-snapshot"] });
      if (workspaceId) {
        void queryClient.invalidateQueries({ queryKey: ["obligation-shares", workspaceId] });
      }
    },
  });
}

export function useArchiveObligationMutation(workspaceId: number | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, archived }: { id: number; archived: boolean }) => {
      if (!supabase || !workspaceId) throw new Error("Workspace no disponible.");
      const nextStatus: ObligationStatus = archived ? "cancelled" : "active";
      const { error } = await supabase
        .from("obligations")
        .update({ status: nextStatus })
        .eq("id", id)
        .eq("workspace_id", workspaceId);
      if (error) throw new Error(error.message ?? "Error de base de datos");
    },
    onSuccess: () => {
      runBackgroundQueryRefresh(
        queryClient,
        workspaceId
          ? [["workspace-snapshot"], ["obligation-active-share"], ["obligation-shares", workspaceId]]
          : [["workspace-snapshot"], ["obligation-active-share"]],
      );
    },
  });
}

export function useCreateObligationMutation(workspaceId: number | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: ObligationFormInput) => {
      if (!supabase || !workspaceId) throw new Error("Workspace no disponible.");
      const { data, error } = await supabase
        .from("obligations")
        .insert({
          workspace_id: workspaceId,
          created_by_user_id: input.userId,
          updated_by_user_id: input.userId,
          title: input.title,
          direction: input.direction,
          origin_type: input.originType,
          counterparty_id: input.counterpartyId ?? null,
          settlement_account_id: input.settlementAccountId ?? null,
          currency_code: input.currencyCode,
          principal_amount: input.principalAmount,
          start_date: input.startDate,
          due_date: input.dueDate ?? null,
          installment_amount: input.installmentAmount ?? null,
          installment_count: input.installmentCount ?? null,
          interest_rate: input.interestRate ?? null,
          description: input.description ?? null,
          notes: input.notes ?? null,
          status: "active",
        })
        .select("id")
        .single();
      if (error) throw new Error(error.message ?? "Error de base de datos");
      const created = data as { id: number };

      // Create opening movement when cash actually moved at obligation start
      const openingImpact = input.openingImpact ?? "none";
      if (openingImpact !== "none" && input.openingAccountId) {
        const isInflow = openingImpact === "inflow";
        const openingDesc = input.direction === "receivable"
          ? `PrÃ©stamo entregado: ${input.title}`
          : `Dinero recibido: ${input.title}`;
        await createMovement(workspaceId, {
          movementType: "obligation_opening" as MovementType,
          status: "posted",
          occurredAt: `${input.startDate}T12:00:00`,
          description: openingDesc,
          notes: null,
          sourceAccountId: isInflow ? null : input.openingAccountId,
          sourceAmount: isInflow ? null : input.principalAmount,
          destinationAccountId: isInflow ? input.openingAccountId : null,
          destinationAmount: isInflow ? input.principalAmount : null,
          obligationId: created.id,
        });
      }

      return created;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["workspace-snapshot"] });
      void queryClient.invalidateQueries({ queryKey: ["obligation-active-share"] });
      if (workspaceId) {
        void queryClient.invalidateQueries({ queryKey: ["obligation-shares", workspaceId] });
      }
    },
  });
}

export function useUpdateObligationMutation(workspaceId: number | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, input }: { id: number; input: Partial<ObligationFormInput> }) => {
      if (!supabase || !workspaceId) throw new Error("Workspace no disponible.");
      const payload: Record<string, unknown> = {};
      if (input.title !== undefined) payload.title = input.title;
      if (input.counterpartyId !== undefined) payload.counterparty_id = input.counterpartyId;
      if (input.settlementAccountId !== undefined) payload.settlement_account_id = input.settlementAccountId;
      if (input.dueDate !== undefined) payload.due_date = input.dueDate;
      if (input.installmentAmount !== undefined) payload.installment_amount = input.installmentAmount;
      if (input.installmentCount !== undefined) payload.installment_count = input.installmentCount;
      if (input.interestRate !== undefined) payload.interest_rate = input.interestRate;
      if (input.description !== undefined) payload.description = input.description;
      if (input.notes !== undefined) payload.notes = input.notes;
      const { error } = await supabase
        .from("obligations")
        .update(payload)
        .eq("id", id)
        .eq("workspace_id", workspaceId);
      if (error) throw new Error(error.message ?? "Error de base de datos");
    },
    onSuccess: () => {
      runBackgroundQueryRefresh(
        queryClient,
        workspaceId
          ? [["workspace-snapshot"], ["obligation-active-share"], ["obligation-shares", workspaceId]]
          : [["workspace-snapshot"], ["obligation-active-share"]],
      );
    },
  });
}

export type ObligationPaymentInput = {
  obligationId: number;
  amount: number;
  paymentDate: string;
  accountId?: number | null;
  installmentNo?: number | null;
  description?: string | null;
  notes?: string | null;
  createMovement: boolean;
  /** Si es "receivable" (me deben), textos automÃ¡ticos usan â€œcobroâ€. */
  direction?: ObligationDirection;
  attachments?: AttachmentLike[];
};

async function fetchObligationWorkspaceId(obligationId: number): Promise<number> {
  if (!supabase) throw new Error("Supabase no disponible.");
  const { data, error } = await supabase
    .from("obligations")
    .select("workspace_id")
    .eq("id", obligationId)
    .single();
  if (error) throw new Error(error.message ?? "ObligaciÃ³n no encontrada");
  const ws = toNum(data?.workspace_id);
  if (!ws) throw new Error("Workspace no disponible.");
  return ws;
}

export function useCreateObligationPaymentMutation(workspaceId: number | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: ObligationPaymentInput) => {
      if (!supabase) throw new Error("Supabase no disponible.");
      const wsId = await fetchObligationWorkspaceId(input.obligationId);
      if (workspaceId != null && workspaceId !== wsId) {
        throw new Error("La obligaciÃ³n no pertenece al workspace activo.");
      }
      const isReceivable = input.direction === "receivable";
      const autoDesc =
        input.description?.trim() ||
        (isReceivable ? `Cobro obligaciÃ³n #${input.obligationId}` : `Pago obligaciÃ³n #${input.obligationId}`);
      const { id: eventId, installmentNoApplied } = await insertObligationPaymentEventWithFallback({
        obligationId: input.obligationId,
        paymentDate: input.paymentDate,
        amount: input.amount,
        installmentNo: input.installmentNo,
        description: input.description,
        notes: input.notes,
        metadata: {},
      });
      let ownerMovementId: number | null = null;
      // If requested, also create a movement linked to this obligation
      if (input.createMovement && input.accountId) {
        const movementPayload: Record<string, unknown> = {
          workspace_id: wsId,
          movement_type: "obligation_payment",
          status: "posted",
          occurred_at: dateStrToISO(input.paymentDate),
          description: autoDesc,
          obligation_id: input.obligationId,
          metadata: { obligation_event_id: eventId },
        };
        if (isReceivable) {
          movementPayload.destination_account_id = input.accountId;
          movementPayload.destination_amount = input.amount;
        } else {
          movementPayload.source_account_id = input.accountId;
          movementPayload.source_amount = input.amount;
        }
        const { data: mvData, error: mvErr } = await supabase
          .from("movements")
          .insert(movementPayload)
          .select("id")
          .single();
        if (mvErr) throw mvErr;
        ownerMovementId = (mvData as { id: number }).id;
        await attachMovementToObligationEvent(eventId, ownerMovementId);
      }
      return {
        id: eventId,
        movementId: ownerMovementId,
        workspaceId: wsId,
        installmentNoApplied,
      };
    },
    onSuccess: (data, variables) => {
      const queryKeys: Array<readonly unknown[]> = [
        ["workspace-snapshot"],
        ["movements"],
        ["obligation-events", variables.obligationId],
        ["entity-attachments", data.workspaceId, "obligation-event", data.id],
      ];
      if (data.movementId) {
        queryKeys.push(["movement-attachments", data.workspaceId, data.movementId]);
      }
      runBackgroundQueryRefresh(queryClient, queryKeys, {
        message: "Actualizando pago",
        description: "Estamos sincronizando el historial y los balances en segundo plano.",
      });
    },
  });
}

// â”€â”€â”€ Link existing movement to obligation â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export function useLinkMovementToObligationMutation(workspaceId: number | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      movementId,
      obligationId,
      amount,
      paymentDate,
      description,
      installmentNo,
    }: {
      movementId: number;
      obligationId: number;
      amount: number;
      paymentDate: string;
      description?: string | null;
      installmentNo?: number | null;
    }) => {
      if (!supabase || !workspaceId) throw new Error("Workspace no disponible.");
      // 1. Create obligation_event of type "payment" linked to this movement
      const { error: evError } = await supabase
        .from("obligation_events")
        .insert({
          obligation_id: obligationId,
          event_type: "payment",
          event_date: paymentDate,
          amount,
          movement_id: movementId,
          description: description?.trim() || null,
          installment_no: installmentNo ?? null,
          metadata: {},
        });
      if (evError) throw new Error(evError.message ?? "Error al crear evento de obligaciÃ³n");
      // 2. Tag the movement with the obligation id
      const { error: mvError } = await supabase
        .from("movements")
        .update({ obligation_id: obligationId })
        .eq("id", movementId)
        .eq("workspace_id", workspaceId);
      if (mvError) throw new Error(mvError.message ?? "Error al vincular movimiento");
    },
    onSuccess: (_data, { movementId, obligationId }) => {
      runBackgroundQueryRefresh(queryClient, [
        ["workspace-snapshot"],
        ["movements"],
        ["movement", movementId],
        ["obligation-events", obligationId],
      ]);
    },
  });
}

export type PrincipalAdjustmentInput = {
  obligationId: number;
  direction: ObligationDirection;
  mode: "increase" | "decrease";
  amount: number;
  eventDate: string;
  reason?: string | null;
  notes?: string | null;
  accountId?: number | null;
  createMovement?: boolean;
};

export function useCreatePrincipalAdjustmentMutation(workspaceId: number | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: PrincipalAdjustmentInput) => {
      if (!supabase) throw new Error("Supabase no disponible.");
      const wsId = await fetchObligationWorkspaceId(input.obligationId);
      if (workspaceId != null && workspaceId !== wsId) {
        throw new Error("La obligaciÃ³n no pertenece al workspace activo.");
      }
      const eventType = input.mode === "increase" ? "principal_increase" : "principal_decrease";
      const { data, error } = await supabase
        .from("obligation_events")
        .insert({
          obligation_id: input.obligationId,
          event_type: eventType,
          event_date: input.eventDate,
          amount: input.amount,
          reason: input.reason ?? null,
          notes: input.notes ?? null,
          metadata: {},
        })
        .select("id")
        .single();
      if (error) throw new Error(error.message ?? "Error de base de datos");
      const eventId = (data as { id: number }).id;
      // Optionally create a linked account movement
      if (input.createMovement && input.accountId) {
        const isReceivable = input.direction === "receivable";
        const movType =
          input.mode === "increase"
            ? (isReceivable ? "expense" : "income")
            : (isReceivable ? "income" : "expense");
        const desc = input.mode === "increase"
          ? (isReceivable
              ? `Prestamo adicional #${input.obligationId}`
              : `Aumento de deuda #${input.obligationId}`)
          : (isReceivable
              ? `Recuperacion de principal #${input.obligationId}`
              : `Reduccion de deuda #${input.obligationId}`);
        const { data: mvData, error: mvErr } = await supabase
          .from("movements")
          .insert({
            workspace_id: wsId,
            movement_type: movType,
            status: "posted",
            occurred_at: dateStrToISO(input.eventDate),
            description: desc,
            ...((movType === "income")
              ? { destination_account_id: input.accountId, destination_amount: input.amount }
              : { source_account_id: input.accountId, source_amount: input.amount }),
            obligation_id: input.obligationId,
            metadata: { obligation_event_id: eventId },
          })
          .select("id")
          .single();
        if (mvErr) throw mvErr;
        await attachMovementToObligationEvent(eventId, (mvData as { id: number }).id);
      }
      return { id: eventId };
    },
    onSuccess: (data, variables) => {
      runBackgroundQueryRefresh(queryClient, [
        ["workspace-snapshot"],
        ["movements"],
        ["obligation-events", variables.obligationId],
      ], {
        message: "Actualizando deuda o crÃ©dito",
        description: "Estamos sincronizando el evento y los balances asociados en segundo plano.",
      });
    },
  });
}

// â”€â”€â”€ Obligation event update / delete â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export type UpdateObligationEventInput = {
  eventId: number;
  obligationId: number;
  amount: number;
  eventDate: string;
  installmentNo?: number | null;
  description?: string | null;
  notes?: string | null;
  reason?: string | null;
  movementId?: number | null;
  accountId?: number | null;
  createMovement?: boolean;
  direction?: ObligationDirection;
  eventType?: string | null;
  currencyCode?: string | null;
  obligationTitle?: string | null;
};

type UpdateObligationEventSyncResult = {
  movementId: number | null;
  workspaceId: number;
  removedMovementId: number | null;
  syncedViewerMovementIds: number[];
};

async function resolveMovementAccountId(movementId: number | null | undefined): Promise<number | null> {
  if (!supabase || !movementId) return null;
  const { data, error } = await supabase
    .from("movements")
    .select("source_account_id, destination_account_id")
    .eq("id", movementId)
    .maybeSingle();
  if (error) {
    throw new Error(error.message ?? "Error al cargar la cuenta del movimiento");
  }
  const row = data as { source_account_id?: NumericLike; destination_account_id?: NumericLike } | null;
  const sourceAccountId = toNum(row?.source_account_id ?? null);
  if (sourceAccountId) return sourceAccountId;
  const destinationAccountId = toNum(row?.destination_account_id ?? null);
  return destinationAccountId || null;
}

async function syncViewerLinkedMovementsForEvent(input: {
  eventId: number;
  obligationId: number;
  obligationWorkspaceId: number;
  amount: number;
  eventDate: string;
  description?: string | null;
  direction: ObligationDirection;
  obligationTitle?: string | null;
}) {
  if (!supabase) throw new Error("Supabase no disponible.");

  const viewerLinks = await fetchViewerLinksForEvent(input.eventId);
  if (viewerLinks.length === 0) return [] as number[];

  const viewerIsDebtor = input.direction === "receivable";
  const autoDesc =
    input.description?.trim() ||
    (viewerIsDebtor
      ? `Pago vinculado: ${input.obligationTitle?.trim() || `Obligacion #${input.obligationId}`}`
      : `Cobro vinculado: ${input.obligationTitle?.trim() || `Obligacion #${input.obligationId}`}`);

  const syncedMovementIds: number[] = [];

  for (const link of viewerLinks) {
    const viewerWorkspaceId = link.viewer_workspace_id != null ? Number(link.viewer_workspace_id) : null;
    let accountId = link.account_id != null ? Number(link.account_id) : null;
    if (!accountId && link.movement_id) {
      accountId = await resolveMovementAccountId(link.movement_id);
    }
    if (!viewerWorkspaceId || !accountId) continue;

    const movementPayload: Record<string, unknown> = {
      workspace_id: viewerWorkspaceId,
      movement_type: "obligation_payment",
      status: "posted",
      occurred_at: dateStrToISO(input.eventDate),
      description: autoDesc,
      obligation_id: null,
      metadata: { obligation_id: input.obligationId, obligation_event_id: input.eventId },
      source_account_id: viewerIsDebtor ? accountId : null,
      source_amount: viewerIsDebtor ? input.amount : null,
      destination_account_id: viewerIsDebtor ? null : accountId,
      destination_amount: viewerIsDebtor ? null : input.amount,
    };

    let movementId = link.movement_id != null ? Number(link.movement_id) : null;
    if (movementId) {
      const { error: movementUpdateError } = await supabase
        .from("movements")
        .update(movementPayload)
        .eq("id", movementId);
      if (movementUpdateError) {
        throw new Error(movementUpdateError.message ?? "Error al actualizar movimiento del viewer");
      }
    } else {
      const { data: movementData, error: movementInsertError } = await supabase
        .from("movements")
        .insert(movementPayload)
        .select("id")
        .single();
      if (movementInsertError) {
        throw new Error(movementInsertError.message ?? "Error al crear movimiento del viewer");
      }
      movementId = toNum((movementData as { id: NumericLike }).id);
      const { error: linkUpdateError } = await supabase
        .from("obligation_event_viewer_links")
        .update({
          account_id: accountId,
          movement_id: movementId,
        })
        .eq("id", link.id);
      if (linkUpdateError) {
        throw new Error(linkUpdateError.message ?? "Error al actualizar vinculo del viewer");
      }
    }

    if (movementId) {
      syncedMovementIds.push(movementId);
      try {
        await mirrorObligationEventAttachmentsToMovement({
          workspaceId: input.obligationWorkspaceId,
          targetWorkspaceId: viewerWorkspaceId,
          eventId: input.eventId,
          movementId,
        });
      } catch (error) {
        console.warn("[syncViewerLinkedMovementsForEvent] attachment mirror failed", error);
      }
    }
  }

  return syncedMovementIds;
}

async function notifyAcceptedViewersObligationEventUpdated(input: {
  obligationId: number;
  eventId: number;
  amount: number;
  eventDate: string;
  installmentNo?: number | null;
  description?: string | null;
  notes?: string | null;
  currencyCode?: string | null;
  eventType?: string | null;
  obligationTitle?: string | null;
  currentAmount?: number | null;
  currentEventDate?: string | null;
  currentInstallmentNo?: number | null;
  currentDescription?: string | null;
  currentNotes?: string | null;
}) {
  if (!supabase) throw new Error("Supabase no disponible.");

  const { data: shareRows, error: shareRowsError } = await supabase
    .from("obligation_shares")
    .select("invited_user_id")
    .eq("obligation_id", input.obligationId)
    .eq("status", "accepted");
  if (shareRowsError) {
    throw new Error(shareRowsError.message ?? "Error al cargar viewers de la obligacion");
  }

  const viewerIds = (shareRows ?? [])
    .map((row) => (row as { invited_user_id?: string | null }).invited_user_id ?? null)
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0);
  if (viewerIds.length === 0) return;

  const amountLabel = formatNotificationCurrency(input.amount, input.currencyCode);
  const payload = eventEditPayload({
    obligationId: input.obligationId,
    eventId: input.eventId,
    currencyCode: input.currencyCode,
    eventType: input.eventType,
    obligationTitle: input.obligationTitle,
    currentAmount: input.currentAmount,
    currentEventDate: input.currentEventDate,
    currentInstallmentNo: input.currentInstallmentNo,
    currentDescription: input.currentDescription,
    currentNotes: input.currentNotes,
    proposedAmount: input.amount,
    proposedEventDate: input.eventDate,
    proposedInstallmentNo: input.installmentNo ?? null,
    proposedDescription: input.description?.trim() || null,
    proposedNotes: input.notes?.trim() || null,
  });

  await Promise.all(
    viewerIds.map((viewerUserId) =>
      createOrRefreshNotificationRow({
        user_id: viewerUserId,
        channel: "in_app",
        status: "pending",
        kind: "obligation_event_updated",
        title: "Evento actualizado",
        body: `Se actualizo un evento${amountLabel}${input.obligationTitle ? ` en "${input.obligationTitle}"` : ""}.`,
        scheduled_for: new Date().toISOString(),
        related_entity_type: "obligation_event",
        related_entity_id: input.eventId,
        payload,
      }),
    ),
  );
}

async function updateObligationEventAndSyncMovements(
  input: UpdateObligationEventInput,
): Promise<UpdateObligationEventSyncResult> {
  if (!supabase) throw new Error("Supabase no disponible.");

  const { data: currentEventRow, error: currentEventError } = await supabase
    .from("obligation_events")
    .select("amount, event_date, installment_no, description, notes, event_type")
    .eq("id", input.eventId)
    .maybeSingle();
  if (currentEventError) {
    throw new Error(currentEventError.message ?? "Error al cargar el evento");
  }
  const currentEvent = currentEventRow as {
    amount?: NumericLike | null;
    event_date?: string | null;
    installment_no?: NumericLike | null;
    description?: string | null;
    notes?: string | null;
    event_type?: string | null;
  } | null;

  const { error } = await supabase
    .from("obligation_events")
    .update({
      amount: input.amount,
      event_date: input.eventDate,
      installment_no: input.installmentNo ?? null,
      description: input.description?.trim() || null,
      notes: input.notes?.trim() || null,
      reason: input.reason?.trim() || null,
    })
    .eq("id", input.eventId);
  if (error) throw new Error(error.message ?? "Error de base de datos");

  const workspaceId = await fetchObligationWorkspaceId(input.obligationId);
  const shouldSyncPaymentMovement =
    input.direction != null &&
    (input.movementId != null || input.accountId != null || input.createMovement != null);

  if (!shouldSyncPaymentMovement) {
    return {
      movementId: input.movementId ?? null,
      workspaceId,
      removedMovementId: null,
      syncedViewerMovementIds: [],
    };
  }

  const isReceivable = input.direction === "receivable";
  const autoDesc =
    input.description?.trim() ||
    (isReceivable
      ? `Cobro obligacion #${input.obligationId}`
      : `Pago obligacion #${input.obligationId}`);

  const createMovement = input.createMovement ?? Boolean(input.movementId ?? input.accountId);
  const resolvedAccountId =
    input.accountId ?? (input.movementId ? await resolveMovementAccountId(input.movementId) : null);

  let movementId = input.movementId ?? null;
  let removedMovementId: number | null = null;

  if (createMovement && resolvedAccountId) {
    const movementPayload: Record<string, unknown> = {
      workspace_id: workspaceId,
      movement_type: "obligation_payment",
      status: "posted",
      occurred_at: dateStrToISO(input.eventDate),
      description: autoDesc,
      obligation_id: input.obligationId,
      metadata: { obligation_event_id: input.eventId },
      source_account_id: isReceivable ? null : resolvedAccountId,
      source_amount: isReceivable ? null : input.amount,
      destination_account_id: isReceivable ? resolvedAccountId : null,
      destination_amount: isReceivable ? input.amount : null,
    };

    if (movementId) {
      const { error: movementUpdateError } = await supabase
        .from("movements")
        .update(movementPayload)
        .eq("id", movementId);
      if (movementUpdateError) {
        throw new Error(movementUpdateError.message ?? "Error al actualizar movimiento vinculado");
      }
    } else {
      const { data: movementData, error: movementInsertError } = await supabase
        .from("movements")
        .insert(movementPayload)
        .select("id")
        .single();
      if (movementInsertError) {
        throw new Error(movementInsertError.message ?? "Error al crear movimiento vinculado");
      }
      movementId = toNum((movementData as { id: NumericLike }).id);
      await attachMovementToObligationEvent(input.eventId, movementId);
    }
  } else if (!createMovement && movementId) {
    const { error: movementDeleteError } = await supabase
      .from("movements")
      .delete()
      .eq("id", movementId);
    if (movementDeleteError) {
      throw new Error(movementDeleteError.message ?? "Error al eliminar movimiento vinculado");
    }
    const { error: unlinkError } = await supabase
      .from("obligation_events")
      .update({ movement_id: null })
      .eq("id", input.eventId);
    if (unlinkError) {
      throw new Error(unlinkError.message ?? "Error al desvincular movimiento del evento");
    }
    removedMovementId = movementId;
    movementId = null;
  }

  const syncedViewerMovementIds = await syncViewerLinkedMovementsForEvent({
    eventId: input.eventId,
    obligationId: input.obligationId,
    obligationWorkspaceId: workspaceId,
    amount: input.amount,
    eventDate: input.eventDate,
    description: input.description,
    direction: input.direction as ObligationDirection,
  });

  await notifyAcceptedViewersObligationEventUpdated({
    obligationId: input.obligationId,
    eventId: input.eventId,
    amount: input.amount,
    eventDate: input.eventDate,
    installmentNo: input.installmentNo ?? null,
    description: input.description ?? null,
    notes: input.notes ?? null,
    currencyCode: input.currencyCode ?? null,
    eventType: input.eventType ?? currentEvent?.event_type ?? null,
    obligationTitle: input.obligationTitle ?? null,
    currentAmount: toNum(currentEvent?.amount ?? null),
    currentEventDate: currentEvent?.event_date ?? null,
    currentInstallmentNo: toNum(currentEvent?.installment_no ?? null),
    currentDescription: currentEvent?.description ?? null,
    currentNotes: currentEvent?.notes ?? null,
  });

  return {
    movementId,
    workspaceId,
    removedMovementId,
    syncedViewerMovementIds,
  };
}

export function useUpdateObligationEventMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateObligationEventInput) => updateObligationEventAndSyncMovements(input),
    onSuccess: (data, variables) => {
      const queryKeys: Array<readonly unknown[]> = [
        ["workspace-snapshot"],
        ["movements"],
        ["obligation-events", variables.obligationId],
      ];
      if (data?.movementId) queryKeys.push(["movement", data.movementId]);
      if (data?.removedMovementId) queryKeys.push(["movement", data.removedMovementId]);
      for (const syncedViewerMovementId of data?.syncedViewerMovementIds ?? []) {
        queryKeys.push(["movement", syncedViewerMovementId]);
      }
      runBackgroundQueryRefresh(queryClient, queryKeys, {
        message: "Actualizando evento",
        description: "Estamos sincronizando el historial de la deuda o crÃ©dito en segundo plano.",
      });
    },
  });
}

export type DeleteObligationEventInput = {
  eventId: number;
  obligationId: number;
  workspaceId?: number | null;
  movementId?: number | null;
  ownerUserId?: string | null;
  obligationTitle?: string | null;
  amount?: number | null;
  currencyCode?: string | null;
  eventType?: string | null;
  eventDate?: string | null;
};

type EventDeleteRequestPayload = {
  obligationId: number;
  eventId: number;
  amount?: number | null;
  currencyCode?: string | null;
  eventType?: string | null;
  eventDate?: string | null;
  obligationTitle?: string | null;
  requestedByUserId?: string | null;
  requestedByDisplayName?: string | null;
  rejectionReason?: string | null;
  responseStatus?: "accepted" | "rejected" | null;
};

type EventEditRequestPayload = {
  obligationId: number;
  eventId: number;
  currencyCode?: string | null;
  eventType?: string | null;
  obligationTitle?: string | null;
  requestedByUserId?: string | null;
  requestedByDisplayName?: string | null;
  rejectionReason?: string | null;
  responseStatus?: "accepted" | "rejected" | null;
  currentAmount?: number | null;
  currentEventDate?: string | null;
  currentInstallmentNo?: number | null;
  currentDescription?: string | null;
  currentNotes?: string | null;
  proposedAmount?: number | null;
  proposedEventDate?: string | null;
  proposedInstallmentNo?: number | null;
  proposedDescription?: string | null;
  proposedNotes?: string | null;
};

type ViewerEventLinkRow = {
  id: number;
  movement_id: number | null;
  linked_by_user_id: string | null;
  account_id: number | null;
  viewer_workspace_id: number | null;
};

type OwnerMovementLookupRow = {
  id: number;
  movement_type: MovementType;
  source_amount: NumericLike;
  destination_amount: NumericLike;
  description: string | null;
  metadata: JsonValue | null;
};

function eventDeletePayload(input: {
  obligationId: number;
  eventId: number;
  amount?: number | null;
  currencyCode?: string | null;
  eventType?: string | null;
  eventDate?: string | null;
  obligationTitle?: string | null;
  requestedByUserId?: string | null;
  requestedByDisplayName?: string | null;
  rejectionReason?: string | null;
  responseStatus?: "accepted" | "rejected" | null;
}): EventDeleteRequestPayload {
  return {
    obligationId: input.obligationId,
    eventId: input.eventId,
    amount: input.amount ?? null,
    currencyCode: input.currencyCode?.trim().toUpperCase() || null,
    eventType: input.eventType ?? null,
    eventDate: input.eventDate ?? null,
    obligationTitle: input.obligationTitle ?? null,
    requestedByUserId: input.requestedByUserId ?? null,
    requestedByDisplayName: input.requestedByDisplayName ?? null,
    rejectionReason: input.rejectionReason ?? null,
    responseStatus: input.responseStatus ?? null,
  };
}

function eventEditPayload(input: {
  obligationId: number;
  eventId: number;
  currencyCode?: string | null;
  eventType?: string | null;
  obligationTitle?: string | null;
  requestedByUserId?: string | null;
  requestedByDisplayName?: string | null;
  rejectionReason?: string | null;
  responseStatus?: "accepted" | "rejected" | null;
  currentAmount?: number | null;
  currentEventDate?: string | null;
  currentInstallmentNo?: number | null;
  currentDescription?: string | null;
  currentNotes?: string | null;
  proposedAmount?: number | null;
  proposedEventDate?: string | null;
  proposedInstallmentNo?: number | null;
  proposedDescription?: string | null;
  proposedNotes?: string | null;
}): EventEditRequestPayload {
  return {
    obligationId: input.obligationId,
    eventId: input.eventId,
    currencyCode: input.currencyCode?.trim().toUpperCase() || null,
    eventType: input.eventType ?? null,
    obligationTitle: input.obligationTitle ?? null,
    requestedByUserId: input.requestedByUserId ?? null,
    requestedByDisplayName: input.requestedByDisplayName ?? null,
    rejectionReason: input.rejectionReason ?? null,
    responseStatus: input.responseStatus ?? null,
    currentAmount: input.currentAmount ?? null,
    currentEventDate: input.currentEventDate ?? null,
    currentInstallmentNo: input.currentInstallmentNo ?? null,
    currentDescription: input.currentDescription ?? null,
    currentNotes: input.currentNotes ?? null,
    proposedAmount: input.proposedAmount ?? null,
    proposedEventDate: input.proposedEventDate ?? null,
    proposedInstallmentNo: input.proposedInstallmentNo ?? null,
    proposedDescription: input.proposedDescription ?? null,
    proposedNotes: input.proposedNotes ?? null,
  };
}

function readEventDeletePayload(value: JsonValue | null | undefined): EventDeleteRequestPayload | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, JsonValue>;
  const obligationId = typeof raw.obligationId === "number" ? raw.obligationId : Number(raw.obligationId ?? 0);
  const eventId = typeof raw.eventId === "number" ? raw.eventId : Number(raw.eventId ?? 0);
  if (!obligationId || !eventId) return null;
  return {
    obligationId,
    eventId,
    amount:
      typeof raw.amount === "number"
        ? raw.amount
        : raw.amount == null
          ? null
          : Number(raw.amount),
    currencyCode: typeof raw.currencyCode === "string" ? raw.currencyCode.trim().toUpperCase() : null,
    eventType: typeof raw.eventType === "string" ? raw.eventType : null,
    eventDate: typeof raw.eventDate === "string" ? raw.eventDate : null,
    obligationTitle: typeof raw.obligationTitle === "string" ? raw.obligationTitle : null,
    requestedByUserId: typeof raw.requestedByUserId === "string" ? raw.requestedByUserId : null,
    requestedByDisplayName:
      typeof raw.requestedByDisplayName === "string" ? raw.requestedByDisplayName : null,
    rejectionReason: typeof raw.rejectionReason === "string" ? raw.rejectionReason : null,
    responseStatus:
      raw.responseStatus === "accepted" || raw.responseStatus === "rejected"
        ? raw.responseStatus
        : null,
  };
}

function readEventEditPayload(value: JsonValue | null | undefined): EventEditRequestPayload | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, JsonValue>;
  const obligationId = typeof raw.obligationId === "number" ? raw.obligationId : Number(raw.obligationId ?? 0);
  const eventId = typeof raw.eventId === "number" ? raw.eventId : Number(raw.eventId ?? 0);
  if (!obligationId || !eventId) return null;
  return {
    obligationId,
    eventId,
    currencyCode: typeof raw.currencyCode === "string" ? raw.currencyCode.trim().toUpperCase() : null,
    eventType: typeof raw.eventType === "string" ? raw.eventType : null,
    obligationTitle: typeof raw.obligationTitle === "string" ? raw.obligationTitle : null,
    requestedByUserId: typeof raw.requestedByUserId === "string" ? raw.requestedByUserId : null,
    requestedByDisplayName:
      typeof raw.requestedByDisplayName === "string" ? raw.requestedByDisplayName : null,
    rejectionReason: typeof raw.rejectionReason === "string" ? raw.rejectionReason : null,
    responseStatus:
      raw.responseStatus === "accepted" || raw.responseStatus === "rejected"
        ? raw.responseStatus
        : null,
    currentAmount:
      typeof raw.currentAmount === "number"
        ? raw.currentAmount
        : raw.currentAmount == null
          ? null
          : Number(raw.currentAmount),
    currentEventDate: typeof raw.currentEventDate === "string" ? raw.currentEventDate : null,
    currentInstallmentNo:
      typeof raw.currentInstallmentNo === "number"
        ? raw.currentInstallmentNo
        : raw.currentInstallmentNo == null
          ? null
          : Number(raw.currentInstallmentNo),
    currentDescription:
      typeof raw.currentDescription === "string" ? raw.currentDescription : null,
    currentNotes: typeof raw.currentNotes === "string" ? raw.currentNotes : null,
    proposedAmount:
      typeof raw.proposedAmount === "number"
        ? raw.proposedAmount
        : raw.proposedAmount == null
          ? null
          : Number(raw.proposedAmount),
    proposedEventDate: typeof raw.proposedEventDate === "string" ? raw.proposedEventDate : null,
    proposedInstallmentNo:
      typeof raw.proposedInstallmentNo === "number"
        ? raw.proposedInstallmentNo
        : raw.proposedInstallmentNo == null
          ? null
          : Number(raw.proposedInstallmentNo),
    proposedDescription:
      typeof raw.proposedDescription === "string" ? raw.proposedDescription : null,
    proposedNotes: typeof raw.proposedNotes === "string" ? raw.proposedNotes : null,
  };
}

async function fetchViewerLinksForEvent(eventId: number): Promise<ViewerEventLinkRow[]> {
  if (!supabase) throw new Error("Supabase no disponible.");
  const { data, error } = await supabase
    .from("obligation_event_viewer_links")
    .select("id, movement_id, linked_by_user_id, account_id, viewer_workspace_id")
    .eq("event_id", eventId);
  if (error) throw new Error(error.message ?? "Error al cargar vÃ­nculos del evento");
  return (data ?? []) as ViewerEventLinkRow[];
}

async function deleteViewerLinksForEvent(eventId: number): Promise<ViewerEventLinkRow[]> {
  if (!supabase) throw new Error("Supabase no disponible.");
  const viewerLinks = await fetchViewerLinksForEvent(eventId);
  for (const link of viewerLinks) {
    if (link.movement_id) {
      const { error: mvErr } = await supabase
        .from("movements")
        .delete()
        .eq("id", link.movement_id);
      if (mvErr) throw new Error(mvErr.message ?? "Error al eliminar movimiento asociado del viewer");
    }
  }
  if (viewerLinks.length > 0) {
    const { error: linkErr } = await supabase
      .from("obligation_event_viewer_links")
      .delete()
      .eq("event_id", eventId);
    if (linkErr) throw new Error(linkErr.message ?? "Error al limpiar vÃ­nculos del evento");
  }
  return viewerLinks;
}

function movementTypeForObligationEvent(eventType: string | null | undefined): MovementType | null {
  switch (eventType) {
    case "payment":
      return "obligation_payment";
    case "principal_increase":
      return "income";
    case "principal_decrease":
      return "expense";
    default:
      return null;
  }
}

function readMovementMetadataEventId(value: JsonValue | null | undefined): number | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, JsonValue>;
  const movementEventId =
    typeof raw.obligation_event_id === "number"
      ? raw.obligation_event_id
      : Number(raw.obligation_event_id ?? 0);
  return Number.isFinite(movementEventId) && movementEventId > 0 ? movementEventId : null;
}

async function attachMovementToObligationEvent(eventId: number, movementId: number) {
  if (!supabase) throw new Error("Supabase no disponible.");
  const { error } = await supabase
    .from("obligation_events")
    .update({ movement_id: movementId })
    .eq("id", eventId);
  if (error) {
    console.warn("[attachMovementToObligationEvent]", {
      eventId,
      movementId,
      message: error.message ?? "Error al vincular evento y movimiento",
    });
  }
}

async function resolveOwnerMovementIdForObligationEvent(
  input: DeleteObligationEventInput,
): Promise<number | null> {
  if (!supabase) throw new Error("Supabase no disponible.");
  if (input.movementId) return input.movementId;

  const { data: eventRow, error: eventErr } = await supabase
    .from("obligation_events")
    .select("movement_id, event_date, amount, event_type, description")
    .eq("id", input.eventId)
    .maybeSingle();
  if (eventErr) throw new Error(eventErr.message ?? "Error al cargar el evento");

  const eventMovementId = toNum((eventRow as { movement_id: NumericLike } | null)?.movement_id ?? null);
  if (eventMovementId) return eventMovementId;

  const eventDate =
    typeof (eventRow as { event_date?: string | null } | null)?.event_date === "string"
      ? (eventRow as { event_date: string }).event_date
      : input.eventDate ?? null;
  const eventAmount =
    (eventRow as { amount?: NumericLike | null } | null)?.amount != null
      ? toNum((eventRow as { amount: NumericLike }).amount)
      : input.amount ?? null;
  const eventType =
    typeof (eventRow as { event_type?: string | null } | null)?.event_type === "string"
      ? (eventRow as { event_type: string }).event_type
      : input.eventType ?? null;
  const eventDescription =
    typeof (eventRow as { description?: string | null } | null)?.description === "string"
      ? (eventRow as { description: string }).description.trim().toLowerCase()
      : "";
  if (!eventDate) return null;

  let query = supabase
    .from("movements")
    .select("id, movement_type, source_amount, destination_amount, description, metadata")
    .eq("obligation_id", input.obligationId)
    .gte("occurred_at", filterDateFrom(eventDate))
    .lte("occurred_at", filterDateTo(eventDate))
    .order("id", { ascending: false })
    .limit(25);

  const movementType = movementTypeForObligationEvent(eventType);
  if (movementType) {
    query = query.eq("movement_type", movementType);
  }

  const { data: movementRows, error: movementErr } = await query;
  if (movementErr) throw new Error(movementErr.message ?? "Error al buscar el movimiento vinculado");

  const candidates = (movementRows ?? []) as OwnerMovementLookupRow[];
  const metadataMatch = candidates.find((row) => readMovementMetadataEventId(row.metadata) === input.eventId);
  if (metadataMatch) return toNum(metadataMatch.id);

  if (eventAmount == null) return null;
  const normalizedAmount = Math.abs(eventAmount);
  const amountMatches = candidates.filter((row) => {
    const sourceAmount = Math.abs(toNum(row.source_amount));
    const destinationAmount = Math.abs(toNum(row.destination_amount));
    return sourceAmount === normalizedAmount || destinationAmount === normalizedAmount;
  });
  if (amountMatches.length === 1) return toNum(amountMatches[0].id);

  const obligationTitleNeedle = input.obligationTitle?.trim().toLowerCase() ?? "";
  const descriptiveMatches = amountMatches.filter((row) => {
    const description = row.description?.trim().toLowerCase() ?? "";
    if (!description) return false;
    return Boolean(
      (obligationTitleNeedle && description.includes(obligationTitleNeedle)) ||
      (eventDescription && description.includes(eventDescription)),
    );
  });
  if (descriptiveMatches.length === 1) return toNum(descriptiveMatches[0].id);

  return null;
}

async function markNotificationReadByEntity(
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

async function resolveViewerDeletePendingNotification(
  userId: string | null | undefined,
  eventId: number,
  responseStatus: "accepted" | "rejected",
  rejectionReason?: string | null,
) {
  if (!supabase || !userId) return;
  const nowIso = new Date().toISOString();
  const { data, error } = await supabase
    .from("notifications")
    .select("id, payload")
    .eq("user_id", userId)
    .eq("kind", "obligation_event_delete_pending")
    .eq("related_entity_type", "obligation_event")
    .eq("related_entity_id", eventId);
  if (error) {
    console.warn("[resolveViewerDeletePendingNotification]", error.message ?? error);
    return;
  }

  for (const row of (data ?? []) as { id: number; payload: JsonValue | null }[]) {
    const payload = readEventDeletePayload(row.payload);
    const updatePayload = payload
      ? eventDeletePayload({
          ...payload,
          rejectionReason:
            responseStatus === "rejected" ? rejectionReason?.trim() || null : payload.rejectionReason ?? null,
          responseStatus,
        })
      : row.payload;
    const { error: updateErr } = await supabase
      .from("notifications")
      .update({
        status: "read",
        read_at: nowIso,
        payload: updatePayload,
      })
      .eq("id", row.id);
    if (updateErr) {
      console.warn("[resolveViewerDeletePendingNotification]", updateErr.message ?? updateErr);
    }
  }
}

async function resolveOwnerDeleteRequestNotification(
  userId: string | null | undefined,
  eventId: number,
  responseStatus: "accepted" | "rejected",
  rejectionReason?: string | null,
) {
  if (!supabase || !userId) return;
  const nowIso = new Date().toISOString();
  const { data, error } = await supabase
    .from("notifications")
    .select("id, payload")
    .eq("user_id", userId)
    .eq("kind", "obligation_event_delete_request")
    .eq("related_entity_type", "obligation_event")
    .eq("related_entity_id", eventId);
  if (error) {
    console.warn("[resolveOwnerDeleteRequestNotification]", error.message ?? error);
    return;
  }

  for (const row of (data ?? []) as { id: number; payload: JsonValue | null }[]) {
    const payload = readEventDeletePayload(row.payload);
    const updatePayload = payload
      ? eventDeletePayload({
          ...payload,
          rejectionReason:
            responseStatus === "rejected" ? rejectionReason?.trim() || null : payload.rejectionReason ?? null,
          responseStatus,
        })
      : row.payload;
    const { error: updateErr } = await supabase
      .from("notifications")
      .update({
        status: "read",
        read_at: nowIso,
        payload: updatePayload,
      })
      .eq("id", row.id);
    if (updateErr) {
      console.warn("[resolveOwnerDeleteRequestNotification]", updateErr.message ?? updateErr);
    }
  }
}

async function resolveViewerEditPendingNotification(
  userId: string | null | undefined,
  eventId: number,
  responseStatus: "accepted" | "rejected",
  rejectionReason?: string | null,
) {
  if (!supabase || !userId) return;
  const nowIso = new Date().toISOString();
  const { data, error } = await supabase
    .from("notifications")
    .select("id, payload")
    .eq("user_id", userId)
    .eq("kind", "obligation_event_edit_pending")
    .eq("related_entity_type", "obligation_event")
    .eq("related_entity_id", eventId);
  if (error) {
    console.warn("[resolveViewerEditPendingNotification]", error.message ?? error);
    return;
  }

  for (const row of (data ?? []) as { id: number; payload: JsonValue | null }[]) {
    const payload = readEventEditPayload(row.payload);
    const updatePayload = payload
      ? eventEditPayload({
          ...payload,
          rejectionReason:
            responseStatus === "rejected" ? rejectionReason?.trim() || null : payload.rejectionReason ?? null,
          responseStatus,
        })
      : row.payload;
    const { error: updateErr } = await supabase
      .from("notifications")
      .update({
        status: "read",
        read_at: nowIso,
        payload: updatePayload,
      })
      .eq("id", row.id);
    if (updateErr) {
      console.warn("[resolveViewerEditPendingNotification]", updateErr.message ?? updateErr);
    }
  }
}

async function resolveOwnerEditRequestNotification(
  userId: string | null | undefined,
  eventId: number,
  responseStatus: "accepted" | "rejected",
  rejectionReason?: string | null,
) {
  if (!supabase || !userId) return;
  const nowIso = new Date().toISOString();
  const { data, error } = await supabase
    .from("notifications")
    .select("id, payload")
    .eq("user_id", userId)
    .eq("kind", "obligation_event_edit_request")
    .eq("related_entity_type", "obligation_event")
    .eq("related_entity_id", eventId);
  if (error) {
    console.warn("[resolveOwnerEditRequestNotification]", error.message ?? error);
    return;
  }

  for (const row of (data ?? []) as { id: number; payload: JsonValue | null }[]) {
    const payload = readEventEditPayload(row.payload);
    const updatePayload = payload
      ? eventEditPayload({
          ...payload,
          rejectionReason:
            responseStatus === "rejected" ? rejectionReason?.trim() || null : payload.rejectionReason ?? null,
          responseStatus,
        })
      : row.payload;
    const { error: updateErr } = await supabase
      .from("notifications")
      .update({
        status: "read",
        read_at: nowIso,
        payload: updatePayload,
      })
      .eq("id", row.id);
    if (updateErr) {
      console.warn("[resolveOwnerEditRequestNotification]", updateErr.message ?? updateErr);
    }
  }
}

type NotificationRefreshInput = {
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

async function createOrRefreshNotificationRow(row: NotificationRefreshInput) {
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
    throw new Error(findErr.message ?? "Error al comprobar la notificaciÃ³n");
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
      throw new Error(updateErr.message ?? "Error al actualizar la notificaciÃ³n");
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
    throw new Error(insertErr.message ?? "Error al crear la notificaciÃ³n");
  }
}

export function useDeleteObligationEventMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: DeleteObligationEventInput) => {
      if (!supabase) throw new Error("Supabase no disponible.");

      const ownerMovementId = await resolveOwnerMovementIdForObligationEvent(input);
      const viewerLinks = await deleteViewerLinksForEvent(input.eventId);
      const deleteRequesterPayloads: EventDeleteRequestPayload[] = [];
      if (input.ownerUserId) {
        const { data: notifRows } = await supabase
          .from("notifications")
          .select("payload")
          .eq("user_id", input.ownerUserId)
          .eq("kind", "obligation_event_delete_request")
          .eq("related_entity_type", "obligation_event")
          .eq("related_entity_id", input.eventId);
        for (const row of (notifRows ?? []) as { payload: JsonValue | null }[]) {
          const payload = readEventDeletePayload(row.payload);
          if (payload?.requestedByUserId) deleteRequesterPayloads.push(payload);
        }
      }
      const acceptedViewerIds = new Set<string>();
      const { data: shareRows, error: shareRowsError } = await supabase
        .from("obligation_shares")
        .select("invited_user_id")
        .eq("obligation_id", input.obligationId)
        .eq("status", "accepted");
      if (shareRowsError) {
        throw new Error(shareRowsError.message ?? "Error al cargar viewers de la obligaciÃ³n");
      }
      for (const row of (shareRows ?? []) as Array<{ invited_user_id: string | null }>) {
        if (typeof row.invited_user_id === "string" && row.invited_user_id.trim().length > 0) {
          acceptedViewerIds.add(row.invited_user_id);
        }
      }

      const { error } = await supabase
        .from("obligation_events")
        .delete()
        .eq("id", input.eventId);
      if (error) throw new Error(error.message ?? "Error de base de datos");
      if (ownerMovementId) {
        const { error: mvErr } = await supabase
          .from("movements")
          .delete()
          .eq("id", ownerMovementId);
        if (mvErr) throw new Error(mvErr.message ?? "Error al eliminar movimiento vinculado");
      }

      if (input.ownerUserId) {
        void resolveOwnerDeleteRequestNotification(input.ownerUserId, input.eventId, "accepted");
      }

      const requestViewerIds = new Set(
        deleteRequesterPayloads
          .map((payload) => payload.requestedByUserId)
          .filter((value): value is string => Boolean(value)),
      );
      const linkedViewerIds = new Set(
        viewerLinks
          .map((link) => link.linked_by_user_id)
          .filter((value): value is string => typeof value === "string" && value.length > 0),
      );
      const allViewerIds = new Set<string>([
        ...acceptedViewerIds,
        ...requestViewerIds,
        ...linkedViewerIds,
      ]);

      for (const viewerUserId of requestViewerIds) {
        void markNotificationReadByEntity(
          viewerUserId,
          "obligation_event_delete_pending",
          "obligation_event",
          input.eventId,
        );
        void resolveViewerDeletePendingNotification(
          viewerUserId,
          input.eventId,
          "accepted",
        );
      }

      const payload = eventDeletePayload({
        obligationId: input.obligationId,
        eventId: input.eventId,
        amount: input.amount,
        eventType: input.eventType,
        eventDate: input.eventDate,
        obligationTitle: input.obligationTitle,
      });

      const amountLabel = formatNotificationCurrency(input.amount ?? null, input.currencyCode ?? null);

      const acceptedNotifs: NotificationRefreshInput[] = [...requestViewerIds].map((viewerUserId) => ({
        user_id: viewerUserId,
        channel: "in_app",
        status: "pending",
        kind: "obligation_event_delete_accepted",
        title: "EliminaciÃ³n aprobada",
        body: `Se eliminÃ³ el evento${amountLabel}${input.obligationTitle ? ` en "${input.obligationTitle}"` : ""}.`,
        scheduled_for: new Date().toISOString(),
        related_entity_type: "obligation_event",
        related_entity_id: input.eventId,
        payload,
      }));
      if (acceptedNotifs.length > 0) {
        await Promise.all(
          acceptedNotifs.map((notification) => createOrRefreshNotificationRow(notification)),
        );
      }

      const otherViewerIds = [...allViewerIds].filter((viewerUserId) => !requestViewerIds.has(viewerUserId));
      if (otherViewerIds.length > 0) {
        await Promise.all(
          otherViewerIds.map((viewerUserId) =>
            createOrRefreshNotificationRow({
              user_id: viewerUserId,
              channel: "in_app",
              status: "pending",
              kind: "obligation_event_deleted",
              title: "Evento eliminado",
              body: `Se eliminÃ³ un evento${amountLabel}${input.obligationTitle ? ` en "${input.obligationTitle}"` : ""}.`,
              scheduled_for: new Date().toISOString(),
              related_entity_type: "obligation_event",
              related_entity_id: input.eventId,
              payload,
            }),
          ),
        );
      }
      return { deletedOwnerMovementId: ownerMovementId };
    },
    onSuccess: (data, variables) => {
      void queryClient.invalidateQueries({ queryKey: ["workspace-snapshot"] });
      void queryClient.invalidateQueries({ queryKey: ["obligation-events", variables.obligationId] });
      void queryClient.invalidateQueries({ queryKey: ["shared-obligations"] });
      void queryClient.invalidateQueries({ queryKey: ["notifications"] });
      void queryClient.invalidateQueries({ queryKey: ["obligation-event-viewer-links", variables.obligationId] });
      void queryClient.invalidateQueries({ queryKey: ["movements"] });
      if (data?.deletedOwnerMovementId) {
        void queryClient.invalidateQueries({ queryKey: ["movement", data.deletedOwnerMovementId] });
      }
      // Refresh attachment counts and lists so both the detail and list screens stay in sync
      const wsId = variables.workspaceId ?? null;
      void queryClient.invalidateQueries({ queryKey: ["entity-attachment-counts", wsId, "obligation-event"] });
      void queryClient.invalidateQueries({ queryKey: ["entity-attachments", wsId, "obligation-event", variables.eventId] });
    },
  });
}

export type CreateObligationEventDeleteRequestInput = {
  obligationId: number;
  eventId: number;
  amount: number;
  currencyCode: string;
  eventType: string;
  eventDate: string;
  ownerUserId: string;
  viewerUserId: string;
  viewerDisplayName?: string | null;
  obligationTitle?: string | null;
};

function formatNotificationCurrency(amount: number | null | undefined, currencyCode: string | null | undefined) {
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

export function useCreateObligationEventDeleteRequestMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateObligationEventDeleteRequestInput) => {
      if (!supabase) throw new Error("Supabase no disponible.");
      const client = supabase;

      const payload = eventDeletePayload({
        obligationId: input.obligationId,
        eventId: input.eventId,
        amount: input.amount,
        currencyCode: input.currencyCode,
        eventType: input.eventType,
        eventDate: input.eventDate,
        obligationTitle: input.obligationTitle,
        requestedByUserId: input.viewerUserId,
        requestedByDisplayName: input.viewerDisplayName,
      });
      const ownerName = input.viewerDisplayName?.trim() || "El visualizador";
      const now = new Date().toISOString();
      const amountLabel = formatNotificationCurrency(input.amount, input.currencyCode);

      async function createOrRefreshNotification(row: {
        user_id: string;
        channel: "in_app";
        status: "pending";
        kind: string;
        title: string;
        body: string;
        scheduled_for: string;
        related_entity_type: string;
        related_entity_id: number;
        payload: EventDeleteRequestPayload;
      }) {
        const { data: existing, error: findErr } = await client
          .from("notifications")
          .select("id")
          .eq("user_id", row.user_id)
          .eq("kind", row.kind)
          .eq("related_entity_type", row.related_entity_type)
          .eq("related_entity_id", row.related_entity_id)
          .order("id", { ascending: false });
        if (findErr) throw new Error(findErr.message ?? "Error al comprobar la notificaciÃ³n");

        if ((existing?.length ?? 0) > 0) {
          const { error: updateErr } = await client
            .from("notifications")
            .update({
              channel: row.channel,
              status: row.status,
              title: row.title,
              body: row.body,
              scheduled_for: row.scheduled_for,
              payload: row.payload,
              read_at: null,
            })
            .eq("user_id", row.user_id)
            .eq("kind", row.kind)
            .eq("related_entity_type", row.related_entity_type)
            .eq("related_entity_id", row.related_entity_id);
          if (updateErr) throw new Error(updateErr.message ?? "Error al actualizar la notificaciÃ³n");
          return;
        }

        const { error: insertErr } = await client
          .from("notifications")
          .insert(row);
        if (insertErr) throw new Error(insertErr.message ?? "Error al crear la notificaciÃ³n");
      }

      await createOrRefreshNotification({
        user_id: input.ownerUserId,
        channel: "in_app",
        status: "pending",
        kind: "obligation_event_delete_request",
        title: "Solicitud de eliminaciÃ³n",
        body: `${ownerName} solicitÃ³ eliminar un evento${amountLabel}${input.obligationTitle ? ` en "${input.obligationTitle}"` : ""}.`,
        scheduled_for: now,
        related_entity_type: "obligation_event",
        related_entity_id: input.eventId,
        payload,
      });

      await createOrRefreshNotification({
        user_id: input.viewerUserId,
        channel: "in_app",
        status: "pending",
        kind: "obligation_event_delete_pending",
        title: "Solicitud enviada",
        body: `Tu solicitud para eliminar este evento quedÃ³ pendiente${input.obligationTitle ? ` en "${input.obligationTitle}"` : ""}.`,
        scheduled_for: now,
        related_entity_type: "obligation_event",
        related_entity_id: input.eventId,
        payload,
      });
      return;

      const { error: ownerErr } = await client
        .from("notifications")
        .upsert(
          {
            user_id: input.ownerUserId,
            channel: "in_app",
            status: "pending",
            kind: "obligation_event_delete_request",
            title: "Solicitud de eliminaciÃ³n",
            body: `${ownerName} solicitÃ³ eliminar un evento${amountLabel}${input.obligationTitle ? ` en "${input.obligationTitle}"` : ""}.`,
            scheduled_for: now,
            related_entity_type: "obligation_event",
            related_entity_id: input.eventId,
            payload,
          },
          { onConflict: "user_id,related_entity_type,related_entity_id,kind" },
        );
      if (ownerErr) throw new Error(ownerErr!.message ?? "Error al crear la solicitud");

      const { error: viewerErr } = await client
        .from("notifications")
        .upsert(
          {
            user_id: input.viewerUserId,
            channel: "in_app",
            status: "pending",
            kind: "obligation_event_delete_pending",
            title: "Solicitud enviada",
            body: `Tu solicitud para eliminar este evento quedÃ³ pendiente${input.obligationTitle ? ` en "${input.obligationTitle}"` : ""}.`,
            scheduled_for: now,
            related_entity_type: "obligation_event",
            related_entity_id: input.eventId,
            payload,
          },
          { onConflict: "user_id,related_entity_type,related_entity_id,kind" },
        );
      if (viewerErr) throw new Error(viewerErr!.message ?? "Error al registrar tu solicitud");
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });
}

export type RejectObligationEventDeleteRequestInput = {
  obligationId: number;
  eventId: number;
  ownerUserId: string;
  viewerUserId: string;
  amount?: number | null;
  eventType?: string | null;
  eventDate?: string | null;
  obligationTitle?: string | null;
  rejectionReason?: string | null;
};

export function useRejectObligationEventDeleteRequestMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: RejectObligationEventDeleteRequestInput) => {
      if (!supabase) throw new Error("Supabase no disponible.");
      const now = new Date().toISOString();

      await resolveOwnerDeleteRequestNotification(
        input.ownerUserId,
        input.eventId,
        "rejected",
        input.rejectionReason,
      );
      await markNotificationReadByEntity(
        input.viewerUserId,
        "obligation_event_delete_pending",
        "obligation_event",
        input.eventId,
      );
      await resolveViewerDeletePendingNotification(
        input.viewerUserId,
        input.eventId,
        "rejected",
        input.rejectionReason,
      );

      const payload = eventDeletePayload({
        obligationId: input.obligationId,
        eventId: input.eventId,
        amount: input.amount,
        eventType: input.eventType,
        eventDate: input.eventDate,
        obligationTitle: input.obligationTitle,
        rejectionReason: input.rejectionReason,
      });

      await createOrRefreshNotificationRow({
        user_id: input.viewerUserId,
        channel: "in_app",
        status: "pending",
        kind: "obligation_event_delete_rejected",
        title: "Solicitud rechazada",
        body: `No se aprobÃ³ la eliminaciÃ³n del evento${input.rejectionReason?.trim() ? `. Motivo: ${input.rejectionReason.trim()}` : ""}.`,
        scheduled_for: now,
        related_entity_type: "obligation_event",
        related_entity_id: input.eventId,
        payload,
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });
}

export type CreateObligationEventEditRequestInput = {
  obligationId: number;
  eventId: number;
  currencyCode: string;
  eventType: string;
  ownerUserId: string;
  viewerUserId: string;
  viewerDisplayName?: string | null;
  obligationTitle?: string | null;
  currentAmount: number;
  currentEventDate: string;
  currentInstallmentNo?: number | null;
  currentDescription?: string | null;
  currentNotes?: string | null;
  proposedAmount: number;
  proposedEventDate: string;
  proposedInstallmentNo?: number | null;
  proposedDescription?: string | null;
  proposedNotes?: string | null;
};

export type AcceptObligationEventEditRequestInput = {
  obligationId: number;
  eventId: number;
  ownerUserId: string;
  viewerUserId: string;
  obligationTitle?: string | null;
  currencyCode?: string | null;
  eventType: string;
  direction?: ObligationDirection;
  currentAmount?: number | null;
  currentEventDate?: string | null;
  currentInstallmentNo?: number | null;
  currentDescription?: string | null;
  currentNotes?: string | null;
  proposedAmount: number;
  proposedEventDate: string;
  proposedInstallmentNo?: number | null;
  proposedDescription?: string | null;
  proposedNotes?: string | null;
  accountId?: number | null;
};

export type RejectObligationEventEditRequestInput = {
  obligationId: number;
  eventId: number;
  ownerUserId: string;
  viewerUserId: string;
  currencyCode?: string | null;
  obligationTitle?: string | null;
  currentAmount?: number | null;
  currentEventDate?: string | null;
  currentInstallmentNo?: number | null;
  currentDescription?: string | null;
  currentNotes?: string | null;
  proposedAmount?: number | null;
  proposedEventDate?: string | null;
  proposedInstallmentNo?: number | null;
  proposedDescription?: string | null;
  proposedNotes?: string | null;
  rejectionReason?: string | null;
};

export function useCreateObligationEventEditRequestMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateObligationEventEditRequestInput) => {
      if (!supabase) throw new Error("Supabase no disponible.");
      const now = new Date().toISOString();
      const amountLabel = formatNotificationCurrency(input.proposedAmount, input.currencyCode);
      const ownerName = input.viewerDisplayName?.trim() || "El visualizador";
      const payload = eventEditPayload({
        obligationId: input.obligationId,
        eventId: input.eventId,
        currencyCode: input.currencyCode,
        eventType: input.eventType,
        obligationTitle: input.obligationTitle,
        requestedByUserId: input.viewerUserId,
        requestedByDisplayName: input.viewerDisplayName,
        currentAmount: input.currentAmount,
        currentEventDate: input.currentEventDate,
        currentInstallmentNo: input.currentInstallmentNo,
        currentDescription: input.currentDescription,
        currentNotes: input.currentNotes,
        proposedAmount: input.proposedAmount,
        proposedEventDate: input.proposedEventDate,
        proposedInstallmentNo: input.proposedInstallmentNo,
        proposedDescription: input.proposedDescription,
        proposedNotes: input.proposedNotes,
      });

      await createOrRefreshNotificationRow({
        user_id: input.ownerUserId,
        channel: "in_app",
        status: "pending",
        kind: "obligation_event_edit_request",
        title: "Solicitud de edicion",
        body: `${ownerName} solicito editar un evento${amountLabel}${input.obligationTitle ? ` en "${input.obligationTitle}"` : ""}.`,
        scheduled_for: now,
        related_entity_type: "obligation_event",
        related_entity_id: input.eventId,
        payload,
      });

      await createOrRefreshNotificationRow({
        user_id: input.viewerUserId,
        channel: "in_app",
        status: "pending",
        kind: "obligation_event_edit_pending",
        title: "Solicitud enviada",
        body: `Tu solicitud para editar este evento quedo pendiente${input.obligationTitle ? ` en "${input.obligationTitle}"` : ""}.`,
        scheduled_for: now,
        related_entity_type: "obligation_event",
        related_entity_id: input.eventId,
        payload,
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });
}

export function useAcceptObligationEventEditRequestMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: AcceptObligationEventEditRequestInput) => {
      if (!supabase) throw new Error("Supabase no disponible.");
      const now = new Date().toISOString();
      const { data: eventRow, error: eventError } = await supabase
        .from("obligation_events")
        .select("movement_id")
        .eq("id", input.eventId)
        .maybeSingle();
      if (eventError) {
        throw new Error(eventError.message ?? "Error al cargar el evento");
      }
      if (!eventRow) {
        throw new Error("El evento ya no esta disponible.");
      }

      const ownerMovementId = toNum((eventRow as { movement_id?: NumericLike | null }).movement_id ?? null) || null;
      const ownerAccountId =
        input.accountId !== undefined ? input.accountId : await resolveMovementAccountId(ownerMovementId);
      const syncResult = await updateObligationEventAndSyncMovements({
        eventId: input.eventId,
        obligationId: input.obligationId,
        amount: input.proposedAmount,
        eventDate: input.proposedEventDate,
        installmentNo: input.proposedInstallmentNo ?? null,
        description: input.proposedDescription ?? null,
        notes: input.proposedNotes ?? null,
        movementId: ownerMovementId,
        accountId: ownerAccountId,
        createMovement: ownerMovementId != null,
        direction: input.eventType === "payment" ? input.direction : undefined,
      });

      await resolveOwnerEditRequestNotification(input.ownerUserId, input.eventId, "accepted");
      await markNotificationReadByEntity(
        input.viewerUserId,
        "obligation_event_edit_pending",
        "obligation_event",
        input.eventId,
      );
      await resolveViewerEditPendingNotification(input.viewerUserId, input.eventId, "accepted");

      const payload = eventEditPayload({
        obligationId: input.obligationId,
        eventId: input.eventId,
        currencyCode: input.currencyCode,
        eventType: input.eventType,
        obligationTitle: input.obligationTitle,
        responseStatus: "accepted",
        currentAmount: input.currentAmount,
        currentEventDate: input.currentEventDate,
        currentInstallmentNo: input.currentInstallmentNo,
        currentDescription: input.currentDescription,
        currentNotes: input.currentNotes,
        proposedAmount: input.proposedAmount,
        proposedEventDate: input.proposedEventDate,
        proposedInstallmentNo: input.proposedInstallmentNo,
        proposedDescription: input.proposedDescription,
        proposedNotes: input.proposedNotes,
      });

      await createOrRefreshNotificationRow({
        user_id: input.viewerUserId,
        channel: "in_app",
        status: "pending",
        kind: "obligation_event_edit_accepted",
        title: "Edicion aprobada",
        body: `Se aprobo la edicion del evento${input.obligationTitle ? ` en "${input.obligationTitle}"` : ""}.`,
        scheduled_for: now,
        related_entity_type: "obligation_event",
        related_entity_id: input.eventId,
        payload,
      });

      return syncResult;
    },
    onSuccess: (data, variables) => {
      const queryKeys: Array<readonly unknown[]> = [
        ["workspace-snapshot"],
        ["movements"],
        ["obligation-events", variables.obligationId],
        ["notifications"],
        ["shared-obligations"],
      ];
      if (data?.movementId) queryKeys.push(["movement", data.movementId]);
      if (data?.removedMovementId) queryKeys.push(["movement", data.removedMovementId]);
      for (const syncedViewerMovementId of data?.syncedViewerMovementIds ?? []) {
        queryKeys.push(["movement", syncedViewerMovementId]);
      }
      runBackgroundQueryRefresh(queryClient, queryKeys, {
        message: "Aprobando edicion",
        description: "Estamos sincronizando el evento y los movimientos relacionados.",
      });
    },
  });
}

export function useRejectObligationEventEditRequestMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: RejectObligationEventEditRequestInput) => {
      if (!supabase) throw new Error("Supabase no disponible.");
      const now = new Date().toISOString();

      await resolveOwnerEditRequestNotification(
        input.ownerUserId,
        input.eventId,
        "rejected",
        input.rejectionReason,
      );
      await markNotificationReadByEntity(
        input.viewerUserId,
        "obligation_event_edit_pending",
        "obligation_event",
        input.eventId,
      );
      await resolveViewerEditPendingNotification(
        input.viewerUserId,
        input.eventId,
        "rejected",
        input.rejectionReason,
      );

      const payload = eventEditPayload({
        obligationId: input.obligationId,
        eventId: input.eventId,
        currencyCode: input.currencyCode,
        obligationTitle: input.obligationTitle,
        rejectionReason: input.rejectionReason,
        responseStatus: "rejected",
        currentAmount: input.currentAmount,
        currentEventDate: input.currentEventDate,
        currentInstallmentNo: input.currentInstallmentNo,
        currentDescription: input.currentDescription,
        currentNotes: input.currentNotes,
        proposedAmount: input.proposedAmount,
        proposedEventDate: input.proposedEventDate,
        proposedInstallmentNo: input.proposedInstallmentNo,
        proposedDescription: input.proposedDescription,
        proposedNotes: input.proposedNotes,
      });

      await createOrRefreshNotificationRow({
        user_id: input.viewerUserId,
        channel: "in_app",
        status: "pending",
        kind: "obligation_event_edit_rejected",
        title: "Edicion rechazada",
        body: `No se aprobo la edicion del evento${input.rejectionReason?.trim() ? `. Motivo: ${input.rejectionReason.trim()}` : ""}.`,
        scheduled_for: now,
        related_entity_type: "obligation_event",
        related_entity_id: input.eventId,
        payload,
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });
}

// â”€â”€â”€ Subscription mutations â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export type SubscriptionFormInput = {
  name: string;
  vendorPartyId?: number | null;
  accountId?: number | null;
  categoryId?: number | null;
  amount: number;
  currencyCode: string;
  frequency: "daily" | "weekly" | "monthly" | "quarterly" | "yearly" | "custom";
  intervalCount: number;
  dayOfMonth?: number | null;
  dayOfWeek?: number | null;
  startDate: string;
  /** PrÃ³ximo vencimiento (YYYY-MM-DD). */
  nextDueDate: string;
  endDate?: string | null;
  remindDaysBefore: number;
  autoCreateMovement: boolean;
  description?: string | null;
  notes?: string | null;
};

export type RecurringIncomeFormInput = {
  name: string;
  payerPartyId?: number | null;
  accountId?: number | null;
  categoryId?: number | null;
  amount: number;
  currencyCode: string;
  frequency: RecurringIncomeFrequency;
  intervalCount: number;
  dayOfMonth?: number | null;
  dayOfWeek?: number | null;
  startDate: string;
  nextExpectedDate: string;
  endDate?: string | null;
  remindDaysBefore: number;
  description?: string | null;
  notes?: string | null;
};

export function useCreateRecurringIncomeMutation(workspaceId: number | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: RecurringIncomeFormInput) => {
      if (!supabase || !workspaceId) throw new Error("Workspace no disponible.");
      const { data: authData, error: authErr } = await supabase.auth.getUser();
      if (authErr) throw new Error(authErr.message ?? "No se pudo verificar la sesiÃ³n");
      const uid = authData.user?.id;
      if (!uid) throw new Error("No hay sesiÃ³n");

      const { data, error } = await supabase
        .from("recurring_income")
        .insert({
          workspace_id: workspaceId,
          created_by_user_id: uid,
          name: input.name,
          payer_party_id: input.payerPartyId ?? null,
          account_id: input.accountId ?? null,
          category_id: input.categoryId ?? null,
          amount: input.amount,
          currency_code: input.currencyCode.trim().toUpperCase(),
          frequency: input.frequency,
          interval_count: input.intervalCount,
          day_of_month: input.dayOfMonth ?? null,
          day_of_week: input.dayOfWeek ?? null,
          start_date: input.startDate,
          next_expected_date: input.nextExpectedDate,
          end_date: input.endDate ?? null,
          remind_days_before: input.remindDaysBefore,
          description: input.description ?? null,
          notes: input.notes ?? null,
          status: "active",
        })
        .select("id")
        .single();
      if (error) throw new Error(error.message ?? "Error de base de datos");
      return data as { id: number };
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["workspace-snapshot"] });
    },
  });
}

export function useUpdateRecurringIncomeMutation(workspaceId: number | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, input }: { id: number; input: Partial<RecurringIncomeFormInput> & { status?: RecurringIncomeStatus } }) => {
      if (!supabase || !workspaceId) throw new Error("Workspace no disponible.");
      const payload: Record<string, unknown> = {};
      if (input.name !== undefined) payload.name = input.name;
      if (input.payerPartyId !== undefined) payload.payer_party_id = input.payerPartyId;
      if (input.accountId !== undefined) payload.account_id = input.accountId;
      if (input.categoryId !== undefined) payload.category_id = input.categoryId;
      if (input.amount !== undefined) payload.amount = input.amount;
      if (input.currencyCode !== undefined) payload.currency_code = input.currencyCode.trim().toUpperCase();
      if (input.frequency !== undefined) payload.frequency = input.frequency;
      if (input.intervalCount !== undefined) payload.interval_count = input.intervalCount;
      if (input.dayOfMonth !== undefined) payload.day_of_month = input.dayOfMonth;
      if (input.dayOfWeek !== undefined) payload.day_of_week = input.dayOfWeek;
      if (input.startDate !== undefined) payload.start_date = input.startDate;
      if (input.nextExpectedDate !== undefined) payload.next_expected_date = input.nextExpectedDate;
      if (input.endDate !== undefined) payload.end_date = input.endDate;
      if (input.remindDaysBefore !== undefined) payload.remind_days_before = input.remindDaysBefore;
      if (input.description !== undefined) payload.description = input.description;
      if (input.notes !== undefined) payload.notes = input.notes;
      if (input.status !== undefined) payload.status = input.status;
      const { error } = await supabase
        .from("recurring_income")
        .update(payload)
        .eq("id", id)
        .eq("workspace_id", workspaceId);
      if (error) throw new Error(error.message ?? "Error de base de datos");
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["workspace-snapshot"] });
    },
  });
}

export function useDeleteRecurringIncomeMutation(workspaceId: number | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      if (!supabase || !workspaceId) throw new Error("Workspace no disponible.");
      const { error: occErr } = await supabase
        .from("recurring_income_occurrences")
        .delete()
        .eq("recurring_income_id", id);
      if (occErr) {
        const msg = occErr.message ?? "";
        const ignorable =
          /recurring_income_occurrences/i.test(msg) ||
          /does not exist/i.test(msg) ||
          /schema cache/i.test(msg) ||
          /could not find/i.test(msg);
        if (!ignorable) throw new Error(msg || "Error al limpiar ocurrencias");
      }

      const { error } = await supabase
        .from("recurring_income")
        .delete()
        .eq("id", id)
        .eq("workspace_id", workspaceId);
      if (error) throw new Error(error.message ?? "Error de base de datos");
    },
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ["workspace-snapshot"] });
      const previousEntries = queryClient.getQueriesData<WorkspaceSnapshot>({ queryKey: ["workspace-snapshot"] });
      queryClient.setQueriesData<WorkspaceSnapshot>({ queryKey: ["workspace-snapshot"] }, (old) => {
        if (!old) return old;
        return { ...old, recurringIncome: old.recurringIncome.filter((item) => item.id !== id) };
      });
      return { previousEntries };
    },
    onError: (_err, _id, context) => {
      for (const [key, value] of (context?.previousEntries ?? [])) {
        queryClient.setQueryData(key, value);
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["workspace-snapshot"] });
    },
  });
}

export function useConfirmRecurringIncomeArrivalMutation(workspaceId: number | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      recurringIncomeId: number;
      expectedDate: string;
      actualDate: string;
      amount: number;
      currencyCode: string;
      frequency: RecurringIncomeFrequency;
      intervalCount: number;
      notes?: string | null;
      movementId?: number | null;
    }) => {
      if (!supabase || !workspaceId) throw new Error("Workspace no disponible.");
      const actual = input.actualDate.trim();
      const expected = input.expectedDate.trim();
      const nextExpectedDate = computeNextRecurringDate(expected, input.frequency, input.intervalCount);
      const status = actual <= expected ? "on_time" : "late";

      const { error: occError } = await supabase
        .from("recurring_income_occurrences")
        .insert({
          workspace_id: workspaceId,
          recurring_income_id: input.recurringIncomeId,
          expected_date: expected,
          actual_date: actual,
          amount: input.amount,
          currency_code: input.currencyCode,
          movement_id: input.movementId ?? null,
          status,
          notes: input.notes ?? null,
        });
      if (occError) throw new Error(occError.message ?? "Error al registrar llegada");

      const { error: updateError } = await supabase
        .from("recurring_income")
        .update({ next_expected_date: nextExpectedDate })
        .eq("id", input.recurringIncomeId)
        .eq("workspace_id", workspaceId);
      if (updateError) throw new Error(updateError.message ?? "Error al actualizar proxima llegada");

      return { nextExpectedDate };
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["workspace-snapshot"] });
    },
  });
}

export function useCreateSubscriptionMutation(workspaceId: number | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: SubscriptionFormInput) => {
      if (!supabase || !workspaceId) throw new Error("Workspace no disponible.");
      const { data: authData, error: authErr } = await supabase.auth.getUser();
      if (authErr) throw new Error(authErr.message ?? "No se pudo verificar la sesiÃ³n");
      const uid = authData.user?.id;
      if (!uid) throw new Error("No hay sesiÃ³n");

      const { data, error } = await supabase
        .from("subscriptions")
        .insert({
          workspace_id: workspaceId,
          created_by_user_id: uid,
          name: input.name,
          vendor_party_id: input.vendorPartyId ?? null,
          account_id: input.accountId ?? null,
          category_id: input.categoryId ?? null,
          amount: input.amount,
          currency_code: input.currencyCode.trim().toUpperCase(),
          frequency: input.frequency,
          interval_count: input.intervalCount,
          day_of_month: input.dayOfMonth ?? null,
          day_of_week: input.dayOfWeek ?? null,
          start_date: input.startDate,
          next_due_date: input.nextDueDate,
          end_date: input.endDate ?? null,
          remind_days_before: input.remindDaysBefore,
          auto_create_movement: input.autoCreateMovement,
          description: input.description ?? null,
          notes: input.notes ?? null,
          status: "active",
        })
        .select("id")
        .single();
      if (error) throw new Error(error.message ?? "Error de base de datos");
      return data as { id: number };
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["workspace-snapshot"] });
    },
  });
}

export function useUpdateSubscriptionMutation(workspaceId: number | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, input }: { id: number; input: Partial<SubscriptionFormInput> & { status?: string } }) => {
      if (!supabase || !workspaceId) throw new Error("Workspace no disponible.");
      const payload: Record<string, unknown> = {};
      if (input.name !== undefined) payload.name = input.name;
      if (input.vendorPartyId !== undefined) payload.vendor_party_id = input.vendorPartyId;
      if (input.accountId !== undefined) payload.account_id = input.accountId;
      if (input.categoryId !== undefined) payload.category_id = input.categoryId;
      if (input.amount !== undefined) payload.amount = input.amount;
      if (input.currencyCode !== undefined) payload.currency_code = input.currencyCode.trim().toUpperCase();
      if (input.frequency !== undefined) payload.frequency = input.frequency;
      if (input.intervalCount !== undefined) payload.interval_count = input.intervalCount;
      if (input.dayOfMonth !== undefined) payload.day_of_month = input.dayOfMonth;
      if (input.dayOfWeek !== undefined) payload.day_of_week = input.dayOfWeek;
      if (input.startDate !== undefined) payload.start_date = input.startDate;
      if (input.nextDueDate !== undefined) payload.next_due_date = input.nextDueDate;
      if (input.endDate !== undefined) payload.end_date = input.endDate;
      if (input.remindDaysBefore !== undefined) payload.remind_days_before = input.remindDaysBefore;
      if (input.autoCreateMovement !== undefined) payload.auto_create_movement = input.autoCreateMovement;
      if (input.description !== undefined) payload.description = input.description;
      if (input.notes !== undefined) payload.notes = input.notes;
      if (input.status !== undefined) payload.status = input.status;
      const { error } = await supabase
        .from("subscriptions")
        .update(payload)
        .eq("id", id)
        .eq("workspace_id", workspaceId);
      if (error) throw new Error(error.message ?? "Error de base de datos");
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["workspace-snapshot"] });
    },
  });
}

export function useDeleteSubscriptionMutation(workspaceId: number | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      if (!supabase || !workspaceId) throw new Error("Workspace no disponible.");

      const { count, error: countErr } = await supabase
        .from("movements")
        .select("*", { count: "exact", head: true })
        .eq("workspace_id", workspaceId)
        .eq("subscription_id", id);
      if (countErr) throw new Error(countErr.message ?? "Error al comprobar movimientos");
      if ((count ?? 0) > 0) {
        throw new Error("No se puede eliminar: hay movimientos vinculados a esta suscripciÃ³n.");
      }

      const { error: occErr } = await supabase
        .from("subscription_occurrences")
        .delete()
        .eq("subscription_id", id);
      if (occErr) {
        const msg = occErr.message ?? "";
        const ignorable =
          /subscription_occurrences/i.test(msg) ||
          /does not exist/i.test(msg) ||
          /schema cache/i.test(msg) ||
          /could not find/i.test(msg);
        if (!ignorable) throw new Error(msg || "Error al limpiar ocurrencias");
      }

      const { error } = await supabase
        .from("subscriptions")
        .delete()
        .eq("id", id)
        .eq("workspace_id", workspaceId);
      if (error) throw new Error(error.message ?? "Error de base de datos");
    },
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ["workspace-snapshot"] });
      const previousEntries = queryClient.getQueriesData<WorkspaceSnapshot>({ queryKey: ["workspace-snapshot"] });
      queryClient.setQueriesData<WorkspaceSnapshot>({ queryKey: ["workspace-snapshot"] }, (old) => {
        if (!old) return old;
        return { ...old, subscriptions: old.subscriptions.filter((s) => s.id !== id) };
      });
      return { previousEntries };
    },
    onError: (_err, _id, context) => {
      for (const [key, value] of (context?.previousEntries ?? [])) {
        queryClient.setQueryData(key, value);
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["workspace-snapshot"] });
    },
  });
}

// â”€â”€â”€ Category mutations â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function invalidateCategoryRelatedQueries(queryClient: QueryClient, workspaceId: number | null) {
  // Mark snapshot stale but don't trigger an immediate expensive refetch â€”
  // category name changes don't affect balances and will be picked up next navigation.
  void queryClient.invalidateQueries({ queryKey: ["workspace-snapshot"], refetchType: "none" });
  if (workspaceId != null) {
    void queryClient.invalidateQueries({ queryKey: ["categories-overview", workspaceId] });
  }
}

export type CategoryFormInput = {
  name: string;
  kind: "expense" | "income" | "both";
  parentId?: number | null;
  color?: string | null;
  icon?: string | null;
  sortOrder?: number;
  isActive?: boolean;
};

export function useCreateCategoryMutation(workspaceId: number | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: CategoryFormInput) => {
      if (!supabase || !workspaceId) throw new Error("Workspace no disponible.");
      const { data: authData, error: authErr } = await supabase.auth.getUser();
      if (authErr) throw new Error(authErr.message ?? "No se pudo verificar la sesiÃ³n");
      const uid = authData.user?.id;
      if (!uid) throw new Error("No hay sesiÃ³n");

      const { data: maxRow, error: maxErr } = await supabase
        .from("categories")
        .select("sort_order")
        .eq("workspace_id", workspaceId)
        .order("sort_order", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (maxErr) throw new Error(maxErr.message ?? "Error al leer orden de categorÃ­as");
      const maxSort = maxRow?.sort_order != null ? toNum(maxRow.sort_order as NumericLike) : 0;

      const clientSort = input.sortOrder;
      const sortOrder =
        clientSort !== undefined && Number.isFinite(clientSort) && clientSort > 0 ? Math.floor(clientSort) : maxSort + 10;

      const colorNorm = input.color?.trim() ? input.color.trim() : null;
      const iconNorm = input.icon?.trim() ? input.icon.trim() : null;

      const { data, error } = await supabase
        .from("categories")
        .insert({
          workspace_id: workspaceId,
          created_by_user_id: uid,
          name: input.name.trim(),
          kind: input.kind,
          parent_id: input.parentId ?? null,
          color: colorNorm,
          icon: iconNorm,
          is_active: input.isActive !== false,
          is_system: false,
          sort_order: sortOrder,
        })
        .select("id")
        .single();
      if (error) throw new Error(error.message ?? "Error de base de datos");
      return data as { id: number };
    },
    onSuccess: () => {
      invalidateCategoryRelatedQueries(queryClient, workspaceId);
    },
  });
}

export function useUpdateCategoryMutation(workspaceId: number | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, input }: { id: number; input: Partial<CategoryFormInput> }) => {
      if (!supabase || !workspaceId) throw new Error("Workspace no disponible.");
      if (input.parentId !== undefined && input.parentId === id) {
        throw new Error("La categorÃ­a no puede ser su propia categorÃ­a padre.");
      }

      const { data: authData, error: authErr } = await supabase.auth.getUser();
      if (authErr) throw new Error(authErr.message ?? "No se pudo verificar la sesiÃ³n");
      const uid = authData.user?.id ?? null;

      const payload: Record<string, unknown> = { updated_by_user_id: uid };
      if (input.name !== undefined) payload.name = input.name.trim();
      if (input.kind !== undefined) payload.kind = input.kind;
      if (input.parentId !== undefined) payload.parent_id = input.parentId;
      if (input.color !== undefined) payload.color = input.color?.trim() ? input.color.trim() : null;
      if (input.icon !== undefined) payload.icon = input.icon?.trim() ? input.icon.trim() : null;
      if (input.sortOrder !== undefined) payload.sort_order = input.sortOrder;
      if (input.isActive !== undefined) payload.is_active = input.isActive;

      const { error } = await supabase
        .from("categories")
        .update(payload)
        .eq("id", id)
        .eq("workspace_id", workspaceId);
      if (error) throw new Error(error.message ?? "Error de base de datos");
    },
    onSuccess: () => {
      invalidateCategoryRelatedQueries(queryClient, workspaceId);
    },
  });
}

/** Solo activar / desactivar (toggle rÃ¡pido en lista). */
export function useToggleCategoryMutation(workspaceId: number | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, isActive }: { id: number; isActive: boolean }) => {
      if (!supabase || !workspaceId) throw new Error("Workspace no disponible.");
      const { data: authData, error: authErr } = await supabase.auth.getUser();
      if (authErr) throw new Error(authErr.message ?? "No se pudo verificar la sesiÃ³n");
      const uid = authData.user?.id ?? null;
      const { error } = await supabase
        .from("categories")
        .update({ is_active: isActive, updated_by_user_id: uid })
        .eq("id", id)
        .eq("workspace_id", workspaceId);
      if (error) throw new Error(error.message ?? "Error de base de datos");
    },
    onSuccess: () => {
      invalidateCategoryRelatedQueries(queryClient, workspaceId);
    },
  });
}

export function useDeleteCategoryMutation(workspaceId: number | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      if (!supabase || !workspaceId) throw new Error("Workspace no disponible.");

      const { data: catRow, error: catErr } = await supabase
        .from("categories")
        .select("id, is_system")
        .eq("id", id)
        .eq("workspace_id", workspaceId)
        .maybeSingle();
      if (catErr) throw new Error(catErr.message ?? "Error al cargar categorÃ­a");
      if (!catRow) throw new Error("CategorÃ­a no encontrada.");
      if ((catRow as { is_system?: boolean }).is_system) {
        throw new Error("No se puede eliminar una categorÃ­a base del sistema.");
      }

      const { count: movCount, error: movErr } = await supabase
        .from("movements")
        .select("*", { count: "exact", head: true })
        .eq("workspace_id", workspaceId)
        .eq("category_id", id);
      if (movErr) throw new Error(movErr.message ?? "Error al comprobar movimientos");
      if ((movCount ?? 0) > 0) {
        throw new Error("No se puede eliminar: hay movimientos que usan esta categorÃ­a.");
      }

      const { count: subCount, error: subErr } = await supabase
        .from("subscriptions")
        .select("*", { count: "exact", head: true })
        .eq("workspace_id", workspaceId)
        .eq("category_id", id);
      if (subErr) throw new Error(subErr.message ?? "Error al comprobar suscripciones");
      if ((subCount ?? 0) > 0) {
        throw new Error("No se puede eliminar: hay suscripciones que usan esta categorÃ­a.");
      }

      const { count: childCount, error: childErr } = await supabase
        .from("categories")
        .select("*", { count: "exact", head: true })
        .eq("workspace_id", workspaceId)
        .eq("parent_id", id);
      if (childErr) throw new Error(childErr.message ?? "Error al comprobar subcategorÃ­as");
      if ((childCount ?? 0) > 0) {
        throw new Error("No se puede eliminar: existen subcategorÃ­as. ReasÃ­gnalas o elimÃ­nalas primero.");
      }

      const { error } = await supabase.from("categories").delete().eq("id", id).eq("workspace_id", workspaceId);
      if (error) throw new Error(error.message ?? "Error de base de datos");
    },
    onSuccess: () => {
      invalidateCategoryRelatedQueries(queryClient, workspaceId);
    },
  });
}

// â”€â”€â”€ Counterparty (contact) mutations â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export type CounterpartyFormInput = {
  name: string;
  type: "person" | "company" | "merchant" | "service" | "bank" | "other";
  phone?: string | null;
  email?: string | null;
  documentNumber?: string | null;
  notes?: string | null;
};

export function useCreateCounterpartyMutation(workspaceId: number | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: CounterpartyFormInput) => {
      if (!supabase || !workspaceId) throw new Error("Workspace no disponible.");
      const { data, error } = await supabase
        .from("counterparties")
        .insert({
          workspace_id: workspaceId,
          name: input.name,
          type: input.type,
          phone: input.phone ?? null,
          email: input.email ?? null,
          document_number: input.documentNumber ?? null,
          notes: input.notes ?? null,
          is_archived: false,
        })
        .select("id")
        .single();
      if (error) throw new Error(error.message ?? "Error de base de datos");
      return data as { id: number };
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["workspace-snapshot"], refetchType: "none" });
      void queryClient.invalidateQueries({ queryKey: ["counterparties"] });
    },
  });
}

export function useUpdateCounterpartyMutation(workspaceId: number | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, input }: { id: number; input: Partial<CounterpartyFormInput> & { isArchived?: boolean } }) => {
      if (!supabase || !workspaceId) throw new Error("Workspace no disponible.");
      const payload: Record<string, unknown> = {};
      if (input.name !== undefined) payload.name = input.name;
      if (input.type !== undefined) payload.type = input.type;
      if (input.phone !== undefined) payload.phone = input.phone;
      if (input.email !== undefined) payload.email = input.email;
      if (input.documentNumber !== undefined) payload.document_number = input.documentNumber;
      if (input.notes !== undefined) payload.notes = input.notes;
      if (input.isArchived !== undefined) payload.is_archived = input.isArchived;
      const { error } = await supabase
        .from("counterparties")
        .update(payload)
        .eq("id", id)
        .eq("workspace_id", workspaceId);
      if (error) throw new Error(error.message ?? "Error de base de datos");
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["workspace-snapshot"], refetchType: "none" });
      void queryClient.invalidateQueries({ queryKey: ["counterparties"] });
    },
  });
}

export function useDeleteCounterpartyMutation(workspaceId: number | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      if (!supabase || !workspaceId) throw new Error("Workspace no disponible.");

      const [{ count: movementCount, error: movementError }, { count: obligationCount, error: obligationError }] =
        await Promise.all([
          supabase
            .from("movements")
            .select("id", { count: "exact", head: true })
            .eq("workspace_id", workspaceId)
            .eq("counterparty_id", id),
          supabase
            .from("obligations")
            .select("id", { count: "exact", head: true })
            .eq("workspace_id", workspaceId)
            .eq("counterparty_id", id),
        ]);

      if (movementError) throw new Error(movementError.message ?? "Error al validar movimientos del contacto");
      if (obligationError) throw new Error(obligationError.message ?? "Error al validar obligaciones del contacto");

      if ((movementCount ?? 0) > 0 || (obligationCount ?? 0) > 0) {
        throw new Error("No puedes eliminar este contacto porque tiene movimientos o crÃ©ditos/deudas asociados. ArchÃ­valo en su lugar.");
      }

      const { error } = await supabase
        .from("counterparties")
        .delete()
        .eq("id", id)
        .eq("workspace_id", workspaceId);
      if (error) throw new Error(error.message ?? "Error de base de datos");
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["workspace-snapshot"], refetchType: "none" });
      void queryClient.invalidateQueries({ queryKey: ["counterparties"] });
    },
  });
}

// â”€â”€â”€ Notification queries â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export function useNotificationsQuery(userId: string | null) {
  return useQuery({
    queryKey: ["notifications", userId],
    queryFn: async () => {
      if (!supabase || !userId) return [];
      const { data, error } = await supabase
        .from("notifications")
        .select("id, title, body, status, scheduled_for, kind, channel, read_at, related_entity_type, related_entity_id, payload")
        .eq("user_id", userId)
        .order("scheduled_for", { ascending: false })
        .limit(100);
      if (error) throw new Error(error.message ?? "Error de base de datos");
      return (data ?? []).map((row: any) => ({
        id: row.id,
        title: row.title,
        body: row.body,
        status: row.status,
        scheduledFor: row.scheduled_for,
        kind: row.kind,
        channel: row.channel,
        readAt: row.read_at,
        relatedEntityType: row.related_entity_type,
        relatedEntityId: row.related_entity_id,
        payload: (row.payload as JsonValue | null) ?? null,
      }));
    },
    enabled: Boolean(userId),
    staleTime: 5_000,
    refetchOnMount: "always",
    refetchOnReconnect: true,
    refetchOnWindowFocus: true,
    refetchInterval: userId ? 10_000 : false,
  });
}

export function useMarkNotificationReadMutation(userId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (notificationId: number) => {
      if (!supabase) throw new Error("Supabase no estÃ¡ configurado.");
      const { error } = await supabase
        .from("notifications")
        .update({ status: "read", read_at: new Date().toISOString() })
        .eq("id", notificationId);
      if (error) throw new Error(error.message ?? "Error de base de datos");
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["notifications", userId] });
    },
  });
}

export function useMarkAllNotificationsReadMutation(userId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      if (!supabase || !userId) throw new Error("Usuario no disponible.");
      const { error } = await supabase
        .from("notifications")
        .update({ status: "read", read_at: new Date().toISOString() })
        .eq("user_id", userId)
        .neq("status", "read");
      if (error) throw new Error(error.message ?? "Error de base de datos");
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["notifications", userId] });
    },
  });
}

export function useMarkNotificationUnreadMutation(userId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (notificationId: number) => {
      if (!supabase) throw new Error("Supabase no estÃ¡ configurado.");
      const { error } = await supabase
        .from("notifications")
        .update({ status: "sent", read_at: null })
        .eq("id", notificationId);
      if (error) throw new Error(error.message ?? "Error de base de datos");
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["notifications", userId] });
    },
  });
}

export function useMarkAllNotificationsUnreadMutation(userId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      if (!supabase || !userId) throw new Error("Usuario no disponible.");
      const { error } = await supabase
        .from("notifications")
        .update({ status: "sent", read_at: null })
        .eq("user_id", userId)
        .eq("status", "read");
      if (error) throw new Error(error.message ?? "Error de base de datos");
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["notifications", userId] });
    },
  });
}

export function useMarkNotificationsReadMutation(userId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (notificationIds: number[]) => {
      if (!supabase) throw new Error("Supabase no estÃ¡ configurado.");
      if (!notificationIds.length) return;
      const { error } = await supabase
        .from("notifications")
        .update({ status: "read", read_at: new Date().toISOString() })
        .in("id", notificationIds);
      if (error) throw new Error(error.message ?? "Error de base de datos");
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["notifications", userId] });
    },
  });
}

export function useMarkNotificationsUnreadMutation(userId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (notificationIds: number[]) => {
      if (!supabase) throw new Error("Supabase no estÃ¡ configurado.");
      if (!notificationIds.length) return;
      const { error } = await supabase
        .from("notifications")
        .update({ status: "sent", read_at: null })
        .in("id", notificationIds);
      if (error) throw new Error(error.message ?? "Error de base de datos");
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["notifications", userId] });
    },
  });
}

// â”€â”€â”€ Edge Function helper â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

async function invokeEdgeFunction<T>(name: string, body: Record<string, unknown>): Promise<T> {
  if (!supabase) throw new Error("Supabase no estÃ¡ configurado.");
  let accessToken: string | null = null;
  let activeSession: Awaited<ReturnType<typeof supabase.auth.getSession>>["data"]["session"] | null = null;
  const configuredProjectRef = extractSupabaseProjectRef(supabaseUrl);
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) {
    logEdgeFunctionDebug(name, {
      stage: "get-session-error",
      error: sessionError.message ?? String(sessionError),
    });
    throw new Error(sessionError.message ?? "No se pudo validar tu sesiÃ³n.");
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
      throw new Error(refreshError.message ?? "Tu sesiÃ³n expirÃ³. Vuelve a iniciar sesiÃ³n.");
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
      throw new Error(refreshError.message ?? "Tu sesiÃ³n expirÃ³. Vuelve a iniciar sesiÃ³n.");
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
    throw new Error("Tu sesiÃ³n expirÃ³. Vuelve a iniciar sesiÃ³n.");
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
      "La sesiÃ³n guardada pertenece a otro proyecto de Supabase. Cierra sesiÃ³n e ingresa otra vez.",
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
      throw new Error(refreshError.message ?? authError?.message ?? "Tu sesiÃ³n expirÃ³. Vuelve a iniciar sesiÃ³n.");
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
        "La sesiÃ³n guardada pertenece a otro proyecto de Supabase. Cierra sesiÃ³n e ingresa otra vez.",
      );
    }

    ({ authData, authError } = await validateCurrentAuth("validate-user-after-refresh"));
    if (authError || !authData.user) {
      if ((authError?.message ?? "").toLowerCase().includes("invalid jwt")) {
        await clearLocalSessionSilently();
      }
      throw new Error(authError?.message ?? "Tu sesiÃ³n expirÃ³. Vuelve a iniciar sesiÃ³n.");
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
  const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timeoutId = controller ? setTimeout(() => controller.abort(), 15_000) : null;

  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(body),
      signal: controller?.signal,
    });
  } catch (error) {
    if (timeoutId) clearTimeout(timeoutId);
    const message =
      error instanceof Error && error.name === "AbortError"
        ? "La solicitud tardÃ³ demasiado. Intenta de nuevo."
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

  if (!response.ok) {
    const message = await readEdgeFunctionErrorMessage(name, undefined, response);
    const shouldRetryViaClient =
      response.status === 401 &&
      message.toLowerCase().includes("invalid jwt");

    if (shouldRetryViaClient) {
      logEdgeFunctionDebug(name, {
        stage: "invoke-error-retrying-via-client",
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

// â”€â”€â”€ Workspace creation â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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

// â”€â”€â”€ Workspace invitation â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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
        throw new Error(response.error ?? "No se pudo enviar la invitaciÃ³n.");
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

// â”€â”€â”€ Obligation active share (pending / accepted) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function mapObligationShareRow(r: Record<string, unknown>): ObligationShareSummary {
  return {
    id: Number(r.id),
    workspaceId: Number(r.workspace_id),
    obligationId: Number(r.obligation_id),
    ownerUserId: String(r.owner_user_id ?? ""),
    invitedByUserId: String(r.invited_by_user_id ?? ""),
    invitedUserId: String(r.invited_user_id ?? ""),
    ownerDisplayName: (r.owner_display_name as string) ?? null,
    invitedDisplayName: (r.invited_display_name as string) ?? null,
    invitedEmail: String(r.invited_email ?? ""),
    status: r.status as ObligationShareSummary["status"],
    token: String(r.token ?? ""),
    message: (r.message as string) ?? null,
    acceptedAt: (r.accepted_at as string) ?? null,
    respondedAt: (r.responded_at as string) ?? null,
    lastSentAt: (r.last_sent_at as string) ?? null,
    createdAt: String(r.created_at ?? ""),
    updatedAt: String(r.updated_at ?? ""),
  };
}

export function useObligationActiveShareQuery(
  workspaceId: number | null,
  obligationId: number | null,
) {
  return useQuery({
    queryKey: ["obligation-active-share", workspaceId, obligationId],
    enabled: Boolean(supabase && workspaceId && obligationId),
    queryFn: async (): Promise<ObligationShareSummary | null> => {
      if (!supabase || !workspaceId || !obligationId) return null;
      const { data, error } = await supabase
        .from("obligation_shares")
        .select(
          "id, workspace_id, obligation_id, owner_user_id, invited_by_user_id, invited_user_id, owner_display_name, invited_display_name, invited_email, status, token, message, accepted_at, responded_at, last_sent_at, created_at, updated_at",
        )
        .eq("workspace_id", workspaceId)
        .eq("obligation_id", obligationId)
        .in("status", ["pending", "accepted"])
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw new Error(error.message ?? "Error al cargar comparticiÃ³n");
      if (!data) return null;
      return mapObligationShareRow(data as Record<string, unknown>);
    },
  });
}

/** Todas las filas pending/accepted del workspace (p. ej. lista de tarjetas + badges). */
export function useObligationSharesQuery(workspaceId: number | null | undefined) {
  return useQuery({
    queryKey: ["obligation-shares", workspaceId ?? null],
    enabled: Boolean(supabase && workspaceId),
    placeholderData: (previousData) => previousData,
    queryFn: async (): Promise<ObligationShareSummary[]> => {
      if (!supabase || !workspaceId) return [];
      const { data, error } = await supabase
        .from("obligation_shares")
        .select(
          "id, workspace_id, obligation_id, owner_user_id, invited_by_user_id, invited_user_id, owner_display_name, invited_display_name, invited_email, status, token, message, accepted_at, responded_at, last_sent_at, created_at, updated_at",
        )
        .eq("workspace_id", workspaceId)
        .in("status", ["pending", "accepted"])
        .order("updated_at", { ascending: false });
      if (error) throw new Error(error.message ?? "Error al cargar comparticiones");
      return (data ?? []).map((row) => mapObligationShareRow(row as Record<string, unknown>));
    },
  });
}

// â”€â”€â”€ Obligaciones compartidas contigo (edge list-shared-obligations) â”€â”€â”€â”€â”€â”€â”€â”€â”€

function copyIfMissing(target: Record<string, unknown>, snake: string, camel: string) {
  if (target[snake] === undefined && target[camel] !== undefined) target[snake] = target[camel];
}

/** Normaliza fila share snake_case si la edge devolviÃ³ camelCase. */
function obligationShareRecordToSnake(input: Record<string, unknown>): Record<string, unknown> {
  const o = { ...input };
  copyIfMissing(o, "workspace_id", "workspaceId");
  copyIfMissing(o, "obligation_id", "obligationId");
  copyIfMissing(o, "owner_user_id", "ownerUserId");
  copyIfMissing(o, "invited_by_user_id", "invitedByUserId");
  copyIfMissing(o, "invited_user_id", "invitedUserId");
  copyIfMissing(o, "owner_display_name", "ownerDisplayName");
  copyIfMissing(o, "invited_display_name", "invitedDisplayName");
  copyIfMissing(o, "invited_email", "invitedEmail");
  copyIfMissing(o, "accepted_at", "acceptedAt");
  copyIfMissing(o, "responded_at", "respondedAt");
  copyIfMissing(o, "last_sent_at", "lastSentAt");
  copyIfMissing(o, "created_at", "createdAt");
  copyIfMissing(o, "updated_at", "updatedAt");
  return o;
}

function obligationRowFromUnknown(o: Record<string, unknown>): ObligationSummaryRow | null {
  const id = Number(o.id);
  if (!Number.isFinite(id)) return null;
  copyIfMissing(o, "workspace_id", "workspaceId");
  copyIfMissing(o, "origin_type", "originType");
  copyIfMissing(o, "counterparty_id", "counterpartyId");
  copyIfMissing(o, "settlement_account_id", "settlementAccountId");
  copyIfMissing(o, "currency_code", "currencyCode");
  copyIfMissing(o, "principal_initial_amount", "principalInitialAmount");
  copyIfMissing(o, "principal_increase_total", "principalIncreaseTotal");
  copyIfMissing(o, "principal_decrease_total", "principalDecreaseTotal");
  copyIfMissing(o, "principal_current_amount", "principalCurrentAmount");
  copyIfMissing(o, "interest_total", "interestTotal");
  copyIfMissing(o, "fee_total", "feeTotal");
  copyIfMissing(o, "adjustment_total", "adjustmentTotal");
  copyIfMissing(o, "discount_total", "discountTotal");
  copyIfMissing(o, "writeoff_total", "writeoffTotal");
  copyIfMissing(o, "payment_total", "paymentTotal");
  copyIfMissing(o, "pending_amount", "pendingAmount");
  copyIfMissing(o, "progress_percent", "progressPercent");
  copyIfMissing(o, "start_date", "startDate");
  copyIfMissing(o, "due_date", "dueDate");
  copyIfMissing(o, "installment_amount", "installmentAmount");
  copyIfMissing(o, "installment_count", "installmentCount");
  copyIfMissing(o, "interest_rate", "interestRate");
  copyIfMissing(o, "payment_count", "paymentCount");
  copyIfMissing(o, "last_payment_date", "lastPaymentDate");
  copyIfMissing(o, "last_event_date", "lastEventDate");
  copyIfMissing(o, "created_at", "createdAt");
  copyIfMissing(o, "updated_at", "updatedAt");

  return {
    id,
    workspace_id: Number(o.workspace_id),
    direction: o.direction as ObligationSummary["direction"],
    origin_type: (o.origin_type as ObligationOriginType) ?? "manual",
    status: o.status as ObligationStatus,
    title: String(o.title ?? ""),
    counterparty_id: o.counterparty_id != null ? Number(o.counterparty_id) : null,
    settlement_account_id: o.settlement_account_id != null ? Number(o.settlement_account_id) : null,
    currency_code: String(o.currency_code ?? "PEN"),
    principal_initial_amount: (o.principal_initial_amount as NumericLike) ?? 0,
    principal_increase_total: (o.principal_increase_total as NumericLike) ?? 0,
    principal_decrease_total: (o.principal_decrease_total as NumericLike) ?? 0,
    principal_current_amount: (o.principal_current_amount as NumericLike) ?? 0,
    interest_total: (o.interest_total as NumericLike) ?? 0,
    fee_total: (o.fee_total as NumericLike) ?? 0,
    adjustment_total: (o.adjustment_total as NumericLike) ?? 0,
    discount_total: (o.discount_total as NumericLike) ?? 0,
    writeoff_total: (o.writeoff_total as NumericLike) ?? 0,
    payment_total: (o.payment_total as NumericLike) ?? 0,
    pending_amount: (o.pending_amount as NumericLike) ?? 0,
    progress_percent: (o.progress_percent as NumericLike) ?? 0,
    start_date: String(o.start_date ?? ""),
    due_date: o.due_date != null ? String(o.due_date) : null,
    installment_amount: (o.installment_amount as NumericLike) ?? null,
    installment_count: o.installment_count != null ? Number(o.installment_count) : null,
    interest_rate: (o.interest_rate as NumericLike) ?? null,
    description: o.description != null ? String(o.description) : null,
    notes: o.notes != null ? String(o.notes) : null,
    payment_count: Number(o.payment_count ?? 0),
    last_payment_date: o.last_payment_date != null ? String(o.last_payment_date) : null,
    last_event_date: o.last_event_date != null ? String(o.last_event_date) : null,
    created_at: String(o.created_at ?? ""),
    updated_at: String(o.updated_at ?? ""),
  };
}

function eventRowFromUnknown(e: Record<string, unknown>): ObligationEventRow | null {
  const id = Number(e.id);
  if (!Number.isFinite(id)) return null;
  copyIfMissing(e, "obligation_id", "obligationId");
  copyIfMissing(e, "event_type", "eventType");
  copyIfMissing(e, "event_date", "eventDate");
  copyIfMissing(e, "created_at", "createdAt");
  copyIfMissing(e, "installment_no", "installmentNo");
  copyIfMissing(e, "movement_id", "movementId");
  copyIfMissing(e, "created_by_user_id", "createdByUserId");
  return {
    id,
    obligation_id: Number(e.obligation_id),
    event_type: e.event_type as ObligationEventSummary["eventType"],
    event_date: String(e.event_date ?? ""),
    created_at: e.created_at != null ? String(e.created_at) : null,
    amount: (e.amount as NumericLike) ?? 0,
    installment_no: e.installment_no != null ? Number(e.installment_no) : null,
    reason: e.reason != null ? String(e.reason) : null,
    description: e.description != null ? String(e.description) : null,
    notes: e.notes != null ? String(e.notes) : null,
    movement_id: e.movement_id != null ? Number(e.movement_id) : null,
    created_by_user_id: e.created_by_user_id != null ? String(e.created_by_user_id) : null,
    metadata: (e.metadata as JsonValue) ?? null,
  };
}

function parseSharedObligationItem(item: unknown): SharedObligationSummary | null {
  if (!item || typeof item !== "object") return null;
  const raw = item as Record<string, unknown>;
  const oblRaw =
    raw.obligation && typeof raw.obligation === "object"
      ? (raw.obligation as Record<string, unknown>)
      : raw;
  const shareRaw =
    raw.share && typeof raw.share === "object"
      ? (raw.share as Record<string, unknown>)
      : raw.obligation_share && typeof raw.obligation_share === "object"
        ? (raw.obligation_share as Record<string, unknown>)
        : null;
  if (!shareRaw) return null;

  const eventsSource = Array.isArray(raw.events)
    ? raw.events
    : Array.isArray(oblRaw.events)
      ? oblRaw.events
      : [];

  const row = obligationRowFromUnknown(oblRaw);
  if (!row) return null;

  const eventRows: ObligationEventRow[] = [];
  for (const ev of eventsSource) {
    if (ev && typeof ev === "object") {
      const er = eventRowFromUnknown(ev as Record<string, unknown>);
      if (er) eventRows.push(er);
    }
  }

  const counterpartyMap = new Map<number, string>();
  if (row.counterparty_id != null) {
    const label =
      (typeof oblRaw.counterparty === "string" && oblRaw.counterparty) ||
      (typeof oblRaw.counterparty_name === "string" && oblRaw.counterparty_name) ||
      (typeof oblRaw.counterpartyName === "string" && oblRaw.counterpartyName);
    if (label) counterpartyMap.set(row.counterparty_id, label);
  }

  const base = mapObligation(row, eventRows, counterpartyMap);
  const share = mapObligationShareRow(obligationShareRecordToSnake(shareRaw));
  if (share.status !== "accepted") return null;

  return { ...base, viewerMode: "shared_viewer", share };
}

async function fetchSharedObligations(): Promise<SharedObligationSummary[]> {
  if (!supabase) return [];
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) {
    throw new Error(sessionError.message ?? "No se pudo validar tu sesiÃ³n.");
  }
  if (!sessionData.session?.user?.id) {
    return [];
  }

  const response = (await invokeEdgeFunction<Record<string, unknown>>("list-shared-obligations", {})) ?? {};

  if (response.ok === false) {
    throw new Error(String(response.error ?? "No se pudieron cargar las obligaciones compartidas."));
  }

  const rawList =
    (Array.isArray(response.items) ? response.items : null) ??
    (Array.isArray(response.obligations) ? response.obligations : null) ??
    (Array.isArray(response.data) ? response.data : null) ??
    [];

  const out: SharedObligationSummary[] = [];
  for (const item of rawList) {
    const parsed = parseSharedObligationItem(item);
    if (parsed) out.push(parsed);
  }
  return out;
}

export function useSharedObligationsQuery(userId: string | null | undefined) {
  return useQuery({
    queryKey: ["shared-obligations", userId ?? null],
    enabled: Boolean(supabase && userId),
    staleTime: 60_000,
    retry: 1,
    queryFn: fetchSharedObligations,
  });
}

/** Combina obligaciones del workspace activo con las compartidas contigo (sin duplicar por id). */
export function mergeWorkspaceAndSharedObligations(
  workspace: ObligationSummary[],
  shared: SharedObligationSummary[],
): (ObligationSummary | SharedObligationSummary)[] {
  const byId = new Map<number, ObligationSummary | SharedObligationSummary>();
  for (const o of workspace) byId.set(o.id, o);
  for (const s of shared) {
    if (!byId.has(s.id)) byId.set(s.id, s);
  }
  return [...byId.values()];
}

/** Eventos de una obligaciÃ³n (Ãºtil cuando el resumen compartido no trae `events` completos). */
export function useObligationEventsQuery(
  obligationId: number | null | undefined,
  enabled: boolean,
) {
  return useQuery({
    queryKey: ["obligation-events", obligationId ?? null],
    enabled: Boolean(supabase && obligationId != null && enabled),
    staleTime: 30_000,
    retry: 1,
    queryFn: () => fetchObligationEventsByObligationId(obligationId as number),
  });
}

/** Invitaciones pendientes donde el usuario actual es el invitado (correo o user id). */
export function usePendingObligationShareInvitesQuery(
  userId: string | null | undefined,
  email: string | null | undefined,
) {
  const normalizedEmail = email?.trim().toLowerCase() ?? "";
  return useQuery({
    queryKey: ["pending-obligation-share-invites", userId ?? null, normalizedEmail],
    enabled: Boolean(supabase && userId && normalizedEmail),
    staleTime: 15_000,
    queryFn: async (): Promise<PendingObligationShareInviteItem[]> => {
      if (!supabase || !userId || !normalizedEmail) return [];
      const { data, error } = await supabase
        .from("obligation_shares")
        .select(
          "id, workspace_id, obligation_id, token, owner_display_name, invited_email, message, updated_at",
        )
        .eq("status", "pending")
        .or(`invited_user_id.eq.${userId},invited_email.eq.${normalizedEmail}`)
        .order("updated_at", { ascending: false });
      if (error) throw new Error(error.message ?? "Error al cargar invitaciones");

      const rows = (data ?? []) as Record<string, unknown>[];
      const obligationIds = Array.from(
        new Set(rows.map((row) => Number(row.obligation_id)).filter((id) => Number.isFinite(id) && id > 0)),
      );
      const obligationMetaById = new Map<number, { title: string | null; direction: ObligationDirection | null }>();
      if (obligationIds.length > 0) {
        const { data: obligationRows } = await supabase
          .from("v_obligation_summary")
          .select("id, title, direction")
          .in("id", obligationIds);
        for (const obligationRow of obligationRows ?? []) {
          const row = obligationRow as Record<string, unknown>;
          const id = Number(row.id);
          if (!Number.isFinite(id)) continue;
          obligationMetaById.set(id, {
            title: typeof row.title === "string" ? row.title : null,
            direction: row.direction === "receivable" || row.direction === "payable"
              ? row.direction
              : null,
          });
        }
      }

      return rows.map((row: Record<string, unknown>) => {
        const obligationId = Number(row.obligation_id);
        const meta = obligationMetaById.get(obligationId);
        const inviteKindLabel = meta?.direction === "receivable"
          ? "deuda"
          : meta?.direction === "payable"
            ? "credito"
            : null;
        return {
        id: Number(row.id),
        workspaceId: Number(row.workspace_id),
        obligationId,
        token: String(row.token ?? ""),
        ownerDisplayName: (row.owner_display_name as string) ?? null,
        invitedEmail: String(row.invited_email ?? ""),
        message: (row.message as string) ?? null,
        updatedAt: String(row.updated_at ?? ""),
        obligationTitle: meta?.title ?? null,
        obligationDirection: meta?.direction ?? null,
        inviteKindLabel,
      };
      });
    },
  });
}

// â”€â”€â”€ Obligation share invite â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export type ObligationShareInviteInput = {
  workspaceId: number;
  obligationId: number;
  invitedEmail: string;
  message?: string | null;
};

export type ObligationShareInviteResult = {
  shareId: number;
  shareUrl?: string | null;
  emailSent: boolean;
  invitedEmail: string;
  invitedDisplayName?: string | null;
};

export type UnlinkObligationShareInput = {
  shareId?: number | null;
  workspaceId?: number | null;
  obligationId?: number | null;
};

export function useCreateObligationShareInviteMutation(workspaceId?: number | null) {
  const queryClient = useQueryClient();
  const appUrl = buildHostedAppUrl();
  return useMutation({
    mutationFn: async (input: ObligationShareInviteInput) => {
      const response = await invokeEdgeFunction<{
        ok: boolean; error?: string;
        shareId?: number; shareUrl?: string;
        emailSent?: boolean; invitedEmail?: string; invitedDisplayName?: string;
        status?: string;
      }>(
        "create-obligation-share-invite",
        {
          workspaceId: input.workspaceId,
          obligationId: input.obligationId,
          invitedEmail: input.invitedEmail,
          message: input.message ?? null,
          appUrl,
        },
      );
      if (!response.ok || !response.shareId || !response.invitedEmail) {
        throw new Error(response.error ?? "No se pudo compartir la obligaciÃ³n.");
      }
      return {
        shareId: response.shareId,
        shareUrl: response.shareUrl ?? null,
        emailSent: Boolean(response.emailSent),
        invitedEmail: response.invitedEmail,
        invitedDisplayName: response.invitedDisplayName ?? null,
      } satisfies ObligationShareInviteResult;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["workspace-snapshot"] });
      void queryClient.invalidateQueries({ queryKey: ["obligation-active-share"] });
      void queryClient.invalidateQueries({ queryKey: ["pending-obligation-share-invites"] });
      if (workspaceId) {
        void queryClient.invalidateQueries({ queryKey: ["obligation-shares", workspaceId] });
      }
    },
  });
}

export function useUnlinkObligationShareMutation(workspaceId?: number | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: UnlinkObligationShareInput) => {
      const response = await invokeEdgeFunction<{
        ok: boolean;
        error?: string;
        shareId?: number;
        status?: string;
        alreadyInactive?: boolean;
      }>("unlink-obligation-share", {
        shareId: input.shareId ?? null,
        workspaceId: input.workspaceId ?? workspaceId ?? null,
        obligationId: input.obligationId ?? null,
      });
      if (!response.ok) {
        throw new Error(response.error ?? "No se pudo desvincular la relación compartida.");
      }
      return response;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["workspace-snapshot"] });
      void queryClient.invalidateQueries({ queryKey: ["obligation-active-share"] });
      void queryClient.invalidateQueries({ queryKey: ["pending-obligation-share-invites"] });
      void queryClient.invalidateQueries({ queryKey: ["shared-obligations"] });
      void queryClient.invalidateQueries({ queryKey: ["notifications"] });
      if (workspaceId) {
        void queryClient.invalidateQueries({ queryKey: ["obligation-shares", workspaceId] });
      }
    },
  });
}

// â”€â”€â”€ Exchange Rates CRUD â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export type ExchangeRateRecord = {
  id: number;
  fromCurrencyCode: string;
  toCurrencyCode: string;
  rate: number;
  effectiveAt: string;
  source: string | null;
  notes: string | null;
};

export function useExchangeRatesQuery() {
  return useQuery({
    queryKey: ["exchange-rates"],
    queryFn: async () => {
      if (!supabase) throw new Error("Supabase no configurado");
      const { data, error } = await supabase
        .from("exchange_rates")
        .select("id, from_currency_code, to_currency_code, rate, effective_at, source, notes")
        .order("effective_at", { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []).map((row: any) => ({
        id: row.id as number,
        fromCurrencyCode: row.from_currency_code as string,
        toCurrencyCode: row.to_currency_code as string,
        rate: toNum(row.rate),
        effectiveAt: row.effective_at as string,
        source: row.source as string | null,
        notes: row.notes as string | null,
      })) as ExchangeRateRecord[];
    },
  });
}

export function useCreateExchangeRateMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { fromCurrencyCode: string; toCurrencyCode: string; rate: number; notes?: string }) => {
      if (!supabase) throw new Error("Supabase no configurado");
      const { error } = await supabase.from("exchange_rates").insert({
        from_currency_code: input.fromCurrencyCode.toUpperCase().trim(),
        to_currency_code: input.toCurrencyCode.toUpperCase().trim(),
        rate: input.rate,
        effective_at: new Date().toISOString(),
        source: "manual",
        notes: input.notes?.trim() ?? null,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["exchange-rates"] });
      void queryClient.invalidateQueries({ queryKey: ["workspace-snapshot"] });
    },
  });
}

export function useUpdateExchangeRateMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      id: number;
      fromCurrencyCode: string;
      toCurrencyCode: string;
      rate: number;
      notes?: string;
    }) => {
      if (!supabase) throw new Error("Supabase no configurado");
      const { error } = await supabase
        .from("exchange_rates")
        .update({
          from_currency_code: input.fromCurrencyCode.toUpperCase().trim(),
          to_currency_code: input.toCurrencyCode.toUpperCase().trim(),
          rate: input.rate,
          effective_at: new Date().toISOString(),
          source: "manual",
          notes: input.notes?.trim() ?? null,
        })
        .eq("id", input.id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["exchange-rates"] });
      void queryClient.invalidateQueries({ queryKey: ["workspace-snapshot"] });
    },
  });
}

async function upsertExchangeRateRow(input: {
  fromCurrencyCode: string;
  toCurrencyCode: string;
  rate: number;
  effectiveAt: string;
  source: string;
  notes: string | null;
}) {
  if (!supabase) throw new Error("Supabase no configurado");
  const from = input.fromCurrencyCode.toUpperCase().trim();
  const to = input.toCurrencyCode.toUpperCase().trim();
  const { data: existing, error: selectError } = await supabase
    .from("exchange_rates")
    .select("id")
    .eq("from_currency_code", from)
    .eq("to_currency_code", to)
    .order("effective_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (selectError) throw new Error(selectError.message);

  const payload = {
    from_currency_code: from,
    to_currency_code: to,
    rate: input.rate,
    effective_at: input.effectiveAt,
    source: input.source,
    notes: input.notes,
  };

  if (existing?.id) {
    const { error } = await supabase
      .from("exchange_rates")
      .update(payload)
      .eq("id", existing.id);
    if (error) throw new Error(error.message);
    return Number(existing.id);
  }

  const { data, error } = await supabase
    .from("exchange_rates")
    .insert(payload)
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return Number(data.id);
}

export function useSyncExchangeRatePairMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { fromCurrencyCode: string; toCurrencyCode: string }) => {
      const liveRate = await fetchLiveExchangeRate(input.fromCurrencyCode, input.toCurrencyCode);
      const from = liveRate.fromCurrencyCode.toUpperCase().trim();
      const to = liveRate.toCurrencyCode.toUpperCase().trim();
      const source = `api:${liveRate.provider}`;

      const directId = await upsertExchangeRateRow({
        fromCurrencyCode: from,
        toCurrencyCode: to,
        rate: liveRate.rate,
        effectiveAt: liveRate.effectiveAt,
        source,
        notes: "Sincronizado automáticamente",
      });

      const inverseRate = 1 / liveRate.rate;
      let inverseId: number | null = null;
      if (Number.isFinite(inverseRate) && inverseRate > 0) {
        inverseId = await upsertExchangeRateRow({
          fromCurrencyCode: to,
          toCurrencyCode: from,
          rate: inverseRate,
          effectiveAt: liveRate.effectiveAt,
          source,
          notes: `Inverso calculado desde ${from}→${to}`,
        });
      }

      return {
        ...liveRate,
        directId,
        inverseId,
      } satisfies LiveExchangeRate & { directId: number; inverseId: number | null };
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["exchange-rates"] });
      void queryClient.invalidateQueries({ queryKey: ["workspace-snapshot"] });
    },
  });
}

export function useDeleteExchangeRateMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      if (!supabase) throw new Error("Supabase no configurado");
      const { error } = await supabase.from("exchange_rates").delete().eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["exchange-rates"] });
      void queryClient.invalidateQueries({ queryKey: ["workspace-snapshot"] });
    },
  });
}

// â”€â”€â”€ Obligation Payment Requests â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function rowToPaymentRequest(row: Record<string, unknown>): ObligationPaymentRequest {
  return {
    id: Number(row.id),
    obligationId: Number(row.obligation_id),
    workspaceId: Number(row.workspace_id),
    shareId: Number(row.share_id),
    requestedByUserId: String(row.requested_by_user_id ?? ""),
    requestedByDisplayName: (row.requested_by_display_name as string | null) ?? null,
    amount: toNum(row.amount as NumericLike),
    paymentDate: String(row.payment_date ?? ""),
    installmentNo: row.installment_no != null ? Number(row.installment_no) : null,
    description: (row.description as string | null) ?? null,
    notes: (row.notes as string | null) ?? null,
    status: (row.status as ObligationPaymentRequest["status"]) ?? "pending",
    rejectionReason: (row.rejection_reason as string | null) ?? null,
    viewerAccountId: row.viewer_account_id != null ? Number(row.viewer_account_id) : null,
    viewerAccountName: (row.viewer_account_name as string | null) ?? null,
    viewerWorkspaceId: row.viewer_workspace_id != null ? Number(row.viewer_workspace_id) : null,
    acceptedEventId: row.accepted_event_id != null ? Number(row.accepted_event_id) : null,
    createdAt: String(row.created_at ?? ""),
    updatedAt: String(row.updated_at ?? ""),
  };
}

/** Todas las solicitudes pendientes del workspace (para mostrar badges en la lista). */
export function usePendingPaymentRequestCountsQuery(workspaceId: number | null | undefined) {
  return useQuery({
    queryKey: ["obligation-payment-request-counts", workspaceId ?? null],
    enabled: Boolean(supabase && workspaceId != null),
    staleTime: 20_000,
    queryFn: async (): Promise<Map<number, number>> => {
      if (!supabase || !workspaceId) return new Map();
      const { data, error } = await supabase
        .from("obligation_payment_requests")
        .select("obligation_id")
        .eq("workspace_id", workspaceId)
        .eq("status", "pending");
      if (error) throw new Error(error.message ?? "Error al cargar solicitudes");
      const counts = new Map<number, number>();
      for (const row of (data ?? []) as { obligation_id: number }[]) {
        const id = Number(row.obligation_id);
        counts.set(id, (counts.get(id) ?? 0) + 1);
      }
      return counts;
    },
  });
}

/** Solicitudes enviadas por el viewer para una obligaciÃ³n (vista del shared viewer). */
export function useViewerPaymentRequestsQuery(
  obligationId: number | null | undefined,
  userId: string | null | undefined,
) {
  return useQuery({
    queryKey: ["viewer-payment-requests", obligationId ?? null, userId ?? null],
    enabled: Boolean(supabase && obligationId != null && userId != null),
    staleTime: 15_000,
    queryFn: async (): Promise<ObligationPaymentRequest[]> => {
      if (!supabase || !obligationId || !userId) return [];
      const { data, error } = await supabase
        .from("obligation_payment_requests")
        .select("id, obligation_id, workspace_id, share_id, requested_by_user_id, requested_by_display_name, amount, payment_date, installment_no, description, notes, status, rejection_reason, viewer_account_id, viewer_workspace_id, accepted_event_id, created_at, updated_at")
        .eq("obligation_id", obligationId)
        .eq("requested_by_user_id", userId)
        .order("created_at", { ascending: false });
      if (error) throw new Error(error.message ?? "Error al cargar solicitudes");
      return (data ?? []).map((row: Record<string, unknown>) => rowToPaymentRequest(row));
    },
  });
}

/** Solicitudes de pago pendientes para una obligaciÃ³n (vista del owner). */
export function useObligationPaymentRequestsQuery(obligationId: number | null | undefined) {
  return useQuery({
    queryKey: ["obligation-payment-requests", obligationId ?? null],
    enabled: Boolean(supabase && obligationId != null),
    staleTime: 20_000,
    queryFn: async (): Promise<ObligationPaymentRequest[]> => {
      if (!supabase || !obligationId) return [];
      const { data, error } = await supabase
        .from("obligation_payment_requests")
        .select("id, obligation_id, workspace_id, share_id, requested_by_user_id, requested_by_display_name, amount, payment_date, installment_no, description, notes, status, rejection_reason, viewer_account_id, viewer_workspace_id, accepted_event_id, created_at, updated_at")
        .eq("obligation_id", obligationId)
        .order("created_at", { ascending: false });
      if (error) throw new Error(error.message ?? "Error al cargar solicitudes");
      return (data ?? []).map((row: Record<string, unknown>) => rowToPaymentRequest(row));
    },
  });
}

export type PaymentRequestInput = {
  obligationId: number;
  shareId: number;
  workspaceId: number;
  requestedByUserId: string;
  requestedByDisplayName?: string | null;
  amount: number;
  paymentDate: string;
  installmentNo?: number | null;
  description?: string | null;
  notes?: string | null;
  /** Cuenta del viewer donde se reflejarÃ¡ el movimiento al aceptarse */
  viewerAccountId?: number | null;
  viewerWorkspaceId?: number | null;
  /** Owner user id â€” used to send in-app notification */
  ownerUserId?: string | null;
  obligationTitle?: string | null;
};

/** Shared viewer envÃ­a una solicitud de pago/cobro al owner. */
export function useCreatePaymentRequestMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: PaymentRequestInput) => {
      if (!supabase) throw new Error("Supabase no disponible.");
      const client = supabase;
      const { data, error } = await client
        .from("obligation_payment_requests")
        .insert({
          obligation_id: input.obligationId,
          share_id: input.shareId,
          workspace_id: input.workspaceId,
          requested_by_user_id: input.requestedByUserId,
          requested_by_display_name: input.requestedByDisplayName ?? null,
          amount: input.amount,
          payment_date: input.paymentDate,
          installment_no: input.installmentNo ?? null,
          description: input.description?.trim() || null,
          notes: input.notes?.trim() || null,
          status: "pending",
          viewer_account_id: input.viewerAccountId ?? null,
          viewer_workspace_id: input.viewerWorkspaceId ?? null,
        })
        .select("id")
        .single();
      if (error) throw new Error(error.message ?? "Error al enviar solicitud");
      const requestId = (data as { id: number }).id;
      if (input.ownerUserId) {
        const senderName = input.requestedByDisplayName ?? "Un usuario";
        const desc = input.description?.trim();
        const obligationLabel = input.obligationTitle?.trim()
          ? ` en "${input.obligationTitle.trim()}"`
          : "";
        const row = {
          user_id: input.ownerUserId,
          channel: "in_app" as const,
          status: "pending" as const,
          kind: "obligation_payment_request",
          title: `Solicitud pendiente${obligationLabel}`,
          body: desc
            ? `${senderName} solicitÃ³ un pago de ${input.amount} Â· ${desc}`
            : `${senderName} enviÃ³ una solicitud de pago de ${input.amount}${input.obligationTitle ? ` para "${input.obligationTitle}"` : ""}.`,
          scheduled_for: new Date().toISOString(),
          related_entity_type: "obligation_payment_request",
          related_entity_id: requestId,
          payload: {
            shareId: input.shareId,
            requestId,
            obligationId: input.obligationId,
            obligationTitle: input.obligationTitle ?? null,
          },
        };

        try {
          const { data: existing, error: findErr } = await client
            .from("notifications")
            .select("id")
            .eq("user_id", row.user_id)
            .eq("kind", row.kind)
            .eq("related_entity_type", row.related_entity_type)
            .eq("related_entity_id", row.related_entity_id)
            .order("id", { ascending: false })
            .limit(1);
          if (findErr) throw new Error(findErr.message ?? "Error al comprobar la notificaciÃ³n");

          if ((existing?.length ?? 0) > 0) {
            const { error: updateErr } = await client
              .from("notifications")
              .update({
                channel: row.channel,
                status: row.status,
                title: row.title,
                body: row.body,
                scheduled_for: row.scheduled_for,
                payload: row.payload,
                read_at: null,
              })
              .eq("user_id", row.user_id)
              .eq("kind", row.kind)
              .eq("related_entity_type", row.related_entity_type)
              .eq("related_entity_id", row.related_entity_id);
            if (updateErr) throw new Error(updateErr.message ?? "Error al actualizar la notificaciÃ³n");
          } else {
            const { error: notificationErr } = await client
              .from("notifications")
              .insert(row);
            if (notificationErr) throw new Error(notificationErr.message ?? "Error al crear la notificaciÃ³n");
          }
        } catch (notificationErr) {
          console.warn("[PaymentRequestNotification]", notificationErr);
        }
      }
      return { id: requestId };
    },
    onSuccess: (data, variables) => {
      // Notify the obligation owner about the new request
      if (false) {
        const senderName = variables.requestedByDisplayName ?? "Un usuario";
        const desc = variables.description?.trim();
        const obligationLabel = variables.obligationTitle?.trim()
          ? ` en "${variables.obligationTitle?.trim() ?? ""}"`
          : "";
        void supabase?.from("notifications").insert({
          user_id: variables.ownerUserId,
          channel: "in_app",
          status: "pending",
          kind: "obligation_payment_request",
          title: `Solicitud pendiente${obligationLabel}`,
          body: desc
            ? `${senderName} solicitÃ³ un pago de ${variables.amount} Â· ${desc}`
            : `${senderName} enviÃ³ una solicitud de pago de ${variables.amount}${variables.obligationTitle ? ` para "${variables.obligationTitle}"` : ""}.`,
          scheduled_for: new Date().toISOString(),
          related_entity_type: "obligation_payment_request",
          related_entity_id: data.id,
          payload: {
            shareId: variables.shareId,
            requestId: data.id,
            obligationId: variables.obligationId,
            obligationTitle: variables.obligationTitle ?? null,
          },
        });
      }
      void queryClient.invalidateQueries({ queryKey: ["obligation-payment-requests", variables.obligationId] });
      void queryClient.invalidateQueries({ queryKey: ["obligation-payment-request-counts"] });
      void queryClient.invalidateQueries({ queryKey: ["shared-obligations"] });
      void queryClient.invalidateQueries({ queryKey: ["notifications"] });
      if (variables.ownerUserId) {
        void queryClient.invalidateQueries({ queryKey: ["notifications", variables.ownerUserId] });
      }
    },
  });
}

export type AcceptPaymentRequestInput = {
  requestId: number;
  obligationId: number;
  workspaceId: number;
  amount: number;
  paymentDate: string;
  installmentNo?: number | null;
  description?: string | null;
  accountId?: number | null;
  createMovement: boolean;
  direction?: ObligationDirection;
  obligationTitle?: string;
  /** Cuenta del viewer (guardada en la solicitud) para auto-crear su movimiento */
  viewerAccountId?: number | null;
  viewerWorkspaceId?: number | null;
  viewerUserId?: string | null;
  ownerUserId?: string | null;
  shareId?: number | null;
};

/** Owner acepta la solicitud â†’ crea evento + movimiento del owner + movimiento del viewer â†’ actualiza status. */
export function useAcceptPaymentRequestMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: AcceptPaymentRequestInput) => {
      if (!supabase) throw new Error("Supabase no disponible.");
      const nowIso = new Date().toISOString();
      const isReceivable = input.direction === "receivable";
      const autoDesc =
        input.description?.trim() ||
        (isReceivable ? `Cobro: ${input.obligationTitle ?? `obligaciÃ³n #${input.obligationId}`}` : `Pago: ${input.obligationTitle ?? `obligaciÃ³n #${input.obligationId}`}`);

      const { id: eventId } = await insertObligationPaymentEventWithFallback({
        obligationId: input.obligationId,
        paymentDate: input.paymentDate,
        amount: input.amount,
        installmentNo: input.installmentNo,
        description: input.description,
        notes: null,
        metadata: { from_payment_request: input.requestId },
      });

      // 2. Create owner's movement if they have a settlement account
      let ownerMovementId: number | null = null;
      if (input.createMovement && input.accountId) {
        const movementPayload: Record<string, unknown> = {
          workspace_id: input.workspaceId,
          movement_type: "obligation_payment",
          status: "posted",
          occurred_at: dateStrToISO(input.paymentDate),
          description: autoDesc,
          obligation_id: input.obligationId,
          metadata: { obligation_event_id: eventId },
        };
        if (isReceivable) {
          movementPayload.destination_account_id = input.accountId;
          movementPayload.destination_amount = input.amount;
        } else {
          movementPayload.source_account_id = input.accountId;
          movementPayload.source_amount = input.amount;
        }
        const { data: mvData, error: mvError } = await supabase
          .from("movements")
          .insert(movementPayload)
          .select("id")
          .single();
        if (mvError) throw new Error(mvError.message ?? "Error al crear movimiento");
        ownerMovementId = (mvData as { id: number }).id;
        await attachMovementToObligationEvent(eventId, ownerMovementId);
      }

      // 3. Mark request as accepted and store the created event id
      // NOTE: viewer's movement is created by the viewer themselves (separate mutation)
      // because the owner cannot insert into the viewer's workspace due to RLS.
      const { error: upError } = await supabase
        .from("obligation_payment_requests")
        .update({
          status: "accepted",
          accepted_event_id: eventId,
          updated_at: nowIso,
        })
        .eq("id", input.requestId);
      if (upError) throw new Error(upError.message ?? "Error al actualizar solicitud");

      if (input.ownerUserId) {
        void supabase
          .from("notifications")
          .update({
            status: "read",
            read_at: nowIso,
            title: "Solicitud aceptada",
            body: input.obligationTitle
              ? `Ya aceptaste la solicitud en "${input.obligationTitle}".`
              : "Ya aceptaste esta solicitud.",
            payload: {
              requestId: input.requestId,
              obligationId: input.obligationId,
              obligationTitle: input.obligationTitle ?? null,
              responseStatus: "accepted",
              acceptedEventId: eventId,
              respondedAt: nowIso,
            },
          })
          .eq("user_id", input.ownerUserId)
          .eq("kind", "obligation_payment_request")
          .eq("related_entity_type", "obligation_payment_request")
          .eq("related_entity_id", input.requestId);
      }

      // 4. Notify the viewer that their request was accepted
      if (input.viewerUserId) {
        const recentCutoffIso = new Date(Date.now() - 5 * 60_000).toISOString();
        const acceptedBody = input.viewerAccountId
          ? `Tu solicitud de ${input.amount} fue aceptada${input.obligationTitle ? ` para "${input.obligationTitle}"` : ""} y se registrarÃ¡ en tu cuenta.`
          : `Tu solicitud de ${input.amount} fue aceptada${input.obligationTitle ? ` para "${input.obligationTitle}"` : ""}. Puedes asociar el movimiento a una cuenta desde el historial.`;

        void supabase
          .from("notifications")
          .update({ status: "read", read_at: nowIso })
          .eq("user_id", input.viewerUserId)
          .eq("kind", "obligation_event_unlinked")
          .eq("related_entity_id", input.obligationId)
          .eq("status", "pending")
          .gte("scheduled_for", recentCutoffIso);

        void supabase
          .from("notifications")
          .insert({
            user_id: input.viewerUserId,
            channel: "in_app",
            status: "pending",
            kind: "obligation_request_accepted",
            title: "Solicitud aceptada",
            body: acceptedBody,
            scheduled_for: nowIso,
            related_entity_type: "obligation_payment_request",
            related_entity_id: input.requestId,
            payload: {
              requestId: input.requestId,
              eventId,
              obligationId: input.obligationId,
              obligationTitle: input.obligationTitle ?? null,
              viewerAccountId: input.viewerAccountId ?? null,
              acceptedEventId: eventId,
              requiresAccountLink: input.viewerAccountId == null,
            },
          });
      }

      return { eventId, ownerMovementId };
    },
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: ["workspace-snapshot"] });
      void queryClient.invalidateQueries({ queryKey: ["movements"] });
      void queryClient.invalidateQueries({ queryKey: ["obligation-events", variables.obligationId] });
      void queryClient.invalidateQueries({ queryKey: ["obligation-payment-requests", variables.obligationId] });
      void queryClient.invalidateQueries({ queryKey: ["obligation-payment-request-counts"] });
      void queryClient.invalidateQueries({ queryKey: ["viewer-payment-requests", variables.obligationId] });
      void queryClient.invalidateQueries({ queryKey: ["shared-obligations"] });
      void queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });
}

/** Owner rechaza la solicitud. */
export function useRejectPaymentRequestMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      requestId,
      obligationId,
      rejectionReason,
      viewerUserId,
      ownerUserId,
      amount,
      obligationTitle,
    }: {
      requestId: number;
      obligationId: number;
      rejectionReason?: string | null;
      viewerUserId?: string | null;
      ownerUserId?: string | null;
      amount?: number | null;
      obligationTitle?: string | null;
    }) => {
      if (!supabase) throw new Error("Supabase no disponible.");
      const { error } = await supabase
        .from("obligation_payment_requests")
        .update({
          status: "rejected",
          rejection_reason: rejectionReason?.trim() || null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", requestId);
      if (error) throw new Error(error.message ?? "Error al rechazar solicitud");

      if (ownerUserId) {
        void supabase
          .from("notifications")
          .update({
            status: "read",
            read_at: new Date().toISOString(),
            title: "Solicitud rechazada",
            body: obligationTitle
              ? `Ya rechazaste la solicitud en "${obligationTitle}".`
              : "Ya rechazaste esta solicitud.",
            payload: {
              requestId,
              obligationId,
              obligationTitle: obligationTitle ?? null,
              responseStatus: "rejected",
              rejectionReason: rejectionReason?.trim() || null,
              respondedAt: new Date().toISOString(),
            },
          })
          .eq("user_id", ownerUserId)
          .eq("kind", "obligation_payment_request")
          .eq("related_entity_type", "obligation_payment_request")
          .eq("related_entity_id", requestId);
      }

      // Notify the viewer that their request was rejected
      if (viewerUserId) {
        void supabase
          .from("notifications")
          .insert({
            user_id: viewerUserId,
            channel: "in_app",
            status: "pending",
            kind: "obligation_request_rejected",
            title: "Solicitud rechazada",
            body: `Tu solicitud${amount != null ? ` de ${amount}` : ""} fue rechazada${obligationTitle ? ` para "${obligationTitle}"` : ""}${rejectionReason?.trim() ? `. Motivo: ${rejectionReason.trim()}` : ""}.`,
            scheduled_for: new Date().toISOString(),
            related_entity_type: "obligation_payment_request",
            related_entity_id: requestId,
            payload: {
              requestId,
              obligationId,
              obligationTitle: obligationTitle ?? null,
            },
          });
      }
    },
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: ["obligation-payment-requests", variables.obligationId] });
      void queryClient.invalidateQueries({ queryKey: ["obligation-payment-request-counts"] });
      void queryClient.invalidateQueries({ queryKey: ["viewer-payment-requests", variables.obligationId] });
      void queryClient.invalidateQueries({ queryKey: ["shared-obligations"] });
      void queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });
}

// â”€â”€â”€ Obligation Event Viewer Links â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/** Links ya creados por el viewer para esta obligaciÃ³n (quÃ© eventos ya vinculÃ³ a sus cuentas). */
export function useObligationEventViewerLinksQuery(
  obligationId: number | null | undefined,
  shareId: number | null | undefined,
) {
  return useQuery({
    queryKey: ["obligation-event-viewer-links", obligationId ?? null, shareId ?? null],
    enabled: Boolean(supabase && obligationId != null && shareId != null),
    staleTime: 20_000,
    queryFn: async (): Promise<ObligationEventViewerLink[]> => {
      if (!supabase || !obligationId || !shareId) return [];
      const { data, error } = await supabase
        .from("obligation_event_viewer_links")
        .select("id, obligation_id, event_id, share_id, linked_by_user_id, viewer_workspace_id, account_id, movement_id, created_at")
        .eq("obligation_id", obligationId)
        .eq("share_id", shareId);
      if (error) throw new Error(error.message ?? "Error al cargar vÃ­nculos");
      return (data ?? []).map((row: Record<string, unknown>) => ({
        id: Number(row.id),
        obligationId: Number(row.obligation_id),
        eventId: Number(row.event_id),
        shareId: Number(row.share_id),
        linkedByUserId: String(row.linked_by_user_id ?? ""),
        viewerWorkspaceId: row.viewer_workspace_id != null ? Number(row.viewer_workspace_id) : null,
        accountId: row.account_id != null ? Number(row.account_id) : null,
        accountName: null,
        movementId: row.movement_id != null ? Number(row.movement_id) : null,
        createdAt: String(row.created_at ?? ""),
      }));
    },
  });
}

export type LinkEventToAccountInput = {
  obligationId: number;
  obligationWorkspaceId: number;
  eventId: number;
  eventType: "payment" | "principal_increase" | "principal_decrease";
  shareId: number;
  linkedByUserId: string;
  viewerWorkspaceId: number;
  accountId: number;
  amount: number;
  eventDate: string;
  description?: string | null;
  /** Direction of the ORIGINAL obligation (owner's perspective) */
  obligationDirection: ObligationDirection;
  obligationTitle: string;
  currencyCode: string;
};

function viewerLinkedEventMovementConfig(input: Pick<LinkEventToAccountInput, "eventType" | "obligationDirection" | "obligationTitle">) {
  const viewerIsDebtor = input.obligationDirection === "receivable";

  if (input.eventType === "payment") {
    return {
      movementType: "obligation_payment" as const,
      isInflow: !viewerIsDebtor,
      autoDesc: viewerIsDebtor
        ? `Pago vinculado: ${input.obligationTitle}`
        : `Cobro vinculado: ${input.obligationTitle}`,
    };
  }

  if (input.eventType === "principal_increase") {
    return {
      movementType: "obligation_opening" as const,
      isInflow: viewerIsDebtor,
      autoDesc: viewerIsDebtor
        ? `Dinero recibido: ${input.obligationTitle}`
        : `Prestamo adicional entregado: ${input.obligationTitle}`,
    };
  }

  return {
    movementType: "obligation_opening" as const,
    isInflow: !viewerIsDebtor,
    autoDesc: viewerIsDebtor
      ? `Devolucion de principal: ${input.obligationTitle}`
      : `Pago de principal: ${input.obligationTitle}`,
  };
}

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
  };
}

/**
 * Shared viewer asocia un evento de pago a una de sus cuentas.
 * Crea un movimiento en el workspace del viewer y registra el link.
 */
export function useLinkEventToAccountMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: LinkEventToAccountInput) => {
      if (!supabase) throw new Error("Supabase no disponible.");

      const movementConfig = viewerLinkedEventMovementConfig(input);
      const autoDesc = input.description?.trim() || movementConfig.autoDesc;

      const movementPayload: Record<string, unknown> = {
        workspace_id: input.viewerWorkspaceId,
        movement_type: movementConfig.movementType,
        status: "posted",
        occurred_at: dateStrToISO(input.eventDate),
        description: autoDesc,
        obligation_id: null,
        metadata: { obligation_id: input.obligationId, obligation_event_id: input.eventId },
      };

      if (movementConfig.isInflow) {
        movementPayload.destination_account_id = input.accountId;
        movementPayload.destination_amount = input.amount;
      } else {
        movementPayload.source_account_id = input.accountId;
        movementPayload.source_amount = input.amount;
      }

      const { data: mvData, error: mvError } = await supabase
        .from("movements")
        .insert(movementPayload)
        .select("id")
        .single();
      if (mvError) throw new Error(mvError.message ?? "Error al crear movimiento");
      const movementId = (mvData as { id: number }).id;

      // Record the link
      const { error: linkError } = await supabase
        .from("obligation_event_viewer_links")
        .insert({
          obligation_id: input.obligationId,
          event_id: input.eventId,
          share_id: input.shareId,
          linked_by_user_id: input.linkedByUserId,
          viewer_workspace_id: input.viewerWorkspaceId,
          account_id: input.accountId,
          movement_id: movementId,
        });
      if (linkError) throw new Error(linkError.message ?? "Error al guardar vÃ­nculo");

      let attachmentSyncError: string | null = null;
      try {
        await mirrorObligationEventAttachmentsToMovement({
          workspaceId: input.obligationWorkspaceId,
          targetWorkspaceId: input.viewerWorkspaceId,
          eventId: input.eventId,
          movementId,
        });
      } catch (error) {
        attachmentSyncError =
          error instanceof Error
            ? error.message
            : "El movimiento se creo, pero no pudimos copiar los comprobantes.";
      }

      return { movementId, attachmentSyncError };
    },
    onSuccess: (data, variables) => {
      void queryClient.invalidateQueries({ queryKey: ["workspace-snapshot"] });
      void queryClient.invalidateQueries({ queryKey: ["movements"] });
      void queryClient.invalidateQueries({ queryKey: ["obligation-event-viewer-links", variables.obligationId, variables.shareId] });
      void queryClient.invalidateQueries({ queryKey: ["notifications"] });
      void queryClient.invalidateQueries({
        queryKey: ["movement-attachments", variables.viewerWorkspaceId, data.movementId],
      });
    },
  });
}

export function useUpsertLinkEventToAccountMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: LinkEventToAccountInput) => {
      if (!supabase) throw new Error("Supabase no disponible.");
      const client = supabase;

      const movementConfig = viewerLinkedEventMovementConfig(input);
      const autoDesc = input.description?.trim() || movementConfig.autoDesc;

      const movementPayload: Record<string, unknown> = {
        workspace_id: input.viewerWorkspaceId,
        movement_type: movementConfig.movementType,
        status: "posted",
        occurred_at: dateStrToISO(input.eventDate),
        description: autoDesc,
        obligation_id: null,
        metadata: { obligation_id: input.obligationId, obligation_event_id: input.eventId },
        source_account_id: movementConfig.isInflow ? null : input.accountId,
        source_amount: movementConfig.isInflow ? null : input.amount,
        destination_account_id: movementConfig.isInflow ? input.accountId : null,
        destination_amount: movementConfig.isInflow ? input.amount : null,
      };

      const { data: existingLinks, error: existingErr } = await client
        .from("obligation_event_viewer_links")
        .select("id, movement_id, viewer_workspace_id")
        .eq("obligation_id", input.obligationId)
        .eq("event_id", input.eventId)
        .eq("share_id", input.shareId)
        .order("id", { ascending: false })
        .limit(1);
      if (existingErr) throw new Error(existingErr.message ?? "Error al comprobar vÃ­nculo existente");

      const existingLink = (existingLinks ?? [])[0] as
        | { id: number; movement_id: number | null; viewer_workspace_id: number | null }
        | undefined;

      let movementId = existingLink?.movement_id ?? null;
      if (movementId) {
        const { error: mvUpdateErr } = await client
          .from("movements")
          .update(movementPayload)
          .eq("id", movementId);
        if (mvUpdateErr) throw new Error(mvUpdateErr.message ?? "Error al actualizar movimiento");
      } else {
        const { data: mvData, error: mvError } = await client
          .from("movements")
          .insert({
            ...movementPayload,
            workspace_id: existingLink?.viewer_workspace_id ?? input.viewerWorkspaceId,
          })
          .select("id")
          .single();
        if (mvError) throw new Error(mvError.message ?? "Error al crear movimiento");
        movementId = (mvData as { id: number }).id;
      }

      if (existingLink?.id) {
        const { error: linkUpdateError } = await client
          .from("obligation_event_viewer_links")
          .update({
            linked_by_user_id: input.linkedByUserId,
            viewer_workspace_id: existingLink.viewer_workspace_id ?? input.viewerWorkspaceId,
            account_id: input.accountId,
            movement_id: movementId,
          })
          .eq("id", existingLink.id);
        if (linkUpdateError) throw new Error(linkUpdateError.message ?? "Error al actualizar vÃ­nculo");
      } else {
        const { error: linkError } = await client
          .from("obligation_event_viewer_links")
          .insert({
            obligation_id: input.obligationId,
            event_id: input.eventId,
            share_id: input.shareId,
            linked_by_user_id: input.linkedByUserId,
            viewer_workspace_id: input.viewerWorkspaceId,
            account_id: input.accountId,
            movement_id: movementId,
          });
        if (linkError) throw new Error(linkError.message ?? "Error al guardar vÃ­nculo");
      }

      let attachmentSyncError: string | null = null;
      if (movementId) {
        try {
          await mirrorObligationEventAttachmentsToMovement({
            workspaceId: input.obligationWorkspaceId,
            targetWorkspaceId: existingLink?.viewer_workspace_id ?? input.viewerWorkspaceId,
            eventId: input.eventId,
            movementId,
          });
        } catch (error) {
          attachmentSyncError =
            error instanceof Error
              ? error.message
              : "El movimiento se creo, pero no pudimos copiar los comprobantes.";
        }
      }

      return { movementId, updatedExisting: Boolean(existingLink?.id), attachmentSyncError };
    },
    onSuccess: (data, variables) => {
      void queryClient.invalidateQueries({ queryKey: ["workspace-snapshot"] });
      void queryClient.invalidateQueries({ queryKey: ["movements"] });
      void queryClient.invalidateQueries({
        queryKey: ["obligation-event-viewer-links", variables.obligationId, variables.shareId],
      });
      void queryClient.invalidateQueries({ queryKey: ["notifications"] });
      if (data.movementId) {
        void queryClient.invalidateQueries({
          queryKey: ["movement-attachments", variables.viewerWorkspaceId, data.movementId],
        });
      }
    },
  });
}

export type DeleteViewerEventLinkInput = {
  linkId: number;
  movementId?: number | null;
  obligationId: number;
  shareId?: number | null;
};

export function useDeleteViewerEventLinkMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: DeleteViewerEventLinkInput) => {
      if (!supabase) throw new Error("Supabase no disponible.");
      if (input.movementId) {
        const { error: mvErr } = await supabase
          .from("movements")
          .delete()
          .eq("id", input.movementId);
        if (mvErr) throw new Error(mvErr.message ?? "Error al eliminar movimiento del viewer");
      }

      const { error: linkErr } = await supabase
        .from("obligation_event_viewer_links")
        .delete()
        .eq("id", input.linkId);
      if (linkErr) throw new Error(linkErr.message ?? "Error al eliminar vÃ­nculo del evento");
    },
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: ["workspace-snapshot"] });
      void queryClient.invalidateQueries({ queryKey: ["movements"] });
      void queryClient.invalidateQueries({
        queryKey: ["obligation-event-viewer-links", variables.obligationId, variables.shareId ?? null],
      });
      void queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });
}
