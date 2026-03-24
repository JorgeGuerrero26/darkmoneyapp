import { useInfiniteQuery, useQuery } from "@tanstack/react-query";

import { supabase } from "../../lib/supabase";
import { MOVEMENTS_PAGE_SIZE } from "../../constants/config";
import { filterDateFrom, filterDateTo } from "../../lib/date";
import type { MovementRecord, MovementStatus, MovementType } from "../../types/domain";

export type MovementFilters = {
  type?: MovementType;
  status?: MovementStatus;
  accountId?: number;
  categoryId?: number;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
};

type MovementPage = {
  data: MovementRecord[];
  hasMore: boolean;
  nextPage: number;
};

async function fetchMovementsPage(
  workspaceId: number,
  page: number,
  filters: MovementFilters,
): Promise<MovementPage> {
  if (!supabase) throw new Error("Supabase no está configurado.");

  const from = page * MOVEMENTS_PAGE_SIZE;
  const to = from + MOVEMENTS_PAGE_SIZE - 1;

  let query = supabase
    .from("movements")
    .select(
      "id, workspace_id, movement_type, status, occurred_at, description, notes, source_account_id, source_amount, destination_account_id, destination_amount, fx_rate, category_id, counterparty_id, obligation_id, subscription_id, metadata",
    )
    .eq("workspace_id", workspaceId)
    .order("occurred_at", { ascending: false })
    .order("id", { ascending: false })
    .range(from, to);

  if (filters.type) query = query.eq("movement_type", filters.type);
  if (filters.status) query = query.eq("status", filters.status);
  if (filters.dateFrom) query = query.gte("occurred_at", filterDateFrom(filters.dateFrom));
  if (filters.dateTo) query = query.lte("occurred_at", filterDateTo(filters.dateTo));
  if (filters.accountId) {
    query = query.or(
      `source_account_id.eq.${filters.accountId},destination_account_id.eq.${filters.accountId}`,
    );
  }
  if (filters.categoryId) query = query.eq("category_id", filters.categoryId);
  if (filters.search) {
    query = query.ilike("description", `%${filters.search}%`);
  }

  const { data, error } = await query;

  if (error) throw error;

  const rows = (data ?? []) as any[];
  const records: MovementRecord[] = rows.map((row) => ({
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
    sourceAmount: row.source_amount ? Number(row.source_amount) : null,
    destinationAccountId: row.destination_account_id,
    destinationAccountName: null,
    destinationAmount: row.destination_amount ? Number(row.destination_amount) : null,
    fxRate: row.fx_rate ? Number(row.fx_rate) : null,
    obligationId: row.obligation_id,
    subscriptionId: row.subscription_id,
    metadata: row.metadata,
  }));

  return {
    data: records,
    hasMore: records.length === MOVEMENTS_PAGE_SIZE,
    nextPage: page + 1,
  };
}

export function useMovementQuery(movementId?: number | null) {
  return useQuery({
    queryKey: ["movement", movementId],
    queryFn: async () => {
      if (!supabase) throw new Error("Supabase no está configurado.");
      const { data, error } = await supabase
        .from("movements")
        .select(
          `id, workspace_id, movement_type, status, occurred_at, description, notes,
           source_account_id, source_amount, destination_account_id, destination_amount,
           fx_rate, category_id, counterparty_id, obligation_id, subscription_id, metadata,
           source_account:accounts!movements_source_account_id_fkey(name),
           destination_account:accounts!movements_destination_account_id_fkey(name),
           category:categories(name),
           counterparty:counterparties(name)`,
        )
        .eq("id", movementId!)
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
        category: row.category?.name ?? "",
        categoryId: row.category_id,
        counterparty: row.counterparty?.name ?? "",
        counterpartyId: row.counterparty_id,
        occurredAt: row.occurred_at,
        sourceAccountId: row.source_account_id,
        sourceAccountName: row.source_account?.name ?? null,
        sourceAmount: row.source_amount ? Number(row.source_amount) : null,
        destinationAccountId: row.destination_account_id,
        destinationAccountName: row.destination_account?.name ?? null,
        destinationAmount: row.destination_amount ? Number(row.destination_amount) : null,
        fxRate: row.fx_rate ? Number(row.fx_rate) : null,
        obligationId: row.obligation_id,
        subscriptionId: row.subscription_id,
        metadata: row.metadata,
      } as MovementRecord;
    },
    enabled: Boolean(movementId),
    staleTime: 30_000,
  });
}

export function usePaginatedMovements(
  workspaceId?: number | null,
  filters: MovementFilters = {},
  /** Incluir en la clave para no reutilizar caché de otro usuario con el mismo workspaceId */
  userScopeKey?: string | null,
) {
  return useInfiniteQuery({
    queryKey: ["movements", userScopeKey ?? null, workspaceId, filters],
    queryFn: ({ pageParam = 0 }) =>
      fetchMovementsPage(workspaceId!, pageParam as number, filters),
    initialPageParam: 0,
    getNextPageParam: (lastPage) =>
      lastPage.hasMore ? lastPage.nextPage : undefined,
    enabled: Boolean(workspaceId),
    staleTime: 30_000,
  });
}
