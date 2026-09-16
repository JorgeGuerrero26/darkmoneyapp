/**
 * El historial que alimenta la mediana del gasto típico.
 *
 * Dos filtros que parecen detalles y no lo son:
 *
 * 1. **Fuera lo que ya tiene su propia línea.** El calendario cuenta las suscripciones y las
 *    cuotas una por una, con su fecha. Si el gasto típico se midiera sobre TODOS los gastos,
 *    esos montos entrarían dos veces: una en su línea pactada y otra dentro del bulto. Por eso
 *    se descartan `subscription_payment` y `obligation_payment`.
 *
 * 2. **Solo meses terminados.** Hoy es 16: este mes lleva media cuenta. Meterlo entre los meses
 *    que se ordenan para sacar la mediana la tira hacia abajo, y la proyección saldría optimista
 *    justo por mirar un mes que aún no acaba.
 *
 * RN-free. La conversión de moneda y qué cuenta como gasto los resuelve quien llama —eso ya vive
 * probado en las agregaciones del dashboard— y aquí solo llega el monto.
 */
import { endOfMonth, format, startOfMonth, subMonths } from "date-fns";

/** Lo mínimo para ubicar un movimiento en el tiempo y saber si le toca su propia línea. */
export type SpendHistoryMovement = {
  movementType: string;
  status: string;
  occurredAt: string;
};

/**
 * Tipos que el calendario ya proyecta por separado.
 *
 * `obligation_opening` no es gasto corriente de nadie: es el día que prestaste la plata.
 */
const LINE_OF_THEIR_OWN = new Set(["subscription_payment", "obligation_payment", "obligation_opening"]);

export type MonthlyDiscretionarySpendInput<TMovement extends SpendHistoryMovement> = {
  movements: readonly TMovement[];
  /** Cuántos meses terminados mirar hacia atrás. */
  months: number;
  /** Monto de gasto ya convertido; 0 si el movimiento no es un gasto. */
  expenseAmountOf: (movement: TMovement) => number;
  /**
   * Desde cuándo están cargados los movimientos. Un mes que empieza antes de esta fecha se
   * descarta entero en vez de valer 0.
   *
   * Importa mucho más de lo que parece: el dashboard trae 90 días, así que pedirle seis meses
   * devolvería tres meses reales y tres ceros. La mediana de [0, 0, 0, 800, 850, 900] es 400 —
   * la mitad de lo que el usuario gasta— y nada en pantalla delataría de dónde salió.
   */
  earliestCoveredDate?: Date | null;
  now?: Date;
};

/**
 * Total de gasto discrecional de cada uno de los últimos `months` meses **terminados**,
 * del más viejo al más reciente. Un mes sin gasto devuelve 0 y conserva su sitio: la mediana
 * necesita saber que ese mes existió.
 */
export function monthlyDiscretionarySpend<TMovement extends SpendHistoryMovement>({
  movements,
  months,
  expenseAmountOf,
  earliestCoveredDate = null,
  now = new Date(),
}: MonthlyDiscretionarySpendInput<TMovement>): number[] {
  const monthCount = Math.max(0, Math.floor(months));
  if (monthCount === 0) return [];

  const totals = new Map<string, number>();
  const orderedKeys: string[] = [];
  for (let i = monthCount; i >= 1; i -= 1) {
    const monthDate = subMonths(now, i);
    if (earliestCoveredDate && startOfMonth(monthDate) < earliestCoveredDate) continue;
    const key = format(monthDate, "yyyy-MM");
    orderedKeys.push(key);
    totals.set(key, 0);
  }
  if (orderedKeys.length === 0) return [];

  const oldest = startOfMonth(subMonths(now, monthCount));
  const newest = endOfMonth(subMonths(now, 1));

  for (const movement of movements) {
    if (movement.status !== "posted") continue;
    if (LINE_OF_THEIR_OWN.has(movement.movementType)) continue;
    const occurred = new Date(movement.occurredAt);
    if (Number.isNaN(occurred.getTime()) || occurred < oldest || occurred > newest) continue;
    const key = format(occurred, "yyyy-MM");
    const current = totals.get(key);
    if (current === undefined) continue;
    totals.set(key, current + Math.abs(expenseAmountOf(movement)));
  }

  return orderedKeys.map((key) => totals.get(key) ?? 0);
}
