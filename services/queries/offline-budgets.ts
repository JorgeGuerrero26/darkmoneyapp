import { selectBudgetProgress } from "../../features/budgets/lib/offlineBudgetProgress";
import { offlineRuntime } from "../../lib/offline/instance";

type Row = Record<string, unknown>;
export type RateRow = { from_currency_code: string; to_currency_code: string; rate: number | string };

/** Tablas cuyo cambio sin enviar vuelve incierto el número que calcula el servidor. */
export const BUDGET_INPUT_TABLES = ["budgets", "movements", "categories", "accounts", "spend_types"];

/**
 * Presupuestos con su avance calculado en el teléfono (réplica de `v_budget_progress`, paridad
 * verificada con datos reales). null = no se puede con certeza (alguna tabla sin descargar, zona
 * horaria distinta de UTC, fracción de centavo, tasa ambigua…): quien llama conserva el valor del servidor.
 */
export async function computeLocalBudgetRows(workspaceId: number, rates: RateRow[]): Promise<Row[] | null> {
  const [budgets, movements, accounts, categories, spendTypes] = await Promise.all(
    ["budgets", "movements", "accounts", "categories", "spend_types"].map((table) =>
      offlineRuntime.listRows(workspaceId, table as "budgets").catch(() => null),
    ),
  );
  if (!budgets || !movements || !accounts || !categories || !spendTypes) return null;
  const result = selectBudgetProgress(
    { enabled: true, hydrated: true, parityVerified: true, serverEffectsPending: false },
    {
      workspaceId,
      serverTimeZone: "UTC",
      budgets,
      movements,
      accounts,
      categories,
      spendTypes,
      rates: rates as unknown as Row[],
    },
    [],
  );
  if (result.source !== "local") return null;
  // Como la consulta del servidor: solo los períodos activos.
  return result.value.filter((row) => row.is_active === true);
}

/**
 * Lo que el servidor devuelve para los presupuestos, salvo que haya cambios sin enviar que lo dejen
 * desfasado (un presupuesto o un gasto nuevo): entonces se calcula con la copia local.
 * `loadRates` solo se llama si hace falta; si falla, se conserva el valor del servidor.
 */
export async function withLocalBudgetRows<T>(workspaceId: number, serverRows: T[], loadRates: () => Promise<RateRow[]>): Promise<T[]> {
  try {
    if (!(await offlineRuntime.hasPendingOps(workspaceId, BUDGET_INPUT_TABLES))) return serverRows;
    const local = await computeLocalBudgetRows(workspaceId, await loadRates());
    return (local as unknown as T[] | null) ?? serverRows;
  } catch {
    return serverRows;
  }
}
