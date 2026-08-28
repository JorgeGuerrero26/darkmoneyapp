/**
 * Geometría del puente de cierre de mes. Puro y sin React, para poder probarlo.
 *
 * Un puente (waterfall) sirve para una cosa: enseñar cómo se pasa de un número a otro. Eso
 * solo se lee si **cada barra arranca donde terminó la anterior**. Dibujadas todas desde el
 * mismo eje, como estaban, no cuentan un recorrido — son cuatro barras sueltas que dan a
 * entender que el cierre es "otro dato más" en vez de la consecuencia de los tres anteriores.
 */

export type BridgeKind = "total" | "delta";

export type BridgeInput = {
  key: string;
  label: string;
  amount: number;
  kind: BridgeKind;
};

export type BridgeSegment = {
  key: string;
  label: string;
  amount: number;
  kind: BridgeKind;
  /** Borde izquierdo de la barra, en % del ancho de la pista. */
  left: number;
  /** Ancho de la barra, en % de la pista. */
  width: number;
  /** Posición del cero, en % — la misma para todas las filas. */
  zero: number;
  /** true si el tramo resta. */
  negative: boolean;
};

/**
 * Convierte los importes en tramos con posición.
 *
 * - `total` (saldo de hoy, cierre esperado): barra desde el cero hasta su valor.
 * - `delta` (agenda, ritmo): tramo entre el acumulado anterior y el nuevo.
 *
 * La escala es común a las cuatro filas, si no las longitudes no serían comparables y el
 * puente mentiría sobre el peso de cada tramo.
 */
export function buildBridgeSegments(rows: readonly BridgeInput[]): BridgeSegment[] {
  let running = 0;
  const spans: { from: number; to: number }[] = [];

  for (const row of rows) {
    if (row.kind === "total") {
      running = row.amount;
      spans.push({ from: 0, to: row.amount });
    } else {
      const next = running + row.amount;
      spans.push({ from: running, to: next });
      running = next;
    }
  }

  const bounds = spans.flatMap((s) => [s.from, s.to]);
  const min = Math.min(0, ...bounds);
  const max = Math.max(0, ...bounds);
  // Todo a la derecha del cero: el eje se pega a la izquierda y se aprovecha la pista entera.
  const span = max - min || 1;
  const zero = ((0 - min) / span) * 100;

  return rows.map((row, i) => {
    const { from, to } = spans[i];
    const a = ((Math.min(from, to) - min) / span) * 100;
    const b = ((Math.max(from, to) - min) / span) * 100;
    return {
      key: row.key,
      label: row.label,
      amount: row.amount,
      kind: row.kind,
      left: a,
      // Mínimo visible: un tramo de cero pixeles parece un fallo de dibujado, no un cero.
      width: Math.max(b - a, 1.5),
      zero,
      negative: to < from,
    };
  });
}
