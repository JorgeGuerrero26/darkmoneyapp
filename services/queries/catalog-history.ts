import type { SupabaseClient } from "@supabase/supabase-js";

import { offlineRuntime } from "../../lib/offline/instance";
import { collapseSubscriptionPaymentRows } from "./subscription-payment-rows";

export type CatalogMovementRow = {
  workspace_id: number; created_by_user_id?: string | null; metadata?: unknown;
  id: number; category_id: number | null; subscription_id: number | null; counterparty_id: number | null;
  movement_type: string; status: string; occurred_at: string;
  source_amount: number | string | null; destination_amount: number | string | null;
  source_account_id: number | null; destination_account_id: number | null;
};

/** A failed page must fail the query, never turn a partial history into a total. */
export async function fetchAllPages<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
  pageSize = 500,
): Promise<T[]> {
  const rows: T[] = [];
  for (let offset = 0; ; offset += pageSize) {
    const result = await page(offset, offset + pageSize - 1);
    if (result.error) throw result.error;
    const batch = result.data ?? [];
    rows.push(...batch);
    if (batch.length < pageSize) return rows;
  }
}

export async function fetchCatalogMovementRows(
  client: SupabaseClient,
  workspaceId: number,
  column: "category_id" | "subscription_id" | "counterparty_id",
  postedOnly = true,
) {
  // Modo sin conexión (beta): con la copia local lista, el historial sale de ella, así que incluye lo
  // que todavía no se envió. Mismo filtro y mismo orden que la consulta de abajo.
  const local = await offlineRuntime.listRows(workspaceId, "movements").catch(() => null);
  if (local) {
    if (column === "subscription_id" && postedOnly) {
      return { data: collapseSubscriptionPaymentRows(local, workspaceId) as unknown as CatalogMovementRow[], error: null };
    }
    const rows = local
      .filter((row) => row[column] != null && (!postedOnly || row.status === "posted"))
      .sort(
        (a, b) =>
          String(b.occurred_at ?? "").localeCompare(String(a.occurred_at ?? "")) || Number(b.id) - Number(a.id),
      );
    return { data: rows as unknown as CatalogMovementRow[], error: null };
  }
  const fields = "id, workspace_id, created_by_user_id, metadata, category_id, subscription_id, counterparty_id, movement_type, status, occurred_at, source_amount, destination_amount, source_account_id, destination_account_id";
  const data = await fetchAllPages<CatalogMovementRow>((from, to) => {
    let query = client.from("movements")
      .select(fields)
      .eq("workspace_id", workspaceId).not(column, "is", null);
    if (postedOnly) query = query.eq("status", "posted");
    return query.order("occurred_at", { ascending: false })
      .order("id", { ascending: false }).range(from, to);
  });
  if (column === "subscription_id" && postedOnly) {
    if (data.some(row=>row.workspace_id!==workspaceId)) throw new Error("El historial no pertenece al espacio consultado.");
    if (new Set(data.map(row=>row.id)).size !== data.length) throw new Error("El historial contiene filas repetidas. Actualiza antes de usar sus totales.");
    const groups = [...new Set(data.map(row => {
      const meta = row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
        ? row.metadata as Record<string, unknown> : {};
      return typeof meta.split_group === "string" && meta.split_group.trim() ? meta.split_group : null;
    }).filter((group): group is string => group !== null))];
    const complete = new Map(data.map(row => [row.id,row]));
    for (let offset = 0; offset < groups.length; offset += 40) {
      const batchGroups = groups.slice(offset,offset+40);
      const groupRows = await fetchAllPages<CatalogMovementRow>((from,to) => client.from("movements")
        .select(fields).eq("workspace_id",workspaceId).in("metadata->>split_group",batchGroups)
        .order("id",{ascending:true}).range(from,to));
      if (new Set(groupRows.map(row=>row.id)).size !== groupRows.length) throw new Error("La división cambió durante la lectura. Actualiza para confirmar el total.");
      const returned = new Set(groupRows.map(row=>row.id));
      if (data.some(row=>batchGroups.includes((row.metadata as Record<string,unknown>)?.split_group as string) && !returned.has(row.id))) {
        throw new Error("La división ya no está disponible completa. Actualiza para confirmar el historial.");
      }
      for (const row of groupRows) {
        if (row.workspace_id !== workspaceId || !batchGroups.includes((row.metadata as Record<string,unknown>)?.split_group as string)) {
          throw new Error("La respuesta del historial no pertenece al grupo y espacio consultados.");
        }
        const old=complete.get(row.id);
        if (old && JSON.stringify(old) !== JSON.stringify(row)) throw new Error("El historial cambió durante la lectura. Actualiza para confirmar el total.");
        complete.set(row.id,row);
      }
    }
    return { data: collapseSubscriptionPaymentRows([...complete.values()], workspaceId) as unknown as CatalogMovementRow[], error: null };
  }
  return { data, error: null };
}
