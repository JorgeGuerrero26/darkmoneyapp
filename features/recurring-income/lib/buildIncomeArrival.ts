import { dateStrToISO } from "../../../lib/date";
import { computeNextRecurringDate } from "../../../lib/subscription-helpers";
import type { RecurringIncomeFrequency } from "../../../types/domain";

export type IncomeArrivalInput = {
  recurringIncomeId: number;
  recurringIncomeName: string;
  expectedDate: string;
  actualDate: string;
  amount: number;
  accountId: number;
  currentAccountId?: number | null;
  categoryId?: number | null;
  payerPartyId?: number | null;
  description?: string | null;
  currencyCode: string;
  frequency: RecurringIncomeFrequency;
  intervalCount: number;
  currentBaseAmount: number;
  newBaseAmount?: number | null;
  baseChangeKind?: "bonus" | "discount" | null;
  notes?: string | null;
};

function joinNotes(...parts: Array<string | null | undefined>) {
  const normalized = parts.map((part) => part?.trim()).filter((part): part is string => Boolean(part));
  return normalized.length > 0 ? normalized.join("\n") : null;
}

function formatAmountWithCurrency(amount: number, currencyCode: string) {
  return `${currencyCode.trim().toUpperCase()} ${amount.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * Lo que cambia al anotar la llegada de un ingreso fijo: el movimiento del ingreso, la fila de su historial y el avance
 * de la próxima fecha (y, si se pidió, del monto esperado). Lo usan el camino en línea y el local (sin conexión), para que
 * ambos escriban exactamente lo mismo.
 */
export function buildIncomeArrival(input: IncomeArrivalInput) {
  const actual = input.actualDate.trim();
  const expected = input.expectedDate.trim();
  if (!actual) throw new Error("La fecha real de llegada es obligatoria.");
  if (!input.accountId) throw new Error("Debes elegir una cuenta destino para crear el movimiento.");

  const nextExpectedDate = computeNextRecurringDate(expected, input.frequency, input.intervalCount);
  const status = actual <= expected ? "on_time" : "late";
  const requestedBaseAmount = input.newBaseAmount != null ? Number(input.newBaseAmount) : null;
  const shouldUpdateBaseAmount =
    requestedBaseAmount != null &&
    Number.isFinite(requestedBaseAmount) &&
    requestedBaseAmount > 0 &&
    Math.abs(requestedBaseAmount - input.currentBaseAmount) > 0.000001;

  /* Se cuenta lo que de verdad cambió, no un motivo que la persona nunca dio. */
  const baseChangeSummary = shouldUpdateBaseAmount
    ? `El monto esperado de las próximas llegadas pasa de ${formatAmountWithCurrency(input.currentBaseAmount, input.currencyCode)} a ${formatAmountWithCurrency(requestedBaseAmount!, input.currencyCode)}.`
    : null;
  const movementNotes = joinNotes(input.notes?.trim() || null, baseChangeSummary);

  const movementFields = {
    movement_type: "income",
    status: "posted",
    occurred_at: dateStrToISO(actual),
    description: input.description?.trim() || input.recurringIncomeName.trim(),
    notes: movementNotes,
    source_account_id: null,
    source_amount: null,
    destination_account_id: input.accountId,
    destination_amount: input.amount,
    fx_rate: null,
    category_id: input.categoryId ?? null,
    spend_type_id: null,
    counterparty_id: input.payerPartyId ?? null,
    obligation_id: null,
    subscription_id: null,
    metadata: {
      recurring_income_id: input.recurringIncomeId,
      recurring_income_expected_date: expected,
      recurring_income_actual_date: actual,
      recurring_income_confirmed_arrival: true,
      recurring_income_base_change_kind: input.baseChangeKind ?? null,
      recurring_income_base_amount_before: input.currentBaseAmount,
      recurring_income_base_amount_after: shouldUpdateBaseAmount ? requestedBaseAmount : null,
    },
    // Identifica ESTA llegada: reenviarla no la duplica.
    client_dedupe_key: `income-arrival:${input.recurringIncomeId}:${expected}`,
  };

  const occurrenceFields = {
    recurring_income_id: input.recurringIncomeId,
    expected_date: expected,
    actual_date: actual,
    amount: input.amount,
    currency_code: input.currencyCode,
    status,
    notes: movementNotes,
  };

  const recurringIncomePatch: Record<string, unknown> = { next_expected_date: nextExpectedDate };
  if (shouldUpdateBaseAmount) recurringIncomePatch.amount = requestedBaseAmount;
  if (!input.currentAccountId && input.accountId) recurringIncomePatch.account_id = input.accountId;

  return {
    nextExpectedDate,
    updatedBaseAmount: shouldUpdateBaseAmount ? requestedBaseAmount : null,
    movementFields,
    occurrenceFields,
    recurringIncomePatch,
  };
}
