import { DUE_SOON_DAYS } from "../../../lib/due-tone";
import { computeNextRecurringDate } from "../../../lib/subscription-helpers";
import type { SubscriptionSummary } from "../../../types/domain";

export type SubscriptionStandingTone = "overdue" | "soon" | "later" | "paused" | "cancelled";

export type SubscriptionStanding = {
  tone: SubscriptionStandingTone;
  /** El estado en una palabra: "Atrasada", "Al día". */
  label: string;
  /** La cuenta completa, en una frase. */
  detail: string;
  /** Cobros ya vencidos y sin anotar. 0 cuando está al día. */
  missedCharges: number;
  missedAmount: number;
  /** Días hasta el próximo cobro; negativo si ya pasó. */
  daysUntilDue: number;
};

type Args = {
  subscription: SubscriptionSummary;
  /** `yyyy-MM-dd`. */
  today: string;
  formatAmount: (amount: number) => string;
  /** De `yyyy-MM-dd` a como se lee: "4 jun". */
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

/** Cuántos cobros llegaron a vencer entre la fecha pendiente y hoy, ambos incluidos. */
function countMissedCharges(subscription: SubscriptionSummary, today: string): number {
  let cursor = subscription.nextDueDate;
  let count = 0;
  // Un tope duro: una suscripción diaria abandonada un año son 365 vueltas, y nadie necesita
  // el número exacto pasado ese punto.
  while (count < 400 && daysBetween(cursor, today) <= 0) {
    count += 1;
    const next = computeNextRecurringDate(cursor, subscription.frequency, subscription.intervalCount);
    if (next === cursor) break; // salvaguarda: una cadencia rota no cuelga la pantalla
    cursor = next;
  }
  return count;
}

/**
 * En qué situación está la suscripción, dicho como se le diría a alguien.
 *
 * Nace del caso que lo hizo evidente: "Próximo cobro · 4 jun 2026 · Hace 90 días" con la
 * cápsula diciendo **"Activa"** en menta. Las dos cosas eran ciertas —el acuerdo sigue en pie—
 * y juntas describían como saludable una suscripción vencida tres veces. Los tres datos que
 * faltaban (qué día debía cobrarse, cuántos cobros van sin anotar y cuánto suman) había que
 * reconstruirlos entre una línea en letra chica y una tarjeta de movimientos vacía.
 *
 * Va aparte de la pantalla y sin nada de React para poder probar la aritmética: contar los
 * cobros vencidos es la parte que se equivoca sola en los meses de 31 días y en los bisiestos.
 */
export function subscriptionStanding({
  subscription,
  today,
  formatAmount,
  formatDate,
}: Args): SubscriptionStanding {
  const daysUntilDue = daysBetween(subscription.nextDueDate, today);

  if (subscription.status === "cancelled") {
    return {
      tone: "cancelled",
      label: "Cancelada",
      detail: "Ya no genera cobros. Su historial se conserva.",
      missedCharges: 0,
      missedAmount: 0,
      daysUntilDue,
    };
  }

  if (subscription.status === "paused") {
    return {
      tone: "paused",
      label: "Pausada",
      detail: "No se cobrará hasta que la reactives.",
      missedCharges: 0,
      missedAmount: 0,
      daysUntilDue,
    };
  }

  if (daysUntilDue < 0) {
    const missedCharges = countMissedCharges(subscription, today);
    const missedAmount = missedCharges * subscription.amount;
    const late = Math.abs(daysUntilDue);
    const charges = missedCharges === 1
      ? "Va 1 cobro sin anotar"
      : `Van ${missedCharges} cobros sin anotar`;
    return {
      tone: "overdue",
      label: "Atrasada",
      detail: `Debía cobrarse el ${formatDate(subscription.nextDueDate)}, hace ${late} ${late === 1 ? "día" : "días"}. ${charges}, ${formatAmount(missedAmount)}.`,
      missedCharges,
      missedAmount,
      daysUntilDue,
    };
  }

  if (daysUntilDue === 0) {
    return {
      tone: "soon",
      label: "Se cobra hoy",
      detail: `Toca hoy, ${formatAmount(subscription.amount)}.`,
      missedCharges: 0,
      missedAmount: 0,
      daysUntilDue,
    };
  }

  const when = `el ${formatDate(subscription.nextDueDate)}, en ${daysUntilDue} ${daysUntilDue === 1 ? "día" : "días"}`;
  // El umbral de "está cerca" es el mismo de toda la app (lib/due-tone), no uno de esta pantalla.
  return daysUntilDue <= DUE_SOON_DAYS
    ? {
        tone: "soon",
        label: "Por cobrar",
        detail: `Se cobra ${when}, ${formatAmount(subscription.amount)}.`,
        missedCharges: 0,
        missedAmount: 0,
        daysUntilDue,
      }
    : {
        tone: "later",
        label: "Al día",
        detail: `Próximo cobro ${when}, ${formatAmount(subscription.amount)}.`,
        missedCharges: 0,
        missedAmount: 0,
        daysUntilDue,
      };
}
