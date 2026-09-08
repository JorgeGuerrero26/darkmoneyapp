import type { ResourceSection } from "../../../components/ui/ResourceSectionList";
import type { BudgetOverview } from "../../../types/domain";
import { groupBudgetsIntoRules } from "./budgetRules";

/**
 * La fila de "Meses cerrados": un presupuesto y su historial resumido, no un mes por fila.
 */
export type ClosedBudgetRule = {
  key: string;
  name: string;
  /** El más reciente de los cerrados: es el que abre el historial. */
  latest: BudgetOverview;
  closed: BudgetOverview[];
};

export type BudgetListItem =
  | { kind: "current"; budget: BudgetOverview }
  | { kind: "closed"; rule: ClosedBudgetRule };

export type BudgetListSection = ResourceSection<BudgetListItem, "current" | "closed">;

/**
 * Dos secciones: lo que corre este mes y lo que ya cerró.
 *
 * Antes eran "Fijados / Requieren atención / En buen estado", tres secciones que ordenaban por
 * estado **períodos sueltos**: el mismo presupuesto aparecía tres veces, una por mes, y eso fue
 * lo que llevó a sumar meses distintos en el encabezado. Agrupado por regla, cada presupuesto
 * ocupa una fila con su mes en curso, y su historial es una propiedad suya — una línea que lo
 * resume y se abre — no vecinos suyos en la lista.
 *
 * El estado deja de ordenar la lista porque ya lo dice cada fila: el porcentaje, la barra y la
 * marca del ritmo. Con dos o tres presupuestos, agrupar por estado partía la pantalla en
 * secciones de un elemento.
 */
export function buildBudgetSections(budgets: BudgetOverview[], todayYmd: string): BudgetListSection[] {
  const rules = groupBudgetsIntoRules(budgets, todayYmd);

  const current = rules
    .filter((rule): rule is typeof rule & { current: BudgetOverview } => rule.current !== null)
    // Los fijados arriba: es la única preferencia que el usuario declaró.
    .sort((a, b) => Number(b.current.isPinned) - Number(a.current.isPinned))
    .map((rule) => ({ kind: "current" as const, budget: rule.current }));

  const closed = rules
    .filter((rule) => rule.closed.length > 0)
    .map((rule) => ({
      kind: "closed" as const,
      rule: {
        key: rule.key,
        name: rule.closed[0].name,
        latest: rule.closed[0],
        closed: rule.closed,
      },
    }));

  return [
    ...(current.length > 0 ? [{
      key: "current" as const,
      label: "Este mes",
      data: current,
      headerVariant: "divider" as const,
    }] : []),
    ...(closed.length > 0 ? [{
      key: "closed" as const,
      label: "Meses cerrados",
      data: closed,
      headerVariant: "divider" as const,
    }] : []),
  ];
}
