import { findInstitution } from "../../../lib/account-institutions";
import type { AccountSummary } from "../../../types/domain";

const CSV_HEADERS = [
  "Nombre",
  "Tipo",
  "Institución",
  "Moneda",
  "Saldo actual",
  "Saldo en moneda base",
  "Saldo inicial",
  "En patrimonio",
  "Archivada",
  "Última actividad",
];

function escapeCell(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

/**
 * Build a UTF-8-BOM-prefixed CSV of accounts for sharing.
 *
 * - First column is "Nombre", last is "Última actividad" (ISO date or empty).
 * - "Institución" resolves the catalog code to the human label, or "" when none.
 * - "Saldo en moneda base" uses the snapshot's pre-computed conversion; when
 *   the field is missing it falls back to "" (caller can re-export later when
 *   FX rates are available).
 * - Booleans are emitted as "Sí" / "No" so Spanish-locale spreadsheets show them as text.
 * - Cell values are wrapped in double quotes and embedded `"` are doubled per RFC 4180.
 *   Headers are emitted raw (legacy behavior, callers expect this format).
 */
export function buildAccountCSV(accounts: readonly AccountSummary[]): string {
  const BOM = "﻿";
  const rows = accounts.map((a) => {
    const institution = findInstitution(a.institutionCode);
    const baseBalance = a.currentBalanceInBaseCurrency;
    return [
      a.name,
      a.type,
      institution?.label ?? "",
      a.currencyCode,
      String(a.currentBalance),
      baseBalance != null ? String(baseBalance) : "",
      String(a.openingBalance),
      a.includeInNetWorth ? "Sí" : "No",
      a.isArchived ? "Sí" : "No",
      a.lastActivity ?? "",
    ]
      .map(escapeCell)
      .join(",");
  });
  return BOM + [CSV_HEADERS.join(","), ...rows].join("\n");
}
