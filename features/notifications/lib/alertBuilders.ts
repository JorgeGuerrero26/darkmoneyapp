/**
 * Builders puros de las alertas nuevas (spec 2026-07-10). Cada builder devuelve
 * filas parciales; useNotificationGenerator completa user_id/channel/status/
 * scheduled_for y aplica idempotencia + cleanup por vigencia.
 */
import type {
  CategoryPostedMovement,
  ObligationSummary,
  RecurringIncomeSummary,
  SubscriptionPostedMovement,
  SubscriptionSummary,
} from "../../../types/domain";

export type AlertRow = {
  kind: string;
  title: string;
  body: string;
  related_entity_type: string;
  related_entity_id: number;
  payload: Record<string, unknown>;
};

const fmt = (n: number) => n.toFixed(2);

export function buildSubscriptionPriceIncreaseAlerts(
  subscriptions: SubscriptionSummary[],
  posted: SubscriptionPostedMovement[],
): AlertRow[] {
  const rows: AlertRow[] = [];
  const activos = new Map(subscriptions.filter((s) => s.status === "active").map((s) => [s.id, s]));

  const porSub = new Map<number, SubscriptionPostedMovement[]>();
  for (const m of posted) {
    if (!activos.has(m.subscriptionId)) continue;
    const arr = porSub.get(m.subscriptionId) ?? [];
    arr.push(m);
    porSub.set(m.subscriptionId, arr);
  }

  for (const [subId, pagos] of porSub) {
    if (pagos.length < 2) continue;
    pagos.sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
    const ultimo = pagos[pagos.length - 1].sourceAmount ?? 0;
    const anterior = pagos[pagos.length - 2].sourceAmount ?? 0;
    if (anterior <= 0 || ultimo < anterior * 1.05) continue;
    const sub = activos.get(subId)!;
    rows.push({
      kind: "subscription_price_increase",
      title: "Suscripción subió de precio",
      body: `"${sub.name}" pasó de ${fmt(anterior)} a ${fmt(ultimo)} ${sub.currencyCode} en su último cobro.`,
      related_entity_type: "subscription",
      related_entity_id: subId,
      payload: { subscriptionId: subId, previousAmount: anterior, currentAmount: ultimo, currencyCode: sub.currencyCode },
    });
  }
  return rows;
}

const dayKey = (iso: string) => iso.slice(0, 10);

export function buildDuplicateChargeAlerts(
  movements: CategoryPostedMovement[],
  categoryKinds: Map<number, string>,
  now: Date,
): AlertRow[] {
  const weekAgo = new Date(now.getTime() - 7 * 86_400_000);
  const grupos = new Map<string, CategoryPostedMovement[]>();
  for (const m of movements) {
    if (categoryKinds.get(m.categoryId) !== "expense") continue;
    if (m.sourceAmount === null || m.sourceAmount <= 0) continue;
    if (new Date(m.occurredAt) < weekAgo) continue;
    const key = `${dayKey(m.occurredAt)}|${m.categoryId}|${m.sourceAmount}`;
    const arr = grupos.get(key) ?? [];
    arr.push(m);
    grupos.set(key, arr);
  }

  const rows: AlertRow[] = [];
  for (const [key, grupo] of grupos) {
    if (grupo.length < 2) continue;
    const [day, , amount] = key.split("|");
    const minId = Math.min(...grupo.map((m) => m.id));
    rows.push({
      kind: "possible_duplicate_charge",
      title: "Posible cobro duplicado",
      body: `Registraste ${grupo.length} gastos idénticos de ${fmt(Number(amount))} el ${day}. Revisa si es un doble cobro.`,
      related_entity_type: "movement",
      related_entity_id: minId,
      payload: { day, amountLabel: fmt(Number(amount)), movementIds: grupo.map((m) => m.id) },
    });
  }
  return rows;
}

export function buildExpectedIncomeMissedAlerts(
  incomes: RecurringIncomeSummary[],
  movements: CategoryPostedMovement[],
  categoryKinds: Map<number, string>,
  now: Date,
): AlertRow[] {
  const rows: AlertRow[] = [];
  for (const income of incomes) {
    if (income.status !== "active" || !income.nextExpectedDate) continue;
    const [y, mo, d] = income.nextExpectedDate.split("-").map(Number);
    const expected = new Date(y, mo - 1, d);
    const daysLate = Math.floor((now.getTime() - expected.getTime()) / 86_400_000);
    if (daysLate < 2) continue;
    const hayIngresoPosterior = movements.some(
      (m) => categoryKinds.get(m.categoryId) === "income" && new Date(m.occurredAt) >= expected,
    );
    if (hayIngresoPosterior) continue;
    rows.push({
      kind: "expected_income_missed",
      title: "¿Ya te pagaron?",
      body: `"${income.name}" se esperaba el ${income.nextExpectedDate} y no hay ingresos registrados desde entonces.`,
      related_entity_type: "recurring_income",
      related_entity_id: income.id,
      payload: { recurringIncomeId: income.id, expectedDate: income.nextExpectedDate, daysLate },
    });
  }
  return rows;
}
