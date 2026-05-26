import { format } from "date-fns";

import type { DashboardMovementRow } from "../lib/dashboard-row";
import { isExpense, isIncome, isTransfer } from "../lib/aggregations";

/**
 * Pre-indexed movements: one pass over the array builds Maps keyed by
 * day (YYYY-MM-DD) and month (YYYY-MM), plus flags so consumers don't
 * have to re-filter the array on every stat calculation.
 *
 * Trade-off: ~O(n) at build time vs O(n) per period bucket on the fly.
 * For the dashboard which computes 7 daily buckets + 6 monthly buckets +
 * current/previous period totals + category breakdowns, the index pays
 * off after ~3 reads.
 */
export type IndexedMovement = {
  movement: DashboardMovementRow;
  occurredAt: Date;
  dateKey: string;
  monthKey: string;
  isIncome: boolean;
  isExpense: boolean;
  isTransfer: boolean;
};

export type MovementsIndex = {
  all: IndexedMovement[];
  byDate: Map<string, IndexedMovement[]>;
  byMonth: Map<string, IndexedMovement[]>;
};

export function buildMovementsIndex(movements: DashboardMovementRow[]): MovementsIndex {
  const all: IndexedMovement[] = new Array(movements.length);
  const byDate = new Map<string, IndexedMovement[]>();
  const byMonth = new Map<string, IndexedMovement[]>();

  for (let i = 0; i < movements.length; i++) {
    const movement = movements[i];
    const occurredAt = new Date(movement.occurredAt);
    const dateKey = format(occurredAt, "yyyy-MM-dd");
    const monthKey = format(occurredAt, "yyyy-MM");
    const indexed: IndexedMovement = {
      movement,
      occurredAt,
      dateKey,
      monthKey,
      isIncome: isIncome(movement),
      isExpense: isExpense(movement),
      isTransfer: isTransfer(movement),
    };
    all[i] = indexed;
    let dayBucket = byDate.get(dateKey);
    if (!dayBucket) {
      dayBucket = [];
      byDate.set(dateKey, dayBucket);
    }
    dayBucket.push(indexed);
    let monthBucket = byMonth.get(monthKey);
    if (!monthBucket) {
      monthBucket = [];
      byMonth.set(monthKey, monthBucket);
    }
    monthBucket.push(indexed);
  }

  return { all, byDate, byMonth };
}

/**
 * Iterate indexed movements whose occurredAt falls within [start, end] (inclusive).
 * If the range is shorter than ~60 days we visit byDate buckets; otherwise we
 * fall back to a single scan over `all`.
 */
export function forEachInRange(
  index: MovementsIndex,
  start: Date,
  end: Date,
  visit: (indexed: IndexedMovement) => void,
): void {
  const startMs = start.getTime();
  const endMs = end.getTime();
  const spanDays = Math.ceil((endMs - startMs) / (24 * 60 * 60 * 1000));
  if (spanDays > 60) {
    for (const indexed of index.all) {
      const t = indexed.occurredAt.getTime();
      if (t >= startMs && t <= endMs) visit(indexed);
    }
    return;
  }
  const cursor = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  while (cursor.getTime() <= endMs) {
    const dateKey = format(cursor, "yyyy-MM-dd");
    const bucket = index.byDate.get(dateKey);
    if (bucket) {
      for (const indexed of bucket) {
        const t = indexed.occurredAt.getTime();
        if (t >= startMs && t <= endMs) visit(indexed);
      }
    }
    cursor.setDate(cursor.getDate() + 1);
  }
}
