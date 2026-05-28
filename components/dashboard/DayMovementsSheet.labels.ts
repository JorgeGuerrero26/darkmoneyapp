/**
 * Strings del DayMovementsSheet centralizadas para preparar i18n futuro.
 * Hoy: monolingüe (es-PE). Cuando se introduzca i18n real (i18next, lingui,
 * etc.), reemplazar las constantes por llamadas a `t(...)` sin tocar el render.
 */

export const DAY_MOVEMENTS_LABELS = {
  movementType: {
    expense: "Gasto",
    income: "Ingreso",
    transfer: "Transferencia",
    subscription_payment: "Suscripción",
    obligation_opening: "Obligación",
    obligation_payment: "Pago obligación",
    refund: "Devolución",
    adjustment: "Ajuste",
  } as Record<string, string>,

  subtitle: {
    all: "Ingresos, gastos y transferencias de ese día",
    expense: "Solo gastos registrados",
    income: "Solo ingresos registrados",
    transfer: "Solo transferencias entre cuentas",
  },

  summary: {
    incomes: "Ingresos",
    expenses: "Gastos",
    savings: "Ahorro del día",
    savingsHint: "Ahorro = ingresos − gastos (sin contar transferencias entre tus cuentas).",
  },

  sections: {
    incomes: (count: number) => `Ingresos (${count})`,
    expenses: (count: number) => `Gastos (${count})`,
    transfers: (count: number) => `Transferencias (${count})`,
  },

  empty: "Nada que mostrar este día.",
  footerHint: "Toca un movimiento para ver el detalle.",
  movementFallback: (id: number) => `Movimiento #${id}`,

  dateFormat: "EEEE d MMMM yyyy",
  timeFormat: "HH:mm",
};
