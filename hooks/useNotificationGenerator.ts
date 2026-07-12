/**
 * useNotificationGenerator
 *
 * Genera notificaciones in-app en la tabla `notifications` basándose en el
 * estado actual del workspace. Se ejecuta cuando el snapshot o el día cambian
 * y el usuario tiene sesión activa. Es idempotente: consulta existentes y usa
 * el índice único de notifications para evitar duplicados.
 *
 * Tipos de alerta generados:
 *
 *  DIARIAS
 *  - daily_workspace_summary : resumen mínimo diario del workspace
 *  - daily_cashflow_check    : chequeo mínimo diario de flujo
 *  - daily_budget_review     : revisión mínima diaria de presupuestos
 *
 *  PRESUPUESTOS
 *  - budget_alert           : presupuesto >= alertPercent% o sobre el límite
 *  - budget_period_ending   : período cierra en ≤ 3 días con gasto > 50%
 *
 *  SUSCRIPCIONES
 *  - subscription_reminder  : suscripción activa dentro de ventana de aviso
 *  - subscription_overdue   : suscripción vencida (nextDueDate < hoy)
 *  - multiple_subscriptions_due : 3+ suscripciones vencen en ≤ 7 días
 *
 *  OBLIGACIONES
 *  - obligation_due         : obligación activa vence en ≤ 7 días
 *  - obligation_overdue     : obligación vencida
 *  - obligation_no_payment  : obligación activa con cuotas y sin pago en 45+ días
 *  - multiple_obligations_overdue : 2+ obligaciones vencidas simultáneamente
 *  - high_interest_obligation : obligación activa con tasa ≥ 10% y saldo > 0
 *
 *  CUENTAS
 *  - low_balance            : saldo bajo umbral mínimo en cuenta bank/cash/savings
 *  - negative_balance       : saldo negativo en cuenta que no es préstamo/tarjeta
 *  - account_dormant        : cuenta sin actividad en 60+ días con saldo > 0
 *
 *  GASTOS E INGRESOS
 *  - no_income_month        : sin ingresos registrados este mes (después del día 15)
 *  - high_expense_month     : gastos del mes > mes anterior en 30%+
 *  - category_spending_spike: una categoría subió 50%+ vs mes anterior
 *  - expense_income_imbalance: gastos > 85% de los ingresos este mes
 *
 *  PATRIMONIO
 *  - net_worth_negative     : patrimonio neto total negativo
 *
 *  ANÁLISIS AVANZADO
 *  - savings_rate_low           : tasa de ahorro < 10% tras el día 20
 *  - subscription_cost_heavy    : costo mensual de suscripciones > 30% del ingreso
 *  - upcoming_annual_subscription : suscripción anual vence en 14-30 días
 *  - no_movements_week          : sin movimientos 7 días consecutivos (con actividad previa)
 */

import { useEffect, useRef, useState } from "react";
import { InteractionManager } from "react-native";
import { supabase } from "../lib/supabase";
import { queryClient } from "../lib/query-client";
import { getNotificationPriority } from "../lib/notification-priority";
import { calendarDaysFromTodayLocal } from "../lib/subscription-helpers";
import type { WorkspaceSnapshot } from "../services/queries/workspace-data";
import {
  buildBudgetLimitAlerts,
  buildBudgetPeriodEndingAlerts,
  buildDetectedSuggestionsPendingAlert,
  buildDuplicateChargeAlerts,
  buildExpectedIncomeMissedAlerts,
  buildMonthlyRecapAlert,
  buildMultipleObligationsOverdueAlert,
  buildMultipleSubscriptionsDueAlert,
  buildObligationDueAlerts,
  buildObligationMilestoneAlerts,
  buildObligationNoPaymentAlerts,
  buildSubscriptionOverdueAlerts,
  buildSubscriptionPriceIncreaseAlerts,
  buildSubscriptionReminderAlerts,
  type AlertRow,
} from "../features/notifications/lib/alertBuilders";

type NotificationRow = {
  user_id: string;
  channel: "in_app";
  status: "pending";
  kind: string;
  title: string;
  body: string;
  scheduled_for: string;
  related_entity_type: string;
  related_entity_id: number;
  payload: Record<string, unknown>;
};

// ─── Date helpers ─────────────────────────────────────────────────────────────

const LIMA_TIMEZONE = "America/Lima";

function usageDateInLima(date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: LIMA_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function startOfLastMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() - 1, 1);
}

function endOfLastMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 0, 23, 59, 59, 999);
}

function startOfPrevMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() - 2, 1);
}

function endOfPrevMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() - 1, 0, 23, 59, 59, 999);
}

function daysBetween(a: Date, b: Date): number {
  return Math.floor((b.getTime() - a.getTime()) / 86_400_000);
}

// ─── Stale cleanup ────────────────────────────────────────────────────────────

const ALL_KINDS = [
  "daily_workspace_summary",
  "daily_cashflow_check",
  "daily_budget_review",
  "budget_alert",
  "budget_period_ending",
  "subscription_reminder",
  "subscription_overdue",
  "multiple_subscriptions_due",
  "obligation_due",
  "obligation_overdue",
  "obligation_no_payment",
  "multiple_obligations_overdue",
  "high_interest_obligation",
  "low_balance",
  "negative_balance",
  "account_dormant",
  "no_income_month",
  "high_expense_month",
  "category_spending_spike",
  "expense_income_imbalance",
  "net_worth_negative",
  // New analytical types
  "savings_rate_low",
  "subscription_cost_heavy",
  "upcoming_annual_subscription",
  "no_movements_week",
  // Kinds nuevos (spec 2026-07-10) — los 2 predictivos server-side NO van aquí
  // (los genera el cron y este cleanup los borraría).
  "subscription_price_increase",
  "possible_duplicate_charge",
  "detected_suggestions_pending",
  "expected_income_missed",
  "monthly_recap",
  "obligation_milestone",
];

const DAILY_INFORMATIONAL_MINIMUM = 3;

async function cleanupStaleNotifications(
  userId: string,
  activeRows: NotificationRow[],
): Promise<void> {
  if (!supabase) return;

  const keepIds: Record<string, Set<number>> = {};
  for (const kind of ALL_KINDS) keepIds[kind] = new Set();
  for (const row of activeRows) {
    keepIds[row.kind]?.add(row.related_entity_id);
  }

  await Promise.all(
    ALL_KINDS.map((kind) => {
      const ids = Array.from(keepIds[kind]);
      const q = supabase!
        .from("notifications")
        .delete()
        .eq("user_id", userId)
        .eq("kind", kind);
      return ids.length ? q.not("related_entity_id", "in", `(${ids.join(",")})`) : q;
    }),
  );
}

// ─── Generator ────────────────────────────────────────────────────────────────

function dailyBaselineEntityId(dayKey: string, index: number): number {
  return Number(dayKey.replace(/-/g, "")) * 10 + index + 1;
}

function countLabel(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

function toNotificationRow(userId: string, nowIso: string, alert: AlertRow): NotificationRow {
  return { user_id: userId, channel: "in_app", status: "pending", scheduled_for: nowIso, ...alert };
}

function appendDailyBaselineNotifications(input: {
  rows: NotificationRow[];
  userId: string;
  snapshot: WorkspaceSnapshot;
  nowIso: string;
  todayKey: string;
  workspaceId: number;
  thisMonthIncome: number;
  thisMonthExpenses: number;
}) {
  const informationalCount = input.rows.filter(
    (row) => getNotificationPriority(row.kind) === "informational",
  ).length;
  const missingCount = DAILY_INFORMATIONAL_MINIMUM - informationalCount;
  if (missingCount <= 0) return;

  const activeBudgetCount = input.snapshot.budgets.filter((budget) => budget.isActive).length;
  const activeSubscriptionCount = input.snapshot.subscriptions.filter((sub) => sub.status === "active").length;
  const activeObligationCount = input.snapshot.obligations.filter((obligation) => obligation.status === "active").length;
  const openAccountCount = input.snapshot.accounts.filter((account) => !account.isArchived).length;
  const movementCount = input.snapshot.categoryPostedMovements.length;
  const expenseIncomeRatio = input.thisMonthIncome > 0
    ? Math.round((input.thisMonthExpenses / input.thisMonthIncome) * 100)
    : null;

  const baselineRows: NotificationRow[] = [
    {
      user_id: input.userId,
      channel: "in_app",
      status: "pending",
      kind: "daily_workspace_summary",
      title: "Resumen financiero del día",
      body: `Tu workspace tiene ${countLabel(openAccountCount, "cuenta activa", "cuentas activas")}, ${countLabel(activeBudgetCount, "presupuesto", "presupuestos")} y ${countLabel(movementCount, "movimiento registrado", "movimientos registrados")}.`,
      scheduled_for: input.nowIso,
      related_entity_type: "daily_digest",
      related_entity_id: dailyBaselineEntityId(input.todayKey, 0),
      payload: {
        workspaceId: input.workspaceId,
        todayKey: input.todayKey,
        accountCount: openAccountCount,
        budgetCount: activeBudgetCount,
        movementCount,
      },
    },
    {
      user_id: input.userId,
      channel: "in_app",
      status: "pending",
      kind: "daily_cashflow_check",
      title: "Chequeo de flujo",
      body: expenseIncomeRatio === null
        ? "Todavía no hay ingresos suficientes este mes para calcular tu margen. Mantén tus movimientos al día."
        : `Este mes tus gastos representan el ${expenseIncomeRatio}% de tus ingresos registrados.`,
      scheduled_for: input.nowIso,
      related_entity_type: "daily_digest",
      related_entity_id: dailyBaselineEntityId(input.todayKey, 1),
      payload: {
        workspaceId: input.workspaceId,
        todayKey: input.todayKey,
        income: input.thisMonthIncome,
        expenses: input.thisMonthExpenses,
        expenseIncomeRatio,
      },
    },
    {
      user_id: input.userId,
      channel: "in_app",
      status: "pending",
      kind: "daily_budget_review",
      title: "Revisión diaria",
      body: activeBudgetCount > 0
        ? `Tienes ${countLabel(activeBudgetCount, "presupuesto", "presupuestos")}, ${countLabel(activeSubscriptionCount, "suscripción", "suscripciones")} y ${countLabel(activeObligationCount, "obligación activa", "obligaciones activas")} para revisar.`
        : "Aún no tienes presupuestos activos. Crea uno para recibir alertas más precisas sobre tus gastos.",
      scheduled_for: input.nowIso,
      related_entity_type: "daily_digest",
      related_entity_id: dailyBaselineEntityId(input.todayKey, 2),
      payload: {
        workspaceId: input.workspaceId,
        todayKey: input.todayKey,
        budgetCount: activeBudgetCount,
        subscriptionCount: activeSubscriptionCount,
        obligationCount: activeObligationCount,
      },
    },
  ];

  input.rows.push(...baselineRows.slice(0, missingCount));
}

async function generateNotifications(
  userId: string,
  snapshot: WorkspaceSnapshot,
): Promise<void> {
  if (!supabase) return;

  const now = new Date();
  const nowIso = now.toISOString();
  const todayKey = usageDateInLima(now);
  const rows: NotificationRow[] = [];

  const pushAlerts = (alerts: AlertRow[] | AlertRow | null) => {
    const list = Array.isArray(alerts) ? alerts : alerts ? [alerts] : [];
    for (const alert of list) rows.push(toNotificationRow(userId, nowIso, alert));
  };

  // Workspace ID (used for workspace-level alerts)
  const workspaceId =
    snapshot.accounts.find((a) => a.workspaceId)?.workspaceId ??
    snapshot.budgets[0]?.workspaceId ?? 0;

  // Category kind map
  const categoryKindMap = new Map<number, string>();
  for (const c of snapshot.categories) categoryKindMap.set(c.id, c.kind);
  const categoryNameMap = new Map<number, string>();
  for (const c of snapshot.categories) categoryNameMap.set(c.id, c.name);

  // ── Monthly movement aggregates ──────────────────────────────────────────
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

  // Per-category monthly totals (for spike detection)
  const thisMonthByCat = new Map<number, number>();
  const lastMonthByCat = new Map<number, number>();

  for (const m of snapshot.categoryPostedMovements) {
    const d = new Date(m.occurredAt);
    const kind = categoryKindMap.get(m.categoryId);
    if (!kind || kind === "transfer") continue;

    if (d >= thisMonthStart) {
      if (kind === "expense") {
        const amt = m.sourceAmount ?? 0;
        thisMonthExpenses += amt;
        thisMonthByCat.set(m.categoryId, (thisMonthByCat.get(m.categoryId) ?? 0) + amt);
      } else if (kind === "income") {
        thisMonthIncome += m.destinationAmount ?? 0;
      }
    } else if (d >= lastMonthStart && d <= lastMonthEnd) {
      if (kind === "expense") {
        const amt = m.sourceAmount ?? 0;
        lastMonthExpenses += amt;
        lastMonthByCat.set(m.categoryId, (lastMonthByCat.get(m.categoryId) ?? 0) + amt);
      } else if (kind === "income") {
        lastMonthIncome += m.destinationAmount ?? 0;
      }
    } else if (d >= prevMonthStart && d <= prevMonthEnd) {
      if (kind === "expense") {
        prevMonthExpenses += m.sourceAmount ?? 0;
      }
    }
  }

  // Categoría con mayor gasto del mes cerrado (para el recap mensual)
  let lastMonthTopCategory: string | null = null;
  let lastMonthTopAmount = 0;
  for (const [catId, amt] of lastMonthByCat) {
    if (amt > lastMonthTopAmount) {
      lastMonthTopAmount = amt;
      lastMonthTopCategory = categoryNameMap.get(catId) ?? null;
    }
  }

  // ── 1. Budget alerts ──────────────────────────────────────────────────────
  pushAlerts(buildBudgetLimitAlerts(snapshot.budgets));

  // ── 2. Budget period ending soon ─────────────────────────────────────────
  pushAlerts(buildBudgetPeriodEndingAlerts(snapshot.budgets, calendarDaysFromTodayLocal));

  // ── 3. Subscription reminders ─────────────────────────────────────────────
  pushAlerts(buildSubscriptionReminderAlerts(snapshot.subscriptions, calendarDaysFromTodayLocal));

  // ── 4. Subscription overdue ───────────────────────────────────────────────
  pushAlerts(buildSubscriptionOverdueAlerts(snapshot.subscriptions, calendarDaysFromTodayLocal));

  // ── 5. Multiple subscriptions due this week ───────────────────────────────
  pushAlerts(buildMultipleSubscriptionsDueAlert(snapshot.subscriptions, workspaceId, calendarDaysFromTodayLocal));

  // ── 6. Obligation due & overdue ───────────────────────────────────────────
  pushAlerts(buildObligationDueAlerts(snapshot.obligations, calendarDaysFromTodayLocal));

  // ── 7. Multiple obligations overdue ──────────────────────────────────────
  pushAlerts(buildMultipleObligationsOverdueAlert(snapshot.obligations, workspaceId, calendarDaysFromTodayLocal));

  // ── 8. Obligation with no recent payment ──────────────────────────────────
  pushAlerts(buildObligationNoPaymentAlerts(snapshot.obligations, now));

  // ── 9. High-interest obligation ───────────────────────────────────────────
  for (const ob of snapshot.obligations) {
    if (ob.status !== "active") continue;
    if (!ob.interestRate || ob.interestRate < 10) continue;
    if (ob.pendingAmount <= 0) continue;

    rows.push({
      user_id: userId, channel: "in_app", status: "pending",
      kind: "high_interest_obligation",
      title: "Obligación con tasa alta",
      body: `"${ob.title}" tiene tasa del ${ob.interestRate}% con ${ob.pendingAmount} ${ob.currencyCode} pendiente. Considera priorizar este pago.`,
      scheduled_for: nowIso,
      related_entity_type: "obligation", related_entity_id: ob.id,
      payload: { interestRate: ob.interestRate, pendingAmount: ob.pendingAmount },
    });
  }

  // ── 10. Low balance ───────────────────────────────────────────────────────
  const nonLoanTypes = new Set(["bank", "cash", "savings", "investment", "other"]);
  for (const acc of snapshot.accounts) {
    if (acc.isArchived) continue;
    if (!nonLoanTypes.has(acc.type)) continue;
    if (acc.currentBalance <= 0) continue; // covered by negative_balance

    // Threshold: 10% of opening balance, minimum 50 units of currency
    const threshold = Math.max(50, Math.abs(acc.openingBalance) * 0.10);
    if (acc.currentBalance < threshold && acc.openingBalance > 0) {
      rows.push({
        user_id: userId, channel: "in_app", status: "pending",
        kind: "low_balance",
        title: "Saldo bajo en cuenta",
        body: `"${acc.name}" tiene solo ${acc.currentBalance.toFixed(2)} ${acc.currencyCode} disponibles.`,
        scheduled_for: nowIso,
        related_entity_type: "account", related_entity_id: acc.id,
        payload: { currentBalance: acc.currentBalance, threshold },
      });
    }
  }

  // ── 11. Negative balance ──────────────────────────────────────────────────
  for (const acc of snapshot.accounts) {
    if (acc.isArchived) continue;
    if (!nonLoanTypes.has(acc.type)) continue;
    if (acc.currentBalance >= 0) continue;

    rows.push({
      user_id: userId, channel: "in_app", status: "pending",
      kind: "negative_balance",
      title: "Saldo negativo en cuenta",
      body: `"${acc.name}" tiene saldo negativo: ${acc.currentBalance.toFixed(2)} ${acc.currencyCode}.`,
      scheduled_for: nowIso,
      related_entity_type: "account", related_entity_id: acc.id,
      payload: { currentBalance: acc.currentBalance },
    });
  }

  // ── 12. Account dormant ───────────────────────────────────────────────────
  for (const acc of snapshot.accounts) {
    if (acc.isArchived) continue;
    if (acc.currentBalance === 0) continue;
    if (!acc.lastActivity) continue;

    const lastAct = new Date(acc.lastActivity);
    const daysSince = daysBetween(lastAct, now);
    if (daysSince >= 60) {
      rows.push({
        user_id: userId, channel: "in_app", status: "pending",
        kind: "account_dormant",
        title: "Cuenta sin actividad",
        body: `"${acc.name}" lleva ${daysSince} días sin movimientos y tiene saldo de ${acc.currentBalance.toFixed(2)} ${acc.currencyCode}.`,
        scheduled_for: nowIso,
        related_entity_type: "account", related_entity_id: acc.id,
        payload: { daysSince, currentBalance: acc.currentBalance },
      });
    }
  }

  // ── 13. No income this month (after day 15) ───────────────────────────────
  if (now.getDate() >= 15 && thisMonthIncome === 0) {
    rows.push({
      user_id: userId, channel: "in_app", status: "pending",
      kind: "no_income_month",
      title: "Sin ingresos registrados este mes",
      body: "No se ha registrado ningún ingreso en lo que va del mes. Recuerda mantener tus movimientos actualizados.",
      scheduled_for: nowIso,
      related_entity_type: "workspace", related_entity_id: workspaceId,
      payload: { dayOfMonth: now.getDate() },
    });
  }

  // ── 14. High expense month (30%+ vs last month) ───────────────────────────
  if (lastMonthExpenses > 0 && thisMonthExpenses > 0) {
    const ratio = thisMonthExpenses / lastMonthExpenses;
    // Only alert if we're at least 7 days into the month (enough data)
    if (ratio > 1.3 && now.getDate() >= 7) {
      const pct = Math.round((ratio - 1) * 100);
      rows.push({
        user_id: userId, channel: "in_app", status: "pending",
        kind: "high_expense_month",
        title: "Gastos elevados este mes",
        body: `Tus gastos este mes ya superan los del mes pasado en un ${pct}%.`,
        scheduled_for: nowIso,
        related_entity_type: "workspace", related_entity_id: workspaceId,
        payload: { thisMonth: thisMonthExpenses, lastMonth: lastMonthExpenses, ratio },
      });
    }
  }

  // ── 15. Category spending spike (50%+ vs last month) ──────────────────────
  for (const [catId, thisAmt] of thisMonthByCat) {
    const lastAmt = lastMonthByCat.get(catId) ?? 0;
    if (lastAmt <= 0) continue; // need baseline
    const ratio = thisAmt / lastAmt;
    // Only alert on meaningful amounts and significant spikes
    if (ratio > 1.5 && thisAmt > 50) {
      const catName = categoryNameMap.get(catId) ?? "Categoría";
      const pct = Math.round((ratio - 1) * 100);
      rows.push({
        user_id: userId, channel: "in_app", status: "pending",
        kind: "category_spending_spike",
        title: `Gasto elevado en "${catName}"`,
        body: `Has gastado ${pct}% más en "${catName}" este mes comparado con el mes pasado.`,
        scheduled_for: nowIso,
        related_entity_type: "category", related_entity_id: catId,
        payload: { thisMonth: thisAmt, lastMonth: lastAmt, ratio, categoryName: catName },
      });
    }
  }

  // ── 16. Expense/income imbalance ──────────────────────────────────────────
  if (thisMonthIncome > 0 && thisMonthExpenses > 0) {
    const ratio = thisMonthExpenses / thisMonthIncome;
    if (ratio > 0.85 && now.getDate() >= 10) {
      const pct = Math.round(ratio * 100);
      rows.push({
        user_id: userId, channel: "in_app", status: "pending",
        kind: "expense_income_imbalance",
        title: "Gastos cerca del total de ingresos",
        body: `Este mes tus gastos representan el ${pct}% de tus ingresos. Queda poco margen de ahorro.`,
        scheduled_for: nowIso,
        related_entity_type: "workspace", related_entity_id: workspaceId,
        payload: { expenses: thisMonthExpenses, income: thisMonthIncome, ratio },
      });
    }
  }

  // ── 17. Net worth negative ────────────────────────────────────────────────
  const netWorth = snapshot.accounts
    .filter((a) => !a.isArchived && a.includeInNetWorth)
    .reduce((sum, a) => sum + (a.currentBalanceInBaseCurrency ?? a.currentBalance), 0);

  if (netWorth < 0) {
    rows.push({
      user_id: userId, channel: "in_app", status: "pending",
      kind: "net_worth_negative",
      title: "Patrimonio neto negativo",
      body: `Tu patrimonio neto total es negativo (${netWorth.toFixed(2)}). Tus deudas superan tus activos.`,
      scheduled_for: nowIso,
      related_entity_type: "workspace", related_entity_id: workspaceId,
      payload: { netWorth },
    });
  }

  // ── 18. Savings rate low (after day 20) ──────────────────────────────────
  if (now.getDate() >= 20 && thisMonthIncome > 0 && thisMonthExpenses > 0) {
    const savingsRate = (thisMonthIncome - thisMonthExpenses) / thisMonthIncome;
    if (savingsRate >= 0 && savingsRate < 0.10) {
      const pct = Math.round(savingsRate * 100);
      rows.push({
        user_id: userId, channel: "in_app", status: "pending",
        kind: "savings_rate_low",
        title: "Tasa de ahorro muy baja",
        body: `Solo estás ahorrando el ${pct}% de tus ingresos este mes. Intenta reducir gastos variables para mejorar tu margen.`,
        scheduled_for: nowIso,
        related_entity_type: "workspace", related_entity_id: workspaceId,
        payload: { savingsRate, income: thisMonthIncome, expenses: thisMonthExpenses },
      });
    }
  }

  // ── 19. Subscriptions cost heavy (> 30% of last month income) ────────────
  if (lastMonthIncome > 0) {
    const activeSubs = snapshot.subscriptions.filter((s) => s.status === "active");
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
    if (ratio > 0.30 && activeSubs.length > 0) {
      const pct = Math.round(ratio * 100);
      rows.push({
        user_id: userId, channel: "in_app", status: "pending",
        kind: "subscription_cost_heavy",
        title: "Suscripciones consumen mucho de tus ingresos",
        body: `Tus suscripciones activas equivalen al ${pct}% de tus ingresos del mes pasado. Revisa cuáles realmente usas.`,
        scheduled_for: nowIso,
        related_entity_type: "workspace", related_entity_id: workspaceId,
        payload: { monthlySubCost, ratio, subCount: activeSubs.length },
      });
    }
  }

  // ── 20. Upcoming annual subscription (14–30 days away) ───────────────────
  for (const sub of snapshot.subscriptions) {
    if (sub.status !== "active") continue;
    if (sub.frequency !== "yearly") continue;
    const diffDays = calendarDaysFromTodayLocal(sub.nextDueDate);
    if (diffDays >= 14 && diffDays <= 30) {
      const parts = sub.nextDueDate.split("-").map(Number);
      const dueDate = parts.length === 3 ? new Date(parts[0], parts[1] - 1, parts[2]) : new Date(sub.nextDueDate);
      rows.push({
        user_id: userId, channel: "in_app", status: "pending",
        kind: "upcoming_annual_subscription",
        title: "Renovación anual próxima",
        body: `"${sub.name}" se renueva en ${diffDays} días (${dueDate.toLocaleDateString("es", { day: "numeric", month: "long" })}). Monto: ${sub.amount} ${sub.currencyCode}.`,
        scheduled_for: nowIso,
        related_entity_type: "subscription", related_entity_id: sub.id,
        payload: { diffDays, amount: sub.amount, nextDueDate: sub.nextDueDate },
      });
    }
  }

  // ── 21. No movements in last 7 days (but had activity in prior 7 days) ────
  const sevenDaysAgo = new Date(now.getTime() - 7 * 86_400_000);
  const fourteenDaysAgo = new Date(now.getTime() - 14 * 86_400_000);
  const veryRecentMvts = snapshot.categoryPostedMovements.filter(
    (m) => new Date(m.occurredAt) >= sevenDaysAgo,
  );
  const priorWeekMvts = snapshot.categoryPostedMovements.filter((m) => {
    const d = new Date(m.occurredAt);
    return d >= fourteenDaysAgo && d < sevenDaysAgo;
  });
  if (veryRecentMvts.length === 0 && priorWeekMvts.length > 0) {
    rows.push({
      user_id: userId, channel: "in_app", status: "pending",
      kind: "no_movements_week",
      title: "Sin movimientos esta semana",
      body: "No has registrado movimientos en los últimos 7 días. ¿Olvidaste registrar tus gastos e ingresos?",
      scheduled_for: nowIso,
      related_entity_type: "workspace", related_entity_id: workspaceId,
      payload: { daysSinceLastMovement: 7 },
    });
  }

  // ── Kinds nuevos (spec 2026-07-10) ────────────────────────────────────────
  const nuevos: AlertRow[] = [
    ...buildSubscriptionPriceIncreaseAlerts(snapshot.subscriptions, snapshot.subscriptionPostedMovements),
    ...buildDuplicateChargeAlerts(snapshot.categoryPostedMovements, categoryKindMap, now),
    ...buildExpectedIncomeMissedAlerts(snapshot.recurringIncome, snapshot.categoryPostedMovements, categoryKindMap, now),
    ...buildObligationMilestoneAlerts(snapshot.obligations),
  ];
  const recap = buildMonthlyRecapAlert(
    { lastMonthExpenses, lastMonthIncome, prevMonthExpenses, topCategoryName: lastMonthTopCategory },
    now,
  );
  if (recap) nuevos.push(recap);

  // Sugerencias detectadas pendientes (query directa; fallo silencioso)
  try {
    const { data: pendientes } = await supabase
      .from("notification_detected_movement_suggestions")
      .select("created_at")
      .eq("user_id", userId)
      .eq("status", "pending")
      .order("created_at", { ascending: true })
      .limit(50);
    const pendingAlert = buildDetectedSuggestionsPendingAlert(
      pendientes?.length ?? 0,
      pendientes?.[0]?.created_at ?? null,
      workspaceId,
      now,
    );
    if (pendingAlert) nuevos.push(pendingAlert);
  } catch { /* sin bloqueo del resto */ }

  rows.push(...nuevos.map((alert) => toNotificationRow(userId, nowIso, alert)));

  appendDailyBaselineNotifications({
    rows,
    userId,
    snapshot,
    nowIso,
    todayKey,
    workspaceId,
    thisMonthIncome,
    thisMonthExpenses,
  });

  // ── Insert only new notifications (idempotent without DB constraint) ──────
  if (!rows.length) {
    await cleanupStaleNotifications(userId, rows);
    void queryClient.invalidateQueries({ queryKey: ["notifications", userId] });
    return;
  }

  const { data: existing } = await supabase
    .from("notifications")
    .select("related_entity_type, related_entity_id, kind, scheduled_for")
    .eq("user_id", userId)
    .in("kind", ALL_KINDS);

  const existingSet = new Set(
    (existing ?? [])
      .filter((row: any) => {
        const scheduledFor = typeof row.scheduled_for === "string" ? row.scheduled_for : "";
        if (!scheduledFor) return false;
        return usageDateInLima(new Date(scheduledFor)) === todayKey;
      })
      .map((row: any) => `${row.related_entity_type}:${row.related_entity_id}:${row.kind}:${todayKey}`),
  );

  const newRows = rows.filter(
    (row) => !existingSet.has(`${row.related_entity_type}:${row.related_entity_id}:${row.kind}:${todayKey}`),
  );

  if (newRows.length) {
    const { error } = await supabase
      .from("notifications")
      .upsert(newRows, {
        onConflict: "user_id,related_entity_type,related_entity_id,kind",
        ignoreDuplicates: true,
      });
    if (error) console.warn("[NotificationGenerator] insert error:", error.message);
  }

  await cleanupStaleNotifications(userId, rows);
  void queryClient.invalidateQueries({ queryKey: ["notifications", userId] });
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useNotificationGenerator(
  userId: string | undefined,
  snapshot: WorkspaceSnapshot | undefined,
) {
  const lastSnapshotRef = useRef<string | null>(null);
  const [generationDayKey, setGenerationDayKey] = useState(() => usageDateInLima());

  useEffect(() => {
    const timer = setInterval(() => {
      setGenerationDayKey((current) => {
        const next = usageDateInLima();
        return current === next ? current : next;
      });
    }, 60_000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!userId || !snapshot) return;

    // Fingerprint: recalculate when any relevant data changes
    const fingerprint = [
      generationDayKey,
      snapshot.budgets.map((b) => `${b.id}:${b.usedPercent}`).join(","),
      snapshot.subscriptions.map((s) => `${s.id}:${s.nextDueDate}:${s.status}`).join(","),
      snapshot.obligations.map((o) => `${o.id}:${o.pendingAmount}:${o.status}:${o.lastPaymentDate ?? ""}`).join(","),
      snapshot.accounts.map((a) => `${a.id}:${Math.round(a.currentBalance)}`).join(","),
      `m:${snapshot.categoryPostedMovements.length}`,
    ].join("|");

    if (fingerprint === lastSnapshotRef.current) return;

    // Diferir el análisis (recorre todo el snapshot en el hilo JS) hasta después
    // de las interacciones en curso: al abrir la app competía con el primer
    // render y frenaba el arranque. La huella se marca DENTRO de la tarea (al
    // ejecutar de verdad): si el efecto re-corre y cancela una tarea pendiente,
    // la huella sin marcar hace que se reprograme en vez de perderse.
    const task = InteractionManager.runAfterInteractions(() => {
      lastSnapshotRef.current = fingerprint;
      void generateNotifications(userId, snapshot).catch((err) => {
        console.warn("[NotificationGenerator] error:", err);
        lastSnapshotRef.current = null; // allow retry on next change
      });
    });
    return () => task.cancel();
  }, [userId, snapshot, generationDayKey]);
}
