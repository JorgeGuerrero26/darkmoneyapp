/**
 * useNotificationGenerator
 *
 * Genera notificaciones in-app en la tabla `notifications` basándose en el
 * estado actual del workspace. Se ejecuta cuando el snapshot o el día cambian
 * y el usuario tiene sesión activa. Es idempotente: consulta existentes y usa
 * el índice único de notifications para evitar duplicados.
 *
 * Las reglas de detección viven como builders puros (testeados) en
 * `features/notifications/lib/alertBuilders.ts`; este hook solo orquesta:
 * fingerprint del snapshot, ejecución diferida, idempotencia (existingSet +
 * upsert ignoreDuplicates) y cleanup por vigencia (ALL_KINDS).
 */

import { useEffect, useRef, useState } from "react";
import { InteractionManager } from "react-native";
import { supabase } from "../lib/supabase";
import { queryClient } from "../lib/query-client";
import { calendarDaysFromTodayLocal } from "../lib/subscription-helpers";
import type { WorkspaceSnapshot } from "../services/queries/workspace-data";
import {
  buildAccountDormantAlerts,
  buildBudgetLimitAlerts,
  buildBudgetPeriodEndingAlerts,
  buildCategorySpendingSpikeAlerts,
  buildDailyBaselineAlerts,
  buildDetectedSuggestionsPendingAlert,
  buildDuplicateChargeAlerts,
  buildExpectedIncomeMissedAlerts,
  buildExpenseIncomeImbalanceAlert,
  buildHighExpenseMonthAlert,
  buildHighInterestObligationAlerts,
  buildLowBalanceAlerts,
  buildMonthlyRecapAlert,
  buildMultipleObligationsOverdueAlert,
  buildMultipleSubscriptionsDueAlert,
  buildNegativeBalanceAlerts,
  buildNetWorthNegativeAlert,
  buildNoIncomeMonthAlert,
  buildNoMovementsWeekAlert,
  buildObligationDueAlerts,
  buildObligationMilestoneAlerts,
  buildObligationNoPaymentAlerts,
  buildSavingsRateLowAlert,
  buildSubscriptionCostHeavyAlert,
  buildSubscriptionOverdueAlerts,
  buildSubscriptionPriceIncreaseAlerts,
  buildSubscriptionReminderAlerts,
  buildUpcomingAnnualSubscriptionAlerts,
  computeMonthlyMovementAggregates,
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

function toNotificationRow(userId: string, nowIso: string, alert: AlertRow): NotificationRow {
  return { user_id: userId, channel: "in_app", status: "pending", scheduled_for: nowIso, ...alert };
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

  // ── Monthly movement aggregates (builder puro) ───────────────────────────
  const {
    thisMonthExpenses,
    thisMonthIncome,
    lastMonthExpenses,
    lastMonthIncome,
    prevMonthExpenses,
    thisMonthByCategory: thisMonthByCat,
    lastMonthByCategory: lastMonthByCat,
    lastMonthTopCategoryName: lastMonthTopCategory,
  } = computeMonthlyMovementAggregates(
    snapshot.categoryPostedMovements,
    categoryKindMap,
    categoryNameMap,
    now,
  );

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
  pushAlerts(buildHighInterestObligationAlerts(snapshot.obligations));

  // ── 10. Low balance ───────────────────────────────────────────────────────
  pushAlerts(buildLowBalanceAlerts(snapshot.accounts));

  // ── 11. Negative balance ──────────────────────────────────────────────────
  pushAlerts(buildNegativeBalanceAlerts(snapshot.accounts));

  // ── 12. Account dormant ───────────────────────────────────────────────────
  pushAlerts(buildAccountDormantAlerts(snapshot.accounts, now));

  // ── 13. No income this month (after day 15) ───────────────────────────────
  pushAlerts(buildNoIncomeMonthAlert(thisMonthIncome, workspaceId, now));

  // ── 14. High expense month (30%+ vs last month) ───────────────────────────
  pushAlerts(buildHighExpenseMonthAlert({ thisMonthExpenses, lastMonthExpenses }, workspaceId, now));

  // ── 15. Category spending spike (50%+ vs last month) ──────────────────────
  pushAlerts(buildCategorySpendingSpikeAlerts(thisMonthByCat, lastMonthByCat, categoryNameMap));

  // ── 16. Expense/income imbalance ──────────────────────────────────────────
  pushAlerts(buildExpenseIncomeImbalanceAlert({ thisMonthExpenses, thisMonthIncome }, workspaceId, now));

  // ── 17. Net worth negative ────────────────────────────────────────────────
  pushAlerts(buildNetWorthNegativeAlert(snapshot.accounts, workspaceId));

  // ── 18. Savings rate low (after day 20) ──────────────────────────────────
  pushAlerts(buildSavingsRateLowAlert({ thisMonthIncome, thisMonthExpenses }, workspaceId, now));

  // ── 19. Subscriptions cost heavy (> 30% of last month income) ────────────
  pushAlerts(buildSubscriptionCostHeavyAlert(snapshot.subscriptions, lastMonthIncome, workspaceId));

  // ── 20. Upcoming annual subscription (14–30 days away) ───────────────────
  pushAlerts(buildUpcomingAnnualSubscriptionAlerts(snapshot.subscriptions, calendarDaysFromTodayLocal));

  // ── 21. No movements in last 7 days (but had activity in prior 7 days) ────
  pushAlerts(buildNoMovementsWeekAlert(snapshot.categoryPostedMovements, workspaceId, now));

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

  pushAlerts(
    buildDailyBaselineAlerts({
      existingKinds: rows.map((row) => row.kind),
      budgets: snapshot.budgets,
      subscriptions: snapshot.subscriptions,
      obligations: snapshot.obligations,
      accounts: snapshot.accounts,
      movementCount: snapshot.categoryPostedMovements.length,
      todayKey,
      workspaceId,
      thisMonthIncome,
      thisMonthExpenses,
    }),
  );

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
