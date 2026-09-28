type Args = {
  /** "updated" = se editó uno existente (revisión 41b): mismo detalle, otro titular. */
  action?: "saved" | "updated";
  movementType?: string | null;
  description?: string | null;
  sourceAmount?: number | null;
  destinationAmount?: number | null;
  sourceCurrency?: string | null;
  destinationCurrency?: string | null;
  formatAmount: (amount: number, currency: string) => string;
};

const TITLE: Record<string, string> = {
  expense: "Gasto guardado",
  income: "Ingreso guardado",
  transfer: "Transferencia guardada",
};

/**
 * Lo que dice el aviso al guardar un movimiento.
 *
 * Decía **"Movimiento guardado · Toca deshacer si fue un error"**: ni qué se guardó ni cuánto, y
 * la segunda línea explicaba un botón que ya está a la vista. Es el momento en que uno comprueba
 * que registró lo que creía, así que ahora nombra el tipo, el detalle y el monto con su signo
 * (revisión 40: "Gasto guardado · Cebada · −S/ 3.00").
 *
 * Hermano de `describeDeletedMovement`, que hace lo mismo al borrar.
 */
export function describeSavedMovement({
  action = "saved",
  movementType,
  description,
  sourceAmount,
  destinationAmount,
  sourceCurrency,
  destinationCurrency,
  formatAmount,
}: Args): { title: string; subtitle: string | null } {
  const title =
    action === "updated" ? "Movimiento actualizado" : (TITLE[movementType ?? ""] ?? "Movimiento guardado");

  const isIncome = movementType === "income";
  const amount = Number(isIncome ? destinationAmount : sourceAmount);
  const currency = isIncome ? destinationCurrency : sourceCurrency;
  const sign = movementType === "expense" ? "−" : isIncome ? "+" : "";
  const money =
    Number.isFinite(amount) && amount > 0 && currency ? `${sign}${formatAmount(amount, currency)}` : null;

  const parts = [description?.trim() || null, money].filter((p): p is string => Boolean(p));
  return { title, subtitle: parts.length > 0 ? parts.join(" · ") : null };
}
