import {
  buildRateMap,
  hasConversionRate,
  resolveConversion,
} from "../../lib/exchange-rate-map";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function approx(a: number, b: number, eps = 1e-9): boolean {
  return Math.abs(a - b) < eps;
}

// ── buildRateMap ─────────────────────────────────────────────────────────────

function testBuildRateMap_upperCasesAndDedupes() {
  const map = buildRateMap([
    { fromCurrencyCode: "usd", toCurrencyCode: "pen", rate: 3.7 },
    { fromCurrencyCode: "USD", toCurrencyCode: "PEN", rate: 3.9 }, // duplicate, ignored
    { fromCurrencyCode: "EUR", toCurrencyCode: "USD", rate: 1.08 },
  ]);
  assert(map.get("USD:PEN") === 3.7, "first rate wins; case-insensitive keys");
  assert(map.get("EUR:USD") === 1.08, "EUR:USD set");
  assert(map.size === 2, "size is 2 after dedupe");
}

function testBuildRateMap_dropsZeroAndNegative() {
  const map = buildRateMap([
    { fromCurrencyCode: "USD", toCurrencyCode: "PEN", rate: 0 },
    { fromCurrencyCode: "EUR", toCurrencyCode: "USD", rate: -1 },
    { fromCurrencyCode: "USD", toCurrencyCode: "EUR", rate: 0.93 },
  ]);
  assert(!map.has("USD:PEN"), "zero rate skipped");
  assert(!map.has("EUR:USD"), "negative rate skipped");
  assert(map.get("USD:EUR") === 0.93, "valid rate kept");
}

// ── resolveConversion ────────────────────────────────────────────────────────

function testResolveConversion_identity() {
  const map = buildRateMap([]);
  assert(resolveConversion(map, "USD", "USD") === 1, "same currency returns 1");
  assert(resolveConversion(map, "usd", "USD") === 1, "case-insensitive identity");
}

function testResolveConversion_direct() {
  const map = buildRateMap([{ fromCurrencyCode: "USD", toCurrencyCode: "PEN", rate: 3.7 }]);
  assert(resolveConversion(map, "USD", "PEN") === 3.7, "direct rate");
  assert(resolveConversion(map, "usd", "pen") === 3.7, "direct rate, lowercase input");
}

function testResolveConversion_inverse() {
  const map = buildRateMap([{ fromCurrencyCode: "USD", toCurrencyCode: "PEN", rate: 4 }]);
  // 4 PEN per USD ⇒ 0.25 USD per PEN
  assert(approx(resolveConversion(map, "PEN", "USD"), 0.25), "inverse rate computed");
}

function testResolveConversion_unknownReturnsOne() {
  const map = buildRateMap([{ fromCurrencyCode: "USD", toCurrencyCode: "PEN", rate: 3.7 }]);
  // No EUR rates available — falls back to 1 (caller responsibility to flag).
  assert(resolveConversion(map, "EUR", "JPY") === 1, "unknown pair falls back to 1");
}

// ── hasConversionRate ────────────────────────────────────────────────────────

function testHasConversionRate() {
  const map = buildRateMap([{ fromCurrencyCode: "USD", toCurrencyCode: "PEN", rate: 3.7 }]);
  assert(hasConversionRate(map, "USD", "USD"), "identity convertible");
  assert(hasConversionRate(map, "USD", "PEN"), "direct convertible");
  assert(hasConversionRate(map, "PEN", "USD"), "inverse convertible");
  assert(!hasConversionRate(map, "EUR", "JPY"), "unknown pair not convertible");
  assert(hasConversionRate(map, "usd", "pen"), "case-insensitive check");
}

// ── Runner ───────────────────────────────────────────────────────────────────

const tests: { name: string; fn: () => void }[] = [
  { name: "buildRateMap uppercases keys and dedupes first-wins", fn: testBuildRateMap_upperCasesAndDedupes },
  { name: "buildRateMap drops zero / negative rates", fn: testBuildRateMap_dropsZeroAndNegative },
  { name: "resolveConversion identity returns 1", fn: testResolveConversion_identity },
  { name: "resolveConversion direct lookup", fn: testResolveConversion_direct },
  { name: "resolveConversion inverse via 1/rate", fn: testResolveConversion_inverse },
  { name: "resolveConversion unknown pair falls back to 1", fn: testResolveConversion_unknownReturnsOne },
  { name: "hasConversionRate covers identity / direct / inverse / unknown", fn: testHasConversionRate },
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

console.log(`\nexchange-rate-map: ${tests.length - failed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} test(s) failed`);
