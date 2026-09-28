/**
 * La segunda línea del aviso al crear o editar una cuenta: "Cuenta Sueldo · S/ 35.29".
 *
 * El aviso decía solo "Cuenta actualizada" y la píldora quedaba medio vacía; además no decía a
 * qué cuenta ni con cuánto quedó, que es lo que uno quiere comprobar. Mismo formato que "Gasto
 * guardado · detalle · monto" (describeSavedMovement).
 *
 * **El saldo que se muestra es el de después de guardar.** En la base, el saldo actual es
 * `saldo inicial + entradas − salidas` (v_account_balances), así que si la edición tocó el saldo
 * inicial, el actual se mueve exactamente esa diferencia. Usar el de antes mostraría una cifra
 * que la cuenta ya no tiene.
 */
export function describeSavedAccount({
  name,
  currencyCode,
  openingBalance,
  previous,
  formatAmount,
}: {
  name: string;
  currencyCode: string;
  openingBalance: number;
  /** La cuenta tal como estaba antes de editarla; ausente al crear. */
  previous?: { openingBalance: number; currentBalance: number } | null;
  formatAmount: (amount: number, currency: string) => string;
}): string {
  const balance = previous
    ? previous.currentBalance + (openingBalance - previous.openingBalance)
    : openingBalance;
  return `${name} · ${formatAmount(balance, currencyCode)}`;
}
