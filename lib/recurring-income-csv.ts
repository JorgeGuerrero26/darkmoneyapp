import type { RecurringIncomeSummary } from "../types/domain";

function escapeCsvCell(value: string): string {
  return `"${String(value).replace(/"/g, '""')}"`;
}

/** CSV UTF-8 con BOM para Excel; filas ya filtradas en cliente. */
export function buildRecurringIncomeCsv(rows: RecurringIncomeSummary[]): string {
  const headers = [
    "nombre",
    "pagador",
    "estado",
    "monto",
    "moneda",
    "monto_moneda_base",
    "frecuencia",
    "etiqueta_frecuencia",
    "categoria",
    "cuenta",
    "inicio",
    "proxima_llegada",
    "fin",
    "recordatorio_dias_antes",
    "descripcion",
    "notas",
  ];
  const lines = [headers.join(",")];

  for (const item of rows) {
    lines.push(
      [
        escapeCsvCell(item.name),
        escapeCsvCell(item.payer),
        escapeCsvCell(item.status),
        String(item.amount),
        escapeCsvCell(item.currencyCode),
        item.amountInBaseCurrency != null ? String(item.amountInBaseCurrency) : "",
        escapeCsvCell(item.frequency),
        escapeCsvCell(item.frequencyLabel),
        escapeCsvCell(item.categoryName ?? ""),
        escapeCsvCell(item.accountName ?? ""),
        escapeCsvCell(item.startDate),
        escapeCsvCell(item.nextExpectedDate),
        escapeCsvCell(item.endDate ?? ""),
        String(item.remindDaysBefore),
        escapeCsvCell(item.description ?? ""),
        escapeCsvCell(item.notes ?? ""),
      ].join(","),
    );
  }

  return "\uFEFF" + lines.join("\n");
}
