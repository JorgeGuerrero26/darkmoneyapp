/**
 * De qué saldo arranca una proyección.
 *
 * Existe porque la respuesta parecía obvia y estaba mal en dos sitios a la vez: la sección del
 * dashboard partía del **patrimonio neto** y el asistente del **saldo líquido**, así que la misma
 * proyección daba dos cierres distintos según dónde la miraras — justo lo que un motor compartido
 * debía impedir.
 *
 * Manda el líquido. Una proyección contesta "cuánta plata voy a tener", y lo que está en una
 * cuenta de inversión no es plata que puedas gastar el mes que viene sin deshacer la inversión.
 * El asistente ya tenía esa regla escrita en su prompt; aquí se vuelve una sola definición.
 *
 * Las tarjetas de crédito quedan fuera por la misma razón invertida: su saldo es deuda, no caja.
 * Lo que le deben a la tarjeta entra en la proyección como un pago con fecha, no restando el
 * saldo de partida.
 */

/** Gastable hoy, sin vender ni liquidar nada. */
export const LIQUID_ACCOUNT_TYPES: readonly string[] = ["bank", "cash", "savings"];

export function isLiquidAccount(type: string | null | undefined): boolean {
  return LIQUID_ACCOUNT_TYPES.includes(String(type ?? ""));
}

export type LiquidAccountLike = {
  type?: string | null;
  currencyCode?: string | null;
  currentBalance?: number | null;
  isArchived?: boolean | null;
};

/**
 * Suma de las cuentas gastables, en la moneda que devuelva `convert`.
 *
 * Una cuenta que no se puede convertir suma 0 y se cuenta aparte: asumir 1:1 inventaría plata,
 * y descartarla en silencio la haría desaparecer sin que nadie lo note.
 */
export function liquidBalance(
  accounts: readonly LiquidAccountLike[],
  convert: (amount: number, fromCurrency: string) => number | null,
): { total: number; unconvertedCount: number } {
  let total = 0;
  let unconvertedCount = 0;
  for (const account of accounts) {
    if (account.isArchived) continue;
    if (!isLiquidAccount(account.type)) continue;
    const converted = convert(Number(account.currentBalance ?? 0), String(account.currencyCode ?? ""));
    if (converted === null) unconvertedCount += 1;
    else total += converted;
  }
  return { total, unconvertedCount };
}
