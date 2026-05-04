import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

import { filterDateFrom, filterDateTo } from "../../lib/date";
import { supabase } from "../../lib/supabase";
import type { BudgetOverview } from "../../types/domain";
import type { BudgetScopedMovement } from "../../lib/budget-metrics";

const PAGE_SIZE = 500;

function buildBudgetScopeKey(budgets: BudgetOverview[]) {
  return budgets
    .map((budget) =>
      [
        budget.id,
        budget.periodStart,
        budget.periodEnd,
        budget.categoryId ?? "all",
        budget.accountId ?? "all",
      ].join(":"),
    )
    .sort()
    .join("|");
}

async function fetchBudgetScopeMovements(
  workspaceId: number,
  periodStart: string,
  periodEnd: string,
): Promise<BudgetScopedMovement[]> {
  if (!supabase) throw new Error("Supabase no está configurado.");

  const rows: BudgetScopedMovement[] = [];
  let page = 0;

  while (true) {
    const from = page * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;
    const { data, error } = await supabase
      .from("movements")
      .select(
        `id, movement_type, occurred_at, description, category_id,
         source_account_id, source_amount, destination_account_id, destination_amount,
         category:categories(name),
         source_account:accounts!movements_source_account_id_fkey(name,currency_code),
         destination_account:accounts!movements_destination_account_id_fkey(name,currency_code)`,
      )
      .eq("workspace_id", workspaceId)
      .eq("status", "posted")
      .gte("occurred_at", filterDateFrom(periodStart))
      .lte("occurred_at", filterDateTo(periodEnd))
      .order("occurred_at", { ascending: false })
      .order("id", { ascending: false })
      .range(from, to);

    if (error) throw new Error(error.message ?? "No se pudieron cargar los movimientos del presupuesto.");

    const pageRows = ((data ?? []) as any[]).map((row): BudgetScopedMovement => ({
      id: row.id,
      movementType: row.movement_type,
      occurredAt: row.occurred_at,
      description: typeof row.description === "string" ? row.description : null,
      categoryId: row.category_id ?? null,
      categoryName: row.category?.name ?? null,
      sourceAccountId: row.source_account_id ?? null,
      sourceAccountName: row.source_account?.name ?? null,
      sourceCurrencyCode: row.source_account?.currency_code ?? null,
      sourceAmount: row.source_amount != null ? Number(row.source_amount) : null,
      destinationAccountId: row.destination_account_id ?? null,
      destinationAccountName: row.destination_account?.name ?? null,
      destinationCurrencyCode: row.destination_account?.currency_code ?? null,
      destinationAmount: row.destination_amount != null ? Number(row.destination_amount) : null,
    }));

    rows.push(...pageRows);
    if (pageRows.length < PAGE_SIZE) break;
    page += 1;
  }

  return rows;
}

export function useBudgetScopeMovementsQuery(
  workspaceId: number | null,
  budgets: BudgetOverview[],
  refreshKey: number,
) {
  const { periodStart, periodEnd, scopeKey } = useMemo(() => {
    if (budgets.length === 0) {
      return { periodStart: null, periodEnd: null, scopeKey: "" };
    }

    let minStart = budgets[0].periodStart;
    let maxEnd = budgets[0].periodEnd;
    for (const budget of budgets) {
      if (budget.periodStart < minStart) minStart = budget.periodStart;
      if (budget.periodEnd > maxEnd) maxEnd = budget.periodEnd;
    }

    return {
      periodStart: minStart,
      periodEnd: maxEnd,
      scopeKey: buildBudgetScopeKey(budgets),
    };
  }, [budgets]);

  return useQuery({
    queryKey: [
      "budget-scope-movements",
      workspaceId,
      periodStart,
      periodEnd,
      scopeKey,
      refreshKey,
    ],
    enabled: Boolean(workspaceId && periodStart && periodEnd && budgets.length > 0),
    staleTime: 30_000,
    placeholderData: (previousData) => previousData,
    queryFn: () => fetchBudgetScopeMovements(workspaceId!, periodStart!, periodEnd!),
  });
}
