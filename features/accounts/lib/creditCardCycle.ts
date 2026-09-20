/**
 * El ciclo de una tarjeta, leído como lo diría una persona.
 *
 * Vive aparte del componente porque la regla de cuándo cae el próximo pago la necesitan tres
 * sitios —la fila de Cuentas, la agenda de próximos pagos y la proyección— y una regla de fechas
 * repetida tres veces son tres reglas distintas dentro de seis meses.
 */

/** Gastable hoy no; deuda con calendario sí. Solo las tarjetas tienen ciclo. */
export function hasCycle(account: { type?: string | null; paymentDay?: number | null }): boolean {
  return account.type === "credit_card" && account.paymentDay != null;
}

/**
 * "Corte 25 · pagas 15". Devuelve null cuando no hay nada que contar.
 *
 * El corte solo se nombra si está: una tarjeta con día de pago y sin corte sigue siendo útil
 * —el pago es lo que mueve la plata— y decir "Corte — · pagas 15" sería peor que callarlo.
 */
export function describeCycle(account: {
  type?: string | null;
  statementDay?: number | null;
  paymentDay?: number | null;
}): string | null {
  if (account.type !== "credit_card") return null;
  const { statementDay, paymentDay } = account;
  if (statementDay != null && paymentDay != null) return `Corte ${statementDay} · pagas ${paymentDay}`;
  if (paymentDay != null) return `Pagas el ${paymentDay}`;
  if (statementDay != null) return `Corte ${statementDay}`;
  return null;
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * El próximo día de pago, hoy incluido.
 *
 * El día se recorta al mes corto —un pago el 31 cae el 28 en febrero— y **no arrastra** el
 * recorte: en marzo vuelve al 31. Misma regla que el motor de proyección y que los bancos.
 */
export function nextPaymentDate(paymentDay: number, from: Date = new Date()): Date | null {
  const day = Math.floor(paymentDay);
  if (!Number.isFinite(day) || day < 1 || day > 31) return null;

  const year = from.getFullYear();
  const month = from.getMonth();
  const thisMonth = Math.min(day, daysInMonth(year, month + 1));
  if (thisMonth >= from.getDate()) return new Date(year, month, thisMonth);

  const next = new Date(year, month + 1, 1);
  return new Date(
    next.getFullYear(),
    next.getMonth(),
    Math.min(day, daysInMonth(next.getFullYear(), next.getMonth() + 1)),
  );
}

/** Lo que se debe hoy, en positivo. El saldo de una tarjeta es negativo cuando se debe. */
export function currentDebt(currentBalance: number | null | undefined): number {
  return Math.max(0, -Number(currentBalance ?? 0));
}
