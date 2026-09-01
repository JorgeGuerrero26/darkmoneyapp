/**
 * Las dos reglas del saldo de una obligación, en un solo sitio.
 *
 * La comprobación de verdad vive en la base (`obligation_events_settle_and_guard`), porque el
 * saldo se mueve por caminos que no pasan por ninguna pantalla —una solicitud aceptada, un
 * evento borrado, un cobro que registra el otro usuario desde su teléfono—. Esto es lo que
 * evita que el usuario llegue hasta el botón para que el servidor le diga que no: mismo límite,
 * dicho antes y en la casilla del monto.
 *
 * RN-free a propósito (se testea suelto): el formateo del importe entra como función.
 */

/**
 * Por debajo de esto, saldado.
 *
 * Es la misma tolerancia que usa el resto de la app (`pendingAmount > 0.009` en el dashboard) y
 * la que aplica el trigger. Sin ella, un céntimo de redondeo en un pago que cubre el total exacto
 * se leería como sobrepago y el usuario no podría cerrar su propia deuda.
 */
export const SETTLEMENT_TOLERANCE = 0.009;

export function isSettled(pendingAmount: number) {
  return pendingAmount <= SETTLEMENT_TOLERANCE;
}

/** Si este monto liquida la obligación —para poder anunciarlo antes de guardar. */
export function settlesObligation(amount: number, pendingAmount: number) {
  return pendingAmount - amount <= SETTLEMENT_TOLERANCE;
}

type OverpaymentInput = {
  amount: number;
  pendingAmount: number;
  formatAmount: (value: number) => string;
  /** "pago" o "cobro": la misma pantalla sirve a las dos puntas de la deuda. */
  noun?: string;
};

/**
 * El mensaje cuando el monto se pasa del saldo, o `null` si cabe.
 *
 * Dice **cuánto** queda, no solo que no cabe: el usuario está mirando la casilla del monto y lo
 * que necesita es el número que sí puede escribir.
 */
export function describeOverpayment({
  amount,
  pendingAmount,
  formatAmount,
  noun = "pago",
}: OverpaymentInput): string | null {
  if (!Number.isFinite(amount) || amount <= 0) return null;
  if (amount - pendingAmount <= SETTLEMENT_TOLERANCE) return null;
  if (isSettled(pendingAmount)) {
    return `Esta cuenta ya está saldada: no queda nada por cubrir.`;
  }
  return `Es más de lo que queda por cubrir. El ${noun} máximo es ${formatAmount(pendingAmount)}.`;
}
