import type { BudgetOverview } from "../../../types/domain";

function csvEscape(value: string | number | boolean | null | undefined) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

export function buildBudgetCSV(budgets: BudgetOverview[]): string {
  const BOM = "﻿";
  const headers = [
    "Nombre",
    "Ámbito",
    "Moneda",
    "Límite",
    "Gastado",
    "Restante",
    "Uso %",
    "Alerta %",
    "Movimientos",
    "Inicio",
    "Fin",
    "Rollover",
    "Notas",
  ];
  const rows = budgets.map((budget) =>
    [
      budget.name,
      budget.scopeLabel,
      budget.currencyCode,
      budget.limitAmount,
      budget.spentAmount,
      budget.remainingAmount,
      Math.round(budget.usedPercent),
      budget.alertPercent,
      budget.movementCount,
      budget.periodStart,
      budget.periodEnd,
      budget.rolloverEnabled ? "Sí" : "No",
      budget.notes ?? "",
    ]
      .map(csvEscape)
      .join(","),
  );

  return BOM + [headers.join(","), ...rows].join("\n");
}
