import { movementActsAsIncome, movementIsTransfer } from "../../../lib/movement-amounts";

export type SummarizableMovement = {
  movementType?: string | null;
  sourceAmount?: number | null;
  destinationAmount?: number | null;
  sourceAmountInBaseCurrency?: number | null;
  destinationAmountInBaseCurrency?: number | null;
};

export type MovementsSummary = {
  incomeTotal: number;
  expenseTotal: number;
  incomeCount: number;
  expenseCount: number;
  net: number;
};

/**
 * Lo que entró y lo que salió en los movimientos que se están viendo.
 *
 * **Qué cuenta como entrada la decide `movementActsAsIncome`, no el tipo del movimiento.**
 *
 * Antes la lista era literal: `income` sumaba a lo que entró; `expense`, `obligation_payment` y
 * `subscription_payment` restaban. Pero un `obligation_payment` es el cobro de una deuda cuando
 * a ti te deben —la plata ENTRA— y el pago de una deuda cuando debes tú. La fila lo sabía y
 * pintaba "+ S/ 690.00" en verde; el resumen lo metía en "salió" tomando su `sourceAmount`, que
 * en un cobro es `null`. Resultado: **el cobro de 690 soles no aparecía en ninguno de los dos
 * totales** —sumaba cero a lo que salió— y el neto del mes quedaba 720 soles por debajo,
 * mientras la cabecera del día decía "+ S/ 686.50" dos centímetros más abajo.
 * (Reportado el 2026-08-31; movimientos 1079 y 1080 en producción.)
 *
 * Las transferencias no cuentan: la plata cambia de bolsillo, no se gana ni se pierde. Es la
 * misma regla que usan las cabeceras de día en `group-by-date.ts`.
 *
 * `rate` convierte de la moneda base a la que se está mostrando.
 */
export function summarizeMovements(
  movements: readonly SummarizableMovement[],
  rate = 1,
): MovementsSummary {
  let incomeTotal = 0;
  let expenseTotal = 0;
  let incomeCount = 0;
  let expenseCount = 0;

  for (const movement of movements) {
    if (movementIsTransfer(movement)) continue;
    if (movementActsAsIncome(movement)) {
      const amount = movement.destinationAmountInBaseCurrency
        ?? movement.destinationAmount
        ?? movement.sourceAmountInBaseCurrency
        ?? movement.sourceAmount
        ?? 0;
      incomeTotal += Math.abs(amount) * rate;
      incomeCount += 1;
    } else {
      const amount = movement.sourceAmountInBaseCurrency
        ?? movement.sourceAmount
        ?? movement.destinationAmountInBaseCurrency
        ?? movement.destinationAmount
        ?? 0;
      expenseTotal += Math.abs(amount) * rate;
      expenseCount += 1;
    }
  }

  return { incomeTotal, expenseTotal, incomeCount, expenseCount, net: incomeTotal - expenseTotal };
}
