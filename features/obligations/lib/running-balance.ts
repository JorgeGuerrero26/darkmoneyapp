import type { ObligationEventSummary, ObligationEventType } from "../../../types/domain";

/**
 * Cómo mueve el saldo pendiente cada tipo de evento.
 *
 * Es la misma resta que hace `v_obligation_summary`: capital vigente más intereses, comisiones y
 * ajustes, menos descuentos, castigos y pagos.
 */
const SIGN: Record<ObligationEventType, 1 | -1> = {
  opening: 1,
  principal_increase: 1,
  interest: 1,
  fee: 1,
  adjustment: 1,
  principal_decrease: -1,
  discount: -1,
  writeoff: -1,
  payment: -1,
};

const toCents = (amount: number) => Math.round(amount * 100);

/**
 * El saldo que quedó **después** de cada movimiento.
 *
 * Es lo que reemplaza a las dos cápsulas que explicaban el modelo de datos —"los cobros reducen
 * el saldo pendiente", "capital cambia el monto prestado o debido"—: enseñaban vocabulario
 * interno con forma de filtro. Ver el saldo que quedó tras cada movimiento enseña la mecánica
 * sin una sola línea de instrucción.
 *
 * Se calcula hacia adelante, del más viejo al más nuevo, y se devuelve por id de evento para que
 * la lista lo pinte en el orden que quiera.
 */
export function balancesAfterEvents(events: readonly ObligationEventSummary[]): Map<number, number> {
  const oldestFirst = [...events].sort((a, b) => {
    const byDate = a.eventDate.localeCompare(b.eventDate);
    return byDate !== 0 ? byDate : a.id - b.id;
  });

  const balances = new Map<number, number>();
  let runningCents = 0;
  for (const event of oldestFirst) {
    runningCents += SIGN[event.eventType] * toCents(event.amount);
    balances.set(event.id, runningCents / 100);
  }
  return balances;
}
