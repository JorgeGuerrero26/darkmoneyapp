/**
 * useNotificationGenerator
 *
 * Genera notificaciones in-app en la tabla `notifications` basándose en el
 * estado actual del workspace. Se ejecuta cuando el snapshot cambia y el
 * usuario tiene sesión activa. Es idempotente: consulta existentes antes de
 * insertar para evitar duplicados sin depender de constraints DB.
 *
 * Tipos de alerta generados:
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

import { useEffect, useRef } from "react";
import { supabase } from "../lib/supabase";
import { queryClient } from "../lib/query-client";
import { calendarDaysFromTodayLocal } from "../lib/subscription-helpers";
import { getNotificationsModule } from "../lib/notifications-runtime";
import type { WorkspaceSnapshot } from "../services/queries/workspace-data";

const Notifications = getNotificationsModule();

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

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function startOfLastMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() - 1, 1);
}

function endOfLastMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 0, 23, 59, 59, 999);
}

function daysBetween(a: Date, b: Date): number {
  return Math.floor((b.getTime() - a.getTime()) / 86_400_000);
}

// ─── Stale cleanup ────────────────────────────────────────────────────────────

const ALL_KINDS = [
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
];

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

async function generateNotifications(
  userId: string,
  snapshot: WorkspaceSnapshot,
): Promise<void> {
  if (!supabase) return;

  const now = new Date();
  const nowIso = now.toISOString();
  const rows: NotificationRow[] = [];

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

  let thisMonthExpenses = 0;
  let thisMonthIncome = 0;
  let lastMonthExpenses = 0;
  let lastMonthIncome = 0;

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
    }
  }

  // ── 1. Budget alerts ──────────────────────────────────────────────────────
  for (const budget of snapshot.budgets) {
    if (!budget.isActive) continue;

    const isOverLimit = budget.usedPercent >= 100;
    const isNearLimit =
      !isOverLimit && budget.alertPercent > 0 && budget.usedPercent >= budget.alertPercent;

    if (isOverLimit) {
      rows.push({
        user_id: userId, channel: "in_app", status: "pending",
        kind: "budget_alert",
        title: "Presupuesto excedido",
        body: `"${budget.name}" superó su límite (${Math.round(budget.usedPercent)}% usado).`,
        scheduled_for: nowIso,
        related_entity_type: "budget", related_entity_id: budget.id,
        payload: { usedPercent: budget.usedPercent, limitAmount: budget.limitAmount },
      });
    } else if (isNearLimit) {
      rows.push({
        user_id: userId, channel: "in_app", status: "pending",
        kind: "budget_alert",
        title: "Presupuesto cerca del límite",
        body: `"${budget.name}" va al ${Math.round(budget.usedPercent)}% de su límite (alerta: ${Math.round(budget.alertPercent)}%).`,
        scheduled_for: nowIso,
        related_entity_type: "budget", related_entity_id: budget.id,
        payload: { usedPercent: budget.usedPercent, limitAmount: budget.limitAmount },
      });
    }
  }

  // ── 2. Budget period ending soon ─────────────────────────────────────────
  for (const budget of snapshot.budgets) {
    if (!budget.isActive) continue;
    const daysLeft = calendarDaysFromTodayLocal(budget.periodEnd);
    if (daysLeft >= 0 && daysLeft <= 3 && budget.usedPercent > 50) {
      rows.push({
        user_id: userId, channel: "in_app", status: "pending",
        kind: "budget_period_ending",
        title: "Período de presupuesto cerrando",
        body: `"${budget.name}" cierra ${daysLeft === 0 ? "hoy" : `en ${daysLeft} día${daysLeft !== 1 ? "s" : ""}`} y lleva ${Math.round(budget.usedPercent)}% ejecutado.`,
        scheduled_for: nowIso,
        related_entity_type: "budget", related_entity_id: budget.id,
        payload: { daysLeft, usedPercent: budget.usedPercent },
      });
    }
  }

  // ── 3. Subscription reminders ─────────────────────────────────────────────
  for (const sub of snapshot.subscriptions) {
    if (sub.status !== "active") continue;
    const diffDays = calendarDaysFromTodayLocal(sub.nextDueDate);
    const window = Math.max(1, sub.remindDaysBefore);
    if (diffDays > window || diffDays < -1) continue;

    const dueLabel =
      diffDays < 0
        ? `venció hace ${Math.abs(diffDays)} día${Math.abs(diffDays) !== 1 ? "s" : ""}`
        : diffDays === 0 ? "vence hoy"
        : `vence en ${diffDays} día${diffDays !== 1 ? "s" : ""}`;

    rows.push({
      user_id: userId, channel: "in_app", status: "pending",
      kind: "subscription_reminder",
      title: "Suscripción próxima a vencer",
      body: `"${sub.name}" ${dueLabel}.`,
      scheduled_for: nowIso,
      related_entity_type: "subscription", related_entity_id: sub.id,
      payload: { nextDueDate: sub.nextDueDate, diffDays },
    });
  }

  // ── 4. Subscription overdue ───────────────────────────────────────────────
  for (const sub of snapshot.subscriptions) {
    if (sub.status !== "active") continue;
    const diffDays = calendarDaysFromTodayLocal(sub.nextDueDate);
    if (diffDays < -1) {
      rows.push({
        user_id: userId, channel: "in_app", status: "pending",
        kind: "subscription_overdue",
        title: "Suscripción vencida sin registrar",
        body: `"${sub.name}" venció hace ${Math.abs(diffDays)} días y aún no tiene movimiento registrado.`,
        scheduled_for: nowIso,
        related_entity_type: "subscription", related_entity_id: sub.id,
        payload: { nextDueDate: sub.nextDueDate, diffDays },
      });
    }
  }

  // ── 5. Multiple subscriptions due this week ───────────────────────────────
  const subsDueThisWeek = snapshot.subscriptions.filter((s) => {
    if (s.status !== "active") return false;
    const d = calendarDaysFromTodayLocal(s.nextDueDate);
    return d >= 0 && d <= 7;
  });
  if (subsDueThisWeek.length >= 3) {
    const totalAmt = subsDueThisWeek.reduce((acc, s) => acc + s.amount, 0);
    rows.push({
      user_id: userId, channel: "in_app", status: "pending",
      kind: "multiple_subscriptions_due",
      title: "Varias suscripciones vencen esta semana",
      body: `${subsDueThisWeek.length} suscripciones vencen en los próximos 7 días: ${subsDueThisWeek.map((s) => s.name).join(", ")}.`,
      scheduled_for: nowIso,
      related_entity_type: "workspace", related_entity_id: workspaceId,
      payload: { count: subsDueThisWeek.length, totalAmount: totalAmt },
    });
  }

  // ── 6. Obligation due & overdue ───────────────────────────────────────────
  for (const ob of snapshot.obligations) {
    if (ob.status !== "active") continue;
    if (!ob.dueDate) continue;
    const diffDays = calendarDaysFromTodayLocal(ob.dueDate);

    if (diffDays < 0) {
      rows.push({
        user_id: userId, channel: "in_app", status: "pending",
        kind: "obligation_overdue",
        title: "Obligación vencida",
        body: `"${ob.title}" venció hace ${Math.abs(diffDays)} día${Math.abs(diffDays) !== 1 ? "s" : ""}. Saldo pendiente: ${ob.pendingAmount} ${ob.currencyCode}.`,
        scheduled_for: nowIso,
        related_entity_type: "obligation", related_entity_id: ob.id,
        payload: { dueDate: ob.dueDate, diffDays, pendingAmount: ob.pendingAmount },
      });
    } else if (diffDays <= 7) {
      rows.push({
        user_id: userId, channel: "in_app", status: "pending",
        kind: "obligation_due",
        title: diffDays === 0 ? "Obligación vence hoy" : "Obligación próxima a vencer",
        body: `"${ob.title}" ${diffDays === 0 ? "vence hoy" : `vence en ${diffDays} día${diffDays !== 1 ? "s" : ""}`}. Saldo: ${ob.pendingAmount} ${ob.currencyCode}.`,
        scheduled_for: nowIso,
        related_entity_type: "obligation", related_entity_id: ob.id,
        payload: { dueDate: ob.dueDate, diffDays, pendingAmount: ob.pendingAmount },
      });
    }
  }

  // ── 7. Multiple obligations overdue ──────────────────────────────────────
  const overdueObligations = snapshot.obligations.filter((o) => {
    if (o.status !== "active" || !o.dueDate) return false;
    return calendarDaysFromTodayLocal(o.dueDate) < 0;
  });
  if (overdueObligations.length >= 2) {
    rows.push({
      user_id: userId, channel: "in_app", status: "pending",
      kind: "multiple_obligations_overdue",
      title: "Varias obligaciones vencidas",
      body: `Tienes ${overdueObligations.length} obligaciones vencidas: ${overdueObligations.map((o) => o.title).join(", ")}.`,
      scheduled_for: nowIso,
      related_entity_type: "workspace", related_entity_id: workspaceId,
      payload: { count: overdueObligations.length },
    });
  }

  // ── 8. Obligation with no recent payment ──────────────────────────────────
  for (const ob of snapshot.obligations) {
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
        user_id: userId, channel: "in_app", status: "pending",
        kind: "obligation_no_payment",
        title: "Obligación sin pagos recientes",
        body: `"${ob.title}" tiene saldo pendiente de ${ob.pendingAmount} ${ob.currencyCode}. ${msg}`,
        scheduled_for: nowIso,
        related_entity_type: "obligation", related_entity_id: ob.id,
        payload: { daysSincePayment, pendingAmount: ob.pendingAmount },
      });
    }
  }

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

  // ── Insert only new notifications (idempotent without DB constraint) ──────
  if (!rows.length) {
    await cleanupStaleNotifications(userId, rows);
    void queryClient.invalidateQueries({ queryKey: ["notifications", userId] });
    return;
  }

  const { data: existing } = await supabase
    .from("notifications")
    .select("related_entity_type, related_entity_id, kind")
    .eq("user_id", userId)
    .in("kind", ALL_KINDS);

  const existingSet = new Set(
    (existing ?? []).map((r: any) => `${r.related_entity_type}:${r.related_entity_id}:${r.kind}`)
  );

  const newRows = rows.filter(
    (r) => !existingSet.has(`${r.related_entity_type}:${r.related_entity_id}:${r.kind}`)
  );

  if (newRows.length) {
    const { error } = await supabase.from("notifications").insert(newRows);
    if (error) console.warn("[NotificationGenerator] insert error:", error.message);

    // Fire as immediate local OS notifications so they appear in the notification shade
    if (Notifications) {
      const toFire = newRows.slice(0, 8); // cap to avoid flooding
      for (const row of toFire) {
        try {
          await Notifications.scheduleNotificationAsync({
            content: {
              title: row.title,
              body: row.body,
              data: {
                kind: row.kind,
                relatedEntityType: row.related_entity_type,
                relatedEntityId: row.related_entity_id,
              },
              sound: true,
            },
            trigger: {
              type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
              seconds: 2,
              repeats: false,
            },
          });
        } catch {
          // ignore — scheduling failures must not block the app
        }
      }
    }
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

  useEffect(() => {
    if (!userId || !snapshot) return;

    // Fingerprint: recalculate when any relevant data changes
    const fingerprint = [
      snapshot.budgets.map((b) => `${b.id}:${b.usedPercent}`).join(","),
      snapshot.subscriptions.map((s) => `${s.id}:${s.nextDueDate}:${s.status}`).join(","),
      snapshot.obligations.map((o) => `${o.id}:${o.pendingAmount}:${o.status}:${o.lastPaymentDate ?? ""}`).join(","),
      snapshot.accounts.map((a) => `${a.id}:${Math.round(a.currentBalance)}`).join(","),
      `m:${snapshot.categoryPostedMovements.length}`,
    ].join("|");

    if (fingerprint === lastSnapshotRef.current) return;
    lastSnapshotRef.current = fingerprint;

    void generateNotifications(userId, snapshot).catch((err) => {
      console.warn("[NotificationGenerator] error:", err);
      lastSnapshotRef.current = null; // allow retry on next change
    });
  }, [userId, snapshot]);
}
