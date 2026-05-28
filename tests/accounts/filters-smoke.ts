import { applyAccountFilter, type AccountTypeFilter } from "../../features/accounts/lib/filters";
import type { AccountSummary } from "../../types/domain";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
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

const fixture: AccountSummary[] = [
  acc({ id: 1, name: "BCP Soles", type: "bank", currencyCode: "PEN" }),
  acc({ id: 2, name: "Interbank USD", type: "bank", currencyCode: "USD" }),
  acc({ id: 3, name: "Visa Platinum", type: "credit_card", currencyCode: "PEN" }),
  acc({ id: 4, name: "Préstamo carro", type: "loan", currencyCode: "PEN", currentBalance: -5000 }),
  acc({ id: 5, name: "Wallet vieja", type: "cash", currencyCode: "PEN", isArchived: true }),
];

// ── showArchived ─────────────────────────────────────────────────────────────

function testHidesArchivedByDefault() {
  const out = applyAccountFilter(fixture, { searchText: "", typeFilters: [], showArchived: false });
  assert(out.length === 4, "4 visible (archived excluded)");
  assert(out.every((a) => !a.isArchived), "no archived in output");
}

function testShowsArchivedWhenRequested() {
  const out = applyAccountFilter(fixture, { searchText: "", typeFilters: [], showArchived: true });
  assert(out.length === 5, "5 accounts when showArchived=true");
}

// ── typeFilters ──────────────────────────────────────────────────────────────

function testEmptyTypeFiltersMatchesAll() {
  const out = applyAccountFilter(fixture, { searchText: "", typeFilters: [], showArchived: true });
  assert(out.length === 5, "empty type filters = all");
}

function testSingleTypeFilter() {
  const out = applyAccountFilter(fixture, {
    searchText: "",
    typeFilters: ["bank"],
    showArchived: false,
  });
  assert(out.length === 2, "2 banks visible");
  assert(out.every((a) => a.type === "bank"), "all are bank");
}

function testMultipleTypeFilters() {
  const filters: AccountTypeFilter[] = ["bank", "loan"];
  const out = applyAccountFilter(fixture, {
    searchText: "",
    typeFilters: filters,
    showArchived: false,
  });
  assert(out.length === 3, "2 banks + 1 loan = 3");
  assert(out.every((a) => a.type === "bank" || a.type === "loan"), "only bank/loan");
}

// ── searchText ───────────────────────────────────────────────────────────────

function testSearchByName_caseInsensitive() {
  const out = applyAccountFilter(fixture, {
    searchText: "bcp",
    typeFilters: [],
    showArchived: false,
  });
  assert(out.length === 1 && out[0].id === 1, "BCP Soles matched");
}

function testSearchByCurrencyCode() {
  const out = applyAccountFilter(fixture, {
    searchText: "usd",
    typeFilters: [],
    showArchived: false,
  });
  assert(out.length === 1 && out[0].id === 2, "USD account matched by currency");
}

function testSearchEmptyMatchesAll() {
  const out = applyAccountFilter(fixture, {
    searchText: "",
    typeFilters: [],
    showArchived: false,
  });
  assert(out.length === 4, "empty search = no filter");
}

function testSearchNoMatch() {
  const out = applyAccountFilter(fixture, {
    searchText: "zzz_nope",
    typeFilters: [],
    showArchived: false,
  });
  assert(out.length === 0, "no match");
}

// ── Combinations ─────────────────────────────────────────────────────────────

function testSearchPlusType() {
  const out = applyAccountFilter(fixture, {
    searchText: "interbank",
    typeFilters: ["bank"],
    showArchived: false,
  });
  assert(out.length === 1 && out[0].id === 2, "name + type filter combined");
}

function testSearchPlusTypeMismatch() {
  // "Interbank" matches name, but type filter is "credit_card" → no match
  const out = applyAccountFilter(fixture, {
    searchText: "interbank",
    typeFilters: ["credit_card"],
    showArchived: false,
  });
  assert(out.length === 0, "name match but type mismatch → empty");
}

// ── Runner ───────────────────────────────────────────────────────────────────

const tests: { name: string; fn: () => void }[] = [
  { name: "hides archived by default", fn: testHidesArchivedByDefault },
  { name: "shows archived when requested", fn: testShowsArchivedWhenRequested },
  { name: "empty type filters matches all", fn: testEmptyTypeFiltersMatchesAll },
  { name: "single type filter", fn: testSingleTypeFilter },
  { name: "multiple type filters (OR)", fn: testMultipleTypeFilters },
  { name: "search by name is case-insensitive", fn: testSearchByName_caseInsensitive },
  { name: "search matches currency code", fn: testSearchByCurrencyCode },
  { name: "empty search returns everything", fn: testSearchEmptyMatchesAll },
  { name: "search with no match returns empty", fn: testSearchNoMatch },
  { name: "search + type combined", fn: testSearchPlusType },
  { name: "search + type mismatch returns empty", fn: testSearchPlusTypeMismatch },
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

console.log(`\nfilters: ${tests.length - failed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} test(s) failed`);
