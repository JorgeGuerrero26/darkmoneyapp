import type { MovementUpdateInput } from "../../movements/lib/movement-input-types";
import type { MovementChange } from "../../../services/queries/assistant";

/**
 * Lo que el asistente propuso corregir, como la edición normal de un movimiento.
 *
 * En un gasto el dinero sale de la cuenta de ORIGEN y en un ingreso entra a la de DESTINO: el
 * monto y la cuenta van del lado que corresponde. Solo se mandan los campos que cambian; el resto
 * del movimiento queda como estaba.
 */
export function movementChangeToUpdate(change: MovementChange): MovementUpdateInput {
  const { after } = change;
  const isExpense = change.movementType === "expense";
  const input: MovementUpdateInput = {};
  if (after.amount !== undefined) {
    if (isExpense) input.sourceAmount = after.amount;
    else input.destinationAmount = after.amount;
  }
  if (after.accountId !== undefined) {
    if (isExpense) input.sourceAccountId = after.accountId;
    else input.destinationAccountId = after.accountId;
  }
  if (after.description !== undefined) input.description = after.description;
  if (after.notes !== undefined) input.notes = after.notes;
  if (after.categoryId !== undefined) input.categoryId = after.categoryId;
  if (after.counterpartyId !== undefined) input.counterpartyId = after.counterpartyId;
  if (after.occurredAt !== undefined) input.occurredAt = after.occurredAt;
  return input;
}

type Line = { label: string; value: string };

/**
 * Las filas de la tarjeta. Al corregir, cada cambio como "antes → ahora"; al borrar, lo que
 * identifica al movimiento para no borrar el equivocado.
 */
export function movementChangeLines(change: MovementChange, money: (amount: number) => string): Line[] {
  const { before, after } = change;
  const or = (value: string | null) => value ?? "—";
  if (change.action === "delete") {
    const lines: Line[] = [{ label: "Fecha", value: before.date }];
    if (before.description) lines.push({ label: "Detalle", value: before.description });
    if (before.categoryName) lines.push({ label: "Categoría", value: before.categoryName });
    if (before.accountName) lines.push({ label: "Cuenta", value: before.accountName });
    return lines;
  }
  const lines: Line[] = [];
  if (after.amount !== undefined) lines.push({ label: "Monto", value: `${money(before.amount)} → ${money(after.amount)}` });
  if (after.description !== undefined) lines.push({ label: "Detalle", value: `${or(before.description)} → ${after.description}` });
  if (after.categoryName !== undefined) lines.push({ label: "Categoría", value: `${or(before.categoryName)} → ${after.categoryName}` });
  if (after.accountName !== undefined) lines.push({ label: "Cuenta", value: `${or(before.accountName)} → ${after.accountName}` });
  if (after.counterpartyName !== undefined) {
    lines.push({ label: "Contacto", value: `${or(before.counterpartyName)} → ${after.counterpartyName}` });
  }
  if (after.date !== undefined) lines.push({ label: "Fecha", value: `${before.date} → ${after.date}` });
  if (after.notes !== undefined) lines.push({ label: "Nota", value: after.notes });
  // Lo que no cambia, para reconocer de qué movimiento se trata.
  if (after.description === undefined && before.description) lines.push({ label: "Movimiento", value: before.description });
  if (after.date === undefined) lines.push({ label: "Del", value: before.date });
  return lines;
}
