import type { ObligationEventSummary, ObligationSummary } from "../../../types/domain";
import { formatCurrency } from "../../../lib/format-currency";
import { ANALYTICS_EVENT_LABELS } from "./obligationEventLabels";
import { currencyPluralTitle } from "../../../constants/currencies";

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
/**
 * El papel. La cifra del saldo va sobre tinta plena, y ahí el texto es el fondo.
 *
 * Paleta de impresión, no del tema: el resto de estas constantes son igual de literales porque
 * el gris cálido de la app no imprime.
 */
const REPORT_PAPER = "#FFFFFF"; // allow-hex

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

/** "PEN" no se lee: en un documento que va a un cliente, la moneda se dice en palabras. */
function currencyName(code: string): string {
  return currencyPluralTitle(code) || code;
}

function sanitizeFileName(name: string): string {
  return name.trim().replace(/[/\\?%*:|"<>]/g, "_").replace(/\s+/g, "_");
}

/** Cuántas filas caben por hoja. La primera lleva encima el encabezado y el resumen. */
const ROWS_FIRST_PAGE = 12;
const ROWS_NEXT_PAGE = 22;

/** "2026-07-19" → "19 jul". El año se dice una vez, en el periodo. */
function formatShortDate(isoDate: string): string {
  const parts = isoDate.slice(0, 10).split("-").map(Number);
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) return isoDate;
  const date = new Date(parts[0], parts[1] - 1, parts[2]);
  return new Intl.DateTimeFormat("es-PE", { day: "numeric", month: "short" }).format(date);
}

/** "31 de julio", para la fecha de corte del saldo. */
function formatLongDay(isoDate: string): string {
  const parts = isoDate.slice(0, 10).split("-").map(Number);
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) return isoDate;
  const date = new Date(parts[0], parts[1] - 1, parts[2]);
  return new Intl.DateTimeFormat("es-PE", { day: "numeric", month: "long" }).format(date);
}

function chunk<T>(items: T[], first: number, rest: number): T[][] {
  if (items.length === 0) return [[]];
  const pages: T[][] = [items.slice(0, first)];
  for (let i = first; i < items.length; i += rest) pages.push(items.slice(i, i + rest));
  return pages;
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
  const count = (predicate: (row: ObligationReportRow) => boolean) =>
    rows.reduce((total, row) => total + (predicate(row) ? 1 : 0), 0);

  const isIncrease = (r: ObligationReportRow) => r.label === ANALYTICS_EVENT_LABELS.principal_increase;
  const isPayment = (r: ObligationReportRow) => r.label === ANALYTICS_EVENT_LABELS.payment;
  const isRelief = (r: ObligationReportRow) =>
    r.label === ANALYTICS_EVENT_LABELS.discount ||
    r.label === ANALYTICS_EVENT_LABELS.writeoff ||
    r.label === ANALYTICS_EVENT_LABELS.principal_decrease;
  const isCharge = (r: ObligationReportRow) =>
    r.label === ANALYTICS_EVENT_LABELS.interest || r.label === ANALYTICS_EVENT_LABELS.fee;

  const increasesTotal = sum((r) => (isIncrease(r) ? r.charge ?? 0 : 0));
  const increasesCount = count(isIncrease);
  const interestFeesTotal = sum((r) => (isCharge(r) ? r.charge ?? 0 : 0));
  const paymentsTotal = sum((r) => (isPayment(r) ? r.credit ?? 0 : 0));
  const paymentsCount = count(isPayment);
  const reliefTotal = sum((r) => (isRelief(r) ? r.credit ?? 0 : 0));
  const reliefCount = count(isRelief);

  const isReceivable = obligation.direction === "receivable";
  /** En una venta a cuotas el aumento es una venta más: la palabra la decide el origen. */
  const sellsOnCredit = obligation.originType === "sale_financed";
  const increaseWord = sellsOnCredit
    ? (increasesCount === 1 ? "venta posterior" : "ventas posteriores")
    : (increasesCount === 1 ? "aumento de capital" : "aumentos de capital");
  const reliefWord = sellsOnCredit
    ? (reliefCount === 1 ? "descuento" : "descuentos")
    : (reliefCount === 1 ? "reducción" : "reducciones");
  const paymentWord = isReceivable
    ? (paymentsCount === 1 ? "pago recibido" : "pagos recibidos")
    : (paymentsCount === 1 ? "pago realizado" : "pagos realizados");
  const paymentRowTitle = isReceivable ? "Pago recibido" : "Pago realizado";

  /** El total al que llegó la cuenta: es la base del porcentaje y no figuraba en ninguna parte. */
  const grossTotal = openingAmount + increasesTotal + interestFeesTotal;
  const collected = paymentsTotal;

  const creditorName = isReceivable ? ownerName ?? "Titular" : obligation.counterparty;
  const debtorName = isReceivable ? obligation.counterparty : ownerName ?? "Titular";
  const generatedLabel = new Intl.DateTimeFormat("es-PE", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(generatedAt);

  const firstDate = rows[0]?.date ?? obligation.startDate;
  const lastDate = rows[rows.length - 1]?.date ?? obligation.startDate;
  const periodLabel = rows.length > 0
    ? `${formatShortDate(firstDate)} — ${formatReportDate(lastDate)}`
    : formatReportDate(obligation.startDate);

  const summaryRows: Array<[string, string]> = [
    [`Apertura, ${formatLongDay(obligation.startDate)}`, money(openingAmount)],
    ...(increasesCount > 0
      ? [[`${increasesCount} ${increaseWord}`, `+ ${money(increasesTotal)}`] as [string, string]]
      : []),
    ...(interestFeesTotal > 0
      ? [["Intereses y cargos", `+ ${money(interestFeesTotal)}`] as [string, string]]
      : []),
    ...(paymentsCount > 0
      ? [[`${paymentsCount} ${paymentWord}`, `− ${money(paymentsTotal)}`] as [string, string]]
      : []),
    ...(reliefCount > 0
      ? [[`${reliefCount} ${reliefWord}`, `− ${money(reliefTotal)}`] as [string, string]]
      : []),
  ];

  /**
   * Las condiciones no pueden afirmar una fecha que la propia tabla desmiente: a la cuota
   * pactada, el saldo actual llega a cero mucho después. Se dice que es lo **pactado** y se pone
   * al lado el saldo que quedaría en esa fecha a ese ritmo.
   */
  const dueProjection = (() => {
    if (!obligation.dueDate || !obligation.installmentAmount || obligation.installmentAmount <= 0) return null;
    const due = new Date(obligation.dueDate.slice(0, 10));
    const months = Math.max(
      0,
      (due.getFullYear() - generatedAt.getFullYear()) * 12 + (due.getMonth() - generatedAt.getMonth()),
    );
    const projected = Math.max(0, obligation.pendingAmount - months * obligation.installmentAmount);
    return { months, projected };
  })();

  const conditionRows: Array<[string, string]> = [
    ["Inicio", formatReportDate(obligation.startDate)],
    ...(obligation.dueDate
      ? [[
          "Vencimiento pactado",
          dueProjection
            ? `${formatReportDate(obligation.dueDate)} · saldo proyectado ${money(dueProjection.projected)}`
            : formatReportDate(obligation.dueDate),
        ] as [string, string]]
      : []),
    ...(obligation.installmentLabel
      ? [["Cuota pactada", obligation.installmentLabel] as [string, string]]
      : []),
    ...(obligation.interestRate != null
      ? [["Tasa de interés", `${obligation.interestRate}%`] as [string, string]]
      : []),
    ["Estado", statusLabel(obligation, generatedAt)],
  ];

  /**
   * El título de la fila es lo que la hace única —el producto—, no el tipo de evento, que se
   * repetía trece veces en la columna más visible. La dirección la dice el signo.
   *
   * Los pagos sí llevan su etiqueta, porque "Cuota 1" solo no se entiende. Y una fila sin
   * concepto se marca como dato faltante: en algo que le envías a un cliente, un renglón sin
   * explicación es una pregunta esperando.
   */
  function rowTitle(row: ObligationReportRow): string {
    if (row.label === ANALYTICS_EVENT_LABELS.opening) return escapeHtml("Apertura del registro");
    if (isPayment(row)) return escapeHtml(paymentRowTitle);
    if (row.detail) return escapeHtml(row.detail);
    if (isIncrease(row)) {
      return `<span class="missing">${escapeHtml(sellsOnCredit ? "Venta sin descripción" : "Aumento sin descripción")}</span>`;
    }
    return escapeHtml(row.label);
  }

  function rowSubtitle(row: ObligationReportRow): string | null {
    const parts = [
      row.installmentNo != null ? `Cuota ${row.installmentNo}` : null,
      isPayment(row) && row.detail ? row.detail : null,
      !isPayment(row) && row.detail && row.label !== ANALYTICS_EVENT_LABELS.opening
        && row.label !== ANALYTICS_EVENT_LABELS.principal_increase
        ? row.label
        : null,
    ].filter(Boolean) as string[];
    return parts.length > 0 ? escapeHtml(parts.join(" · ")) : null;
  }

  const pages = chunk(rows, ROWS_FIRST_PAGE, ROWS_NEXT_PAGE);
  const pageCount = pages.length;

  function renderRows(pageRows: ObligationReportRow[]): string {
    return pageRows
      .map((row) => {
        const signed = row.charge != null ? `+ ${money(row.charge)}` : `− ${money(row.credit ?? 0)}`;
        const subtitle = rowSubtitle(row);
        return `<tr>
        <td class="date">${formatShortDate(row.date)}</td>
        <td><span class="concept">${rowTitle(row)}</span>${subtitle ? `<div class="muted">${subtitle}</div>` : ""}</td>
        <td class="num">${signed}</td>
        <td class="num balance">${money(row.balance)}</td>
      </tr>`;
      })
      .join("\n");
  }

  const tablePages = pages
    .map((pageRows, index) => {
      const isLast = index === pageCount - 1;
      const carriedIn = index > 0 ? pages[index - 1][pages[index - 1].length - 1]?.balance ?? null : null;
      const carriedOut = !isLast ? pageRows[pageRows.length - 1]?.balance ?? null : null;
      return `<section class="sheet${isLast ? "" : " sheet-break"}">
    ${index > 0 ? `<div class="continues">Viene de la página ${index} · saldo arrastrado <strong>${money(carriedIn ?? 0)}</strong></div>` : ""}
    <div class="table-head">
      <h2>Movimientos</h2>
      <span class="table-meta">${rows.length} en total · página ${index + 1} de ${pageCount}</span>
    </div>
    <table class="events">
      <thead>
        <tr><th>Fecha</th><th>Detalle</th><th class="num">Movimiento</th><th class="num">Saldo</th></tr>
      </thead>
      <tbody>
        ${renderRows(pageRows) || `<tr><td colspan="4" class="muted">Sin movimientos registrados.</td></tr>`}
      </tbody>
    </table>
    ${carriedOut != null ? `<div class="continues">Continúa en la página ${index + 2} · saldo arrastrado <strong>${money(carriedOut)}</strong></div>` : ""}
    <footer><span>Folio ${folio}</span><span>${index + 1} / ${pageCount}</span></footer>
  </section>`;
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
  .sheet-break { page-break-after: always; }
  .brand { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid ${REPORT_ACCENT}; padding-bottom: 10px; }
  .brand h1 { font-size: 20px; margin: 0; letter-spacing: 0.4px; }
  .brand .kind { color: ${REPORT_MUTED}; font-size: 12px; margin-top: 3px; }
  .brand .app { color: ${REPORT_ACCENT}; font-weight: 700; font-size: 13px; text-align: right; }
  .brand .stamp { color: ${REPORT_MUTED}; font-size: 10px; margin-top: 3px; text-align: right; }
  .parties { display: flex; gap: 18px; margin: 14px 0 4px; }
  .parties div { flex: 1; }
  .parties .role { color: ${REPORT_MUTED}; font-size: 9.5px; text-transform: uppercase; letter-spacing: 0.6px; }
  .parties .name { font-weight: 700; font-size: 12.5px; margin-top: 2px; }
  .pending-block { background: ${REPORT_INK}; color: ${REPORT_PAPER}; border-radius: 10px; padding: 14px 18px; margin: 14px 0 6px; display: flex; justify-content: space-between; align-items: flex-end; }
  .pending-block .k { font-size: 9.5px; text-transform: uppercase; letter-spacing: 0.8px; opacity: 0.75; }
  .pending-block .v { font-size: 30px; font-weight: 700; font-variant-numeric: tabular-nums; margin-top: 4px; }
  .pending-block .side { text-align: right; font-size: 11px; opacity: 0.85; line-height: 1.5; }
  h2 { font-size: 12px; margin: 16px 0 6px; color: ${REPORT_ACCENT}; text-transform: uppercase; letter-spacing: 0.8px; }
  .summary { width: 100%; border-collapse: collapse; }
  .summary td { padding: 5px 2px; border-bottom: 1px solid ${REPORT_LINE}; }
  .summary td:last-child { text-align: right; font-variant-numeric: tabular-nums; }
  .summary tr.total td { font-weight: 700; border-bottom: none; }
  .table-head { display: flex; justify-content: space-between; align-items: baseline; }
  .table-meta { color: ${REPORT_MUTED}; font-size: 10px; }
  table.events { width: 100%; border-collapse: collapse; }
  table.events th { text-align: left; font-size: 9.5px; text-transform: uppercase; letter-spacing: 0.6px; color: ${REPORT_MUTED}; border-bottom: 2px solid ${REPORT_INK}; padding: 6px 4px; }
  table.events td { padding: 6px 4px; border-bottom: 1px solid ${REPORT_LINE}; vertical-align: top; }
  table.events tr:nth-child(even) td { background: #FAFCFB; }
  .date { color: ${REPORT_MUTED}; white-space: nowrap; }
  .concept { font-weight: 600; }
  .missing { font-style: italic; color: ${REPORT_MUTED}; font-weight: 400; }
  .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .balance { font-weight: 700; }
  .muted { color: ${REPORT_MUTED}; font-size: 10.5px; margin-top: 2px; font-weight: 400; }
  .continues { color: ${REPORT_MUTED}; font-size: 10.5px; padding: 6px 2px; }
  .conditions { display: flex; flex-wrap: wrap; gap: 6px 24px; margin-top: 4px; }
  .conditions div { min-width: 30%; }
  .conditions .k { color: ${REPORT_MUTED}; font-size: 9.5px; text-transform: uppercase; letter-spacing: 0.6px; }
  .conditions .v { font-weight: 600; margin-top: 1px; }
  footer { margin-top: 14px; border-top: 1px solid ${REPORT_LINE}; padding-top: 6px; color: ${REPORT_MUTED}; font-size: 9.5px; display: flex; justify-content: space-between; }
</style>
</head>
<body>
  <div class="brand">
    <div>
      <h1>${escapeHtml(obligation.title)}</h1>
      <div class="kind">Estado de cuenta · ${escapeHtml(obligation.counterparty)}</div>
    </div>
    <div>
      <div class="app">DarkMoney</div>
      <div class="stamp">${folio}</div>
      <div class="stamp">${generatedLabel}</div>
    </div>
  </div>

  <div class="parties">
    <div><div class="role">Acreedor</div><div class="name">${escapeHtml(creditorName)}</div></div>
    <div><div class="role">Deudor</div><div class="name">${escapeHtml(debtorName)}</div></div>
    <div><div class="role">Periodo</div><div class="name">${escapeHtml(periodLabel)}</div></div>
    <div><div class="role">Moneda</div><div class="name">${escapeHtml(currencyName(currency))}</div></div>
  </div>

  <div class="pending-block">
    <div>
      <div class="k">Saldo pendiente al ${escapeHtml(formatLongDay(lastDate))}</div>
      <div class="v">${money(obligation.pendingAmount)}</div>
    </div>
    <div class="side">
      ${isReceivable ? "Cobrado" : "Pagado"} ${money(collected)}<br />de ${money(grossTotal)} en total
    </div>
  </div>

  <h2>Cómo se formó el saldo</h2>
  <table class="summary">
    ${summaryRows.map(([label, value]) => `<tr><td>${escapeHtml(label)}</td><td>${escapeHtml(value)}</td></tr>`).join("\n    ")}
    <tr class="total"><td>Saldo pendiente</td><td>${money(obligation.pendingAmount)}</td></tr>
  </table>

  ${tablePages}

  <h2>Condiciones</h2>
  <div class="conditions">
    ${conditionRows.map(([k, v]) => `<div><div class="k">${escapeHtml(k)}</div><div class="v">${escapeHtml(v)}</div></div>`).join("\n    ")}
  </div>
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
