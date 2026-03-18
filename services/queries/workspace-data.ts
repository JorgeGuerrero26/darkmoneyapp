import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { WorkspaceInvitationStatus } from "../../types/domain";

import { supabase } from "../../lib/supabase";
import type { AppProfile } from "../../lib/auth-context";
import type {
  AccountSummary,
  BudgetOverview,
  CategorySummary,
  CounterpartySummary,
  ExchangeRateSummary,
  JsonValue,
  MovementRecord,
  MovementType,
  MovementStatus,
  ObligationOriginType,
  ObligationStatus,
  ObligationSummary,
  ObligationEventSummary,
  SubscriptionFrequency,
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
  current_balance_in_base_currency: NumericLike;
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
  counterparty_name: string | null;
  settlement_account_id: number | null;
  settlement_account_name: string | null;
  currency_code: string;
  principal_amount: NumericLike;
  principal_amount_in_base_currency: NumericLike;
  current_principal_amount: NumericLike;
  current_principal_amount_in_base_currency: NumericLike;
  pending_amount: NumericLike;
  pending_amount_in_base_currency: NumericLike;
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
  installment_label: string;
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
  const obligationEvents: ObligationEventSummary[] = events
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
    }));

  return {
    id: row.id,
    workspaceId: row.workspace_id,
    title: row.title,
    direction: row.direction,
    originType: row.origin_type,
    counterparty:
      row.counterparty_name ??
      (row.counterparty_id ? counterpartyMap.get(row.counterparty_id) ?? "" : ""),
    counterpartyId: row.counterparty_id,
    settlementAccountId: row.settlement_account_id,
    settlementAccountName: row.settlement_account_name,
    status: row.status,
    currencyCode: row.currency_code,
    principalAmount: toNum(row.principal_amount),
    principalAmountInBaseCurrency: toNum(row.principal_amount_in_base_currency),
    currentPrincipalAmount: toNum(row.current_principal_amount),
    currentPrincipalAmountInBaseCurrency: toNum(
      row.current_principal_amount_in_base_currency,
    ),
    pendingAmount: toNum(row.pending_amount),
    pendingAmountInBaseCurrency: toNum(row.pending_amount_in_base_currency),
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
    installmentLabel: row.installment_label,
    events: obligationEvents,
  };
}

function mapSubscription(
  row: SubscriptionRow,
  categoryMap: Map<number, string>,
  counterpartyMap: Map<number, string>,
  accountMap: Map<number, string>,
  frequencyLabels: Record<SubscriptionFrequency, string>,
): SubscriptionSummary {
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
    amount: toNum(row.amount),
    currencyCode: row.currency_code,
    frequency: row.frequency,
    frequencyLabel: frequencyLabels[row.frequency] ?? row.frequency,
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
  categories: (CategorySummary & { isSystem: boolean })[];
  budgets: BudgetOverview[];
  obligations: ObligationSummary[];
  subscriptions: SubscriptionSummary[];
  counterparties: CounterpartySummary[];
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
    obligationEventsResult,
    subscriptionsResult,
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
      .select("account_id, workspace_id, current_balance, current_balance_in_base_currency")
      .eq("workspace_id", activeWorkspaceId),
    supabase
      .from("categories")
      .select("id, workspace_id, name, kind, parent_id, color, icon, sort_order, is_system, is_active, created_at, updated_at")
      .eq("workspace_id", activeWorkspaceId)
      .eq("is_active", true)
      .order("sort_order", { ascending: true }),
    supabase
      .from("v_budget_progress")
      .select("id, workspace_id, created_by_user_id, updated_by_user_id, name, period_start, period_end, currency_code, category_id, category_name, account_id, account_name, scope_kind, scope_label, limit_amount, spent_amount, remaining_amount, used_percent, alert_percent, movement_count, rollover_enabled, notes, is_active, is_near_limit, is_over_limit, created_at, updated_at")
      .eq("workspace_id", activeWorkspaceId)
      .eq("is_active", true),
    supabase
      .from("counterparties")
      .select("id, workspace_id, name, type, is_archived")
      .eq("workspace_id", activeWorkspaceId)
      .eq("is_archived", false)
      .order("name", { ascending: true }),
    supabase
      .from("v_obligation_summary")
      .select("id, workspace_id, direction, origin_type, status, title, counterparty_id, counterparty_name, settlement_account_id, settlement_account_name, currency_code, principal_amount, principal_amount_in_base_currency, current_principal_amount, current_principal_amount_in_base_currency, pending_amount, pending_amount_in_base_currency, progress_percent, start_date, due_date, installment_amount, installment_count, interest_rate, description, notes, payment_count, last_payment_date, installment_label")
      .eq("workspace_id", activeWorkspaceId)
      .in("status", ["active", "draft"]),
    supabase
      .from("obligation_events")
      .select("id, obligation_id, event_type, event_date, amount, installment_no, reason, description, notes, movement_id, created_by_user_id, metadata")
      .eq("workspace_id", activeWorkspaceId),
    supabase
      .from("subscriptions")
      .select("id, workspace_id, name, vendor_party_id, account_id, category_id, currency_code, amount, frequency, interval_count, day_of_month, day_of_week, start_date, next_due_date, end_date, status, remind_days_before, auto_create_movement, description, notes")
      .eq("workspace_id", activeWorkspaceId)
      .eq("status", "active")
      .order("next_due_date", { ascending: true }),
    supabase
      .from("v_latest_exchange_rates")
      .select("from_currency_code, to_currency_code, rate, effective_at"),
  ]);

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

  const categoryMap = new Map<number, string>();
  const categories: (CategorySummary & { isSystem: boolean })[] = (categoriesResult.data ?? []).map((row: any) => {
    categoryMap.set(row.id, row.name);
    return {
      id: row.id,
      name: row.name,
      kind: row.kind,
      isActive: row.is_active,
      isSystem: row.is_system ?? false,
    };
  });

  const counterpartyMap = new Map<number, string>();
  const counterparties: CounterpartySummary[] = (counterpartiesResult.data ?? []).map(
    (row: any) => {
      counterpartyMap.set(row.id, row.name);
      return {
        id: row.id,
        name: row.name,
        type: row.type,
        isArchived: row.is_archived,
      };
    },
  );

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
      currentBalanceInBaseCurrency: toNum(balance?.current_balance_in_base_currency ?? null),
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

  const obligationEventRows = (obligationEventsResult.data ?? []) as ObligationEventRow[];
  const obligations: ObligationSummary[] = (obligationsResult.data ?? []).map((row: any) =>
    mapObligation(row as ObligationSummaryRow, obligationEventRows, counterpartyMap),
  );

  const subscriptions: SubscriptionSummary[] = (subscriptionsResult.data ?? []).map(
    (row: any) =>
      mapSubscription(
        row as SubscriptionRow,
        categoryMap,
        counterpartyMap,
        accountMap,
        FREQUENCY_LABELS,
      ),
  );

  const exchangeRates: ExchangeRateSummary[] = (exchangeRatesResult.data ?? []).map(
    (row: any) => ({
      fromCurrencyCode: (row as ExchangeRateRow).from_currency_code,
      toCurrencyCode: (row as ExchangeRateRow).to_currency_code,
      rate: toNum((row as ExchangeRateRow).rate),
      effectiveAt: (row as ExchangeRateRow).effective_at,
    }),
  );

  return {
    workspaces,
    accounts,
    categories,
    budgets,
    obligations,
    subscriptions,
    counterparties,
    exchangeRates,
  };
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
    metadata: input.metadata ?? null,
  };

  const { data, error } = await supabase
    .from("movements")
    .insert(payload)
    .select(
      "id, workspace_id, movement_type, status, occurred_at, description, notes, source_account_id, source_amount, destination_account_id, destination_amount, fx_rate, category_id, counterparty_id, obligation_id, subscription_id, metadata",
    )
    .single();

  if (error) throw error;
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
        })
        .select("id")
        .single();
      if (error) throw error;
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
          include_in_net_worth: input.includeInNetWorth,
          color: input.color,
          icon: input.icon,
        })
        .eq("id", id)
        .eq("workspace_id", workspaceId);
      if (error) throw error;
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
      if (error) throw error;
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
      if (error) throw error;
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
      if (error) throw error;
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
      if (error) throw error;
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
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["workspace-snapshot"] });
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
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["workspace-snapshot"] });
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
      if (error) throw error;
      return data as { id: number };
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["workspace-snapshot"] });
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
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["workspace-snapshot"] });
    },
  });
}

export type ObligationPaymentInput = {
  obligationId: number;
  amount: number;
  paymentDate: string;
  accountId?: number | null;
  notes?: string | null;
  createMovement: boolean;
};

export function useCreateObligationPaymentMutation(workspaceId: number | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: ObligationPaymentInput) => {
      if (!supabase || !workspaceId) throw new Error("Workspace no disponible.");
      // Register as obligation_event of type "payment"
      const { data, error } = await supabase
        .from("obligation_events")
        .insert({
          obligation_id: input.obligationId,
          event_type: "payment",
          event_date: input.paymentDate,
          amount: input.amount,
          notes: input.notes ?? null,
        })
        .select("id")
        .single();
      if (error) throw error;
      // If requested, also create a movement linked to this obligation
      if (input.createMovement && input.accountId) {
        const { error: mvErr } = await supabase
          .from("movements")
          .insert({
            workspace_id: workspaceId,
            movement_type: "obligation_payment",
            status: "posted",
            occurred_at: new Date(input.paymentDate).toISOString(),
            description: `Pago obligación #${input.obligationId}`,
            source_account_id: input.accountId,
            source_amount: input.amount,
            obligation_id: input.obligationId,
          });
        if (mvErr) throw mvErr;
      }
      return data as { id: number };
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["workspace-snapshot"] });
      void queryClient.invalidateQueries({ queryKey: ["movements"] });
    },
  });
}

// ─── Subscription mutations ───────────────────────────────────────────────────

export type SubscriptionFormInput = {
  name: string;
  vendor?: string | null;
  vendorPartyId?: number | null;
  accountId?: number | null;
  categoryId?: number | null;
  amount: number;
  currencyCode: string;
  frequency: "daily" | "weekly" | "monthly" | "quarterly" | "yearly" | "custom";
  intervalCount: number;
  dayOfMonth?: number | null;
  startDate: string;
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
      const { data, error } = await supabase
        .from("subscriptions")
        .insert({
          workspace_id: workspaceId,
          name: input.name,
          vendor: input.vendor ?? null,
          vendor_party_id: input.vendorPartyId ?? null,
          account_id: input.accountId ?? null,
          category_id: input.categoryId ?? null,
          amount: input.amount,
          currency_code: input.currencyCode,
          frequency: input.frequency,
          interval_count: input.intervalCount,
          day_of_month: input.dayOfMonth ?? null,
          start_date: input.startDate,
          end_date: input.endDate ?? null,
          remind_days_before: input.remindDaysBefore,
          auto_create_movement: input.autoCreateMovement,
          description: input.description ?? null,
          notes: input.notes ?? null,
          status: "active",
        })
        .select("id")
        .single();
      if (error) throw error;
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
      if (input.vendor !== undefined) payload.vendor = input.vendor;
      if (input.accountId !== undefined) payload.account_id = input.accountId;
      if (input.categoryId !== undefined) payload.category_id = input.categoryId;
      if (input.amount !== undefined) payload.amount = input.amount;
      if (input.currencyCode !== undefined) payload.currency_code = input.currencyCode;
      if (input.frequency !== undefined) payload.frequency = input.frequency;
      if (input.intervalCount !== undefined) payload.interval_count = input.intervalCount;
      if (input.dayOfMonth !== undefined) payload.day_of_month = input.dayOfMonth;
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
      if (error) throw error;
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
      const { error } = await supabase
        .from("subscriptions")
        .delete()
        .eq("id", id)
        .eq("workspace_id", workspaceId);
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["workspace-snapshot"] });
    },
  });
}

// ─── Category mutations ───────────────────────────────────────────────────────

export type CategoryFormInput = {
  name: string;
  kind: "expense" | "income" | "both";
  parentId?: number | null;
  color?: string | null;
  icon?: string | null;
};

export function useCreateCategoryMutation(workspaceId: number | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: CategoryFormInput) => {
      if (!supabase || !workspaceId) throw new Error("Workspace no disponible.");
      const { data, error } = await supabase
        .from("categories")
        .insert({
          workspace_id: workspaceId,
          name: input.name,
          kind: input.kind,
          parent_id: input.parentId ?? null,
          color: input.color ?? null,
          icon: input.icon ?? null,
          is_active: true,
          is_system: false,
        })
        .select("id")
        .single();
      if (error) throw error;
      return data as { id: number };
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["workspace-snapshot"] });
    },
  });
}

export function useUpdateCategoryMutation(workspaceId: number | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, input }: { id: number; input: Partial<CategoryFormInput> & { isActive?: boolean } }) => {
      if (!supabase || !workspaceId) throw new Error("Workspace no disponible.");
      const payload: Record<string, unknown> = {};
      if (input.name !== undefined) payload.name = input.name;
      if (input.kind !== undefined) payload.kind = input.kind;
      if (input.color !== undefined) payload.color = input.color;
      if (input.icon !== undefined) payload.icon = input.icon;
      if (input.isActive !== undefined) payload.is_active = input.isActive;
      const { error } = await supabase
        .from("categories")
        .update(payload)
        .eq("id", id)
        .eq("workspace_id", workspaceId);
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["workspace-snapshot"] });
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
      if (error) throw error;
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
      if (error) throw error;
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
        .select("id, title, body, status, scheduled_for, kind, channel, read_at")
        .eq("user_id", userId)
        .order("scheduled_for", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []).map((row: any) => ({
        id: row.id,
        title: row.title,
        body: row.body,
        status: row.status,
        scheduledFor: row.scheduled_for,
        kind: row.kind,
        channel: row.channel,
        readAt: row.read_at,
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
      if (error) throw error;
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
      if (error) throw error;
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
  if (error) throw error;
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
      if (workspaceId) {
        void queryClient.invalidateQueries({ queryKey: ["obligation-shares", workspaceId] });
      }
    },
  });
}
