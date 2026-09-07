/**
 * Qué pasa con lo que se espera de aquí en adelante.
 *
 * Antes eran tres cápsulas —Sin cambio / Bonificación / Descuento— que nombraban **el motivo**
 * cuando lo que decidían era **si el cambio afecta a las próximas llegadas**. Y estaban al
 * revés: una bonificación es justo lo contrario de permanente, y ahí se ofrecía como cambio de
 * base para siempre. El motivo, si importa, es la nota.
 */
export type RecurringIncomeBaseChangeMode = "once" | "forever";

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
  currentBaseAmount: number;
};

export type ArrivalDraftResult =
  | { ok: true; nextBaseAmount: number | null }
  | { ok: false; error: string };

/**
 * Lo que hace falta para anotar una llegada.
 *
 * **El nuevo monto base ya no es un campo aparte.** Se pedía por separado, con dos reglas que se
 * contradecían con el resto de la hoja —"si hubo bonificación, el nuevo monto debe ser mayor"—
 * para acabar en el número que el usuario ya había escrito arriba. Si dice que a partir de ahora
 * llega esto, lo que llega **es** lo que acaba de declarar.
 */
export function validateArrivalDraft(input: ArrivalDraftInput): ArrivalDraftResult {
  if (!input.date.trim()) return { ok: false, error: "La fecha real de llegada es obligatoria." };
  if (input.actualAmount == null) return { ok: false, error: "Ingresa un monto real mayor a 0." };
  if (input.accountId == null) return { ok: false, error: "Elige la cuenta destino para registrar el movimiento." };

  // "Desde ahora" sin diferencia no cambia nada: el nuevo base sería el que ya estaba.
  const changesBase =
    input.baseChangeMode === "forever" &&
    Math.round((input.actualAmount - input.currentBaseAmount) * 100) !== 0;

  return { ok: true, nextBaseAmount: changesBase ? input.actualAmount : null };
}
