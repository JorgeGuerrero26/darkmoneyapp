import { parseISO } from "date-fns";

import type { ProjectedMonth, ProjectionLine } from "../../projection/lib/cashflow-calendar";
import type { FutureFlowItem } from "./dashboard-builders";

function sourceOf(kind: ProjectionLine["kind"]): FutureFlowItem["source"] {
  switch (kind) {
    case "subscription":
      return "subscription";
    case "recurring_income":
      return "recurring-income";
    case "credit_card_payment":
      return "card";
    case "planned_movement":
      return "planned";
    default:
      return "obligation";
  }
}

/**
 * Los compromisos de la proyección, como lista con fecha.
 *
 * Es lo que leen "Compromisos pendientes" en Fin de mes, "Esta semana" y las ventanas de 7/15/30
 * días de Flujo. Salen de las MISMAS líneas que suman el cierre, así que ninguna lista puede
 * contar algo que el cierre no cuenta, ni al revés.
 *
 * El gasto típico queda fuera: no es un compromiso con fecha, es una estimación repartida en el
 * mes. Una cuota atrasada conserva la fecha en que venció, para que se vea como tal.
 */
export function projectionFlowItems(months: readonly ProjectedMonth[], fallbackDate: Date): FutureFlowItem[] {
  const items: FutureFlowItem[] = [];
  for (const month of months) {
    const push = (line: ProjectionLine, direction: "inflow" | "outflow") => {
      if (line.kind === "typical_spend") return;
      items.push({
        source: sourceOf(line.kind),
        id: line.refId ?? 0,
        title: line.label,
        date: line.dueDate ? parseISO(line.dueDate) : fallbackDate,
        direction,
        amount: line.amount,
      });
    };
    month.inflows.forEach((line) => push(line, "inflow"));
    month.outflows.forEach((line) => push(line, "outflow"));
  }
  return items.sort((a, b) => a.date.getTime() - b.date.getTime() || a.title.localeCompare(b.title));
}
