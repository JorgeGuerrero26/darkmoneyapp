import { DUE_SOON_DAYS } from "../../../lib/due-tone";
import { computeNextRecurringDate } from "../../../lib/subscription-helpers";
import type { RecurringIncomeSummary } from "../../../types/domain";

export type RecurringIncomeStandingTone = "unconfirmed" | "soon" | "later" | "paused" | "cancelled";

export type RecurringIncomeStanding = {
  tone: RecurringIncomeStandingTone;
  /** La línea de la fila: "Se esperaba el 29 jul · 2 llegadas sin anotar". */
  detail: string;
  /** Llegadas que ya vencieron y nadie confirmó. */
  missedArrivals: number;
  missedAmount: number;
  daysUntilExpected: number;
};

type Args = {
  item: RecurringIncomeSummary;
  /** `yyyy-MM-dd`. */
  today: string;
  formatAmount: (amount: number) => string;
  /** De `yyyy-MM-dd` a como se lee: "29 jul". */
  formatDate: (ymd: string) => string;
};

function parseYmd(ymd: string): Date {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

function daysBetween(from: string, to: string): number {
  const a = parseYmd(from);
  const b = parseYmd(to);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return 0;
  return Math.round(
    (Date.UTC(a.getFullYear(), a.getMonth(), a.getDate()) -
      Date.UTC(b.getFullYear(), b.getMonth(), b.getDate())) /
      86_400_000,
  );
}

function countMissedArrivals(item: RecurringIncomeSummary, today: string): number {
  let cursor = item.nextExpectedDate;
  let count = 0;
  while (count < 400 && daysBetween(cursor, today) < 0) {
    count += 1;
    const next = computeNextRecurringDate(cursor, item.frequency, item.intervalCount, item.dayOfMonth);
    if (next === cursor) break;
    cursor = next;
  }
  return count;
}

/**
 * En qué situación está un ingreso fijo.
 *
 * **Un ingreso sin confirmar no es lo mismo que un gasto sin anotar.** El gasto que no anotas
 * infla tu saldo y tarde o temprano lo notas al mirar la cuenta. El ingreso que no confirmas
 * hace lo contrario: la app te **promete** una plata que puede no haber llegado. Aquí eso valía
 * "Próximo: 29 jul" en gris con una cápsula verde al lado, treinta y seis días después.
 *
 * Se llama **"sin confirmar"** y no "atrasado" a propósito: el ingreso pudo llegar y faltar
 * anotarlo, o no haber llegado. Las dos cosas piden lo mismo — que lo revises — y la app no
 * puede saber cuál es sin que alguien lo mire.
 */
export function recurringIncomeStanding({
  item,
  today,
  formatAmount,
  formatDate,
}: Args): RecurringIncomeStanding {
  const daysUntilExpected = daysBetween(item.nextExpectedDate, today);

  if (item.status === "cancelled") {
    return {
      tone: "cancelled",
      detail: "Cancelado · ya no se espera",
      missedArrivals: 0,
      missedAmount: 0,
      daysUntilExpected,
    };
  }

  if (item.status === "paused") {
    return {
      tone: "paused",
      detail: `Pausado · la llegada quedó en el ${formatDate(item.nextExpectedDate)}`,
      missedArrivals: 0,
      missedAmount: 0,
      daysUntilExpected,
    };
  }

  if (daysUntilExpected < 0) {
    const missedArrivals = countMissedArrivals(item, today);
    const missedAmount = missedArrivals * item.amount;
    const arrivals = missedArrivals === 1 ? "1 llegada sin anotar" : `${missedArrivals} llegadas sin anotar`;
    return {
      tone: "unconfirmed",
      detail: `Se esperaba el ${formatDate(item.nextExpectedDate)} · ${arrivals}`,
      missedArrivals,
      missedAmount,
      daysUntilExpected,
    };
  }

  const account = item.accountName ? ` · a ${item.accountName}` : "";
  if (daysUntilExpected === 0) {
    return {
      tone: "soon",
      detail: `Llega hoy${account}`,
      missedArrivals: 0,
      missedAmount: 0,
      daysUntilExpected,
    };
  }

  return {
    tone: daysUntilExpected <= DUE_SOON_DAYS ? "soon" : "later",
    detail: `Llega el ${formatDate(item.nextExpectedDate)}${account}`,
    missedArrivals: 0,
    missedAmount: 0,
    daysUntilExpected,
  };
}
