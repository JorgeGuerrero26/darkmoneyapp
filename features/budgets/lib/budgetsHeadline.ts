import type { BudgetOverview } from "../../../types/domain";

export type BudgetsHeadline = {
  /** Lo gastado por los presupuestos que corren a la vez. */
  spent: number;
  /** La suma de sus límites. Solo de los simultáneos: apilar meses inventa un presupuesto. */
  limit: number;
  /** "Septiembre, dos presupuestos activos. Ninguno se ha pasado." */
  support: string;
  /** Alguno se pasó: el encabezado se pinta en clay. */
  hasOverspend: boolean;
};

const CARDINALES = ["ningún", "un", "dos", "tres", "cuatro", "cinco", "seis", "siete", "ocho"];

function cuantos(n: number): string {
  return n < CARDINALES.length ? CARDINALES[n] : String(n);
}

type Args = {
  /** Solo los que corren AHORA. Ver la regla de abajo. */
  active: BudgetOverview[];
  /** El mes en curso, ya escrito: "Septiembre". */
  periodLabel: string;
  formatAmount: (value: number) => string;
};

/**
 * El encabezado de la lista: se suma lo simultáneo, nunca lo sucesivo.
 *
 * Sumaba todos los períodos de la lista, y las tres filas eran el MISMO presupuesto en mayo,
 * junio y julio: salía "S/ 1,752.32 de S/ 1,200.00" — un límite de 1,200 que nunca existió, y un
 * gasto que no ocurrió en ningún momento. Es como sumar los saldos de tres cuentas que son la
 * misma cuenta en tres fechas.
 *
 * Dos presupuestos que corren **a la vez** sí se suman: Alimentación y Transporte coexisten en
 * septiembre, así que "S/ 385.12 de S/ 550.00" describe un mes real.
 *
 * **Y el exceso se atribuye, no se netea.** El margen que sobra en Transporte no compensa lo que
 * te pasaste en comida: son bolsillos distintos, y un neto cruzado esconde el único dato
 * accionable. Por eso la frase nombra el presupuesto y su cifra propia.
 */
export function buildBudgetsHeadline({ active, periodLabel, formatAmount }: Args): BudgetsHeadline {
  const spent = active.reduce((sum, budget) => sum + budget.spentAmount, 0);
  const limit = active.reduce((sum, budget) => sum + budget.limitAmount, 0);
  const excedidos = active.filter((budget) => budget.spentAmount > budget.limitAmount);

  const cuenta = `${periodLabel}, ${cuantos(active.length)} presupuesto${active.length === 1 ? "" : "s"} activo${active.length === 1 ? "" : "s"}.`;

  if (active.length === 0) {
    return { spent, limit, support: `${periodLabel}, ningún presupuesto activo.`, hasOverspend: false };
  }

  if (excedidos.length === 0) {
    return { spent, limit, support: `${cuenta} Ninguno se ha pasado.`, hasOverspend: false };
  }

  if (excedidos.length === 1) {
    const budget = excedidos[0];
    const exceso = formatAmount(budget.spentAmount - budget.limitAmount);
    return { spent, limit, support: `${cuenta} Te pasaste ${exceso} en ${budget.name}.`, hasOverspend: true };
  }

  // Con varios se nombran, sin sumar sus excesos en una cifra: cada uno es su propio bolsillo.
  const nombres = excedidos.map((budget) => budget.name);
  const lista = `${nombres.slice(0, -1).join(", ")} y ${nombres[nombres.length - 1]}`;
  return { spent, limit, support: `${cuenta} Te pasaste en ${lista}.`, hasOverspend: true };
}

/**
 * Lo que dice la fila de un presupuesto en "Meses cerrados".
 *
 * Resume su historial en una línea en vez de repetir el presupuesto una vez por mes: son los
 * mismos 400 de Alimentación, y verlos tres veces seguidas fue lo que hizo que alguien los
 * sumara.
 */
export function closedMonthsSummary(closed: BudgetOverview[]): string {
  if (closed.length === 0) return "";
  const meses = closed.length === 1 ? "el último mes" : `los ${closed.length} últimos meses`;
  const pasados = closed.filter((budget) => budget.spentAmount > budget.limitAmount).length;
  if (pasados === 0) return `Dentro del límite ${meses}`;
  if (pasados === closed.length) {
    return closed.length === 1 ? "Te pasaste el último mes" : `Te pasaste los ${closed.length} meses`;
  }
  return `Te pasaste en ${pasados} de ${meses.replace("los ", "los ")}`;
}
