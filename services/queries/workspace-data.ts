import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import type { WorkspaceInvitationStatus } from "../../types/domain";

import { supabase } from "../../lib/supabase";
import { dateStrToISO } from "../../lib/date";
import { sortObligationEventsNewestFirst } from "../../lib/sort-obligation-events";
import {
  convertAmountToWorkspaceBase,
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
  SubscriptionFrequency,
  CategoryPostedMovement,
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
      "id, obligation_id, event_type, event_date, amount, installment_no, reason, description, notes, movement_id, created_by_user_id, metadata",
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

/** Fila de `counterparties` → overview para snapshot (métricas financieras: 0 hasta enlazar v_counterparty_summary). */
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

// ─── Snapshot query ───────────────────────────────────────────────────────────

export type WorkspaceSnapshot = {
  workspaces: Workspace[];
  accounts: AccountSummary[];
  /** Catálogo completo (activas e inactivas), orden sort_order + name. */
  categories: CategorySummary[];
  budgets: BudgetOverview[];
  obligations: ObligationSummary[];
  subscriptions: SubscriptionSummary[];
  /** Movimientos posted con subscription_id (analíticas sin query extra). */
  subscriptionPostedMovements: SubscriptionPostedMovement[];
  /** Movimientos posted con category_id (analíticas categorías). */
  categoryPostedMovements: CategoryPostedMovement[];
  counterparties: CounterpartyOverview[];
  exchangeRates: ExchangeRateSummary[];
};

async function fetchWorkspaceSnapshot(
  userId: string,
  activeWorkspaceId: number,
): Promise<WorkspaceSnapshot> {
  if (!supabase) throw new Error("Supabase no está configurado.");

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
      .eq("is_archived", false)
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
      .eq("workspace_id", activeWorkspaceId)
      .in("status", ["active", "draft"]),
    // Descripción/notas desde la tabla base: v_obligation_summary a veces no incluye estas columnas.
    supabase
      .from("obligations")
      .select("id, description, notes")
      .eq("workspace_id", activeWorkspaceId)
      .in("status", ["active", "draft"]),
    supabase
      .from("subscriptions")
      .select("id, workspace_id, name, vendor_party_id, account_id, category_id, currency_code, amount, frequency, interval_count, day_of_month, day_of_week, start_date, next_due_date, end_date, status, remind_days_before, auto_create_movement, description, notes")
      .eq("workspace_id", activeWorkspaceId)
      .order("next_due_date", { ascending: true }),
    supabase
      .from("movements")
      .select("id, subscription_id, status, occurred_at, source_amount, destination_amount")
      .eq("workspace_id", activeWorkspaceId)
      .not("subscription_id", "is", null)
      .eq("status", "posted")
      .order("occurred_at", { ascending: false })
      .limit(5000),
    supabase
      .from("movements")
      .select("id, category_id, status, occurred_at, source_amount, destination_amount")
      .eq("workspace_id", activeWorkspaceId)
      .not("category_id", "is", null)
      .eq("status", "posted")
      .order("occurred_at", { ascending: false })
      .limit(5000),
    supabase
      .from("v_latest_exchange_rates")
      .select("from_currency_code, to_currency_code, rate, effective_at"),
  ]);

  if (subscriptionsResult.error) {
    throw new Error(subscriptionsResult.error.message ?? "Error al cargar suscripciones");
  }

  // obligation_events no tiene workspace_id en el esquema: filtrar eventos por obligaciones del workspace
  const obligationRowsForEvents = (obligationsResult.data ?? []) as ObligationSummaryRow[];
  const obligationIdsForEvents = obligationRowsForEvents.map((r) => r.id);
  let obligationEventRows: ObligationEventRow[] = [];
  if (obligationIdsForEvents.length > 0) {
    const { data: evData, error: evError } = await supabase
      .from("obligation_events")
      .select(
        "id, obligation_id, event_type, event_date, amount, installment_no, reason, description, notes, movement_id, created_by_user_id, metadata",
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

  return {
    workspaces,
    accounts,
    categories,
    budgets,
    obligations,
    subscriptions,
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

// ─── Workspace list init (no activeWorkspaceId needed) ────────────────────────

async function fetchUserWorkspaces(userId: string) {
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
    staleTime: 60_000,
    retry: 1,
  });
}

// ─── Dashboard movements query ────────────────────────────────────────────────

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
  /** Para listados en dashboard (detalle por día) */
  description: string;
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

// ─── Movement mutations ───────────────────────────────────────────────────────

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
  if (!supabase) throw new Error("Supabase no está configurado.");

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

  if (error) throw new Error(error.message ?? "Error al guardar el movimiento");
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
      void queryClient.invalidateQueries({ queryKey: ["workspace-snapshot"] });
      void queryClient.invalidateQueries({ queryKey: ["movements"] });
    },
  });
}

// ─── Account mutations ────────────────────────────────────────────────────────

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
      if (error) throw new Error(error.message ?? "Error de base de datos");
      return data as { id: number };
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["workspace-snapshot"] });
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
      void queryClient.invalidateQueries({ queryKey: ["workspace-snapshot"] });
    },
  });
}

// ─── Budget mutations ─────────────────────────────────────────────────────────

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
      void queryClient.invalidateQueries({ queryKey: ["workspace-snapshot"] });
    },
  });
}

// ─── Movement mutations (update / void) ──────────────────────────────────────

export type MovementUpdateInput = {
  description?: string;
  notes?: string | null;
  categoryId?: number | null;
  counterpartyId?: number | null;
  occurredAt?: string;
  status?: MovementStatus;
  sourceAmount?: number;
  destinationAmount?: number;
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
      const { error } = await supabase
        .from("movements")
        .update(payload)
        .eq("id", id)
        .eq("workspace_id", workspaceId);
      if (error) throw new Error(error.message ?? "Error de base de datos");
    },
    onSuccess: (_data, { id }) => {
      void queryClient.invalidateQueries({ queryKey: ["workspace-snapshot"] });
      void queryClient.invalidateQueries({ queryKey: ["movements"] });
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
    onSuccess: (_data, id) => {
      void queryClient.invalidateQueries({ queryKey: ["workspace-snapshot"] });
      void queryClient.invalidateQueries({ queryKey: ["movements"] });
      void queryClient.invalidateQueries({ queryKey: ["movement", id] });
    },
  });
}

// ─── Budget mutations (update / delete) ──────────────────────────────────────

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
      void queryClient.invalidateQueries({ queryKey: ["workspace-snapshot"] });
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
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["workspace-snapshot"] });
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
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["workspace-snapshot"] });
      void queryClient.invalidateQueries({ queryKey: ["movements"] });
    },
  });
}

// ─── Account mutations (archive) ─────────────────────────────────────────────

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
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["workspace-snapshot"] });
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
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["workspace-snapshot"] });
    },
  });
}

// ─── Account analytics ────────────────────────────────────────────────────────

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

// ─── Obligation mutations ─────────────────────────────────────────────────────

export type ObligationFormInput = {
  title: string;
  direction: "receivable" | "payable";
  originType: "cash_loan" | "sale_financed" | "purchase_financed" | "manual";
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

export function useCreateObligationMutation(workspaceId: number | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: ObligationFormInput) => {
      if (!supabase || !workspaceId) throw new Error("Workspace no disponible.");
      const { data, error } = await supabase
        .from("obligations")
        .insert({
          workspace_id: workspaceId,
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
      return data as { id: number };
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
    onSuccess: async () => {
      await queryClient.refetchQueries({ queryKey: ["workspace-snapshot"] });
      void queryClient.invalidateQueries({ queryKey: ["obligation-active-share"] });
      if (workspaceId) {
        void queryClient.invalidateQueries({ queryKey: ["obligation-shares", workspaceId] });
      }
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
  /** Si es "receivable" (me deben), textos automáticos usan “cobro”. */
  direction?: ObligationDirection;
};

async function fetchObligationWorkspaceId(obligationId: number): Promise<number> {
  if (!supabase) throw new Error("Supabase no disponible.");
  const { data, error } = await supabase
    .from("obligations")
    .select("workspace_id")
    .eq("id", obligationId)
    .single();
  if (error) throw new Error(error.message ?? "Obligación no encontrada");
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
        throw new Error("La obligación no pertenece al workspace activo.");
      }
      const isReceivable = input.direction === "receivable";
      const autoDesc =
        input.description?.trim() ||
        (isReceivable ? `Cobro obligación #${input.obligationId}` : `Pago obligación #${input.obligationId}`);
      // Register as obligation_event of type "payment"
      const { data, error } = await supabase
        .from("obligation_events")
        .insert({
          obligation_id: input.obligationId,
          event_type: "payment",
          event_date: input.paymentDate,
          amount: input.amount,
          installment_no: input.installmentNo ?? null,
          description: input.description?.trim() || null,
          notes: input.notes ?? null,
          metadata: {},
        })
        .select("id")
        .single();
      if (error) throw new Error(error.message ?? "Error de base de datos");
      // If requested, also create a movement linked to this obligation
      if (input.createMovement && input.accountId) {
        const { error: mvErr } = await supabase
          .from("movements")
          .insert({
            workspace_id: wsId,
            movement_type: "obligation_payment",
            status: "posted",
            occurred_at: dateStrToISO(input.paymentDate),
            description: autoDesc,
            source_account_id: input.accountId,
            source_amount: input.amount,
            obligation_id: input.obligationId,
            metadata: {},
          });
        if (mvErr) throw mvErr;
      }
      return data as { id: number };
    },
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: ["workspace-snapshot"] });
      void queryClient.invalidateQueries({ queryKey: ["movements"] });
      void queryClient.invalidateQueries({ queryKey: ["obligation-events", variables.obligationId] });
    },
  });
}

export type PrincipalAdjustmentInput = {
  obligationId: number;
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
        throw new Error("La obligación no pertenece al workspace activo.");
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
      // Optionally create a linked account movement
      if (input.createMovement && input.accountId) {
        const movType = input.mode === "increase" ? "income" : "expense";
        const desc = input.mode === "increase"
          ? `Aumento de principal #${input.obligationId}`
          : `Reducción de principal #${input.obligationId}`;
        const { error: mvErr } = await supabase
          .from("movements")
          .insert({
            workspace_id: wsId,
            movement_type: movType,
            status: "posted",
            occurred_at: dateStrToISO(input.eventDate),
            description: desc,
            ...(input.mode === "increase"
              ? { destination_account_id: input.accountId, destination_amount: input.amount }
              : { source_account_id: input.accountId, source_amount: input.amount }),
            obligation_id: input.obligationId,
            metadata: {},
          });
        if (mvErr) throw mvErr;
      }
      return data as { id: number };
    },
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: ["workspace-snapshot"] });
      void queryClient.invalidateQueries({ queryKey: ["movements"] });
      void queryClient.invalidateQueries({ queryKey: ["obligation-events", variables.obligationId] });
    },
  });
}

// ─── Obligation event update / delete ────────────────────────────────────────

export type UpdateObligationEventInput = {
  eventId: number;
  obligationId: number;
  amount: number;
  eventDate: string;
  installmentNo?: number | null;
  description?: string | null;
  notes?: string | null;
  reason?: string | null;
};

export function useUpdateObligationEventMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: UpdateObligationEventInput) => {
      if (!supabase) throw new Error("Supabase no disponible.");
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
    },
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: ["workspace-snapshot"] });
      void queryClient.invalidateQueries({ queryKey: ["obligation-events", variables.obligationId] });
    },
  });
}

export type DeleteObligationEventInput = {
  eventId: number;
  obligationId: number;
};

export function useDeleteObligationEventMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: DeleteObligationEventInput) => {
      if (!supabase) throw new Error("Supabase no disponible.");
      const { error } = await supabase
        .from("obligation_events")
        .delete()
        .eq("id", input.eventId);
      if (error) throw new Error(error.message ?? "Error de base de datos");
    },
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: ["workspace-snapshot"] });
      void queryClient.invalidateQueries({ queryKey: ["obligation-events", variables.obligationId] });
    },
  });
}

// ─── Subscription mutations ───────────────────────────────────────────────────

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
  /** Próximo vencimiento (YYYY-MM-DD). */
  nextDueDate: string;
  endDate?: string | null;
  remindDaysBefore: number;
  autoCreateMovement: boolean;
  description?: string | null;
  notes?: string | null;
};

export function useCreateSubscriptionMutation(workspaceId: number | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: SubscriptionFormInput) => {
      if (!supabase || !workspaceId) throw new Error("Workspace no disponible.");
      const { data: authData, error: authErr } = await supabase.auth.getUser();
      if (authErr) throw new Error(authErr.message ?? "No se pudo verificar la sesión");
      const uid = authData.user?.id;
      if (!uid) throw new Error("No hay sesión");

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
        throw new Error("No se puede eliminar: hay movimientos vinculados a esta suscripción.");
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
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["workspace-snapshot"] });
    },
  });
}

// ─── Category mutations ───────────────────────────────────────────────────────

function invalidateCategoryRelatedQueries(queryClient: QueryClient, workspaceId: number | null) {
  void queryClient.invalidateQueries({ queryKey: ["workspace-snapshot"] });
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
      if (authErr) throw new Error(authErr.message ?? "No se pudo verificar la sesión");
      const uid = authData.user?.id;
      if (!uid) throw new Error("No hay sesión");

      const { data: maxRow, error: maxErr } = await supabase
        .from("categories")
        .select("sort_order")
        .eq("workspace_id", workspaceId)
        .order("sort_order", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (maxErr) throw new Error(maxErr.message ?? "Error al leer orden de categorías");
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
        throw new Error("La categoría no puede ser su propia categoría padre.");
      }

      const { data: authData, error: authErr } = await supabase.auth.getUser();
      if (authErr) throw new Error(authErr.message ?? "No se pudo verificar la sesión");
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

/** Solo activar / desactivar (toggle rápido en lista). */
export function useToggleCategoryMutation(workspaceId: number | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, isActive }: { id: number; isActive: boolean }) => {
      if (!supabase || !workspaceId) throw new Error("Workspace no disponible.");
      const { data: authData, error: authErr } = await supabase.auth.getUser();
      if (authErr) throw new Error(authErr.message ?? "No se pudo verificar la sesión");
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
      if (catErr) throw new Error(catErr.message ?? "Error al cargar categoría");
      if (!catRow) throw new Error("Categoría no encontrada.");
      if ((catRow as { is_system?: boolean }).is_system) {
        throw new Error("No se puede eliminar una categoría base del sistema.");
      }

      const { count: movCount, error: movErr } = await supabase
        .from("movements")
        .select("*", { count: "exact", head: true })
        .eq("workspace_id", workspaceId)
        .eq("category_id", id);
      if (movErr) throw new Error(movErr.message ?? "Error al comprobar movimientos");
      if ((movCount ?? 0) > 0) {
        throw new Error("No se puede eliminar: hay movimientos que usan esta categoría.");
      }

      const { count: subCount, error: subErr } = await supabase
        .from("subscriptions")
        .select("*", { count: "exact", head: true })
        .eq("workspace_id", workspaceId)
        .eq("category_id", id);
      if (subErr) throw new Error(subErr.message ?? "Error al comprobar suscripciones");
      if ((subCount ?? 0) > 0) {
        throw new Error("No se puede eliminar: hay suscripciones que usan esta categoría.");
      }

      const { count: childCount, error: childErr } = await supabase
        .from("categories")
        .select("*", { count: "exact", head: true })
        .eq("workspace_id", workspaceId)
        .eq("parent_id", id);
      if (childErr) throw new Error(childErr.message ?? "Error al comprobar subcategorías");
      if ((childCount ?? 0) > 0) {
        throw new Error("No se puede eliminar: existen subcategorías. Reasígnalas o elimínalas primero.");
      }

      const { error } = await supabase.from("categories").delete().eq("id", id).eq("workspace_id", workspaceId);
      if (error) throw new Error(error.message ?? "Error de base de datos");
    },
    onSuccess: () => {
      invalidateCategoryRelatedQueries(queryClient, workspaceId);
    },
  });
}

// ─── Counterparty (contact) mutations ────────────────────────────────────────

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
      void queryClient.invalidateQueries({ queryKey: ["workspace-snapshot"] });
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
      void queryClient.invalidateQueries({ queryKey: ["workspace-snapshot"] });
      void queryClient.invalidateQueries({ queryKey: ["counterparties"] });
    },
  });
}

// ─── Notification queries ─────────────────────────────────────────────────────

export function useNotificationsQuery(userId: string | null) {
  return useQuery({
    queryKey: ["notifications", userId],
    queryFn: async () => {
      if (!supabase || !userId) return [];
      const { data, error } = await supabase
        .from("notifications")
        .select("id, title, body, status, scheduled_for, kind, channel, read_at, related_entity_type, related_entity_id")
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
      }));
    },
    enabled: Boolean(userId),
    staleTime: 30_000,
  });
}

export function useMarkNotificationReadMutation(userId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (notificationId: number) => {
      if (!supabase) throw new Error("Supabase no está configurado.");
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

// ─── Edge Function helper ─────────────────────────────────────────────────────

async function invokeEdgeFunction<T>(name: string, body: Record<string, unknown>): Promise<T> {
  if (!supabase) throw new Error("Supabase no está configurado.");
  const { data, error } = await supabase.functions.invoke<T>(name, { body });
  if (error) throw new Error(error.message ?? "Error de base de datos");
  return data as T;
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
          appUrl: null,
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
      if (error) throw new Error(error.message ?? "Error al cargar compartición");
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

// ─── Obligaciones compartidas contigo (edge list-shared-obligations) ─────────

function copyIfMissing(target: Record<string, unknown>, snake: string, camel: string) {
  if (target[snake] === undefined && target[camel] !== undefined) target[snake] = target[camel];
}

/** Normaliza fila share snake_case si la edge devolvió camelCase. */
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
    principal_initial_amount: o.principal_initial_amount ?? 0,
    principal_increase_total: o.principal_increase_total ?? 0,
    principal_decrease_total: o.principal_decrease_total ?? 0,
    principal_current_amount: o.principal_current_amount ?? 0,
    interest_total: o.interest_total ?? 0,
    fee_total: o.fee_total ?? 0,
    adjustment_total: o.adjustment_total ?? 0,
    discount_total: o.discount_total ?? 0,
    writeoff_total: o.writeoff_total ?? 0,
    payment_total: o.payment_total ?? 0,
    pending_amount: o.pending_amount ?? 0,
    progress_percent: o.progress_percent ?? 0,
    start_date: String(o.start_date ?? ""),
    due_date: o.due_date != null ? String(o.due_date) : null,
    installment_amount: o.installment_amount ?? null,
    installment_count: o.installment_count != null ? Number(o.installment_count) : null,
    interest_rate: o.interest_rate ?? null,
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
  copyIfMissing(e, "installment_no", "installmentNo");
  copyIfMissing(e, "movement_id", "movementId");
  copyIfMissing(e, "created_by_user_id", "createdByUserId");
  return {
    id,
    obligation_id: Number(e.obligation_id),
    event_type: e.event_type as ObligationEventSummary["eventType"],
    event_date: String(e.event_date ?? ""),
    amount: e.amount ?? 0,
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

/** Eventos de una obligación (útil cuando el resumen compartido no trae `events` completos). */
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
      return (data ?? []).map((row: Record<string, unknown>) => ({
        id: Number(row.id),
        workspaceId: Number(row.workspace_id),
        obligationId: Number(row.obligation_id),
        token: String(row.token ?? ""),
        ownerDisplayName: (row.owner_display_name as string) ?? null,
        invitedEmail: String(row.invited_email ?? ""),
        message: (row.message as string) ?? null,
        updatedAt: String(row.updated_at ?? ""),
        obligationTitle: null as string | null,
      }));
    },
  });
}

// ─── Obligation share invite ──────────────────────────────────────────────────

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

export function useCreateObligationShareInviteMutation(workspaceId?: number | null) {
  const queryClient = useQueryClient();
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
          appUrl: null,
        },
      );
      if (!response.ok || !response.shareId || !response.invitedEmail) {
        throw new Error(response.error ?? "No se pudo compartir la obligación.");
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

// ─── Exchange Rates CRUD ───────────────────────────────────────────────────────

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
