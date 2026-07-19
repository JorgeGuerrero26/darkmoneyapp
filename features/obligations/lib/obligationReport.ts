import type { ObligationEventSummary, ObligationSummary } from "../../../types/domain";
import { formatCurrency } from "../../../lib/format-currency";
import { ANALYTICS_EVENT_LABELS } from "./obligationEventLabels";

/**
 * Builder puro (RN-free) del "Reporte de transparencia" de un crédito/deuda:
 * HTML listo para expo-print, folio, nombre de archivo y mensaje de WhatsApp.
 * Espejea la fórmula de saldo de v_obligation_summary:
 *   pending = principal + aumentos - reducciones + intereses + cargos
 *             + ajustes(con signo) - descuentos - castigos - pagos
 */

// Paleta clara para papel/PDF: el tema dark de la app no imprime bien; acentos
// derivados de la marca (pine #6BE4C5 → teal oscuro legible sobre blanco).
const REPORT_INK = "#15202B";
const REPORT_MUTED = "#5B6B7B";
const REPORT_ACCENT = "#0E8C6D";
const REPORT_DEBIT = "#B23A52";
const REPORT_LINE = "#D9E0E7";
const REPORT_SOFT_BG = "#F2F6F5";

/** Cargos suben el saldo; abonos lo bajan. adjustment va con el signo del monto. */
const CHARGE_TYPES = new Set(["opening", "principal_increase", "interest", "fee"]);
const CREDIT_TYPES = new Set(["payment", "principal_decrease", "discount", "writeoff"]);

export type ObligationReportRow = {
  eventId: number;
  date: string;
  label: string;
  detail: string | null;
  installmentNo: number | null;
  charge: number | null;
  credit: number | null;
  balance: number;
};

export type ObligationReportInput = {
  obligation: ObligationSummary;
  events: ObligationEventSummary[];
  ownerName: string | null;
  generatedAt?: Date;
};

export type ObligationReportResult = {
  html: string;
  folio: string;
  fileName: string;
  message: string;
};

function sortEventsForReport(events: ObligationEventSummary[]): ObligationEventSummary[] {
  return [...events].sort((a, b) => {
    if (a.eventType === "opening" && b.eventType !== "opening") return -1;
    if (b.eventType === "opening" && a.eventType !== "opening") return 1;
    if (a.eventDate !== b.eventDate) return a.eventDate < b.eventDate ? -1 : 1;
    return a.id - b.id;
  });
}

/**
 * Filas cronológicas con saldo corrido. El saldo arranca en el evento de
 * apertura (o en principalAmount si no existe) y aplica cada evento con la
 * misma semántica que la vista de la BD.
 */
export function computeObligationReportRows(
  events: ObligationEventSummary[],
  principalAmount: number,
): ObligationReportRow[] {
  const ordered = sortEventsForReport(events);
  const rows: ObligationReportRow[] = [];
  const hasOpening = ordered.some((event) => event.eventType === "opening");
  let balance = hasOpening ? 0 : principalAmount;

  for (const event of ordered) {
    const amount = Math.abs(event.amount);
    let charge: number | null = null;
    let credit: number | null = null;

    if (event.eventType === "opening" || CHARGE_TYPES.has(event.eventType)) {
      charge = amount;
      balance += amount;
    } else if (CREDIT_TYPES.has(event.eventType)) {
      credit = amount;
      balance -= amount;
    } else {
      // adjustment: con signo tal como está almacenado
      if (event.amount >= 0) {
        charge = event.amount;
      } else {
        credit = Math.abs(event.amount);
      }
      balance += event.amount;
    }

    rows.push({
      eventId: event.id,
      date: event.eventDate,
      label: ANALYTICS_EVENT_LABELS[event.eventType] ?? event.eventType,
      detail: event.description?.trim() || event.reason?.trim() || null,
      installmentNo: event.installmentNo ?? null,
      charge,
      credit,
      balance,
    });
  }
  return rows;
}

export function buildObligationReportFolio(obligationId: number, generatedAt: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const y = generatedAt.getFullYear();
  const stamp = `${y}${pad(generatedAt.getMonth() + 1)}${pad(generatedAt.getDate())}-${pad(generatedAt.getHours())}${pad(generatedAt.getMinutes())}`;
  return `DM-${obligationId}-${stamp}`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** "2026-07-19" → "19 jul 2026" sin corrimiento de zona horaria. */
function formatReportDate(isoDate: string | null | undefined): string {
  if (!isoDate) return "—";
  const parts = isoDate.slice(0, 10).split("-").map(Number);
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) return isoDate;
  const date = new Date(parts[0], parts[1] - 1, parts[2]);
  return new Intl.DateTimeFormat("es-PE", { day: "numeric", month: "short", year: "numeric" }).format(date);
}

const STATUS_LABELS: Record<ObligationSummary["status"], string> = {
  draft: "Borrador",
  active: "Activo",
  paid: "Pagado",
  cancelled: "Cancelado",
  defaulted: "En mora",
};

function statusLabel(obligation: ObligationSummary, today: Date): string {
  const base = STATUS_LABELS[obligation.status] ?? obligation.status;
  if (obligation.status === "active" && obligation.dueDate) {
    const pad = (n: number) => String(n).padStart(2, "0");
    const todayIso = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
    if (obligation.dueDate.slice(0, 10) < todayIso) return `${base} · vencido`;
  }
  return base;
}

function sanitizeFileName(name: string): string {
  return name.trim().replace(/[/\\?%*:|"<>]/g, "_").replace(/\s+/g, "_");
}

export function buildObligationReport(input: ObligationReportInput): ObligationReportResult {
  const { obligation, ownerName } = input;
  const generatedAt = input.generatedAt ?? new Date();
  const folio = buildObligationReportFolio(obligation.id, generatedAt);
  const currency = obligation.currencyCode;
  const money = (amount: number) => formatCurrency(amount, currency);

  const rows = computeObligationReportRows(input.events, obligation.principalAmount);
  const openingAmount = rows.find((row) => row.label === ANALYTICS_EVENT_LABELS.opening)?.charge
    ?? obligation.principalAmount;

  const sum = (predicate: (row: ObligationReportRow) => number) =>
    rows.reduce((total, row) => total + predicate(row), 0);
  const increasesTotal = sum((r) => (r.label === ANALYTICS_EVENT_LABELS.principal_increase ? r.charge ?? 0 : 0));
  const interestFeesTotal = sum((r) =>
    r.label === ANALYTICS_EVENT_LABELS.interest || r.label === ANALYTICS_EVENT_LABELS.fee ? r.charge ?? 0 : 0,
  );
  const paymentsTotal = sum((r) => (r.label === ANALYTICS_EVENT_LABELS.payment ? r.credit ?? 0 : 0));
  const reliefTotal = sum((r) =>
    r.label === ANALYTICS_EVENT_LABELS.discount ||
    r.label === ANALYTICS_EVENT_LABELS.writeoff ||
    r.label === ANALYTICS_EVENT_LABELS.principal_decrease
      ? r.credit ?? 0
      : 0,
  );

  const isReceivable = obligation.direction === "receivable";
  const kindLabel = isReceivable ? "Crédito (por cobrar)" : "Deuda (por pagar)";
  const creditorName = isReceivable ? ownerName ?? "Titular" : obligation.counterparty;
  const debtorName = isReceivable ? obligation.counterparty : ownerName ?? "Titular";
  const progress = Math.max(0, Math.min(100, Math.round(obligation.progressPercent ?? 0)));
  const generatedLabel = new Intl.DateTimeFormat("es-PE", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(generatedAt);

  const summaryRows: Array<[string, string]> = [
    ["Monto original", money(openingAmount)],
    ...(increasesTotal > 0 ? [["Aumentos de capital", `+ ${money(increasesTotal)}`] as [string, string]] : []),
    ...(interestFeesTotal > 0 ? [["Intereses y cargos", `+ ${money(interestFeesTotal)}`] as [string, string]] : []),
    ...(paymentsTotal > 0
      ? [[isReceivable ? "Cobros recibidos" : "Pagos realizados", `− ${money(paymentsTotal)}`] as [string, string]]
      : []),
    ...(reliefTotal > 0 ? [["Descuentos y reducciones", `− ${money(reliefTotal)}`] as [string, string]] : []),
  ];

  const conditionRows: Array<[string, string]> = [
    ["Inicio", formatReportDate(obligation.startDate)],
    ["Vencimiento", formatReportDate(obligation.dueDate)],
    ...(obligation.installmentLabel ? [["Cuotas", obligation.installmentLabel] as [string, string]] : []),
    ...(obligation.interestRate != null
      ? [["Tasa de interés", `${obligation.interestRate}%`] as [string, string]]
      : []),
    ["Estado", statusLabel(obligation, generatedAt)],
  ];

  const tableRows = rows
    .map((row) => {
      const detailParts = [
        row.installmentNo != null ? `Cuota ${row.installmentNo}` : null,
        row.detail ? escapeHtml(row.detail) : null,
      ].filter(Boolean);
      return `<tr>
        <td>${formatReportDate(row.date)}</td>
        <td><strong>${escapeHtml(row.label)}</strong>${detailParts.length ? `<div class="muted">${detailParts.join(" · ")}</div>` : ""}</td>
        <td class="num charge">${row.charge != null ? money(row.charge) : ""}</td>
        <td class="num credit">${row.credit != null ? money(row.credit) : ""}</td>
        <td class="num balance">${money(row.balance)}</td>
      </tr>`;
    })
    .join("\n");

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8" />
<style>
  @page { margin: 28px 32px; }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, "Helvetica Neue", Helvetica, Arial, sans-serif; color: ${REPORT_INK}; font-size: 12px; margin: 0; }
  .brand { display: flex; justify-content: space-between; align-items: baseline; border-bottom: 3px solid ${REPORT_ACCENT}; padding-bottom: 10px; }
  .brand h1 { font-size: 20px; margin: 0; letter-spacing: 0.4px; }
  .brand .app { color: ${REPORT_ACCENT}; font-weight: 700; font-size: 13px; }
  .kind { color: ${REPORT_MUTED}; font-size: 12px; margin-top: 2px; }
  .meta { display: flex; justify-content: space-between; color: ${REPORT_MUTED}; font-size: 10.5px; margin-top: 6px; }
  .parties { display: flex; gap: 24px; margin: 14px 0 4px; }
  .parties div { flex: 1; background: ${REPORT_SOFT_BG}; border-radius: 8px; padding: 8px 12px; }
  .parties .role { color: ${REPORT_MUTED}; font-size: 10px; text-transform: uppercase; letter-spacing: 0.6px; }
  .parties .name { font-weight: 700; font-size: 13px; margin-top: 2px; }
  h2 { font-size: 13px; margin: 18px 0 8px; color: ${REPORT_ACCENT}; text-transform: uppercase; letter-spacing: 0.8px; }
  .summary { width: 100%; border-collapse: collapse; }
  .summary td { padding: 5px 8px; border-bottom: 1px solid ${REPORT_LINE}; }
  .summary td:last-child { text-align: right; font-variant-numeric: tabular-nums; }
  .pending { background: ${REPORT_SOFT_BG}; font-weight: 700; font-size: 14px; }
  .progress-wrap { margin-top: 10px; }
  .progress-track { height: 10px; border-radius: 6px; background: ${REPORT_LINE}; overflow: hidden; }
  .progress-fill { height: 100%; border-radius: 6px; background: ${REPORT_ACCENT}; width: ${progress}%; }
  .progress-label { color: ${REPORT_MUTED}; font-size: 10.5px; margin-top: 4px; }
  table.events { width: 100%; border-collapse: collapse; }
  table.events th { text-align: left; font-size: 10px; text-transform: uppercase; letter-spacing: 0.6px; color: ${REPORT_MUTED}; border-bottom: 2px solid ${REPORT_INK}; padding: 6px 8px; }
  table.events td { padding: 6px 8px; border-bottom: 1px solid ${REPORT_LINE}; vertical-align: top; }
  table.events tr:nth-child(even) td { background: #FAFCFB; }
  .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .charge { color: ${REPORT_DEBIT}; }
  .credit { color: ${REPORT_ACCENT}; }
  .balance { font-weight: 700; }
  .muted { color: ${REPORT_MUTED}; font-size: 10.5px; margin-top: 2px; font-weight: 400; }
  .conditions { display: flex; flex-wrap: wrap; gap: 6px 24px; }
  .conditions div { min-width: 30%; }
  .conditions .k { color: ${REPORT_MUTED}; font-size: 10px; text-transform: uppercase; letter-spacing: 0.6px; }
  .conditions .v { font-weight: 600; margin-top: 1px; }
  footer { margin-top: 22px; border-top: 1px solid ${REPORT_LINE}; padding-top: 8px; color: ${REPORT_MUTED}; font-size: 10px; display: flex; justify-content: space-between; }
</style>
</head>
<body>
  <div class="brand">
    <div>
      <h1>${escapeHtml(obligation.title)}</h1>
      <div class="kind">${kindLabel} · Estado de cuenta</div>
    </div>
    <div class="app">DarkMoney</div>
  </div>
  <div class="meta">
    <span>Moneda: ${escapeHtml(currency)}</span>
    <span>Generado: ${generatedLabel}</span>
    <span>Folio: ${folio}</span>
  </div>

  <div class="parties">
    <div><div class="role">Acreedor</div><div class="name">${escapeHtml(creditorName)}</div></div>
    <div><div class="role">Deudor</div><div class="name">${escapeHtml(debtorName)}</div></div>
  </div>

  <h2>Resumen ejecutivo</h2>
  <table class="summary">
    ${summaryRows.map(([label, value]) => `<tr><td>${escapeHtml(label)}</td><td>${escapeHtml(value)}</td></tr>`).join("\n    ")}
    <tr class="pending"><td>Saldo pendiente</td><td>${money(obligation.pendingAmount)}</td></tr>
  </table>
  <div class="progress-wrap">
    <div class="progress-track"><div class="progress-fill"></div></div>
    <div class="progress-label">${progress}% ${isReceivable ? "cobrado" : "pagado"}</div>
  </div>

  <h2>Historial de movimientos</h2>
  <table class="events">
    <thead>
      <tr><th>Fecha</th><th>Concepto</th><th class="num">Cargo</th><th class="num">Abono</th><th class="num">Saldo</th></tr>
    </thead>
    <tbody>
      ${tableRows || `<tr><td colspan="5" class="muted">Sin movimientos registrados.</td></tr>`}
    </tbody>
  </table>

  <h2>Condiciones</h2>
  <div class="conditions">
    ${conditionRows.map(([k, v]) => `<div><div class="k">${escapeHtml(k)}</div><div class="v">${escapeHtml(v)}</div></div>`).join("\n    ")}
  </div>

  <footer>
    <span>Generado con DarkMoney · ${generatedLabel}</span>
    <span>Folio ${folio}</span>
  </footer>
</body>
</html>`;

  const dateLabel = `${generatedAt.getDate()} de ${new Intl.DateTimeFormat("es-PE", { month: "long" }).format(generatedAt)}`;
  const message =
    `Hola ${obligation.counterparty}, te comparto el estado de cuenta actualizado de nuestro ` +
    `${isReceivable ? "crédito" : "deuda"} «${obligation.title}»: saldo pendiente ` +
    `${money(obligation.pendingAmount)} al ${dateLabel}. Lo genero desde mi app de finanzas ` +
    `para que tengas total transparencia del detalle y el histórico. Cualquier duda me dices. ` +
    `(Folio ${folio})`;

  return {
    html,
    folio,
    fileName: `Reporte_${sanitizeFileName(obligation.title)}_${folio}.pdf`,
    message,
  };
}
