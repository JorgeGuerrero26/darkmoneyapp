import { DUE_SOON_DAYS } from "../../../lib/due-tone";
import { computeNextRecurringDate } from "../../../lib/subscription-helpers";
import type { RecurringIncomeSummary } from "../../../types/domain";

export type RecurringIncomeStandingTone = "unconfirmed" | "soon" | "later" | "paused" | "cancelled";

export type RecurringIncomeStanding = {
  tone: RecurringIncomeStandingTone;
  /** El estado en dos palabras, para la cápsula: "2 sin confirmar", "Al día". */
  label: string;
  /** La línea de la fila: "Se esperaba el 29 jul · 2 llegadas sin anotar". */
  detail: string;
  /**
   * La cuenta entera, para la tarjeta del detalle: "Debió llegar el 29 jul y el 29 ago. Son
   * S/ 5,261.00 sin anotar." Ahí cabe una frase; en una fila de lista, no.
   */
  summary: string;
  /** Llegadas que ya vencieron y nadie confirmó. */
  missedArrivals: number;
  missedAmount: number;
  /**
   * Las fechas de esas llegadas, de la más vieja a la más nueva.
   *
   * Son las que faltaban en la pantalla: el historial solo listaba lo anotado, así que las que
   * nadie confirmó no aparecían en ninguna parte — justo las que hay que resolver.
   */
  pendingDates: string[];
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

/** Las llegadas que ya vencieron sin que nadie las confirmara, de la más vieja a la más nueva. */
function missedArrivalDates(item: RecurringIncomeSummary, today: string): string[] {
  const dates: string[] = [];
  let cursor = item.nextExpectedDate;
  while (dates.length < 400 && daysBetween(cursor, today) < 0) {
    dates.push(cursor);
    const next = computeNextRecurringDate(cursor, item.frequency, item.intervalCount, item.dayOfMonth);
    if (next === cursor) break;
    cursor = next;
  }
  return dates;
}

/**
 * "el 29 jul y el 29 ago". A partir de cuatro se dice el número y la primera: enumerar ocho
 * fechas en la tarjeta ocupa tres líneas para decir lo que ya dice "8 veces".
 */
function listDates(dates: string[], formatDate: (ymd: string) => string): string {
  const shown = dates.map((ymd) => `el ${formatDate(ymd)}`);
  if (shown.length === 1) return shown[0];
  if (shown.length <= 3) return `${shown.slice(0, -1).join(", ")} y ${shown[shown.length - 1]}`;
  return `${dates.length} veces desde ${shown[0]}`;
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
      label: "Cancelado",
      detail: "Cancelado · ya no se espera",
      summary: "Cancelado: ya no se espera ninguna llegada.",
      missedArrivals: 0,
      missedAmount: 0,
      pendingDates: [],
      daysUntilExpected,
    };
  }

  if (item.status === "paused") {
    return {
      tone: "paused",
      label: "Pausado",
      detail: `Pausado · la llegada quedó en el ${formatDate(item.nextExpectedDate)}`,
      summary: `En pausa. La llegada quedó en el ${formatDate(item.nextExpectedDate)} y no se espera hasta que lo reactives.`,
      missedArrivals: 0,
      missedAmount: 0,
      pendingDates: [],
      daysUntilExpected,
    };
  }

  if (daysUntilExpected < 0) {
    const pendingDates = missedArrivalDates(item, today);
    const missedArrivals = pendingDates.length;
    const missedAmount = missedArrivals * item.amount;
    const arrivals = missedArrivals === 1 ? "1 llegada sin anotar" : `${missedArrivals} llegadas sin anotar`;
    return {
      tone: "unconfirmed",
      label: `${missedArrivals} sin confirmar`,
      detail: `Se esperaba el ${formatDate(item.nextExpectedDate)} · ${arrivals}`,
      // El monto es lo que la pantalla no decía en ninguna parte: cuánta plata hay sin anotar.
      summary: `Debió llegar ${listDates(pendingDates, formatDate)}. Son ${formatAmount(missedAmount)} sin anotar.`,
      missedArrivals,
      missedAmount,
      pendingDates,
      daysUntilExpected,
    };
  }

  const account = item.accountName ? ` · a ${item.accountName}` : "";
  if (daysUntilExpected === 0) {
    return {
      tone: "soon",
      label: "Llega hoy",
      detail: `Llega hoy${account}`,
      summary: `Llega hoy${account}.`,
      missedArrivals: 0,
      missedAmount: 0,
      pendingDates: [],
      daysUntilExpected,
    };
  }

  return {
    tone: daysUntilExpected <= DUE_SOON_DAYS ? "soon" : "later",
    label: "Al día",
    detail: `Llega el ${formatDate(item.nextExpectedDate)}${account}`,
    summary: `La próxima llega el ${formatDate(item.nextExpectedDate)}${account}.`,
    missedArrivals: 0,
    missedAmount: 0,
    pendingDates: [],
    daysUntilExpected,
  };
}
