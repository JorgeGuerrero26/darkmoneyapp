import { parsePositiveAmountInput } from "../../../lib/amount-parsing";
import type { SplitLine } from "./split-movement";

export type SplitAllocation = {
  /** Lo repartido hasta ahora. */
  assigned: number;
  /** Lo que falta por repartir. Negativo si te pasaste. */
  remaining: number;
  /** Entre 0 y 1: cuánto del total está repartido. */
  progress: number;
  /** El índice del renglón que recibe la propuesta, o `null` si no hay ninguno. */
  proposalIndex: number | null;
  /** Lo que se le propone a ese renglón, ya formateado a dos decimales. */
  proposalAmount: string;
  /** Cuadra: se puede guardar. */
  balanced: boolean;
};

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Repartir un total, no escribir N montos.
 *
 * **El total ya está decidido** —son los S/ 86.40 del movimiento— y lo único que falta resolver
 * es cuánto va a cada lado. El panel pedía los montos como campos independientes y no decía
 * nunca cuánto quedaba por asignar: si ponías 62.40, nada en pantalla decía que faltaban 24;
 * había que restar de cabeza y confiar en que al guardar cuadrara.
 *
 * Con el resto a la vista la interacción se resuelve sola: **el último renglón vacío llega
 * propuesto con lo que sobra**, así que partir un gasto en dos es teclear un número. La
 * propuesta va en gris hasta que se acepta, porque es de la app y no tuya — el mismo criterio
 * que separa lo que dice un modelo de lo que dice un saldo.
 */
export function allocateSplit(lines: SplitLine[], totalAmount: number): SplitAllocation {
  const amounts = lines.map((line) => parsePositiveAmountInput(line.amount));
  const assigned = round2(amounts.reduce((sum: number, amount) => sum + (amount ?? 0), 0));
  const remaining = round2(totalAmount - assigned);
  const progress = totalAmount > 0 ? Math.max(0, Math.min(1, assigned / totalAmount)) : 0;

  /* La propuesta va al primer renglón sin monto: es el que el usuario todavía no ha tocado.
     Si están todos llenos no se propone nada — corregir un número escrito es cosa suya. */
  const emptyIndex = amounts.findIndex((amount) => amount == null);
  const hasProposal = emptyIndex >= 0 && remaining > 0;

  return {
    assigned,
    remaining,
    progress,
    proposalIndex: hasProposal ? emptyIndex : null,
    proposalAmount: hasProposal ? remaining.toFixed(2) : "",
    balanced: Math.abs(remaining) <= 0.009 && amounts.every((amount) => amount != null),
  };
}

/**
 * El estado del reparto, en positivo.
 *
 * El panel abría con **"Cada línea necesita un monto mayor a 0"** en ámbar, antes de escribir
 * nada: la pantalla regañaba por no haber llenado un formulario recién abierto. Un formulario
 * vacío no está mal, está vacío. Esto solo dice dónde va el reparto; el error aparece al
 * intentar guardar sin cuadrar, que es cuando hay algo que corregir.
 */
export function splitStatusLabel(
  allocation: SplitAllocation,
  formatAmount: (value: number) => string,
): { label: string; value: string; tone: "pending" | "done" | "over" } {
  if (allocation.remaining > 0.009) {
    return { label: "Falta asignar", value: formatAmount(allocation.remaining), tone: "pending" };
  }
  if (allocation.remaining < -0.009) {
    return {
      label: "Te pasaste por",
      value: formatAmount(Math.abs(allocation.remaining)),
      tone: "over",
    };
  }
  return { label: "Todo asignado", value: formatAmount(0), tone: "done" };
}

/**
 * Por qué se puede guardar o no, dicho cuando el usuario ya intentó guardar.
 *
 * Antes esto se enseñaba desde el primer pintado. Aquí se pide a propósito: es la respuesta a
 * "guardar", no un juicio sobre un formulario que se acaba de abrir.
 */
export function splitBlockingReason(lines: SplitLine[], allocation: SplitAllocation): string | null {
  if (lines.length < 2) return "Una división necesita al menos dos categorías.";
  if (lines.some((line) => parsePositiveAmountInput(line.amount) == null)) {
    return "Ponle un monto a cada categoría.";
  }
  if (lines.some((line) => line.categoryId == null)) return "Elige la categoría de cada parte.";
  if (allocation.remaining > 0.009) {
    return `Falta repartir ${allocation.remaining.toFixed(2)}.`;
  }
  if (allocation.remaining < -0.009) {
    return `Te pasaste por ${Math.abs(allocation.remaining).toFixed(2)}.`;
  }
  return null;
}
