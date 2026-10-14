import type { SupabaseClient } from "@supabase/supabase-js";

import { offlineRuntime } from "../../lib/offline/instance";

export type CatalogMovementRow = {
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
    const rows = local
      .filter((row) => row[column] != null && (!postedOnly || row.status === "posted"))
      .sort(
        (a, b) =>
          String(b.occurred_at ?? "").localeCompare(String(a.occurred_at ?? "")) || Number(b.id) - Number(a.id),
      );
    return { data: rows as unknown as CatalogMovementRow[], error: null };
  }
  const data = await fetchAllPages<CatalogMovementRow>((from, to) => {
    let query = client.from("movements")
      .select("id, category_id, subscription_id, counterparty_id, movement_type, status, occurred_at, source_amount, destination_amount, source_account_id, destination_account_id")
      .eq("workspace_id", workspaceId).not(column, "is", null);
    if (postedOnly) query = query.eq("status", "posted");
    return query.order("occurred_at", { ascending: false })
      .order("id", { ascending: false }).range(from, to);
  });
  return { data, error: null };
}
