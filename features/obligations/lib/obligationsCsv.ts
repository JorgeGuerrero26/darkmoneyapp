import type { ObligationSummary, SharedObligationSummary } from "../../../types/domain";

function csvEscape(value: unknown) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

export function buildObligationCSV(obligations: Array<ObligationSummary | SharedObligationSummary>) {
  const BOM = "\uFEFF";
  const headers = [
    "Titulo",
    "Direccion",
    "Estado",
    "Contraparte",
    "Moneda",
    "Principal",
    "Pendiente",
    "Progreso",
    "Inicio",
    "Vencimiento",
    "Compartida",
  ];
  const rows = obligations.map((obligation) => [
    obligation.title,
    obligation.direction,
    obligation.status,
    obligation.counterparty,
    obligation.currencyCode,
    obligation.principalAmount,
    obligation.pendingAmount,
    obligation.progressPercent,
    obligation.startDate,
    obligation.dueDate ?? "",
    "viewerMode" in obligation ? "Si" : "No",
  ].map(csvEscape).join(","));
  return BOM + [headers.join(","), ...rows].join("\n");
}
