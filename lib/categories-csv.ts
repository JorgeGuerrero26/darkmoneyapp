import type { CategoryOverview } from "../types/domain";

function escapeCsvCell(s: string): string {
  return `"${String(s).replace(/"/g, '""')}"`;
}

export function buildCategoriesCsv(rows: CategoryOverview[]): string {
  const headers = [
    "nombre",
    "tipo",
    "activa",
    "sistema",
    "padre",
    "movimientos",
    "suscripciones",
    "ultima_actividad",
    "orden",
    "color",
    "icono",
  ];
  const lines = [headers.join(",")];
  for (const c of rows) {
    lines.push(
      [
        escapeCsvCell(c.name),
        escapeCsvCell(c.kind),
        c.isActive ? "si" : "no",
        c.isSystem ? "si" : "no",
        escapeCsvCell(c.parentName ?? ""),
        String(c.movementCount),
        String(c.subscriptionCount),
        escapeCsvCell(c.lastActivityAt ?? ""),
        String(c.sortOrder),
        escapeCsvCell(c.color ?? ""),
        escapeCsvCell(c.icon ?? ""),
      ].join(","),
    );
  }
  return "\uFEFF" + lines.join("\n");
}
