import type { BudgetOverview } from "../../../types/domain";
import { daysLeft, expectedPace } from "./budgetRules";

export type BudgetHeadState =
  /** El período corre: se enseña el progreso, con barra y ritmo. */
  | { kind: "progress"; spent: number; limit: number; sentence: string }
  /** Cerró sin un solo movimiento: no es un resultado, es que no se anotó nada. */
  | { kind: "no-data"; title: string; body: string }
  /** Cerró con datos: arriba va cómo terminó, no un progreso a medias. */
  | { kind: "verdict"; spent: number; limit: number; sentence: string };

type Args = {
  budget: BudgetOverview;
  todayYmd: string;
  formatAmount: (value: number) => string;
  /** "Junio", "Septiembre": el período del que habla la pantalla. */
  periodLabel: string;
};

/**
 * Qué encabeza el detalle de un presupuesto.
 *
 * **"0% · En rango" en verde sobre un mes cerrado sin un solo movimiento.** Cero gastado en un
 * período terminado no significa que te portaste bien: significa que no se registró nada. La
 * pantalla felicitaba por un período vacío, con el número más grande y el único color de la
 * pantalla — y el dato que de verdad juzgaba ese presupuesto, que el mes anterior cerró en 152%,
 * estaba al pie en letra de doce.
 *
 * Un cero sin movimientos es **ausencia de datos**, y hay que decirlo así. Por eso hay tres
 * estados y no uno:
 *
 * - **Progreso** mientras el período corre: cuánto llevas, la barra y el ritmo. Es lo único que
 *   admite una barra, porque una barra promete que aún puede moverse.
 * - **Sin datos** cuando cerró vacío: es la noticia, no una nota al pie.
 * - **Veredicto** cuando cerró con gasto: cómo terminó. Ya no hay nada que seguir.
 */
export function budgetHeadState({ budget, todayYmd, formatAmount, periodLabel }: Args): BudgetHeadState {
  const closed = budget.periodEnd < todayYmd;
  const spent = budget.spentAmount;
  const limit = budget.limitAmount;

  if (closed && budget.movementCount === 0) {
    return {
      kind: "no-data",
      title: `${periodLabel} cerró sin movimientos`,
      // "No es que no gastaras" antes que nada: es lo que el cero hacía creer.
      body: `No es que no gastaras: es que no se anotó nada entre el ${shortDate(budget.periodStart)} y el ${shortDate(budget.periodEnd)}. Un cero sin movimientos no dice si cumpliste el límite.`,
    };
  }

  if (closed) {
    const diff = spent - limit;
    return {
      kind: "verdict",
      spent,
      limit,
      sentence: diff > 0
        ? `${periodLabel} cerró ${formatAmount(diff)} por encima del límite.`
        : `${periodLabel} cerró dentro del límite, con ${formatAmount(-diff)} sin gastar.`,
    };
  }

  const restantes = daysLeft(budget, todayYmd);
  const pace = expectedPace(budget, todayYmd);
  const esperado = limit * pace;
  const desvio = spent - esperado;
  const dias = restantes === 1 ? "queda 1 día" : `quedan ${restantes} días`;

  /* El restante se dice aquí, y con para cuántos días alcanza: es lo que lo hace útil, y lo que
     la cuadrícula 2×2 daba como una resta suelta. */
  const sentence = spent > limit
    ? `${periodLabel}, ${dias}. Te pasaste ${formatAmount(spent - limit)} del límite.`
    : desvio >= 1
      ? `${periodLabel}, ${dias}. A estas alturas del mes se esperaría ${formatAmount(esperado)}: vas ${formatAmount(desvio)} por delante del ritmo.`
      : `${periodLabel}, ${dias}. Te quedan ${formatAmount(limit - spent)}, unos ${formatAmount((limit - spent) / Math.max(1, restantes))} al día.`;

  return { kind: "progress", spent, limit, sentence };
}

/** "1 de junio", con el mes entero: la frase se lee, no se ojea. */
function shortDate(ymd: string): string {
  const meses = [
    "enero", "febrero", "marzo", "abril", "mayo", "junio",
    "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
  ];
  const [, m, d] = ymd.split("-");
  return `${Number(d)} de ${meses[Number(m) - 1] ?? m}`;
}

/**
 * La lectura de la serie: lo que el usuario iba a deducir solo, dicho por la app.
 *
 * Un presupuesto se juzga **por su serie, no por un mes**. Tres meses seguidos por encima
 * significan que el límite está mal puesto, y eso solo se ve en fila — estaba en la última
 * tarjeta de la pantalla, con una línea, mientras arriba en verde a 40px decía "En rango".
 */
export function budgetSeriesReading(
  closed: BudgetOverview[],
  formatAmount: (value: number) => string,
): string {
  const conDatos = closed.filter((budget) => budget.movementCount > 0);
  if (conDatos.length === 0) return "";
  const pasados = conDatos.filter((budget) => budget.spentAmount > budget.limitAmount).length;
  const limite = formatAmount(conDatos[0].limitAmount);

  if (pasados === 0) {
    return conDatos.length === 1
      ? "El último mes cerró dentro del límite."
      : `Dentro del límite los ${conDatos.length} últimos meses.`;
  }
  if (pasados === conDatos.length && conDatos.length >= 2) {
    return `Te pasaste los ${conDatos.length} meses. El límite de ${limite} puede estar corto.`;
  }
  const meses = conDatos.length === 1 ? "el último mes" : `los ${conDatos.length} últimos meses`;
  const cola = pasados >= 2 ? ` El límite de ${limite} puede estar corto.` : "";
  return `Te pasaste en ${pasados} de ${meses}.${cola}`;
}
