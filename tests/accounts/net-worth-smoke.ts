import { computeNetWorth } from "../../features/accounts/lib/net-worth";
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

// ── Basic identity (display == base) ─────────────────────────────────────────

function testIdentityCurrency() {
  const accounts: AccountSummary[] = [
    acc({ id: 1, currentBalance: 1000, currentBalanceInBaseCurrency: 1000 }),
    acc({ id: 2, currentBalance: 500, currentBalanceInBaseCurrency: 500 }),
  ];
  const total = computeNetWorth({
    accounts,
    baseCurrency: "PEN",
    displayCurrency: "PEN",
    exchangeRateMap: buildRateMap([]),
  });
  assert(total === 1500, `expected 1500, got ${total}`);
}

// ── Exclusions ───────────────────────────────────────────────────────────────

function testExcludesArchived() {
  const accounts: AccountSummary[] = [
    acc({ id: 1, currentBalanceInBaseCurrency: 1000 }),
    acc({ id: 2, currentBalanceInBaseCurrency: 999, isArchived: true }),
  ];
  const total = computeNetWorth({
    accounts,
    baseCurrency: "PEN",
    displayCurrency: "PEN",
    exchangeRateMap: buildRateMap([]),
  });
  assert(total === 1000, `archived excluded, got ${total}`);
}

function testExcludesNotInNetWorth() {
  const accounts: AccountSummary[] = [
    acc({ id: 1, currentBalanceInBaseCurrency: 1000 }),
    acc({ id: 2, currentBalanceInBaseCurrency: 999, includeInNetWorth: false }),
  ];
  const total = computeNetWorth({
    accounts,
    baseCurrency: "PEN",
    displayCurrency: "PEN",
    exchangeRateMap: buildRateMap([]),
  });
  assert(total === 1000, `not-in-net-worth excluded, got ${total}`);
}

// ── Currency conversion ──────────────────────────────────────────────────────

function testBaseToDisplayConversion() {
  // Workspace base = PEN, but we want to see in USD. Rate USD→PEN = 3.7,
  // so 1 PEN = 1/3.7 USD ≈ 0.27027.
  const accounts: AccountSummary[] = [
    acc({ id: 1, currentBalance: 3700, currentBalanceInBaseCurrency: 3700 }),
  ];
  const total = computeNetWorth({
    accounts,
    baseCurrency: "PEN",
    displayCurrency: "USD",
    exchangeRateMap: buildRateMap([
      { fromCurrencyCode: "USD", toCurrencyCode: "PEN", rate: 3.7 },
    ]),
  });
  // 3700 PEN * (1/3.7) = 1000 USD
  assert(approx(total, 1000), `expected ~1000 USD, got ${total}`);
}

function testForeignAccountAlreadyInBase() {
  // Account is in USD, but `currentBalanceInBaseCurrency` already holds the
  // base-currency equivalent. Display currency matches base — no extra conversion.
  const accounts: AccountSummary[] = [
    acc({
      id: 1,
      currencyCode: "USD",
      currentBalance: 100, // native
      currentBalanceInBaseCurrency: 370, // already in PEN
    }),
  ];
  const total = computeNetWorth({
    accounts,
    baseCurrency: "PEN",
    displayCurrency: "PEN",
    exchangeRateMap: buildRateMap([]),
  });
  assert(total === 370, `should be 370 PEN, got ${total}`);
}

function testMissingBaseFallsBackToCurrent() {
  // If `currentBalanceInBaseCurrency` is missing, the function uses
  // `currentBalance` as if it were already in base.
  const accounts: AccountSummary[] = [
    acc({ id: 1, currentBalance: 250, currentBalanceInBaseCurrency: null }),
  ];
  const total = computeNetWorth({
    accounts,
    baseCurrency: "PEN",
    displayCurrency: "PEN",
    exchangeRateMap: buildRateMap([]),
  });
  assert(total === 250, `fallback to currentBalance, got ${total}`);
}

// ── Edge cases ───────────────────────────────────────────────────────────────

function testEmptyAccountsIsZero() {
  const total = computeNetWorth({
    accounts: [],
    baseCurrency: "PEN",
    displayCurrency: "USD",
    exchangeRateMap: buildRateMap([]),
  });
  assert(total === 0, "empty array → 0");
}

function testNegativeContribution() {
  // A debt account (loan) included in net worth pulls it down.
  const accounts: AccountSummary[] = [
    acc({ id: 1, currentBalanceInBaseCurrency: 1000 }),
    acc({ id: 2, type: "loan", currentBalance: -300, currentBalanceInBaseCurrency: -300 }),
  ];
  const total = computeNetWorth({
    accounts,
    baseCurrency: "PEN",
    displayCurrency: "PEN",
    exchangeRateMap: buildRateMap([]),
  });
  assert(total === 700, `1000 + (-300) = 700, got ${total}`);
}

// ── Runner ───────────────────────────────────────────────────────────────────

const tests: { name: string; fn: () => void }[] = [
  { name: "identity (display == base)", fn: testIdentityCurrency },
  { name: "archived accounts excluded", fn: testExcludesArchived },
  { name: "!includeInNetWorth excluded", fn: testExcludesNotInNetWorth },
  { name: "base → display conversion using inverse rate", fn: testBaseToDisplayConversion },
  { name: "foreign account counted via base value", fn: testForeignAccountAlreadyInBase },
  { name: "missing currentBalanceInBaseCurrency falls back to currentBalance", fn: testMissingBaseFallsBackToCurrent },
  { name: "empty array yields 0", fn: testEmptyAccountsIsZero },
  { name: "loan with negative balance pulls total down", fn: testNegativeContribution },
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

console.log(`\nnet-worth: ${tests.length - failed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} test(s) failed`);
