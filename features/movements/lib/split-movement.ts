import { parsePositiveAmountInput } from "../../../lib/amount-parsing";

/**
 * Split de montos (backlog P3, v1): dividir un GASTO en varias categorías al
 * crearlo. Cada línea genera un movimiento propio (misma cuenta/fecha/descripción
 * con sufijo i/n) enlazados por metadata.splitGroup — así presupuestos y
 * analítica ven cada categoría con su monto real sin cambios de esquema.
 */

export type SplitLine = {
  categoryId: number | null;
  amount: string;
};

export type SplitValidation = {
  valid: boolean;
  /** Diferencia total - suma de líneas (redondeada a 2 decimales). */
  remaining: number;
  error: string | null;
};

export function emptySplitLines(): SplitLine[] {
  return [
    { categoryId: null, amount: "" },
    { categoryId: null, amount: "" },
  ];
}

export function validateSplit(lines: SplitLine[], totalAmount: number): SplitValidation {
  if (!Number.isFinite(totalAmount) || totalAmount <= 0) {
    return { valid: false, remaining: 0, error: "Ingresa primero el monto total del gasto" };
  }
  if (lines.length < 2) {
    return { valid: false, remaining: totalAmount, error: "Una división necesita al menos 2 líneas" };
  }
  let sum = 0;
  for (const line of lines) {
    const amount = parsePositiveAmountInput(line.amount);
    if (amount == null) {
      return { valid: false, remaining: round2(totalAmount - sum), error: "Cada línea necesita un monto mayor a 0" };
    }
    if (line.categoryId == null) {
      return { valid: false, remaining: round2(totalAmount - sum - amount), error: "Cada línea necesita una categoría" };
    }
    sum += amount;
  }
  const remaining = round2(totalAmount - sum);
  if (Math.abs(remaining) > 0.009) {
    return {
      valid: false,
      remaining,
      error: remaining > 0
        ? `Faltan ${remaining.toFixed(2)} por asignar`
        : `Te pasaste por ${Math.abs(remaining).toFixed(2)}`,
    };
  }
  return { valid: true, remaining: 0, error: null };
}

export function splitLineDescription(baseDescription: string, index: number, total: number): string {
  const base = baseDescription.trim() || "Gasto dividido";
  return `${base} (${index + 1}/${total})`;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
