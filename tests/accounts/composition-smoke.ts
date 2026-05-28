import { computeComposition } from "../../features/accounts/lib/composition";
import { buildRateMap } from "../../lib/exchange-rate-map";
import type { AccountSummary } from "../../types/domain";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function approx(a: number, b: number, eps = 1e-6): boolean {
  return Math.abs(a - b) < eps;
}

function acc(overrides: Partial<AccountSummary>): AccountSummary {
  return {
    id: 0,
    workspaceId: 1,
    name: "",
    type: "bank",
    currencyCode: "PEN",
    openingBalance: 0,
    currentBalance: 0,
    currentBalanceInBaseCurrency: 0,
    includeInNetWorth: true,
    lastActivity: "",
    color: "#000",
    icon: "landmark",
    isArchived: false,
    ...overrides,
  };
}

// ── Bucketing ───────────────────────────────────────────────────────────────

function testGroupsByType() {
  const c = computeComposition({
    accounts: [
      acc({ id: 1, type: "bank", currentBalanceInBaseCurrency: 1000 }),
      acc({ id: 2, type: "bank", currentBalanceInBaseCurrency: 500 }),
      acc({ id: 3, type: "cash", currentBalanceInBaseCurrency: 200 }),
    ],
    baseCurrency: "PEN",
    displayCurrency: "PEN",
    exchangeRateMap: buildRateMap([]),
  });
  // 2 banks → 1500, 1 cash → 200. Sorted desc.
  assert(c.assets.length === 2, "2 asset buckets");
  assert(c.assets[0].type === "bank" && c.assets[0].value === 1500, "biggest first");
  assert(c.assets[1].type === "cash" && c.assets[1].value === 200, "cash second");
}

// ── Debts ───────────────────────────────────────────────────────────────────

function testLoanTypeIsDebtEvenWithPositiveBalance() {
  const c = computeComposition({
    accounts: [
      acc({ id: 1, type: "loan", currentBalanceInBaseCurrency: 0 }),
      acc({ id: 2, type: "loan", currentBalanceInBaseCurrency: 200 }),
    ],
    baseCurrency: "PEN",
    displayCurrency: "PEN",
    exchangeRateMap: buildRateMap([]),
  });
  // Both loans → debts only.
  assert(c.assets.length === 0, "no asset slices when only loans");
  assert(c.debts === 200, "loan with +200 still counted as debt (abs)");
}

function testNegativeBalanceCountsAsDebt() {
  const c = computeComposition({
    accounts: [acc({ id: 1, type: "bank", currentBalanceInBaseCurrency: -300 })],
    baseCurrency: "PEN",
    displayCurrency: "PEN",
    exchangeRateMap: buildRateMap([]),
  });
  assert(c.assets.length === 0, "negative bank is not asset");
  assert(c.debts === 300, "abs value as debt");
}

function testAssetsAndDebtsCoexist() {
  const c = computeComposition({
    accounts: [
      acc({ id: 1, type: "bank", currentBalanceInBaseCurrency: 1000 }),
      acc({ id: 2, type: "loan", currentBalanceInBaseCurrency: 500 }),
    ],
    baseCurrency: "PEN",
    displayCurrency: "PEN",
    exchangeRateMap: buildRateMap([]),
  });
  assert(c.totalAssets === 1000, "assets total 1000");
  assert(c.debts === 500, "debts 500");
  assert(c.netWorth === 500, "net worth 500");
}

// ── Percentages ─────────────────────────────────────────────────────────────

function testPercentagesAddUpTo100() {
  const c = computeComposition({
    accounts: [
      acc({ id: 1, type: "bank", currentBalanceInBaseCurrency: 700 }),
      acc({ id: 2, type: "cash", currentBalanceInBaseCurrency: 300 }),
    ],
    baseCurrency: "PEN",
    displayCurrency: "PEN",
    exchangeRateMap: buildRateMap([]),
  });
  assert(approx(c.assets[0].pct, 70), "70%");
  assert(approx(c.assets[1].pct, 30), "30%");
  assert(approx(c.assets[0].pct + c.assets[1].pct, 100), "sums to 100");
}

function testPercentagesZeroWhenNoAssets() {
  const c = computeComposition({
    accounts: [acc({ id: 1, type: "loan", currentBalanceInBaseCurrency: 500 })],
    baseCurrency: "PEN",
    displayCurrency: "PEN",
    exchangeRateMap: buildRateMap([]),
  });
  // No assets at all — divide by zero would explode. We return 0% safely.
  assert(c.assets.length === 0, "no asset slices");
  assert(c.totalAssets === 0, "totalAssets 0");
}

// ── Exclusions ──────────────────────────────────────────────────────────────

function testExcludesArchived() {
  const c = computeComposition({
    accounts: [
      acc({ id: 1, type: "bank", currentBalanceInBaseCurrency: 1000 }),
      acc({ id: 2, type: "bank", currentBalanceInBaseCurrency: 999, isArchived: true }),
    ],
    baseCurrency: "PEN",
    displayCurrency: "PEN",
    exchangeRateMap: buildRateMap([]),
  });
  assert(c.totalAssets === 1000, "archived excluded");
}

function testExcludesNotInNetWorth() {
  const c = computeComposition({
    accounts: [
      acc({ id: 1, type: "bank", currentBalanceInBaseCurrency: 1000 }),
      acc({ id: 2, type: "bank", currentBalanceInBaseCurrency: 999, includeInNetWorth: false }),
    ],
    baseCurrency: "PEN",
    displayCurrency: "PEN",
    exchangeRateMap: buildRateMap([]),
  });
  assert(c.totalAssets === 1000, "!includeInNetWorth excluded");
}

// ── Currency conversion ─────────────────────────────────────────────────────

function testConvertsToDisplayCurrency() {
  // Base PEN, display USD, rate USD→PEN = 4 (i.e. 1 PEN = 0.25 USD).
  const c = computeComposition({
    accounts: [acc({ id: 1, type: "bank", currentBalanceInBaseCurrency: 4000 })],
    baseCurrency: "PEN",
    displayCurrency: "USD",
    exchangeRateMap: buildRateMap([{ fromCurrencyCode: "USD", toCurrencyCode: "PEN", rate: 4 }]),
  });
  // 4000 PEN * 0.25 = 1000 USD
  assert(approx(c.assets[0].value, 1000), `expected 1000 USD, got ${c.assets[0].value}`);
  assert(approx(c.totalAssets, 1000), "totalAssets 1000 USD");
}

// ── Runner ──────────────────────────────────────────────────────────────────

const tests: { name: string; fn: () => void }[] = [
  { name: "groups accounts by type and sorts desc", fn: testGroupsByType },
  { name: "loan type always counted as debt", fn: testLoanTypeIsDebtEvenWithPositiveBalance },
  { name: "negative balance counted as debt", fn: testNegativeBalanceCountsAsDebt },
  { name: "assets and debts coexist", fn: testAssetsAndDebtsCoexist },
  { name: "percentages add up to 100", fn: testPercentagesAddUpTo100 },
  { name: "percentages safe when no assets", fn: testPercentagesZeroWhenNoAssets },
  { name: "archived accounts excluded", fn: testExcludesArchived },
  { name: "!includeInNetWorth excluded", fn: testExcludesNotInNetWorth },
  { name: "converts amounts to display currency", fn: testConvertsToDisplayCurrency },
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
console.log(`\ncomposition: ${tests.length - failed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} test(s) failed`);
