import { useQuery } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "../../lib/supabase";
import type { DashboardMovementRow } from "../../features/dashboard/lib/dashboard-row";
import { dayMovementBounds } from "../../features/dashboard/lib/day-movements-model";

export type DashboardDayMovement = Omit<DashboardMovementRow, "sourceAmount" | "destinationAmount"> & {
  sourceAmount: number | null;
  destinationAmount: number | null;
};

/** Read the complete selected day, not the dashboard's capped 90-day feed. */
export async function fetchDashboardDayMovements(client: Pick<SupabaseClient, "from">, workspaceId: number, day: string, signal?: AbortSignal): Promise<DashboardDayMovement[]> {
  if (!Number.isSafeInteger(workspaceId) || workspaceId <= 0) throw new Error("Espacio inválido.");
  const { from, until } = dayMovementBounds(day);
  const result: DashboardDayMovement[] = [];
  const seenIds = new Set<number>();
  let expectedCount: number | null = null;
  const pageSize = 500;
  for (let offset = 0; ; offset += pageSize) {
    let query = client.from("movements")
      .select("id, movement_type, status, occurred_at, source_amount, destination_amount, source_account_id, destination_account_id, category_id, spend_type_id, counterparty_id, description", { count: "exact" })
      .eq("workspace_id", workspaceId).eq("status", "posted")
      .gte("occurred_at", from).lt("occurred_at", until)
      .order("occurred_at", { ascending: false }).order("id", { ascending: false })
      .range(offset, offset + pageSize - 1);
    if (signal) query = query.abortSignal(signal);
    const { data, error, count } = await query;
    if (error) throw new Error(error.message ?? "No se pudo cargar el día completo.");
    if (!data) throw new Error("No se pudo confirmar el detalle del día.");
    if (signal?.aborted) throw new Error("Consulta cancelada.");
    if (count == null || !Number.isSafeInteger(count) || count < 0) throw new Error("No se pudo confirmar el total del día.");
    if (expectedCount !== null && count !== expectedCount) throw new Error("El día cambió mientras cargaba. Vuelve a consultar.");
    expectedCount = count;
    for (const row of data) {
      if (seenIds.has(row.id)) throw new Error("El día cambió mientras cargaba. Vuelve a consultar.");
      seenIds.add(row.id);
    }
    result.push(...data.map((row): DashboardDayMovement => ({
      id: row.id, movementType: row.movement_type, status: row.status, occurredAt: row.occurred_at,
      sourceAmount: row.source_amount == null ? null : Number(row.source_amount),
      destinationAmount: row.destination_amount == null ? null : Number(row.destination_amount),
      sourceAccountId: row.source_account_id ?? null, destinationAccountId: row.destination_account_id ?? null,
      categoryId: row.category_id ?? null, spendTypeId: row.spend_type_id ?? null,
      counterpartyId: row.counterparty_id ?? null, description: row.description ?? "",
    })));
    if (data.length < pageSize) {
      if (result.length !== expectedCount) throw new Error("No se pudo cargar el día completo.");
      return result;
    }
  }
}

export function useDashboardDayMovementsQuery(workspaceId: number | null, userId: string | null | undefined, day: string | null) {
  return useQuery({
    queryKey: ["dashboard-movements", userId ?? null, workspaceId, "day", day],
    queryFn: ({ signal }) => {
      if (!supabase || !workspaceId || !userId || !day) throw new Error("No se puede consultar este día.");
      return fetchDashboardDayMovements(supabase, workspaceId, day, signal);
    },
    enabled: Boolean(workspaceId && userId && day),
    staleTime: 0,
    retry: 1,
  });
}
