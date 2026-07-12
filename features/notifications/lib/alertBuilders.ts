/**
 * Builders puros de las alertas nuevas (spec 2026-07-10). Cada builder devuelve
 * filas parciales; useNotificationGenerator completa user_id/channel/status/
 * scheduled_for y aplica idempotencia + cleanup por vigencia.
 */
import type {
  AccountSummary,
  BudgetOverview,
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

const MESES_ES = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];
const pad2 = (n: number) => String(n).padStart(2, "0");

export function buildMonthlyRecapAlert(
  input: { lastMonthExpenses: number; lastMonthIncome: number; prevMonthExpenses: number; topCategoryName: string | null },
  now: Date,
): AlertRow | null {
  if (now.getDate() > 7) return null;
  if (input.lastMonthExpenses <= 0 && input.lastMonthIncome <= 0) return null;

  const cierre = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const monthLabel = MESES_ES[cierre.getMonth()];
  const monthFrom = `${cierre.getFullYear()}-${pad2(cierre.getMonth() + 1)}-01`;
  const lastDay = new Date(cierre.getFullYear(), cierre.getMonth() + 1, 0).getDate();
  const monthTo = `${cierre.getFullYear()}-${pad2(cierre.getMonth() + 1)}-${pad2(lastDay)}`;

  let comparativa = "";
  if (input.prevMonthExpenses > 0) {
    const delta = Math.round(((input.lastMonthExpenses - input.prevMonthExpenses) / input.prevMonthExpenses) * 100);
    comparativa = delta <= 0 ? ` Gastaste ${Math.abs(delta)}% menos que el mes anterior.` : ` Gastaste ${delta}% más que el mes anterior.`;
  }
  const top = input.topCategoryName ? ` Tu mayor gasto fue en ${input.topCategoryName}.` : "";

  return {
    kind: "monthly_recap",
    title: `Resumen de ${monthLabel}`,
    body: `Cerraste ${monthLabel} con ${fmt(input.lastMonthExpenses)} en gastos y ${fmt(input.lastMonthIncome)} en ingresos.${comparativa}${top}`,
    related_entity_type: "monthly_recap",
    related_entity_id: cierre.getFullYear() * 100 + (cierre.getMonth() + 1),
    payload: { monthFrom, monthTo, monthLabel },
  };
}

const MILESTONES = [100, 75, 50, 25];

export function buildObligationMilestoneAlerts(obligations: ObligationSummary[]): AlertRow[] {
  const rows: AlertRow[] = [];
  for (const o of obligations) {
    if (o.status !== "active") continue;
    const milestone = MILESTONES.find((m) => o.progressPercent >= m);
    if (!milestone) continue;
    const esCierre = milestone === 100;
    rows.push({
      kind: "obligation_milestone",
      title: esCierre ? "¡Obligación completa!" : `Hito de pago: ${milestone}%`,
      body: esCierre
        ? `Terminaste de pagar "${o.title}". Una deuda menos.`
        : `Ya pagaste el ${milestone}% de "${o.title}". Saldo pendiente: ${fmt(o.pendingAmount)} ${o.currencyCode}.`,
      related_entity_type: "obligation_milestone",
      related_entity_id: o.id * 1000 + milestone,
      payload: { obligationId: o.id, milestone, progressPercent: o.progressPercent },
    });
  }
  return rows;
}

export function buildDetectedSuggestionsPendingAlert(
  pendingCount: number,
  oldestPendingAt: string | null,
  workspaceId: number,
  now: Date,
): AlertRow | null {
  if (pendingCount < 3 || !oldestPendingAt) return null;
  if (now.getTime() - new Date(oldestPendingAt).getTime() < 24 * 3_600_000) return null;
  return {
    kind: "detected_suggestions_pending",
    title: "Movimientos detectados sin revisar",
    body: `Tienes ${pendingCount} movimientos detectados esperando tu confirmación desde hace más de un día.`,
    related_entity_type: "workspace",
    related_entity_id: workspaceId,
    payload: { pendingCount, oldestPendingAt },
  };
}

// ─── Builders legacy (migrados de useNotificationGenerator) ─────────────────
// Comportamiento idéntico al hook original: mismos kinds, títulos, bodies,
// entity ids, payloads y umbrales. `daysFromToday` se inyecta (el hook pasa
// calendarDaysFromTodayLocal) para mantener los builders puros y testeables.

export type DaysFromToday = (ymd: string) => number;

export function buildBudgetLimitAlerts(budgets: BudgetOverview[]): AlertRow[] {
  const rows: AlertRow[] = [];
  for (const budget of budgets) {
    if (!budget.isActive) continue;

    const isOverLimit = budget.usedPercent >= 100;
    const isNearLimit =
      !isOverLimit && budget.alertPercent > 0 && budget.usedPercent >= budget.alertPercent;

    if (isOverLimit) {
      rows.push({
        kind: "budget_alert",
        title: "Presupuesto excedido",
        body: `"${budget.name}" superó su límite (${Math.round(budget.usedPercent)}% usado).`,
        related_entity_type: "budget",
        related_entity_id: budget.id,
        payload: { usedPercent: budget.usedPercent, limitAmount: budget.limitAmount },
      });
    } else if (isNearLimit) {
      rows.push({
        kind: "budget_alert",
        title: "Presupuesto cerca del límite",
        body: `"${budget.name}" va al ${Math.round(budget.usedPercent)}% de su límite (alerta: ${Math.round(budget.alertPercent)}%).`,
        related_entity_type: "budget",
        related_entity_id: budget.id,
        payload: { usedPercent: budget.usedPercent, limitAmount: budget.limitAmount },
      });
    }
  }
  return rows;
}

export function buildBudgetPeriodEndingAlerts(
  budgets: BudgetOverview[],
  daysFromToday: DaysFromToday,
): AlertRow[] {
  const rows: AlertRow[] = [];
  for (const budget of budgets) {
    if (!budget.isActive) continue;
    const daysLeft = daysFromToday(budget.periodEnd);
    if (daysLeft >= 0 && daysLeft <= 3 && budget.usedPercent > 50) {
      rows.push({
        kind: "budget_period_ending",
        title: "Período de presupuesto cerrando",
        body: `"${budget.name}" cierra ${daysLeft === 0 ? "hoy" : `en ${daysLeft} día${daysLeft !== 1 ? "s" : ""}`} y lleva ${Math.round(budget.usedPercent)}% ejecutado.`,
        related_entity_type: "budget",
        related_entity_id: budget.id,
        payload: { daysLeft, usedPercent: budget.usedPercent },
      });
    }
  }
  return rows;
}

export function buildSubscriptionReminderAlerts(
  subscriptions: SubscriptionSummary[],
  daysFromToday: DaysFromToday,
): AlertRow[] {
  const rows: AlertRow[] = [];
  for (const sub of subscriptions) {
    if (sub.status !== "active") continue;
    const diffDays = daysFromToday(sub.nextDueDate);
    const window = Math.max(1, sub.remindDaysBefore);
    if (diffDays > window || diffDays < -1) continue;

    const dueLabel =
      diffDays < 0
        ? `venció hace ${Math.abs(diffDays)} día${Math.abs(diffDays) !== 1 ? "s" : ""}`
        : diffDays === 0 ? "vence hoy"
        : `vence en ${diffDays} día${diffDays !== 1 ? "s" : ""}`;

    rows.push({
      kind: "subscription_reminder",
      title: "Suscripción próxima a vencer",
      body: `"${sub.name}" ${dueLabel}.`,
      related_entity_type: "subscription",
      related_entity_id: sub.id,
      payload: { nextDueDate: sub.nextDueDate, diffDays },
    });
  }
  return rows;
}

export function buildSubscriptionOverdueAlerts(
  subscriptions: SubscriptionSummary[],
  daysFromToday: DaysFromToday,
): AlertRow[] {
  const rows: AlertRow[] = [];
  for (const sub of subscriptions) {
    if (sub.status !== "active") continue;
    const diffDays = daysFromToday(sub.nextDueDate);
    if (diffDays < -1) {
      rows.push({
        kind: "subscription_overdue",
        title: "Suscripción vencida sin registrar",
        body: `"${sub.name}" venció hace ${Math.abs(diffDays)} días y aún no tiene movimiento registrado.`,
        related_entity_type: "subscription",
        related_entity_id: sub.id,
        payload: { nextDueDate: sub.nextDueDate, diffDays },
      });
    }
  }
  return rows;
}

const daysBetween = (a: Date, b: Date): number =>
  Math.floor((b.getTime() - a.getTime()) / 86_400_000);

export function buildMultipleSubscriptionsDueAlert(
  subscriptions: SubscriptionSummary[],
  workspaceId: number,
  daysFromToday: DaysFromToday,
): AlertRow | null {
  const subsDueThisWeek = subscriptions.filter((s) => {
    if (s.status !== "active") return false;
    const d = daysFromToday(s.nextDueDate);
    return d >= 0 && d <= 7;
  });
  if (subsDueThisWeek.length < 3) return null;
  const totalAmt = subsDueThisWeek.reduce((acc, s) => acc + s.amount, 0);
  return {
    kind: "multiple_subscriptions_due",
    title: "Varias suscripciones vencen esta semana",
    body: `${subsDueThisWeek.length} suscripciones vencen en los próximos 7 días: ${subsDueThisWeek.map((s) => s.name).join(", ")}.`,
    related_entity_type: "workspace",
    related_entity_id: workspaceId,
    payload: { count: subsDueThisWeek.length, totalAmount: totalAmt },
  };
}

export function buildObligationDueAlerts(
  obligations: ObligationSummary[],
  daysFromToday: DaysFromToday,
): AlertRow[] {
  const rows: AlertRow[] = [];
  for (const ob of obligations) {
    if (ob.status !== "active") continue;
    if (!ob.dueDate) continue;
    const diffDays = daysFromToday(ob.dueDate);

    if (diffDays < 0) {
      rows.push({
        kind: "obligation_overdue",
        title: "Obligación vencida",
        body: `"${ob.title}" venció hace ${Math.abs(diffDays)} día${Math.abs(diffDays) !== 1 ? "s" : ""}. Saldo pendiente: ${ob.pendingAmount} ${ob.currencyCode}.`,
        related_entity_type: "obligation",
        related_entity_id: ob.id,
        payload: { dueDate: ob.dueDate, diffDays, pendingAmount: ob.pendingAmount },
      });
    } else if (diffDays <= 7) {
      rows.push({
        kind: "obligation_due",
        title: diffDays === 0 ? "Obligación vence hoy" : "Obligación próxima a vencer",
        body: `"${ob.title}" ${diffDays === 0 ? "vence hoy" : `vence en ${diffDays} día${diffDays !== 1 ? "s" : ""}`}. Saldo: ${ob.pendingAmount} ${ob.currencyCode}.`,
        related_entity_type: "obligation",
        related_entity_id: ob.id,
        payload: { dueDate: ob.dueDate, diffDays, pendingAmount: ob.pendingAmount },
      });
    }
  }
  return rows;
}

export function buildMultipleObligationsOverdueAlert(
  obligations: ObligationSummary[],
  workspaceId: number,
  daysFromToday: DaysFromToday,
): AlertRow | null {
  const overdueObligations = obligations.filter((o) => {
    if (o.status !== "active" || !o.dueDate) return false;
    return daysFromToday(o.dueDate) < 0;
  });
  if (overdueObligations.length < 2) return null;
  return {
    kind: "multiple_obligations_overdue",
    title: "Varias obligaciones vencidas",
    body: `Tienes ${overdueObligations.length} obligaciones vencidas: ${overdueObligations.map((o) => o.title).join(", ")}.`,
    related_entity_type: "workspace",
    related_entity_id: workspaceId,
    payload: { count: overdueObligations.length },
  };
}

export function buildObligationNoPaymentAlerts(
  obligations: ObligationSummary[],
  now: Date,
): AlertRow[] {
  const rows: AlertRow[] = [];
  for (const ob of obligations) {
    if (ob.status !== "active") continue;
    if (!ob.installmentAmount || ob.installmentAmount <= 0) continue;
    if (ob.pendingAmount <= 0) continue;

    const lastPay = ob.lastPaymentDate ? new Date(ob.lastPaymentDate) : null;
    const daysSincePayment = lastPay ? daysBetween(lastPay, now) : 999;
    const startDate = new Date(ob.startDate);
    const daysSinceStart = daysBetween(startDate, now);

    // Alert if: no payment in 45+ days (and obligation is at least 15 days old)
    if (daysSincePayment >= 45 && daysSinceStart >= 15) {
      const msg = lastPay
        ? `Sin pagos en ${daysSincePayment} días.`
        : "Sin pagos registrados aún.";
      rows.push({
        kind: "obligation_no_payment",
        title: "Obligación sin pagos recientes",
        body: `"${ob.title}" tiene saldo pendiente de ${ob.pendingAmount} ${ob.currencyCode}. ${msg}`,
        related_entity_type: "obligation",
        related_entity_id: ob.id,
        payload: { daysSincePayment, pendingAmount: ob.pendingAmount },
      });
    }
  }
  return rows;
}

// Cuentas que representan dinero propio (excluye préstamos/tarjetas).
const NON_LOAN_ACCOUNT_TYPES = new Set(["bank", "cash", "savings", "investment", "other"]);

export function buildHighInterestObligationAlerts(obligations: ObligationSummary[]): AlertRow[] {
  const rows: AlertRow[] = [];
  for (const ob of obligations) {
    if (ob.status !== "active") continue;
    if (!ob.interestRate || ob.interestRate < 10) continue;
    if (ob.pendingAmount <= 0) continue;

    rows.push({
      kind: "high_interest_obligation",
      title: "Obligación con tasa alta",
      body: `"${ob.title}" tiene tasa del ${ob.interestRate}% con ${ob.pendingAmount} ${ob.currencyCode} pendiente. Considera priorizar este pago.`,
      related_entity_type: "obligation",
      related_entity_id: ob.id,
      payload: { interestRate: ob.interestRate, pendingAmount: ob.pendingAmount },
    });
  }
  return rows;
}

export function buildLowBalanceAlerts(accounts: AccountSummary[]): AlertRow[] {
  const rows: AlertRow[] = [];
  for (const acc of accounts) {
    if (acc.isArchived) continue;
    if (!NON_LOAN_ACCOUNT_TYPES.has(acc.type)) continue;
    if (acc.currentBalance <= 0) continue; // covered by negative_balance

    // Threshold: 10% of opening balance, minimum 50 units of currency
    const threshold = Math.max(50, Math.abs(acc.openingBalance) * 0.10);
    if (acc.currentBalance < threshold && acc.openingBalance > 0) {
      rows.push({
        kind: "low_balance",
        title: "Saldo bajo en cuenta",
        body: `"${acc.name}" tiene solo ${acc.currentBalance.toFixed(2)} ${acc.currencyCode} disponibles.`,
        related_entity_type: "account",
        related_entity_id: acc.id,
        payload: { currentBalance: acc.currentBalance, threshold },
      });
    }
  }
  return rows;
}

export function buildNegativeBalanceAlerts(accounts: AccountSummary[]): AlertRow[] {
  const rows: AlertRow[] = [];
  for (const acc of accounts) {
    if (acc.isArchived) continue;
    if (!NON_LOAN_ACCOUNT_TYPES.has(acc.type)) continue;
    if (acc.currentBalance >= 0) continue;

    rows.push({
      kind: "negative_balance",
      title: "Saldo negativo en cuenta",
      body: `"${acc.name}" tiene saldo negativo: ${acc.currentBalance.toFixed(2)} ${acc.currencyCode}.`,
      related_entity_type: "account",
      related_entity_id: acc.id,
      payload: { currentBalance: acc.currentBalance },
    });
  }
  return rows;
}

export function buildAccountDormantAlerts(accounts: AccountSummary[], now: Date): AlertRow[] {
  const rows: AlertRow[] = [];
  for (const acc of accounts) {
    if (acc.isArchived) continue;
    if (acc.currentBalance === 0) continue;
    if (!acc.lastActivity) continue;

    const lastAct = new Date(acc.lastActivity);
    const daysSince = daysBetween(lastAct, now);
    if (daysSince >= 60) {
      rows.push({
        kind: "account_dormant",
        title: "Cuenta sin actividad",
        body: `"${acc.name}" lleva ${daysSince} días sin movimientos y tiene saldo de ${acc.currentBalance.toFixed(2)} ${acc.currencyCode}.`,
        related_entity_type: "account",
        related_entity_id: acc.id,
        payload: { daysSince, currentBalance: acc.currentBalance },
      });
    }
  }
  return rows;
}

// ─── Agregados mensuales (una pasada sobre los movimientos del snapshot) ────

const startOfMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1);
const startOfLastMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth() - 1, 1);
const endOfLastMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 0, 23, 59, 59, 999);
const startOfPrevMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth() - 2, 1);
const endOfPrevMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth() - 1, 0, 23, 59, 59, 999);

export type MonthlyMovementAggregates = {
  thisMonthExpenses: number;
  thisMonthIncome: number;
  lastMonthExpenses: number;
  lastMonthIncome: number;
  prevMonthExpenses: number;
  thisMonthByCategory: Map<number, number>;
  lastMonthByCategory: Map<number, number>;
  lastMonthTopCategoryName: string | null;
};

export function computeMonthlyMovementAggregates(
  movements: CategoryPostedMovement[],
  categoryKinds: Map<number, string>,
  categoryNames: Map<number, string>,
  now: Date,
): MonthlyMovementAggregates {
  const thisMonthStart = startOfMonth(now);
  const lastMonthStart = startOfLastMonth(now);
  const lastMonthEnd = endOfLastMonth(now);
  const prevMonthStart = startOfPrevMonth(now);
  const prevMonthEnd = endOfPrevMonth(now);

  let thisMonthExpenses = 0;
  let thisMonthIncome = 0;
  let lastMonthExpenses = 0;
  let lastMonthIncome = 0;
  let prevMonthExpenses = 0;

  const thisMonthByCategory = new Map<number, number>();
  const lastMonthByCategory = new Map<number, number>();

  for (const m of movements) {
    const d = new Date(m.occurredAt);
    const kind = categoryKinds.get(m.categoryId);
    if (!kind || kind === "transfer") continue;

    if (d >= thisMonthStart) {
      if (kind === "expense") {
        const amt = m.sourceAmount ?? 0;
        thisMonthExpenses += amt;
        thisMonthByCategory.set(m.categoryId, (thisMonthByCategory.get(m.categoryId) ?? 0) + amt);
      } else if (kind === "income") {
        thisMonthIncome += m.destinationAmount ?? 0;
      }
    } else if (d >= lastMonthStart && d <= lastMonthEnd) {
      if (kind === "expense") {
        const amt = m.sourceAmount ?? 0;
        lastMonthExpenses += amt;
        lastMonthByCategory.set(m.categoryId, (lastMonthByCategory.get(m.categoryId) ?? 0) + amt);
      } else if (kind === "income") {
        lastMonthIncome += m.destinationAmount ?? 0;
      }
    } else if (d >= prevMonthStart && d <= prevMonthEnd) {
      if (kind === "expense") {
        prevMonthExpenses += m.sourceAmount ?? 0;
      }
    }
  }

  let lastMonthTopCategoryName: string | null = null;
  let lastMonthTopAmount = 0;
  for (const [catId, amt] of lastMonthByCategory) {
    if (amt > lastMonthTopAmount) {
      lastMonthTopAmount = amt;
      lastMonthTopCategoryName = categoryNames.get(catId) ?? null;
    }
  }

  return {
    thisMonthExpenses,
    thisMonthIncome,
    lastMonthExpenses,
    lastMonthIncome,
    prevMonthExpenses,
    thisMonthByCategory,
    lastMonthByCategory,
    lastMonthTopCategoryName,
  };
}

export function buildNoIncomeMonthAlert(
  thisMonthIncome: number,
  workspaceId: number,
  now: Date,
): AlertRow | null {
  if (now.getDate() < 15 || thisMonthIncome !== 0) return null;
  return {
    kind: "no_income_month",
    title: "Sin ingresos registrados este mes",
    body: "No se ha registrado ningún ingreso en lo que va del mes. Recuerda mantener tus movimientos actualizados.",
    related_entity_type: "workspace",
    related_entity_id: workspaceId,
    payload: { dayOfMonth: now.getDate() },
  };
}

export function buildHighExpenseMonthAlert(
  input: { thisMonthExpenses: number; lastMonthExpenses: number },
  workspaceId: number,
  now: Date,
): AlertRow | null {
  if (input.lastMonthExpenses <= 0 || input.thisMonthExpenses <= 0) return null;
  const ratio = input.thisMonthExpenses / input.lastMonthExpenses;
  if (ratio <= 1.3 || now.getDate() < 7) return null;
  const pct = Math.round((ratio - 1) * 100);
  return {
    kind: "high_expense_month",
    title: "Gastos elevados este mes",
    body: `Tus gastos este mes ya superan los del mes pasado en un ${pct}%.`,
    related_entity_type: "workspace",
    related_entity_id: workspaceId,
    payload: { thisMonth: input.thisMonthExpenses, lastMonth: input.lastMonthExpenses, ratio },
  };
}

export function buildCategorySpendingSpikeAlerts(
  thisMonthByCategory: Map<number, number>,
  lastMonthByCategory: Map<number, number>,
  categoryNames: Map<number, string>,
): AlertRow[] {
  const rows: AlertRow[] = [];
  for (const [catId, thisAmt] of thisMonthByCategory) {
    const lastAmt = lastMonthByCategory.get(catId) ?? 0;
    if (lastAmt <= 0) continue; // need baseline
    const ratio = thisAmt / lastAmt;
    // Only alert on meaningful amounts and significant spikes
    if (ratio > 1.5 && thisAmt > 50) {
      const catName = categoryNames.get(catId) ?? "Categoría";
      const pct = Math.round((ratio - 1) * 100);
      rows.push({
        kind: "category_spending_spike",
        title: `Gasto elevado en "${catName}"`,
        body: `Has gastado ${pct}% más en "${catName}" este mes comparado con el mes pasado.`,
        related_entity_type: "category",
        related_entity_id: catId,
        payload: { thisMonth: thisAmt, lastMonth: lastAmt, ratio, categoryName: catName },
      });
    }
  }
  return rows;
}

export function buildExpenseIncomeImbalanceAlert(
  input: { thisMonthExpenses: number; thisMonthIncome: number },
  workspaceId: number,
  now: Date,
): AlertRow | null {
  if (input.thisMonthIncome <= 0 || input.thisMonthExpenses <= 0) return null;
  const ratio = input.thisMonthExpenses / input.thisMonthIncome;
  if (ratio <= 0.85 || now.getDate() < 10) return null;
  const pct = Math.round(ratio * 100);
  return {
    kind: "expense_income_imbalance",
    title: "Gastos cerca del total de ingresos",
    body: `Este mes tus gastos representan el ${pct}% de tus ingresos. Queda poco margen de ahorro.`,
    related_entity_type: "workspace",
    related_entity_id: workspaceId,
    payload: { expenses: input.thisMonthExpenses, income: input.thisMonthIncome, ratio },
  };
}

export function buildNetWorthNegativeAlert(
  accounts: AccountSummary[],
  workspaceId: number,
): AlertRow | null {
  const netWorth = accounts
    .filter((a) => !a.isArchived && a.includeInNetWorth)
    .reduce((sum, a) => sum + (a.currentBalanceInBaseCurrency ?? a.currentBalance), 0);

  if (netWorth >= 0) return null;
  return {
    kind: "net_worth_negative",
    title: "Patrimonio neto negativo",
    body: `Tu patrimonio neto total es negativo (${netWorth.toFixed(2)}). Tus deudas superan tus activos.`,
    related_entity_type: "workspace",
    related_entity_id: workspaceId,
    payload: { netWorth },
  };
}

export function buildSavingsRateLowAlert(
  input: { thisMonthIncome: number; thisMonthExpenses: number },
  workspaceId: number,
  now: Date,
): AlertRow | null {
  if (now.getDate() < 20 || input.thisMonthIncome <= 0 || input.thisMonthExpenses <= 0) return null;
  const savingsRate = (input.thisMonthIncome - input.thisMonthExpenses) / input.thisMonthIncome;
  if (savingsRate < 0 || savingsRate >= 0.10) return null;
  const pct = Math.round(savingsRate * 100);
  return {
    kind: "savings_rate_low",
    title: "Tasa de ahorro muy baja",
    body: `Solo estás ahorrando el ${pct}% de tus ingresos este mes. Intenta reducir gastos variables para mejorar tu margen.`,
    related_entity_type: "workspace",
    related_entity_id: workspaceId,
    payload: { savingsRate, income: input.thisMonthIncome, expenses: input.thisMonthExpenses },
  };
}

export function buildSubscriptionCostHeavyAlert(
  subscriptions: SubscriptionSummary[],
  lastMonthIncome: number,
  workspaceId: number,
): AlertRow | null {
  if (lastMonthIncome <= 0) return null;
  const activeSubs = subscriptions.filter((s) => s.status === "active");
  const monthlySubCost = activeSubs.reduce((sum, s) => {
    const monthly =
      s.frequency === "yearly" ? s.amount / 12
      : s.frequency === "quarterly" ? s.amount / 3
      : s.frequency === "weekly" ? s.amount * 4.33
      : s.frequency === "daily" ? s.amount * 30
      : s.amount;
    return sum + monthly;
  }, 0);
  const ratio = monthlySubCost / lastMonthIncome;
  if (ratio <= 0.30 || activeSubs.length === 0) return null;
  const pct = Math.round(ratio * 100);
  return {
    kind: "subscription_cost_heavy",
    title: "Suscripciones consumen mucho de tus ingresos",
    body: `Tus suscripciones activas equivalen al ${pct}% de tus ingresos del mes pasado. Revisa cuáles realmente usas.`,
    related_entity_type: "workspace",
    related_entity_id: workspaceId,
    payload: { monthlySubCost, ratio, subCount: activeSubs.length },
  };
}

export function buildUpcomingAnnualSubscriptionAlerts(
  subscriptions: SubscriptionSummary[],
  daysFromToday: DaysFromToday,
): AlertRow[] {
  const rows: AlertRow[] = [];
  for (const sub of subscriptions) {
    if (sub.status !== "active") continue;
    if (sub.frequency !== "yearly") continue;
    const diffDays = daysFromToday(sub.nextDueDate);
    if (diffDays >= 14 && diffDays <= 30) {
      const parts = sub.nextDueDate.split("-").map(Number);
      const dueDate = parts.length === 3 ? new Date(parts[0], parts[1] - 1, parts[2]) : new Date(sub.nextDueDate);
      rows.push({
        kind: "upcoming_annual_subscription",
        title: "Renovación anual próxima",
        body: `"${sub.name}" se renueva en ${diffDays} días (${dueDate.toLocaleDateString("es", { day: "numeric", month: "long" })}). Monto: ${sub.amount} ${sub.currencyCode}.`,
        related_entity_type: "subscription",
        related_entity_id: sub.id,
        payload: { diffDays, amount: sub.amount, nextDueDate: sub.nextDueDate },
      });
    }
  }
  return rows;
}

export function buildNoMovementsWeekAlert(
  movements: CategoryPostedMovement[],
  workspaceId: number,
  now: Date,
): AlertRow | null {
  const sevenDaysAgo = new Date(now.getTime() - 7 * 86_400_000);
  const fourteenDaysAgo = new Date(now.getTime() - 14 * 86_400_000);
  const veryRecentMvts = movements.filter((m) => new Date(m.occurredAt) >= sevenDaysAgo);
  const priorWeekMvts = movements.filter((m) => {
    const d = new Date(m.occurredAt);
    return d >= fourteenDaysAgo && d < sevenDaysAgo;
  });
  if (veryRecentMvts.length !== 0 || priorWeekMvts.length === 0) return null;
  return {
    kind: "no_movements_week",
    title: "Sin movimientos esta semana",
    body: "No has registrado movimientos en los últimos 7 días. ¿Olvidaste registrar tus gastos e ingresos?",
    related_entity_type: "workspace",
    related_entity_id: workspaceId,
    payload: { daysSinceLastMovement: 7 },
  };
}
