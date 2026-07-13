/**
 * Texto accionable que el destino muestra como "por qué llegaste aquí".
 * Un kind sin entrada devuelve null: el tap navega sin nota (p. ej. los
 * quick-links de Movimientos ya explican con su ActiveFilterBar).
 */
const STATIC_REASONS: Record<string, string> = {
  daily_budget_review: "Revisión diaria: mira el avance de tus presupuestos y ajusta lo que se esté pasando.",
  multiple_subscriptions_due: "Tienes varias suscripciones por cobrar pronto — revisa cuáles y su fecha.",
  subscription_cost_heavy: "Tus suscripciones pesan mucho en el gasto del mes — evalúa cancelar o renegociar alguna.",
  multiple_obligations_overdue: "Tienes varias deudas vencidas — prioriza cuál pagar primero.",
  commitments_vs_balance: "Tus compromisos superan tu saldo disponible — revisa qué mover o renegociar.",
  net_worth_negative: "Tu patrimonio neto está en negativo — revisa saldos y deudas por cuenta.",
  cash_runway_alert: "Tu efectivo cubre pocos días de gasto — revisa tus saldos disponibles.",
  recurring_income_reminder: "Un ingreso fijo está por llegar — confírmalo cuando aterrice.",
  expected_income_missed: "Un ingreso esperado no llegó en su fecha — confírmalo o ajusta su calendario.",
  obligation_due: "Esta deuda vence pronto — registra el pago o ajusta la fecha si cambió.",
  obligation_overdue: "Esta deuda está vencida — registra el pago o renegocia la fecha.",
  obligation_no_payment: "Esta deuda lleva tiempo sin pagos — registra un abono o revisa su plan.",
  high_interest_obligation: "Esta deuda tiene interés alto — considera amortizarla antes.",
  obligation_milestone: "Alcanzaste un hito de esta deuda — revisa su avance.",
  low_balance: "Esta cuenta quedó con saldo bajo — considera moverle fondos.",
  negative_balance: "Esta cuenta está en negativo — regulariza el saldo o corrige movimientos.",
  account_dormant: "Esta cuenta lleva semanas sin movimientos — confirma su saldo o archívala.",
  subscription_reminder: "Esta suscripción se cobra pronto — verifica el saldo de la cuenta.",
  subscription_overdue: "El cobro de esta suscripción ya pasó — márcala pagada o ajusta la fecha.",
  upcoming_annual_subscription: "Se acerca el cobro anual de esta suscripción — es un monto grande, prepáralo.",
  subscription_price_increase: "Esta suscripción subió de precio — decide si la mantienes.",
};

export function buildNotificationReason(
  kind: string,
  payload?: Record<string, unknown> | null,
): string | null {
  if (kind === "budget_alert" || kind === "budget_period_ending") {
    const used = Number(payload?.usedPercent);
    const usedLabel = Number.isFinite(used) && used > 0 ? `${Math.round(used)}%` : null;
    if (kind === "budget_alert") {
      return usedLabel
        ? `Este presupuesto va en ${usedLabel} de su límite — revisa qué lo está empujando.`
        : "Este presupuesto está cerca de su límite — revisa qué lo está empujando.";
    }
    return usedLabel
      ? `El período de este presupuesto cierra pronto con ${usedLabel} usado — revisa cómo termina.`
      : "El período de este presupuesto está por cerrar — revisa cómo termina.";
  }
  return STATIC_REASONS[kind] ?? null;
}
