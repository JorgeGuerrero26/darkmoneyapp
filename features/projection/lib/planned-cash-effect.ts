/**
 * Qué le hace a la caja un movimiento planificado.
 *
 * Una transferencia no es ni ingreso ni gasto, y tratarla como uno u otro rompía la proyección en
 * sentidos opuestos: el dashboard la restaba como gasto aunque fuera entre dos cuentas propias, y
 * el asistente la sumaba como ingreso. Lo que importa es si el dinero **sale de la caja** o
 * **vuelve a ella**:
 *
 * - de una cuenta líquida a una de inversión, préstamo u otra: sale (el aporte mensual a un fondo
 *   es plata que ya no se puede gastar);
 * - de una de esas a una líquida: vuelve;
 * - entre dos líquidas, o entre dos que no lo son: no cambia la caja;
 * - hacia una tarjeta de crédito: no se cuenta aquí. El pago de la tarjeta ya sale en su día de
 *   pago desde el ciclo de la tarjeta, y contarlo de nuevo lo restaría dos veces.
 *
 * Si no se conoce el tipo de alguna de las dos cuentas, no se inventa un efecto: devuelve null.
 *
 * Existe una copia en `supabase/functions/_shared/cashflow-calendar.ts` que el test de paridad
 * mantiene idéntica.
 */
import {
  movementActsAsIncome,
  movementDisplayAccountId,
  movementDisplayAmount,
  movementIsTransfer,
} from "../../../lib/movement-amounts";
import { isLiquidAccount } from "./liquid-balance";

type PlannedLike = {
  movementType?: string | null;
  sourceAmount?: number | null;
  destinationAmount?: number | null;
  sourceAccountId?: number | null;
  destinationAccountId?: number | null;
};

export type PlannedCashEffect = {
  /** Positivo entra a la caja, negativo sale. */
  signedAmount: number;
  /** La cuenta cuya moneda es la del monto. */
  accountId: number | null;
};

export function plannedCashEffect(
  movement: PlannedLike,
  accountTypeById: ReadonlyMap<number, string | null | undefined>,
): PlannedCashEffect | null {
  if (!movementIsTransfer(movement)) {
    const income = movementActsAsIncome(movement);
    return {
      signedAmount: movementDisplayAmount(movement) * (income ? 1 : -1),
      accountId: movementDisplayAccountId(movement),
    };
  }

  const sourceId = movement.sourceAccountId ?? null;
  const destinationId = movement.destinationAccountId ?? null;
  if (sourceId == null || destinationId == null) return null;
  const sourceType = accountTypeById.get(sourceId);
  const destinationType = accountTypeById.get(destinationId);
  if (sourceType == null || destinationType == null) return null;
  if (sourceType === "credit_card" || destinationType === "credit_card") return null;

  const sourceLiquid = isLiquidAccount(sourceType);
  const destinationLiquid = isLiquidAccount(destinationType);
  if (sourceLiquid && !destinationLiquid) {
    const amount = Math.abs(Number(movement.sourceAmount ?? movement.destinationAmount ?? 0));
    return { signedAmount: -amount, accountId: sourceId };
  }
  if (!sourceLiquid && destinationLiquid) {
    const amount = Math.abs(Number(movement.destinationAmount ?? movement.sourceAmount ?? 0));
    return { signedAmount: amount, accountId: destinationId };
  }
  return null;
}
