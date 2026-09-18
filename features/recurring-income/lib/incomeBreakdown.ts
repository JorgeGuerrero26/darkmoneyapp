/**
 * El desglose de un sueldo: bruto, descuentos y lo que queda.
 *
 * Existe porque un ingreso fijo guardaba un solo número y nadie sabía cuál era. El usuario
 * escribía 3.659 y el dato no decía si eso es lo que gana o lo que le llega.
 *
 * **El neto manda.** Lo que se guarda en `amount` —y lo que alimenta la proyección, el dashboard
 * y el asistente— es lo que LLEGA A LA CUENTA. El bruto y los descuentos son un registro sobre
 * él, no una fórmula que lo produzca.
 *
 * **Se registra, no se calcula.** Aquí no hay tramos, ni UIT, ni tabla de impuestos. El usuario
 * copia lo que dice su boleta. Un cálculo propio sería sofisticado y MENOS exacto que el papel
 * que ya tiene en la mano: cada empleador calcula la retención a su manera.
 *
 * **La diferencia se avisa, no se bloquea.** Hay descuentos reales que la boleta no detalla
 * —adelantos, ajustes, redondeos— y exigir el cuadre castigaría al usuario por algo que no
 * controla. `verifyBreakdown` devuelve el veredicto; quien lo muestre decide el color, nunca el
 * permiso para guardar.
 */

/** Un céntimo de tolerancia: por debajo es redondeo, no una diferencia real. */
const EPSILON = 0.005;

/** Lo que se teclea en cada fila del desglose, antes de validar. */
export type DeductionDraft = {
  /** Identidad estable de la fila mientras se edita. No se guarda. */
  key: string;
  name: string;
  amount: string;
};

/** Lo que acaba en `recurring_income.deductions`. */
export type Deduction = {
  name: string;
  amount: number;
};

/**
 * Conceptos que se repiten en casi toda boleta peruana.
 *
 * Tocar uno precarga el nombre y deja el cursor en el monto: cero teclado para el caso normal.
 * "Otro" existe porque la lista nunca va a estar completa y escribir a mano tiene que ser una
 * opción visible, no el castigo por no encajar.
 */
export const FREQUENT_DEDUCTIONS: readonly string[] = ["AFP", "ONP", "Renta 5ta", "EPS", "Préstamo", "Otro"];

export function parseMoney(value: string): number | null {
  const parsed = Number(String(value).replace(",", "."));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

/**
 * Las filas que valen como descuento.
 *
 * Una fila a medio llenar —nombre sin monto, monto sin nombre— no es un error que haya que
 * gritarle al usuario: es una fila que todavía no dice nada. Se descarta al guardar.
 */
export function collectDeductions(drafts: readonly DeductionDraft[]): Deduction[] {
  const out: Deduction[] = [];
  for (const draft of drafts) {
    const name = draft.name.trim();
    const amount = parseMoney(draft.amount);
    if (!name || amount == null) continue;
    out.push({ name: name.slice(0, 60), amount: Number(amount.toFixed(2)) });
  }
  return out;
}

export function deductionsTotal(deductions: readonly Deduction[]): number {
  return Number(deductions.reduce((sum, row) => sum + row.amount, 0).toFixed(2));
}

export type BreakdownVerdict =
  /** No hay bruto declarado: no hay nada que cuadrar. */
  | { status: "empty" }
  /** Bruto − descuentos coincide con lo que llega. */
  | { status: "matches"; net: number }
  /** No coincide. `difference` es positiva si el desglose da MÁS de lo que llega. */
  | { status: "differs"; net: number; difference: number };

/**
 * Compara el desglose con el neto declarado.
 *
 * Nunca devuelve "inválido": el peor caso es `differs`, que es información para el usuario, no
 * un impedimento. Quien llame a esto no debe usarlo para decidir si deja guardar.
 */
export function verifyBreakdown(
  grossAmount: number | null,
  deductions: readonly Deduction[],
  netAmount: number | null,
): BreakdownVerdict {
  if (grossAmount == null || grossAmount <= 0) return { status: "empty" };
  const net = Number((grossAmount - deductionsTotal(deductions)).toFixed(2));
  if (netAmount == null) return { status: "matches", net };
  const difference = Number((net - netAmount).toFixed(2));
  if (Math.abs(difference) < EPSILON) return { status: "matches", net };
  return { status: "differs", net, difference };
}

/** El aviso, ya redactado. `null` cuando no hay nada que decir. */
export function describeVerdict(verdict: BreakdownVerdict, formatAmount: (value: number) => string): string | null {
  if (verdict.status === "empty") return null;
  if (verdict.status === "matches") return "Coincide con lo que llega a tu cuenta.";
  const magnitude = formatAmount(Math.abs(verdict.difference));
  return verdict.difference > 0
    ? `El desglose da ${magnitude} más de lo que llega.`
    : `El desglose da ${magnitude} menos de lo que llega.`;
}

/** Los conceptos que todavía se pueden ofrecer: los ya usados salen de la fila de atajos. */
export function availableShortcuts(drafts: readonly DeductionDraft[]): string[] {
  const used = new Set(drafts.map((draft) => draft.name.trim().toLowerCase()).filter(Boolean));
  // "Otro" nunca se gasta: no nombra un concepto, abre una fila en blanco.
  return FREQUENT_DEDUCTIONS.filter((label) => label === "Otro" || !used.has(label.toLowerCase()));
}

/** Lo guardado vuelve a la forma que edita el formulario. */
export function toDrafts(deductions: unknown, makeKey: (index: number) => string): DeductionDraft[] {
  if (!Array.isArray(deductions)) return [];
  const out: DeductionDraft[] = [];
  deductions.forEach((row, index) => {
    if (!row || typeof row !== "object") return;
    const record = row as Record<string, unknown>;
    const name = typeof record.name === "string" ? record.name : "";
    const amount = Number(record.amount);
    if (!name.trim() || !Number.isFinite(amount) || amount <= 0) return;
    out.push({ key: makeKey(index), name, amount: amount.toFixed(2) });
  });
  return out;
}
