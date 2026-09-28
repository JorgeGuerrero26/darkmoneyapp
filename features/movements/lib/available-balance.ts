type EditedMovement = {
  status: string;
  sourceAccountId: number | null;
  sourceAmount: number | null;
};

/**
 * Cuánto se puede gastar desde la cuenta origen, para el aviso "el monto supera el saldo".
 *
 * **Al editar, el saldo de la cuenta ya tiene descontado el movimiento que se está editando.**
 * Compararlo tal cual contaba ese monto dos veces: al abrir un gasto de S/ 54 ya registrado, con
 * S/ 5 en la cuenta, el formulario avisaba de que S/ 54 superaba el saldo — sobre algo que ya
 * estaba pagado y no iba a cambiar nada. Reportado el 2026-09-28.
 *
 * Lo disponible para el movimiento editado es lo que queda **más lo que él mismo ya ocupa**. Así
 * solo avisa por la diferencia: subirlo de 54 a 70 con 5 en la cuenta sí la supera (59 < 70).
 *
 * Solo se devuelve si el movimiento estaba contabilizado (`posted`) y sale de la misma cuenta
 * que está elegida ahora: uno planificado no tocó el saldo, y si se cambió de cuenta, la nueva
 * no tiene nada suyo que devolver. Mismo criterio que el margen de un pago de crédito editado.
 */
export function availableSourceBalance({
  currentBalance,
  selectedSourceAccountId,
  editing,
}: {
  currentBalance: number | null;
  selectedSourceAccountId: number | null;
  editing: EditedMovement | null;
}): number | null {
  if (currentBalance == null) return null;
  if (!editing || editing.status !== "posted") return currentBalance;
  if (editing.sourceAccountId == null || editing.sourceAccountId !== selectedSourceAccountId) {
    return currentBalance;
  }
  const original = Number(editing.sourceAmount);
  return Number.isFinite(original) && original > 0 ? currentBalance + original : currentBalance;
}
