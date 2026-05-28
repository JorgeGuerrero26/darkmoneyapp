import { pickAccountBadge } from "../../features/accounts/lib/badges";
import type { AccountSummary } from "../../types/domain";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function makeAccount(overrides: Partial<AccountSummary> = {}): AccountSummary {
  return {
    id: 1,
    workspaceId: 1,
    name: "Test",
    type: "bank",
    currencyCode: "PEN",
    openingBalance: 0,
    currentBalance: 100,
    currentBalanceInBaseCurrency: 100,
    includeInNetWorth: true,
    lastActivity: "",
    color: "#4566d6",
    icon: "landmark",
    isArchived: false,
    ...overrides,
  };
}

// ── Priority: archived suppresses everything ────────────────────────────────

function testArchivedReturnsNull() {
  const a = makeAccount({ isArchived: true, currentBalance: -100, type: "loan" });
  assert(pickAccountBadge(a, "PEN") === null, "archived suppresses other badges");
}

// ── Debt: type or negative balance ──────────────────────────────────────────

function testLoanTypeIsDebt() {
  const a = makeAccount({ type: "loan", currentBalance: 0 });
  const badge = pickAccountBadge(a, "PEN");
  assert(badge?.tone === "danger" && badge.label === "Deuda", "loan type → Deuda chip");
}

function testLoanWalletIsDebt() {
  const a = makeAccount({ type: "loan_wallet" });
  const badge = pickAccountBadge(a, "PEN");
  assert(badge?.tone === "danger", "loan_wallet → debt");
}

function testNegativeBalanceIsDebt() {
  const a = makeAccount({ type: "bank", currentBalance: -50 });
  const badge = pickAccountBadge(a, "PEN");
  assert(badge?.tone === "danger" && badge.label === "Deuda", "negative balance → Deuda");
}

// ── Out of net worth: only when not debt ────────────────────────────────────

function testOutOfNetWorth() {
  const a = makeAccount({ includeInNetWorth: false, currentBalance: 100, type: "bank" });
  const badge = pickAccountBadge(a, "PEN");
  assert(
    badge?.tone === "muted" && badge.label === "Fuera de patrimonio",
    "non-debt + !includeInNetWorth → muted badge",
  );
}

function testDebtBeatsOutOfNetWorth() {
  const a = makeAccount({ includeInNetWorth: false, currentBalance: -10 });
  const badge = pickAccountBadge(a, "PEN");
  assert(badge?.tone === "danger", "debt takes priority over out-of-net-worth");
}

// ── Foreign currency: lowest priority ───────────────────────────────────────

function testForeignCurrencyBadge() {
  const a = makeAccount({ currencyCode: "USD" });
  const badge = pickAccountBadge(a, "PEN");
  assert(badge?.tone === "info" && badge.label === "USD", "foreign currency badge shows code");
}

function testForeignCurrencyCaseInsensitive() {
  const a = makeAccount({ currencyCode: "usd" });
  const badge = pickAccountBadge(a, "pen");
  assert(badge?.tone === "info" && badge.label === "USD", "comparison case-insensitive");
}

function testSameCurrencyNoBadge() {
  const a = makeAccount({ currencyCode: "PEN" });
  assert(pickAccountBadge(a, "PEN") === null, "matching currency → no foreign badge");
}

function testNoBaseCurrencyNoBadge() {
  const a = makeAccount({ currencyCode: "USD" });
  assert(pickAccountBadge(a, undefined) === null, "no baseCurrency → no foreign badge");
}

// ── Healthy account → no badge ──────────────────────────────────────────────

function testHealthyAccountNoBadge() {
  const a = makeAccount();
  assert(pickAccountBadge(a, "PEN") === null, "healthy account in base currency → no badge");
}

// ── Runner ──────────────────────────────────────────────────────────────────

const tests: { name: string; fn: () => void }[] = [
  { name: "archived account returns null", fn: testArchivedReturnsNull },
  { name: "loan type is debt", fn: testLoanTypeIsDebt },
  { name: "loan_wallet type is debt", fn: testLoanWalletIsDebt },
  { name: "negative balance is debt", fn: testNegativeBalanceIsDebt },
  { name: "out-of-net-worth badge", fn: testOutOfNetWorth },
  { name: "debt beats out-of-net-worth", fn: testDebtBeatsOutOfNetWorth },
  { name: "foreign currency badge", fn: testForeignCurrencyBadge },
  { name: "foreign currency comparison case-insensitive", fn: testForeignCurrencyCaseInsensitive },
  { name: "same currency yields no badge", fn: testSameCurrencyNoBadge },
  { name: "no baseCurrency provided → no foreign badge", fn: testNoBaseCurrencyNoBadge },
  { name: "healthy account yields no badge", fn: testHealthyAccountNoBadge },
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

console.log(`\nbadges: ${tests.length - failed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} test(s) failed`);
