import type { RecurringIncomeOccurrenceSummary } from "../../../types/domain";

export type ArrivalRow =
  | {
      kind: "pending";
      key: string;
      date: string;
      /**
       * Solo la más vieja se puede anotar, y por eso va primero.
       *
       * El puntero del ingreso avanza de una llegada a la siguiente: confirmar la de agosto
       * saltándose la de julio movería el puntero a septiembre y la de julio dejaría de estar
       * pendiente **y** de estar anotada — desaparecería sin que nadie lo vea, que es
       * exactamente el fallo que esta pantalla viene a arreglar.
       */
      actionable: boolean;
    }
  | {
      kind: "confirmed";
      key: string;
      /** La fecha en que llegó de verdad. */
      date: string;
      amount: number;
      currencyCode: string;
      /** "Llegó 1 día después · S/ 1.47 más". Vacío cuando llegó el día y por el monto pactados. */
      support: string;
      movementId?: number | null;
    };

function parseYmd(ymd: string): number {
  const [y, m, d] = ymd.split("-").map(Number);
  return Date.UTC(y, (m ?? 1) - 1, d ?? 1);
}

function daysBetween(from: string, to: string): number {
  const a = parseYmd(from);
  const b = parseYmd(to);
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.round((a - b) / 86_400_000);
}

/**
 * El desfase, en palabras.
 *
 * Llevaba cápsula: "A tiempo" en verde, "Tardío" en ámbar. Tres colores para una diferencia de
 * días que la fecha ya muestra —y la del 30 de abril salía en ámbar por **un** día—. En palabras
 * se dice cuánto, no solo que sí o que no, y la cápsula deja de tapar el sitio donde va el dato
 * que de verdad faltaba: cuánto llegó ese mes.
 */
export function arrivalDelayPhrase(expectedDate: string | null, actualDate: string): string {
  if (!expectedDate) return "";
  const days = daysBetween(actualDate, expectedDate);
  if (days === 0) return "";
  const n = Math.abs(days);
  const unit = n === 1 ? "día" : "días";
  return days > 0 ? `Llegó ${n} ${unit} después` : `Llegó ${n} ${unit} antes`;
}

/**
 * La diferencia con lo pactado, cuando la hay.
 *
 * Es el dato que la cápsula tapaba: ese mes llegaron S/ 2,631.97 en vez de S/ 2,630.50, y la
 * pantalla no lo decía en ninguna parte. El céntimo suelto importa en un sueldo.
 */
export function arrivalAmountPhrase(
  amount: number,
  expectedAmount: number,
  formatAmount: (value: number) => string,
): string {
  const delta = Math.round((amount - expectedAmount) * 100) / 100;
  if (delta === 0) return "";
  return `${formatAmount(Math.abs(delta))} ${delta > 0 ? "más" : "menos"}`;
}

type Args = {
  /** Las que vencieron sin confirmar, de `recurringIncomeStanding`. */
  pendingDates: string[];
  occurrences: RecurringIncomeOccurrenceSummary[];
  /** Lo que debería llegar cada vez, para medir la diferencia. */
  expectedAmount: number;
  fallbackCurrencyCode: string;
  formatAmount: (value: number) => string;
};

/**
 * El calendario completo de llegadas: lo que falta y lo que llegó, en una sola lista.
 *
 * **El historial contaba mal.** Listaba solo lo anotado y encabezaba con el total —"HISTORIAL DE
 * LLEGADAS · 3"—, así que las llegadas que nadie confirmó no aparecían en ninguna parte: ni en
 * la lista ni en el conteo. Con la última anotada el 26 de junio y la siguiente esperada el 29
 * de julio, dos sueldos enteros eran invisibles justo en la pantalla que existe para revisarlos.
 *
 * Lo que falta va primero, de la más vieja a la más nueva, porque en ese orden se anota. Lo
 * anotado va debajo al revés —lo último arriba—, que es como se lee un historial.
 */
export function buildArrivalRows({
  pendingDates,
  occurrences,
  expectedAmount,
  fallbackCurrencyCode,
  formatAmount,
}: Args): ArrivalRow[] {
  // De la más vieja a la más nueva: es una cola de trabajo, no historial, y se vacía por orden.
  const pending: ArrivalRow[] = [...pendingDates]
    .sort((a, b) => a.localeCompare(b))
    .map((date, index) => ({
      kind: "pending" as const,
      key: `pending-${date}`,
      date,
      actionable: index === 0,
    }));

  const confirmed: ArrivalRow[] = [...occurrences]
    .sort((a, b) => (b.actualDate ?? "").localeCompare(a.actualDate ?? ""))
    .map((occurrence) => {
      const delay = arrivalDelayPhrase(occurrence.expectedDate ?? null, occurrence.actualDate ?? "");
      const diff = arrivalAmountPhrase(occurrence.amount, expectedAmount, formatAmount);
      return {
        kind: "confirmed" as const,
        key: `occurrence-${occurrence.id}`,
        date: occurrence.actualDate,
        amount: occurrence.amount,
        currencyCode: occurrence.currencyCode || fallbackCurrencyCode,
        support: [delay, diff].filter(Boolean).join(" · "),
        movementId: occurrence.movementId,
      };
    });

  return [...pending, ...confirmed];
}
