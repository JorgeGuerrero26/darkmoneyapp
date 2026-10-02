import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import ts from "typescript";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const cache = new Map();
function load(path) {
  if (cache.has(path)) return cache.get(path);
  const module = { exports: {} }; cache.set(path, module.exports);
  const source = ts.transpileModule(readFileSync(path, "utf8"), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020,
  } }).outputText;
  const require = createRequire(path);
  new Function("require", "module", "exports", source)((specifier) => {
    if (!specifier.startsWith(".")) return require(specifier);
    const target = resolve(dirname(path), specifier);
    return load([target, `${target}.ts`].find(existsSync));
  }, module, module.exports);
  cache.set(path, module.exports); return module.exports;
}
const history = load(resolve(root, "services/queries/catalog-history.ts"));
const money = load(resolve(root, "lib/catalog-money.ts"));
const categories = load(resolve(root, "features/categories/lib/category-analytics.ts"));
const currency = load(resolve(root, "lib/analytics-currency.ts"));
const allRows = Array.from({ length: 1501 }, (_, id) => ({ id, occurred_at: "2020-01-01", category_id: 7 }));
let pages = 0;
assert.deepEqual(await history.fetchAllPages(async (from, to) => {
  pages++; return { data: allRows.slice(from, to + 1), error: null };
}), allRows);
assert.equal(pages, 4);
await assert.rejects(history.fetchAllPages(async (from) => from ? { data: null, error: new Error("page failed") } : { data: allRows.slice(0, 500), error: null }), /page failed/);
const calls = [];
const client = { from(table) {
  assert.equal(table, "movements");
  const query = {};
  for (const method of ["select", "eq", "not", "order"]) query[method] = (...args) => { calls.push([method, ...args]); return query; };
  query.range = async (from, to) => ({ data: allRows.slice(from, to + 1), error: null });
  return query;
} };
assert.equal((await history.fetchCatalogMovementRows(client, 42, "category_id")).data.length, 1501);
assert.ok(calls.some((call) => JSON.stringify(call) === JSON.stringify(["eq", "workspace_id", 42])));
assert.ok(calls.some((call) => JSON.stringify(call) === JSON.stringify(["eq", "status", "posted"])));
assert.ok(calls.some((call) => JSON.stringify(call) === JSON.stringify(["order", "id", { ascending: false }])));
assert.equal(money.catalogMovementAmount({ movementType: "obligation_payment", sourceAmount: 0, destinationAmount: 50 }), 50);
assert.equal(money.catalogMovementAmount({ movementType: "expense", sourceAmount: 20, destinationAmount: null }), 20);
assert.deepEqual(money.currencyTotals([{ amount: 10, currencyCode: "USD", amountInBaseCurrency: null }, { amount: 20, currencyCode: "PEN" }], "PEN"), [{ currencyCode: "USD", amount: 10 }, { currencyCode: "PEN", amount: 20 }]);
const rows = [
  { id: 1, categoryId: 7, occurredAt: "2020-01-01", movementType: "expense", sourceAmount: 200, destinationAmount: null, amountCurrencyCode: "PEN", amountInBaseCurrency: 200 },
  { id: 2, categoryId: 7, occurredAt: "2026-10-01T04:59:59Z", movementType: "obligation_payment", sourceAmount: 0, destinationAmount: 50, amountCurrencyCode: "PEN", amountInBaseCurrency: 50 },
  { id: 3, categoryId: 7, occurredAt: "2026-10-01T05:00:00Z", movementType: "expense", sourceAmount: 10, destinationAmount: null, amountCurrencyCode: "USD", amountInBaseCurrency: null },
];
const category = categories.buildCategoryAnalytics(rows, 7, "PEN", new Date("2026-10-02T12:00:00Z"));
assert.equal(category.paymentCount, 3);
assert.equal(category.totalBase, 250);
assert.equal(category.totalLast12, 50);
assert.equal(category.averageActiveMonthBase, 50);
assert.equal(category.unconvertedCount, 1);
assert.equal(category.last12.find((item) => item.ym === "2026-09").totalBase, 50);
assert.equal(category.last12.find((item) => item.ym === "2026-10").totalBase, 0);
assert.deepEqual(category.received, [{ currencyCode: "PEN", amount: 50 }]);
assert.deepEqual(category.spent, [{ currencyCode: "USD", amount: 10 }, { currencyCode: "PEN", amount: 200 }]);
assert.equal(currency.buildCurrencyBreakdown([{ amount: 10, currencyCode: "USD", amountInBaseCurrency: 38 }, { amount: 20, currencyCode: "USD", amountInBaseCurrency: null }])[0].totalInBaseCurrency, null);
assert.equal(currency.buildCurrencyBreakdown([{ amount: 20, currencyCode: "USD", amountInBaseCurrency: null }, { amount: 10, currencyCode: "USD", amountInBaseCurrency: 38 }])[0].totalInBaseCurrency, null);
console.log("catalog-money: OK — 1501 rows, old history, pagination failures, direction, FX and month boundary");
