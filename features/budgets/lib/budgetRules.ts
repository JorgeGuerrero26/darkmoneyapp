import type { BudgetOverview } from "../../../types/domain";

/**
 * Un presupuesto es **una regla que se repite**, no una fila por mes.
 *
 * La lista trataba cada período como un presupuesto aparte, y de ahí salían dos cifras que no
 * describían nada: "Te pasaste S/ 552.32" era la suma del exceso de mayo, junio y julio —tres
 * meses que no se solapan, así que no te pasaste eso en ningún momento— y "de S/ 1,200.00" eran
 * tres límites de 400 apilados, un presupuesto que nunca existió.
 *
 * La clave agrupa por lo que hace que dos períodos sean **el mismo presupuesto**: el mismo
 * ámbito (categoría y cuenta) y el mismo nombre. El nombre entra normalizado porque "Alimentacion"
 * y "Alimentación" son la misma regla escrita con y sin tilde, y separarlas rompería el historial
 * justo donde el usuario no ve ninguna diferencia.
 */
export function budgetRuleKey(budget: BudgetOverview): string {
  const name = budget.name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return `${budget.categoryId ?? "-"}|${budget.accountId ?? "-"}|${name}`;
}

export type BudgetRule = {
  key: string;
  /** El período que corre hoy. `null` cuando la regla solo tiene meses cerrados. */
  current: BudgetOverview | null;
  /** Cerrados, del más reciente al más antiguo. */
  closed: BudgetOverview[];
};

function isClosed(budget: BudgetOverview, todayYmd: string): boolean {
  return budget.periodEnd < todayYmd;
}

function isCurrent(budget: BudgetOverview, todayYmd: string): boolean {
  return budget.periodStart <= todayYmd && budget.periodEnd >= todayYmd;
}

/**
 * Agrupa los períodos en reglas: una fila por presupuesto, con su mes en curso y su historial.
 *
 * Si una regla tiene dos períodos vigentes a la vez —"1 jun – 1 jul" y "2 jul – 1 ago" se
 * solapaban un día en los datos reales— gana el que empezó después: es el que el usuario acaba
 * de crear.
 */
export function groupBudgetsIntoRules(budgets: BudgetOverview[], todayYmd: string): BudgetRule[] {
  const byKey = new Map<string, BudgetOverview[]>();
  for (const budget of budgets) {
    const key = budgetRuleKey(budget);
    const list = byKey.get(key);
    if (list) list.push(budget);
    else byKey.set(key, [budget]);
  }

  const rules: BudgetRule[] = [];
  for (const [key, periods] of byKey) {
    const ordered = [...periods].sort((a, b) => b.periodStart.localeCompare(a.periodStart));
    const current = ordered.find((budget) => isCurrent(budget, todayYmd)) ?? null;
    const closed = ordered.filter((budget) => isClosed(budget, todayYmd));
    rules.push({ key, current, closed });
  }
  return rules;
}

/**
 * Dónde deberías ir a estas alturas del período, entre 0 y 1.
 *
 * Es lo que convierte un 81% en información: el día 8 es alarmante y el día 26 es normal. Sin
 * esta marca, el porcentaje solo dice cuánto llevas, no si vas bien.
 */
export function expectedPace(budget: Pick<BudgetOverview, "periodStart" | "periodEnd">, todayYmd: string): number {
  const start = Date.parse(`${budget.periodStart}T00:00:00Z`);
  const end = Date.parse(`${budget.periodEnd}T00:00:00Z`);
  const today = Date.parse(`${todayYmd}T00:00:00Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end) || !Number.isFinite(today)) return 0;
  const total = end - start;
  if (total <= 0) return 1;
  return Math.max(0, Math.min(1, (today - start) / total));
}

/** Días que faltan para que cierre el período. 0 el último día. */
export function daysLeft(budget: Pick<BudgetOverview, "periodEnd">, todayYmd: string): number {
  const end = Date.parse(`${budget.periodEnd}T00:00:00Z`);
  const today = Date.parse(`${todayYmd}T00:00:00Z`);
  if (!Number.isFinite(end) || !Number.isFinite(today)) return 0;
  return Math.max(0, Math.round((end - today) / 86_400_000));
}

/**
 * La única línea que añade algo a la fila.
 *
 * La fila decía el estado cuatro veces: cápsula "Excedido", barra en clay, porcentaje en clay y
 * abajo "⚠ Presupuesto excedido" — la última era literalmente la primera escrita de nuevo. Lo
 * que no decía ninguna era **cuánto** y **cuánto falta**, que es lo que decide si hay que hacer
 * algo. Cuando no hay nada que añadir, no hay línea.
 */
export function budgetRowNote(
  budget: BudgetOverview,
  todayYmd: string,
  formatAmount: (value: number) => string,
): string {
  const restantes = daysLeft(budget, todayYmd);
  const dias = restantes === 1 ? "queda 1 día" : `quedan ${restantes} días`;

  if (budget.spentAmount > budget.limitAmount) {
    return `Te pasaste ${formatAmount(budget.spentAmount - budget.limitAmount)}, y ${dias}.`;
  }

  // El ritmo solo dice algo mientras el período está abierto y ya avanzó algo.
  const pace = expectedPace(budget, todayYmd);
  if (pace <= 0 || restantes === 0) return "";
  const esperado = budget.limitAmount * pace;
  const exceso = budget.spentAmount - esperado;
  // Menos de un sol por encima no es un aviso, es ruido de redondeo.
  if (exceso < 1) return "";
  return `Vas ${formatAmount(exceso)} por encima del ritmo que te deja llegar a fin de mes.`;
}
