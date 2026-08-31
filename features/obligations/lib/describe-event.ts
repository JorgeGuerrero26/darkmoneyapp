import type { ObligationEventSummary } from "../../../types/domain";
import { ANALYTICS_EVENT_LABELS } from "./obligationEventLabels";

export type EventDescription = {
  /** Lo que hace única a la fila. */
  title: string;
  /** Fecha y el dato secundario, en una línea. */
  detail: string | null;
  /** El título es un marcador de dato faltante, no algo que el usuario escribió. */
  missingDescription: boolean;
  /** El movimiento reduce lo que queda por cobrar o pagar. */
  reduces: boolean;
};

const REDUCING = new Set(["payment", "principal_decrease", "discount", "writeoff"]);

/**
 * Cómo se lee un movimiento de una obligación.
 *
 * **El producto es el título de la fila**, no el tipo de evento: "Aumento de capital" se repetía
 * trece veces en el lugar más visible mientras "Canon EOS R" —lo único que distingue una fila de
 * otra— iba en letra chica.
 *
 * Los pagos y los ajustes sí llevan su etiqueta, porque el monto solo no dice qué pasó, y su
 * referencia baja a la segunda línea. Un aumento sin descripción se marca como dato faltante en
 * vez de dejar el renglón mudo.
 */
export function describeObligationEvent(
  event: ObligationEventSummary,
  options: { sellsOnCredit: boolean; isReceivable: boolean },
): EventDescription {
  const description = event.description?.trim() || event.reason?.trim() || null;
  const reduces = REDUCING.has(event.eventType);
  const saleWord = options.sellsOnCredit ? "venta" : "aumento";

  if (event.eventType === "opening") {
    return {
      title: options.sellsOnCredit ? "Primera venta" : "Apertura del registro",
      detail: description,
      missingDescription: false,
      reduces: false,
    };
  }

  if (event.eventType === "principal_increase") {
    return {
      title: description ?? `${saleWord === "venta" ? "Venta" : "Aumento"} sin descripción`,
      detail: saleWord,
      missingDescription: description == null,
      reduces: false,
    };
  }

  if (event.eventType === "payment") {
    return {
      title: options.isReceivable ? "Pago recibido" : "Pago realizado",
      detail: [event.installmentNo != null ? `Cuota ${event.installmentNo}` : null, description]
        .filter(Boolean)
        .join(" · ") || null,
      missingDescription: false,
      reduces: true,
    };
  }

  return {
    title: ANALYTICS_EVENT_LABELS[event.eventType] ?? event.eventType,
    detail: description,
    missingDescription: false,
    reduces,
  };
}
