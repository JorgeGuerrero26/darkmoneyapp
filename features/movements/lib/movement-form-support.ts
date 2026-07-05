import { todayPeru } from "../../../lib/date";
import { parsePositiveAmountInput } from "../../../lib/amount-parsing";
import type {
  ExchangeRateSummary,
  MovementStatus,
  MovementType,
} from "../../../types/domain";

/**
 * Tipos y helpers puros del formulario de movimientos, extraídos de
 * components/forms/MovementForm.tsx (fase 1 del refactor R7: el form tenía
 * ~1730 líneas con todo inline). Sin React ni estado: solo datos.
 */

export type MovementFormStep = 1 | 2 | 3;

export type MovementFormState = {
  movementType: MovementType;
  status: MovementStatus;
  sourceAccountId: number | null;
  destinationAccountId: number | null;
  sourceAmount: string;
  destinationAmount: string;
  description: string;
  categoryId: number | null;
  counterpartyId: number | null;
  occurredAt: string;
  notes: string;
};

export type MovementSuggestionLike = {
  id: number;
  movementType: string;
  status: string;
  occurredAt: string;
  sourceAccountId: number | null;
  destinationAccountId: number | null;
  categoryId: number | null;
  counterpartyId: number | null;
  description: string;
  amount: number;
};

export type CategorySuggestionState = {
  categoryId: number | null;
  categoryName: string;
  newCategoryName?: string | null;
  confidence: number;
  reasons: string[];
  source?: "deepseek" | "local";
};

export type TransferFxState = {
  rate: number;
  effectiveAt: string | null;
  label: string;
  source: "api" | "local" | "manual";
  provider?: string;
};

export type CategoryFeedbackIntent = {
  kind: "accepted_category_suggestion" | "manual_category_change";
  categoryId: number;
  categoryName?: string | null;
  confidence?: number | null;
  reasons?: string[];
  source?: "deepseek" | "local";
};

export function readMovementLinkedEventId(metadata: unknown): number | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  const raw = metadata as Record<string, unknown>;
  const eventId = Number(raw.obligation_event_id ?? 0);
  return Number.isFinite(eventId) && eventId > 0 ? eventId : null;
}

export function isSuggestionCashflow(movement: MovementSuggestionLike) {
  return (
    movement.movementType === "income" ||
    movement.movementType === "refund" ||
    movement.movementType === "expense" ||
    movement.movementType === "subscription_payment" ||
    movement.movementType === "obligation_payment"
  );
}

export function suggestionActsAsIncome(movement: MovementSuggestionLike) {
  return movement.movementType === "income" || movement.movementType === "refund";
}

export function formatTransferAmount(value: number) {
  if (!Number.isFinite(value)) return "";
  return String(Math.round(value * 100) / 100);
}

export function formatExchangeRateInput(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "";
  return String(Math.round(value * 1_000_000) / 1_000_000);
}

export function formatExchangeRateLabel(fromCurrencyCode: string, toCurrencyCode: string, rate: number) {
  const from = fromCurrencyCode.trim().toUpperCase();
  const to = toCurrencyCode.trim().toUpperCase();
  if (!from || !to || !Number.isFinite(rate) || rate <= 0) return "";
  return `1 ${from} = ${rate.toLocaleString("es-PE", { maximumFractionDigits: 6 })} ${to}`;
}

export function parseDecimalInput(value: string) {
  // Solo se usa para el tipo de cambio manual: "3,672" es decimal, no miles.
  return parsePositiveAmountInput(value, { kind: "rate" });
}

export function findTransferExchangeRate(
  exchangeRates: ExchangeRateSummary[],
  fromCurrencyCode: string,
  toCurrencyCode: string,
) {
  const from = fromCurrencyCode.trim().toUpperCase();
  const to = toCurrencyCode.trim().toUpperCase();
  if (!from || !to || from === to) return null;

  const candidates = exchangeRates
    .filter((rate) => {
      const rateFrom = rate.fromCurrencyCode.trim().toUpperCase();
      const rateTo = rate.toCurrencyCode.trim().toUpperCase();
      return (
        rate.rate > 0 &&
        ((rateFrom === from && rateTo === to) || (rateFrom === to && rateTo === from))
      );
    })
    .sort((left, right) => new Date(right.effectiveAt).getTime() - new Date(left.effectiveAt).getTime());

  const best = candidates[0];
  if (!best) return null;
  const direct = best.fromCurrencyCode.trim().toUpperCase() === from;
  const resolvedRate = direct ? best.rate : 1 / best.rate;
  if (!Number.isFinite(resolvedRate) || resolvedRate <= 0) return null;
  return {
    rate: resolvedRate,
    effectiveAt: best.effectiveAt,
    label: formatExchangeRateLabel(from, to, resolvedRate),
  };
}

export function getInitialMovementForm(defaultType: MovementType): MovementFormState {
  return {
    movementType: defaultType,
    status: "posted",
    sourceAccountId: null,
    destinationAccountId: null,
    sourceAmount: "",
    destinationAmount: "",
    description: "",
    categoryId: null,
    counterpartyId: null,
    occurredAt: todayPeru(),
    notes: "",
  };
}
