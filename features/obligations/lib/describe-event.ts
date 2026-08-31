import type { ObligationEventSummary } from "../../../types/domain";
import { ANALYTICS_EVENT_LABELS } from "./obligationEventLabels";

export type EventDescription = {
  /** Lo que identifica la fila: el concepto que el usuario escribió. */
  title: string;
  /** El dato secundario: la referencia de un pago, o hacia dónde movió la deuda. */
  detail: string | null;
  /** El título es un marcador de dato faltante, no algo que el usuario escribió. */
  missingDescription: boolean;
  /** El movimiento reduce lo que queda por cobrar o pagar. Es lo que decide el signo. */
  reduces: boolean;
};

const REDUCING = new Set(["payment", "principal_decrease", "discount", "writeoff"]);

/**
 * Cómo se lee un movimiento de una obligación. Una sola regla para la lista corta, la completa
 * y el PDF.
 *
 * **El concepto va siempre en el título.** "Reducción de capital · Préstamo canon M50" y "Viper
 * V3 Pro · venta" eran el mismo tipo de dato titulado de dos maneras opuestas: uno con el nombre
 * del mecanismo arriba, el otro con el concepto. El concepto es lo que identifica la fila —es lo
 * que el PDF imprime—, así que manda; el mecanismo, cuando importa, baja al subtítulo.
 *
 * Y el mecanismo se dice en lo que le pasa a la deuda —"le debe más", "le debe menos"—, no con
 * el vocabulario del sistema: "capital" sale, igual que salió "principal".
 */
export function describeObligationEvent(
  event: ObligationEventSummary,
  options: { sellsOnCredit: boolean; isReceivable: boolean },
): EventDescription {
  const description = event.description?.trim() || event.reason?.trim() || null;
  const reduces = REDUCING.has(event.eventType);

  if (event.eventType === "opening") {
    return {
      title: options.sellsOnCredit ? "Primera venta" : "Apertura del registro",
      detail: description,
      missingDescription: false,
      reduces: false,
    };
  }

  /**
   * Los pagos conservan su etiqueta: el monto solo no dice si entró o se perdonó, y su
   * referencia —"para completar los 690"— es lo que baja al subtítulo.
   *
   * El número de cuota se retira. En una cuenta donde se paga 330, 580, 30, 350, 450 y 690 no
   * describe nada: el pago del 31 de julio era "Cuota 6" y el del 19, doce días antes, "Cuota 7".
   */
  if (event.eventType === "payment") {
    return {
      title: options.isReceivable ? "Pago recibido" : "Pago realizado",
      detail: description,
      missingDescription: false,
      reduces: true,
    };
  }

  const owesMore = reduces ? "le debe menos" : "le debe más";
  const mechanism = options.isReceivable ? owesMore : (reduces ? "debes menos" : "debes más");

  if (description) {
    return { title: description, detail: mechanism, missingDescription: false, reduces };
  }

  if (event.eventType === "principal_increase") {
    return {
      title: options.sellsOnCredit ? "Venta sin descripción" : "Aumento sin descripción",
      detail: mechanism,
      missingDescription: true,
      reduces: false,
    };
  }

  return {
    title: ANALYTICS_EVENT_LABELS[event.eventType] ?? event.eventType,
    detail: mechanism,
    missingDescription: false,
    reduces,
  };
}

/**
 * El neto de un grupo de movimientos, **con signo**.
 *
 * La cabecera del 19 de julio decía "+ S/ 35.00" sobre un pago y dos reducciones que bajaban la
 * deuda, sumando magnitudes como si hubiera crecido — mientras el saldo de la derecha, en la
 * misma fila, bajaba. El signo dice hacia dónde se movió la deuda: `+` cuando le debe más.
 */
export function signedNet(events: readonly ObligationEventSummary[]): number {
  const cents = events.reduce((total, event) => {
    const amount = Math.round(Math.abs(event.amount) * 100);
    return total + (REDUCING.has(event.eventType) ? -amount : amount);
  }, 0);
  return cents / 100;
}
