import { offlineRuntime } from "./instance";

type BalanceRowLike = { account_id: number; current_balance: unknown };

/**
 * Cuando la base local está lista, los saldos del snapshot salen de ella y no de
 * `v_account_balances`: esa vista no incluye lo que todavía no se envió, y un refetch cualquiera
 * haría saltar el saldo hacia atrás. Sin base local lista devuelve las filas tal cual (comportamiento
 * de siempre). Los saldos locales se comparan con los del servidor en las pruebas de paridad.
 */
export async function withLocalBalanceRows<T extends BalanceRowLike>(workspaceId: number, rows: T[]): Promise<T[]> {
  try {
    const local = await offlineRuntime.accountBalances(workspaceId);
    if (!local) return rows;
    const byId = new Map(local.map((balance) => [balance.accountId, balance.currentBalance]));
    return rows.map((row) => (byId.has(Number(row.account_id)) ? { ...row, current_balance: byId.get(Number(row.account_id)) } : row));
  } catch {
    return rows;
  }
}
