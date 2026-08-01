import type { RecurringIncomeBaseChangeMode } from "../components/RecurringIncomeArrivalSheet";

/** Movida desde app/recurring-income.tsx para compartirla con el dashboard. Cuerpo verbatim. */
export function parseMoneyInput(value: string): number | null {
  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export type ArrivalDraftInput = {
  date: string;
  actualAmount: number | null;
  accountId: number | null;
  baseChangeMode: RecurringIncomeBaseChangeMode;
  parsedNewBaseAmount: number | null;
  currentBaseAmount: number;
};

export type ArrivalDraftResult =
  | { ok: true; nextBaseAmount: number | null }
  | { ok: false; error: string };

export function validateArrivalDraft(input: ArrivalDraftInput): ArrivalDraftResult {
  if (!input.date.trim()) return { ok: false, error: "La fecha real de llegada es obligatoria." };
  if (input.actualAmount == null) return { ok: false, error: "Ingresa un monto real mayor a 0." };
  if (input.accountId == null) return { ok: false, error: "Elige la cuenta destino para registrar el movimiento." };

  let nextBaseAmount: number | null = null;
  if (input.baseChangeMode !== "none") {
    nextBaseAmount = input.parsedNewBaseAmount;
    if (nextBaseAmount == null) {
      return { ok: false, error: "Ingresa el nuevo monto base para las próximas llegadas." };
    }
    if (input.baseChangeMode === "bonus" && nextBaseAmount <= input.currentBaseAmount) {
      return { ok: false, error: "Si hubo bonificación permanente, el nuevo monto base debe ser mayor al actual." };
    }
    if (input.baseChangeMode === "discount" && nextBaseAmount >= input.currentBaseAmount) {
      return { ok: false, error: "Si hubo descuento permanente, el nuevo monto base debe ser menor al actual." };
    }
  }
  return { ok: true, nextBaseAmount };
}
