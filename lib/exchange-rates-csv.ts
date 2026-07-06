import type { ExchangeRateRecord } from "../services/queries/exchange-rates";

function escapeCsvCell(s: string): string {
  return `"${String(s).replace(/"/g, '""')}"`;
}

/** CSV UTF-8 con BOM para Excel; filas ya filtradas en cliente (mismo patrón que subscriptions-csv). */
export function buildExchangeRatesCsv(rows: ExchangeRateRecord[]): string {
  const headers = [
    "moneda_origen",
    "moneda_destino",
    "tasa",
    "vigente_desde",
    "fuente",
    "fijada",
    "notas",
  ];
  const lines = rows.map((rate) => [
    rate.fromCurrencyCode,
    rate.toCurrencyCode,
    String(rate.rate),
    rate.effectiveAt,
    rate.source ?? "",
    rate.isPinned ? "si" : "no",
    rate.notes ?? "",
  ].map(escapeCsvCell).join(","));
  return "\uFEFF" + [headers.join(","), ...lines].join("\n");
}
