import type { SubscriptionSummary } from "../types/domain";

function escapeCsvCell(s: string): string {
  return `"${String(s).replace(/"/g, '""')}"`;
}

/** CSV UTF-8 con BOM para Excel; filas ya filtradas en cliente. */
export function buildSubscriptionsCsv(rows: SubscriptionSummary[]): string {
  const headers = [
    "nombre",
    "proveedor",
    "estado",
    "monto",
    "moneda",
    "monto_moneda_base",
    "frecuencia",
    "etiqueta_frecuencia",
    "categoria",
    "cuenta",
    "inicio",
    "proximo_vencimiento",
    "fin",
    "auto_movimiento",
    "descripcion",
    "notas",
  ];
  const lines = [headers.join(",")];
  for (const s of rows) {
    lines.push(
      [
        escapeCsvCell(s.name),
        escapeCsvCell(s.vendor),
        escapeCsvCell(s.status),
        String(s.amount),
        escapeCsvCell(s.currencyCode),
        s.amountInBaseCurrency != null ? String(s.amountInBaseCurrency) : "",
        escapeCsvCell(s.frequency),
        escapeCsvCell(s.frequencyLabel),
        escapeCsvCell(s.categoryName ?? ""),
        escapeCsvCell(s.accountName ?? ""),
        escapeCsvCell(s.startDate),
        escapeCsvCell(s.nextDueDate),
        escapeCsvCell(s.endDate ?? ""),
        s.autoCreateMovement ? "si" : "no",
        escapeCsvCell(s.description ?? ""),
        escapeCsvCell(s.notes ?? ""),
      ].join(","),
    );
  }
  return "\uFEFF" + lines.join("\n");
}
