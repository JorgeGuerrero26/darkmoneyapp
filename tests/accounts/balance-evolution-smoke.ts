import {
  computeBalanceEvolution,
  downsample,
  summarizeTrend,
  type BalancePoint,
} from "../../features/accounts/lib/balance-evolution";
import type { MovementRecord } from "../../types/domain";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function approx(a: number, b: number, eps = 1e-6): boolean {
  return Math.abs(a - b) < eps;
}

const NOW = new Date("2026-05-28T12:00:00Z").getTime();
const DAY = 24 * 60 * 60 * 1000;

function mov(overrides: Partial<MovementRecord>): MovementRecord {
  return {
    id: 0,
    workspaceId: 1,
    movementType: "expense",
    status: "posted",
    description: "",
    category: "",
    counterparty: "",
    occurredAt: new Date(NOW - DAY).toISOString(),
    sourceAccountId: 1,
    sourceAccountName: null,
    sourceAmount: null,
    destinationAccountId: null,
    destinationAccountName: null,
    destinationAmount: null,
    ...overrides,
  };
}

// ── computeBalanceEvolution ────────────────────────────────────────────────

function testNoMovementsEmitsFlatLine() {
  const points = computeBalanceEvolution({
    accountId: 1,
    currentBalance: 1000,
    movements: [],
    windowDays: 30,
    now: NOW,
  });
  assert(points.length === 2, "flat line emits 2 points");
  assert(points[0].value === 1000 && points[1].value === 1000, "values are both currentBalance");
  assert(points[0].t < points[1].t, "first is older than second");
  assert(points[1].t === NOW, "last point is now");
}

function testExpenseDecreasesBalance() {
  // Today balance 800; yesterday spent 200 → before yesterday: 1000.
  const points = computeBalanceEvolution({
    accountId: 1,
    currentBalance: 800,
    movements: [
      mov({
        movementType: "expense",
        sourceAccountId: 1,
        sourceAmount: 200,
        occurredAt: new Date(NOW - DAY).toISOString(),
      }),
    ],
    windowDays: 30,
    now: NOW,
  });
  // Expect 2 points: pre-expense (1000) and today (800).
  assert(points.length === 2, "expects 2 points");
  assert(points[0].value === 1000, "pre-expense was 1000");
  assert(points[1].value === 800, "current is 800");
}

function testIncomeIncreasesBalance() {
  // Today balance 1500; yesterday received 500 → before: 1000.
  const points = computeBalanceEvolution({
    accountId: 1,
    currentBalance: 1500,
    movements: [
      mov({
        movementType: "income",
        sourceAccountId: null,
        destinationAccountId: 1,
        destinationAmount: 500,
        occurredAt: new Date(NOW - DAY).toISOString(),
      }),
    ],
    windowDays: 30,
    now: NOW,
  });
  assert(points.length === 2, "2 points");
  assert(points[0].value === 1000, "before income was 1000");
  assert(points[1].value === 1500, "current is 1500");
}

function testTransferOutSubtracts() {
  const points = computeBalanceEvolution({
    accountId: 1,
    currentBalance: 700,
    movements: [
      mov({
        movementType: "transfer",
        sourceAccountId: 1,
        sourceAmount: 300,
        destinationAccountId: 2,
        destinationAmount: 300,
        occurredAt: new Date(NOW - DAY).toISOString(),
      }),
    ],
    windowDays: 30,
    now: NOW,
  });
  assert(points[0].value === 1000, "before transfer was 1000");
  assert(points[1].value === 700, "current 700");
}

function testTransferInAdds() {
  const points = computeBalanceEvolution({
    accountId: 2,
    currentBalance: 1300,
    movements: [
      mov({
        movementType: "transfer",
        sourceAccountId: 1,
        sourceAmount: 300,
        destinationAccountId: 2,
        destinationAmount: 300,
        occurredAt: new Date(NOW - DAY).toISOString(),
      }),
    ],
    windowDays: 30,
    now: NOW,
  });
  assert(points[0].value === 1000, "before transfer destination was 1000");
  assert(points[1].value === 1300, "current 1300");
}

function testIgnoresPendingMovements() {
  const points = computeBalanceEvolution({
    accountId: 1,
    currentBalance: 1000,
    movements: [
      mov({
        movementType: "expense",
        status: "pending",
        sourceAccountId: 1,
        sourceAmount: 999,
        occurredAt: new Date(NOW - DAY).toISOString(),
      }),
    ],
    windowDays: 30,
    now: NOW,
  });
  // Pending should not move the curve.
  assert(points.length === 2, "flat line");
  assert(points[0].value === 1000 && points[1].value === 1000, "no delta from pending");
}

function testIgnoresMovementsOutsideWindow() {
  const points = computeBalanceEvolution({
    accountId: 1,
    currentBalance: 500,
    movements: [
      mov({
        movementType: "expense",
        sourceAccountId: 1,
        sourceAmount: 500,
        occurredAt: new Date(NOW - 200 * DAY).toISOString(), // 200d ago
      }),
    ],
    windowDays: 30,
    now: NOW,
  });
  // Movement is outside window → curve is flat.
  assert(points.length === 2, "flat line");
  assert(points[0].value === 500 && points[1].value === 500, "no in-window deltas");
}

function testMultipleMovementsChronologicalOrdering() {
  // Today: 600. -100 (3d ago expense), +200 (5d ago income), -100 (7d ago expense)
  // Walk back: 600 → 700 (undo -100) → 500 (undo +200) → 600 (undo -100).
  const points = computeBalanceEvolution({
    accountId: 1,
    currentBalance: 600,
    movements: [
      mov({
        movementType: "expense",
        sourceAccountId: 1,
        sourceAmount: 100,
        occurredAt: new Date(NOW - 3 * DAY).toISOString(),
      }),
      mov({
        movementType: "income",
        sourceAccountId: null,
        destinationAccountId: 1,
        destinationAmount: 200,
        occurredAt: new Date(NOW - 5 * DAY).toISOString(),
      }),
      mov({
        movementType: "expense",
        sourceAccountId: 1,
        sourceAmount: 100,
        occurredAt: new Date(NOW - 7 * DAY).toISOString(),
      }),
    ],
    windowDays: 30,
    now: NOW,
  });
  // 4 points: 3 movements + today.
  assert(points.length === 4, `expected 4 points, got ${points.length}`);
  // Oldest first.
  assert(points[0].t < points[1].t && points[1].t < points[2].t, "chronological order");
  // Values (oldest → newest): 600, 500, 700, 600
  assert(points[0].value === 600, "oldest pre-expense was 600");
  assert(points[1].value === 500, "after 7d-ago expense: 500");
  assert(points[2].value === 700, "after 5d-ago income: 700");
  assert(points[3].value === 600, "today: 600");
}

// ── downsample ──────────────────────────────────────────────────────────────

function testDownsampleNoOpIfUnderLimit() {
  const points: BalancePoint[] = [
    { t: 1, value: 10 },
    { t: 2, value: 20 },
  ];
  const out = downsample(points, 10);
  assert(out.length === 2, "no change when under limit");
}

function testDownsamplePreservesEndpoints() {
  const points: BalancePoint[] = Array.from({ length: 100 }, (_, i) => ({
    t: i,
    value: i,
  }));
  const out = downsample(points, 10);
  assert(out.length === 10, "exactly 10 points");
  assert(out[0].value === 0, "first preserved");
  assert(out[out.length - 1].value === 99, "last preserved");
}

// ── summarizeTrend ──────────────────────────────────────────────────────────

function testTrendUp() {
  const t = summarizeTrend([
    { t: 0, value: 1000 },
    { t: 1, value: 1200 },
  ]);
  assert(t.direction === "up", "up direction");
  assert(t.delta === 200, "delta 200");
  assert(t.pct !== null && approx(t.pct, 20), "20%");
}

function testTrendDown() {
  const t = summarizeTrend([
    { t: 0, value: 1000 },
    { t: 1, value: 800 },
  ]);
  assert(t.direction === "down", "down direction");
  assert(t.delta === -200, "delta -200");
  assert(t.pct !== null && approx(t.pct, -20), "-20%");
}

function testTrendFlatWithinThreshold() {
  // 0.3% change → flat.
  const t = summarizeTrend([
    { t: 0, value: 1000 },
    { t: 1, value: 1003 },
  ]);
  assert(t.direction === "flat", "0.3% change is flat");
}

function testTrendPctNullWhenStartZero() {
  const t = summarizeTrend([
    { t: 0, value: 0 },
    { t: 1, value: 500 },
  ]);
  assert(t.pct === null, "pct null when start is 0");
  assert(t.direction === "up", "still up");
}

// ── Runner ──────────────────────────────────────────────────────────────────

const tests: { name: string; fn: () => void }[] = [
  { name: "no movements → flat line with 2 points", fn: testNoMovementsEmitsFlatLine },
  { name: "expense decreases balance going back", fn: testExpenseDecreasesBalance },
  { name: "income increases balance going back", fn: testIncomeIncreasesBalance },
  { name: "transfer out subtracts from source", fn: testTransferOutSubtracts },
  { name: "transfer in adds to destination", fn: testTransferInAdds },
  { name: "pending movements ignored", fn: testIgnoresPendingMovements },
  { name: "movements outside window ignored", fn: testIgnoresMovementsOutsideWindow },
  { name: "multiple movements emit chronological points", fn: testMultipleMovementsChronologicalOrdering },
  { name: "downsample no-op when under limit", fn: testDownsampleNoOpIfUnderLimit },
  { name: "downsample preserves endpoints", fn: testDownsamplePreservesEndpoints },
  { name: "trend up", fn: testTrendUp },
  { name: "trend down", fn: testTrendDown },
  { name: "trend flat within threshold", fn: testTrendFlatWithinThreshold },
  { name: "trend pct null when start is 0", fn: testTrendPctNullWhenStartZero },
];

let failed = 0;
for (const t of tests) {
  try {
    t.fn();
    console.log(`  ✓ ${t.name}`);
  } catch (err) {
    failed += 1;
    console.error(`  ✗ ${t.name}: ${(err as Error).message}`);
  }
}
console.log(`\nbalance-evolution: ${tests.length - failed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} test(s) failed`);
