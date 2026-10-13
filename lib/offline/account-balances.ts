import type { LocalAccountBalance } from "./movement-store";

type AccountLike = {
  id: number;
  currencyCode: string;
  currentBalance: number;
  currentBalanceInBaseCurrency?: number | null;
};

/**
 * Sustituye los saldos que vienen del servidor por los calculados con el espejo local.
 *
 * Mientras haya cambios sin enviar, el saldo del servidor no los incluye, y cualquier refetch
 * (volver a la app, cambiar de módulo) haría "saltar" el saldo hacia atrás. El saldo local suma
 * lo mismo que el servidor más lo pendiente, así que es siempre el correcto.
 *
 * El valor en moneda base conserva la tasa implícita que ya traía la cuenta; si no hay forma de
 * conocerla (saldo en cero y otra moneda), se deja como estaba y lo corrige el siguiente refetch.
 */
export function overlayBalancesOnAccounts<T extends AccountLike>(
  accounts: T[],
  balances: LocalAccountBalance[],
  baseCurrency: string,
): T[] {
  const byId = new Map(balances.map((balance) => [balance.accountId, balance.currentBalance]));
  return accounts.map((account) => {
    const next = byId.get(account.id);
    if (next === undefined || next === account.currentBalance) return account;

    let nextBase = account.currentBalanceInBaseCurrency;
    if (account.currencyCode === baseCurrency) {
      nextBase = next;
    } else if (account.currentBalance !== 0 && account.currentBalanceInBaseCurrency != null) {
      const rate = account.currentBalanceInBaseCurrency / account.currentBalance;
      nextBase = Math.round(next * rate * 100) / 100;
    }
    return { ...account, currentBalance: next, currentBalanceInBaseCurrency: nextBase };
  });
}
