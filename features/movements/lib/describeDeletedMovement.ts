type Movement = {
  description?: string | null;
  movementType?: string | null;
  sourceAccountId?: number | null;
  destinationAccountId?: number | null;
  sourceAmount?: number | null;
  destinationAmount?: number | null;
};

type Args = {
  movement: Movement;
  accountName: (id: number | null | undefined) => string | null;
  formatAmount: (amount: number) => string;
};

/**
 * Lo que dice el aviso al borrar un movimiento.
 *
 * Decía **"1 movimiento eliminado"**, que no dice cuál — y es el momento exacto en que uno
 * quiere comprobar que borró lo que creía, porque la fila ya desapareció de la lista y el
 * nombre es lo único que queda. Ahora la primera línea nombra el movimiento y la segunda dice
 * la consecuencia real: **cuánto vuelve y a qué cuenta**, que no se mencionaba en ninguna parte.
 *
 * Con selección múltiple el conteo vuelve a servir: ahí sí no hay un nombre que dar.
 */
export function describeDeletedMovement({ movement, accountName, formatAmount }: Args): {
  title: string;
  subtitle: string | null;
} {
  const name = movement.description?.trim();
  const title = name ? `Se eliminó «${name}»` : "Movimiento eliminado";

  // Un gasto vuelve a la cuenta de la que salió; un ingreso se le quita a la que lo recibió.
  const isExpense = movement.movementType === "expense" || movement.movementType === "subscription_payment";
  const isIncome = movement.movementType === "income";
  const amount = Number(movement.sourceAmount ?? movement.destinationAmount ?? 0);
  if (!Number.isFinite(amount) || amount <= 0) return { title, subtitle: null };

  const account = isIncome
    ? accountName(movement.destinationAccountId)
    : accountName(movement.sourceAccountId);
  if (!account) return { title, subtitle: formatAmount(amount) };

  if (isExpense) return { title, subtitle: `${formatAmount(amount)} · devuelto a ${account}` };
  if (isIncome) return { title, subtitle: `${formatAmount(amount)} · descontado de ${account}` };
  // Traspasos y el resto: el movimiento se deshace, sin afirmar en qué dirección.
  return { title, subtitle: `${formatAmount(amount)} · ${account}` };
}

export function describeDeletedMovements(count: number): string {
  return count === 1 ? "Se eliminó 1 movimiento" : `Se eliminaron ${count} movimientos`;
}
