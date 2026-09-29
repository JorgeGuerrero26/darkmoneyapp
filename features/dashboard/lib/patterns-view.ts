import { getDay, startOfDay, subDays } from "date-fns";

import { movementDisplayAccountId } from "../../../lib/movement-display";
import { normalizeAnalyticsText } from "../../../services/analytics/movement-features";
import type { PatternCluster } from "../../../services/analytics/pattern-clustering";
import type { DashboardMovementRow } from "./dashboard-row";

export type PatternCategoryRow = { id: number | null; name: string; amount: number; share: number };

export function expenseTitle(description: string, accountName?: string | null) {
  const title = description.trim();
  return !title || (accountName != null && normalizeAnalyticsText(title) === normalizeAnalyticsText(accountName))
    ? "Gasto sin descripción"
    : title;
}

export function categorySpendRows(
  totals: ReadonlyMap<number | null, number>,
  names: ReadonlyMap<number, string>,
) {
  const rows = Array.from(totals, ([id, amount]) => ({
    id,
    name: id == null ? "Sin categoría" : names.get(id) ?? "Categoría",
    amount,
  })).filter((row) => row.amount > 0).sort((a, b) => b.amount - a.amount);
  const total = rows.reduce((sum, row) => sum + row.amount, 0);
  return {
    total,
    visible: rows.slice(0, 5).map((row) => ({ ...row, share: total > 0 ? row.amount / total : 0 })),
    rest: rows.slice(5).map((row) => ({ ...row, share: total > 0 ? row.amount / total : 0 })),
  };
}

export function habitPresentation(
  pattern: PatternCluster,
  movementsById: ReadonlyMap<number, DashboardMovementRow>,
  accountNames: ReadonlyMap<number, string>,
) {
  const counts = new Map<string, number>();
  for (const id of pattern.movementIds) {
    const movement = movementsById.get(id);
    if (!movement) continue;
    const accountId = movementDisplayAccountId(movement);
    const accountName = accountId == null ? null : accountNames.get(accountId);
    if (accountName) counts.set(accountName, (counts.get(accountName) ?? 0) + 1);
  }
  const accountName = [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  const label = pattern.label.replace(/: movimientos parecidos$/i, "").trim();
  const missingDescription = !label || (accountName != null && normalizeAnalyticsText(label) === normalizeAnalyticsText(accountName));
  return {
    title: missingDescription ? `${pattern.type} sin descripción` : label,
    accountName: missingDescription ? accountName : null,
  };
}

export type WeeklySpendDay = {
  index: number;
  total: number;
  average: number;
  count: number;
  movements: DashboardMovementRow[];
};

/** Mean spend for each weekday in a fixed 90-day window, including days with no expense. */
export function weeklySpendPattern(
  movements: readonly DashboardMovementRow[],
  getExpense: (movement: DashboardMovementRow) => number,
  now = new Date(),
  days = 90,
) {
  const firstDay = startOfDay(subDays(now, days - 1));
  const lastDay = startOfDay(now);
  const weekdays = Array.from({ length: 7 }, (_, index): WeeklySpendDay => ({ index, total: 0, average: 0, count: 0, movements: [] }));
  const occurrences = Array(7).fill(0) as number[];
  for (let offset = 0; offset < days; offset += 1) {
    const date = subDays(lastDay, offset);
    const jsDay = getDay(date);
    occurrences[jsDay === 0 ? 6 : jsDay - 1] += 1;
  }
  for (const movement of movements) {
    if (movement.status !== "posted") continue;
    const date = new Date(movement.occurredAt);
    if (date < firstDay || date > now) continue;
    const amount = getExpense(movement);
    if (amount <= 0) continue;
    const jsDay = getDay(date);
    const day = weekdays[jsDay === 0 ? 6 : jsDay - 1];
    day.total += amount;
    day.count += 1;
    day.movements.push(movement);
  }
  for (const day of weekdays) day.average = day.total / Math.max(occurrences[day.index], 1);
  const top = weekdays.reduce((best, day) => day.average > best.average ? day : best, weekdays[0]);
  return { days: weekdays, top, hasExpenses: weekdays.some((day) => day.count > 0) };
}

export type WeeklySpendPattern = ReturnType<typeof weeklySpendPattern>;
