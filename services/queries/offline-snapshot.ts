import type { QueryClient } from "@tanstack/react-query";

import { offlineRuntime } from "../../lib/offline/instance";
import { BUDGET_INPUT_TABLES, computeLocalBudgetRows } from "./offline-budgets";
import { isCoreSnapshot } from "./snapshot-cache";
import {
  FREQUENCY_LABELS,
  applyBaseCurrencyToAccounts,
  buildAccountSummaries,
  buildCategorySummaries,
  mapBudget,
  mapCounterpartyFromRow,
  mapRecurringIncome,
  mapSubscription,
  type WorkspaceDeferred,
  type WorkspaceSnapshot,
} from "./workspace-data";

/** Tablas del núcleo del snapshot que se reconstruyen desde la copia local. */
const SNAPSHOT_CATALOG_TABLES = ["accounts", "categories", "counterparties", "subscriptions", "recurring_income"] as const;

export function touchesSnapshotCatalogs(tables: string[]): boolean {
  return tables.some((table) => (SNAPSHOT_CATALOG_TABLES as readonly string[]).includes(table));
}

type Rows = Record<string, unknown>[];

/**
 * Reconstruye cuentas, categorías, contactos, suscripciones e ingresos fijos del snapshot en cache
 * a partir de la base local. Tras escribir sin red no hay refetch posible, y con red el refetch
 * tarda; la copia local ya contiene lo recién guardado. Usa los mismos mapeadores que el servidor.
 *
 * Lo que solo calcula el servidor (resumen financiero de cada contacto) se conserva del cache.
 * Devuelve false si no hay nada que reconstruir (sin base local lista o sin snapshot cacheado).
 */
export async function applyLocalCatalogsToCache(queryClient: QueryClient, workspaceId: number): Promise<boolean> {
  const current = queryClient
    .getQueriesData({ queryKey: ["workspace-snapshot", workspaceId] })
    .map(([, data]) => data)
    .find(isCoreSnapshot) as WorkspaceSnapshot | undefined;
  if (!current) return false;

  const [accountRows, categoryRows, counterpartyRows, subscriptionRows, incomeRows, balances] = await Promise.all([
    offlineRuntime.listRows(workspaceId, "accounts"),
    offlineRuntime.listRows(workspaceId, "categories"),
    offlineRuntime.listRows(workspaceId, "counterparties"),
    offlineRuntime.listRows(workspaceId, "subscriptions"),
    offlineRuntime.listRows(workspaceId, "recurring_income"),
    offlineRuntime.accountBalances(workspaceId),
  ]);
  // Si alguna tabla aún no se descargó, no se mezcla: el cache queda como está.
  if (!accountRows || !categoryRows || !counterpartyRows || !subscriptionRows || !incomeRows || !balances) return false;

  const baseCurrency = (current.workspaces.find((w) => w.id === workspaceId)?.baseCurrencyCode ?? "PEN").toUpperCase();
  const bySort = (a: Rows[number], b: Rows[number]) => Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0);

  const accounts = buildAccountSummaries(
    [...accountRows].sort(bySort) as Rows,
    balances.map((balance) => ({ account_id: balance.accountId, workspace_id: workspaceId, current_balance: balance.currentBalance })),
  );
  applyBaseCurrencyToAccounts(accounts, baseCurrency, current.exchangeRates);

  const categories = buildCategorySummaries(
    [...categoryRows].sort((a, b) => bySort(a, b) || String(a.name ?? "").localeCompare(String(b.name ?? ""))) as Rows,
  );

  const previousById = new Map((current.counterparties ?? []).map((item) => [item.id, item]));
  const counterparties = [...counterpartyRows]
    .sort(
      (a, b) =>
        Number(Boolean(a.is_archived)) - Number(Boolean(b.is_archived)) ||
        Number(Boolean(b.is_pinned)) - Number(Boolean(a.is_pinned)) ||
        String(a.name ?? "").localeCompare(String(b.name ?? "")),
    )
    .map((row) => {
      const mapped = mapCounterpartyFromRow(row as never);
      const previous = previousById.get(mapped.id);
      // Resumen financiero (cobros, pagos, movimientos): solo lo calcula el servidor; se conserva.
      if (!previous) return mapped;
      return {
        ...previous,
        name: mapped.name,
        type: mapped.type,
        isArchived: mapped.isArchived,
        isPinned: mapped.isPinned,
        phone: mapped.phone,
        email: mapped.email,
        documentNumber: mapped.documentNumber,
        notes: mapped.notes,
      };
    });

  const categoryMap = new Map(categories.map((item) => [item.id, item.name]));
  const counterpartyMap = new Map(counterparties.map((item) => [item.id, item.name]));
  const accountMap = new Map(accounts.map((item) => [item.id, item.name]));
  const byDate = (key: string) => (a: Rows[number], b: Rows[number]) => String(a[key] ?? "").localeCompare(String(b[key] ?? ""));
  const subscriptions = [...subscriptionRows]
    .sort(byDate("next_due_date"))
    .map((row) => mapSubscription(row as never, categoryMap, counterpartyMap, accountMap, FREQUENCY_LABELS, baseCurrency, current.exchangeRates));
  const recurringIncome = [...incomeRows]
    .sort(byDate("next_expected_date"))
    .map((row) => mapRecurringIncome(row as never, categoryMap, counterpartyMap, accountMap, FREQUENCY_LABELS, baseCurrency, current.exchangeRates));

  queryClient.setQueriesData<unknown>({ queryKey: ["workspace-snapshot", workspaceId] }, (old: unknown) => {
    if (!isCoreSnapshot(old)) return old;
    return { ...old, accounts, categories, counterparties, subscriptions, recurringIncome };
  });
  return true;
}

/**
 * Sin red no hay refetch: tras escribir un presupuesto o un gasto, la parte diferida del snapshot
 * (presupuestos) se rehace desde la base local. Solo si hay cambios sin enviar; si no, el servidor ya es exacto.
 */
export async function applyLocalBudgetsToCache(queryClient: QueryClient, workspaceId: number): Promise<boolean> {
  const entries = queryClient.getQueriesData({ queryKey: ["workspace-snapshot", workspaceId] }).map(([, data]) => data);
  const core = entries.find(isCoreSnapshot) as WorkspaceSnapshot | undefined;
  if (!core) return false;
  if (!(await offlineRuntime.hasPendingOps(workspaceId, BUDGET_INPUT_TABLES))) return false;
  const rows = await computeLocalBudgetRows(
    workspaceId,
    core.exchangeRates.map((rate) => ({ from_currency_code: rate.fromCurrencyCode, to_currency_code: rate.toCurrencyCode, rate: rate.rate })),
  );
  if (!rows) return false;
  const budgets = rows.map((row) => mapBudget(row as never));
  queryClient.setQueriesData<unknown>({ queryKey: ["workspace-snapshot", workspaceId] }, (old: unknown) => {
    if (!old || isCoreSnapshot(old)) return old;
    return { ...(old as WorkspaceDeferred), budgets };
  });
  return true;
}
