import type { MovementRecord } from "../../../types/domain";

/**
 * A point on the balance-evolution curve. `t` is a Unix-ms timestamp; `value`
 * is the account balance *right after* the movement at that timestamp (or
 * `currentBalance` for the "today" point).
 */
export type BalancePoint = {
  t: number;
  value: number;
};

export type EvolutionInput = {
  accountId: number;
  /** Today's balance for the account (already settled, in native currency). */
  currentBalance: number;
  /** Movements for the account, in any order. Filtered/sorted internally. */
  movements: readonly MovementRecord[];
  /**
   * How far back to reconstruct. Default 90 days. Movements older than this
   * are ignored — the curve simply starts at the oldest *visible* point.
   */
  windowDays?: number;
  /**
   * Now-equivalent timestamp. Pass it explicitly so tests are deterministic;
   * production callers can omit (defaults to `Date.now()`).
   */
  now?: number;
};

/**
 * Compute the impact a movement has on `accountId`. Positive when money came
 * IN, negative when money went OUT. Returns 0 for non-posted movements or
 * movements that don't touch the account.
 */
function deltaForAccount(m: MovementRecord, accountId: number): number {
  if (m.status !== "posted") return 0;

  // Source account loses money — subtract sourceAmount when it represents an outflow.
  if (m.sourceAccountId === accountId && m.sourceAmount != null) {
    if (m.movementType === "expense" || m.movementType === "subscription_payment") {
      return -m.sourceAmount;
    }
    if (m.movementType === "transfer") {
      return -m.sourceAmount;
    }
    if (m.movementType === "obligation_payment") {
      // Obligation payments leaving the account
      return -m.sourceAmount;
    }
  }

  // Destination account gains money.
  if (m.destinationAccountId === accountId && m.destinationAmount != null) {
    if (m.movementType === "income" || m.movementType === "refund") {
      return m.destinationAmount;
    }
    if (m.movementType === "transfer") {
      return m.destinationAmount;
    }
    if (m.movementType === "obligation_payment") {
      return m.destinationAmount;
    }
  }

  return 0;
}

/**
 * Reconstruct the balance over time for an account.
 *
 * Strategy: starting from `currentBalance` today, walk movements newest →
 * oldest, undoing each posted delta to recover the historical balance at the
 * moment *just before* that movement.
 *
 * Returns points oldest → newest, suitable for feeding a sparkline path.
 * Always emits at least 2 points (the start equals the end when there are no
 * movements in the window) so consumers can draw a flat line.
 */
export function computeBalanceEvolution(input: EvolutionInput): BalancePoint[] {
  const now = input.now ?? Date.now();
  const windowMs = (input.windowDays ?? 90) * 24 * 60 * 60 * 1000;
  const cutoff = now - windowMs;

  // Only postings that touch this account, in time window, sorted newest first.
  const relevant = input.movements
    .filter((m) => m.status === "posted")
    .filter((m) => m.sourceAccountId === input.accountId || m.destinationAccountId === input.accountId)
    .map((m) => ({
      t: new Date(m.occurredAt).getTime(),
      delta: deltaForAccount(m, input.accountId),
    }))
    .filter((p) => Number.isFinite(p.t) && p.t <= now && p.t >= cutoff)
    .sort((a, b) => b.t - a.t);

  // Walk backwards. After each "undo", the balance value belongs to the moment
  // BEFORE that movement (i.e. the previous timestamp on the curve).
  const points: BalancePoint[] = [{ t: now, value: input.currentBalance }];
  let running = input.currentBalance;
  for (const step of relevant) {
    running -= step.delta;
    points.push({ t: step.t, value: running });
  }

  // Return oldest → newest, so the index 0 is the earliest sample.
  points.reverse();

  // Always emit at least 2 points to keep callers' SVG math simple.
  if (points.length === 1) {
    points.unshift({ t: points[0].t - windowMs, value: points[0].value });
  }
  return points;
}

/**
 * Down-sample evolution points to at most `maxPoints` by bucketing. Preserves
 * the first and last samples to keep the visual endpoints accurate.
 *
 * If the input already has <= maxPoints, it's returned as-is.
 */
export function downsample(points: readonly BalancePoint[], maxPoints: number): BalancePoint[] {
  if (points.length <= maxPoints) return points.slice();
  if (maxPoints < 2) return [points[0], points[points.length - 1]];

  const bucketSize = points.length / maxPoints;
  const out: BalancePoint[] = [];
  for (let i = 0; i < maxPoints; i++) {
    const idx = Math.min(points.length - 1, Math.floor(i * bucketSize));
    out.push(points[idx]);
  }
  // Always end on the most recent sample.
  out[out.length - 1] = points[points.length - 1];
  return out;
}

/**
 * Trend summary used for badges / arrows in the UI.
 *  - delta: absolute change over the window
 *  - pct:   percent change, or null if start was 0 (avoid divide-by-zero)
 *  - direction: "up" | "down" | "flat" (threshold 0.5% of |start|)
 */
export type TrendSummary = {
  delta: number;
  pct: number | null;
  direction: "up" | "down" | "flat";
};

export function summarizeTrend(points: readonly BalancePoint[]): TrendSummary {
  if (points.length < 2) return { delta: 0, pct: null, direction: "flat" };
  const start = points[0].value;
  const end = points[points.length - 1].value;
  const delta = end - start;
  const pct = start === 0 ? null : (delta / Math.abs(start)) * 100;
  const flatThreshold = Math.max(0.01, Math.abs(start) * 0.005);
  let direction: TrendSummary["direction"] = "flat";
  if (delta > flatThreshold) direction = "up";
  else if (delta < -flatThreshold) direction = "down";
  return { delta, pct, direction };
}
