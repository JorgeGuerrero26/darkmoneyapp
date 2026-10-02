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

const contacts = load(resolve(root, "features/contacts/lib/contact-money.ts"));
const metrics = load(resolve(root, "features/contacts/lib/contactMetrics.ts"));
const snapshotCache = load(resolve(root, "services/queries/snapshot-cache.ts"));
const rates = [{ fromCurrencyCode: "USD", toCurrencyCode: "PEN", rate: 3.75, effectiveAt: "2026-10-01" }];
const obligation = { counterpartyId: 7, direction: "receivable", pendingAmount: 100, principalAmount: 200, currencyCode: "USD", status: "active", pendingAmountInBaseCurrency: 100 };
const snapshot = {
  obligations: [obligation, { ...obligation, status: "cancelled", pendingAmount: 9999 }, { ...obligation, direction: "payable", currencyCode: "PEN", pendingAmount: 20 }],
  subscriptions: [{ vendorPartyId: 7, status: "active", amount: 10, currencyCode: "USD", amountInBaseCurrency: 10 }, { vendorPartyId: 7, status: "paused", amount: 100, currencyCode: "PEN" }],
  recurringIncome: [{ payerPartyId: 7, status: "active", amount: 50, currencyCode: "PEN" }],
  exchangeRates: rates,
  counterpartyPostedMovements: rows.map((item) => ({ ...item, counterpartyId: 7 })),
};
const contact = contacts.buildContactMoney(snapshot, 7, "PEN");
assert.deepEqual(contact.receivable, [{ currencyCode: "PEN", amount: 375 }]);
assert.deepEqual(contact.payable, [{ currencyCode: "PEN", amount: 20 }]);
assert.equal(contact.receivablePrincipalTotal, 750);
assert.deepEqual(contact.scheduledExpense, [{ currencyCode: "PEN", amount: 37.5 }]);
assert.equal(contact.unconvertedExposure, 0);
assert.equal(contact.unconvertedFlow, 1);
assert.equal(contact.inflowTotal, 50);
assert.equal(contact.outflowTotal, 200);
const unconverted = contacts.buildContactMoney({ ...snapshot, exchangeRates: [] }, 7, "PEN");
assert.deepEqual(unconverted.receivable, [{ currencyCode: "USD", amount: 100 }]);
assert.equal(unconverted.receivablePendingTotal, 0);
assert.equal(unconverted.unconvertedExposure, 1);
assert.equal(unconverted.unconvertedScheduled, 1);
assert.equal(unconverted.hasReceivable, true);
assert.equal(contacts.buildContactMoney({ ...snapshot, counterpartyPostedMovements: undefined }, 7, "PEN").flowLoaded, false);
assert.equal(contacts.buildContactMoney({ ...snapshot, obligations: undefined }, 7, "PEN").exposureLoaded, false);
const resultMetrics = metrics.buildContactMetricsById({ ...snapshot, counterparties: [{ id: 7, movementCount: 3 }], baseCurrency: "PEN", exchangeRates: [] });
assert.equal(metrics.contactHasOpenBalance(resultMetrics.get(7)), true);
assert.deepEqual(resultMetrics.get(7).receivable, [{ currencyCode: "USD", amount: 100 }]);

const csvPath = resolve(root, "features/contacts/lib/contactsCsv.ts");
const csvSource = ts.createSourceFile(csvPath, readFileSync(csvPath, "utf8"), ts.ScriptTarget.Latest, true);
const csvFunctions = csvSource.statements.filter(ts.isFunctionDeclaration).map((node) => node.getText(csvSource)).join("\n");
const csvExports = {};
new Function("TYPE_LABELS", "formatContactAmounts", "exports", ts.transpileModule(csvFunctions, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText)(
  { person: "Persona" }, contacts.formatContactAmounts, csvExports,
);
const csv = csvExports.buildContactCSV([{ id: 7, type: "person", name: "Test", movementCount: 3 }], resultMetrics);
assert.ok(csv.includes(contacts.formatContactAmounts([{ amount: 100, currencyCode: "USD" }])));
assert.ok(!csv.includes('"100"')); // Never an unlabeled native amount posing as workspace currency.

// Actual cache patch: correct destination currency, without applying a mutation to a server.
const oldSnapshot = { ...snapshot, workspaces: [{ id: 42, baseCurrencyCode: "PEN" }],
  accounts: [{ id: 1, currencyCode: "PEN", currentBalance: 20 }, { id: 2, currencyCode: "USD", currentBalance: 10 }],
  categoryPostedMovements: [], subscriptionPostedMovements: [], counterpartyPostedMovements: [] };
let patched;
snapshotCache.patchSnapshotWithCreatedMovement({ setQueriesData: (_filter, updater) => { patched = updater(oldSnapshot); } }, 42, {
  id: 1234, status: "posted", movementType: "obligation_payment", counterpartyId: 7,
  categoryId: 7, occurredAt: "2026-10-02T12:00:00Z", sourceAmount: 0,
  destinationAmount: 50, destinationAccountId: 2,
});
assert.equal(patched.counterpartyPostedMovements[0].amountCurrencyCode, "USD");
assert.equal(patched.counterpartyPostedMovements[0].amountInBaseCurrency, 187.5);
assert.equal(patched.categoryPostedMovements[0].amount, 50);
assert.equal(patched.accounts[1].currentBalance, 60);
console.log("contact-money: OK — conversions, cancelled, repayments, missing FX, active schedules and cache patch");

// Compare the actual pure implementations of both clients, not two hand-coded expectations.
const webRoot = resolve(root, "../DarkMoney");
if (existsSync(resolve(webRoot, "src/lib/analytics-money.ts"))) {
  const webMoney = load(resolve(webRoot, "src/lib/analytics-money.ts"));
  const webContacts = load(resolve(webRoot, "src/modules/contacts/lib/contact-parity.ts"));
  const adapted = rows.map((item) => ({ ...item, counterpartyId: 7,
    sourceCurrencyCode: item.amountCurrencyCode, destinationCurrencyCode: item.amountCurrencyCode,
    sourceAmountInBaseCurrency: item.amountInBaseCurrency, destinationAmountInBaseCurrency: item.amountInBaseCurrency,
  })).sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
  const normalize = (amounts) => [...amounts].sort((a, b) => a.currencyCode.localeCompare(b.currencyCode));
  const direction = load(resolve(root, "lib/movement-amounts.ts"));
  for (const incoming of [true, false]) {
    const clientRows = adapted.filter((item) => direction.movementActsAsIncome(item) === incoming);
    const webAmounts = webMoney.currencyTotals(clientRows.map((item) => webMoney.movementAnalyticsAmount(item, "PEN")), "PEN");
    assert.deepEqual(normalize(incoming ? contact.inflow : contact.outflow), normalize(webAmounts));
  }
  const webExposure = webContacts.contactExposure(snapshot.obligations.map((item) => ({ ...item,
    pendingAmountInBaseCurrency: item.currencyCode === "USD" ? item.pendingAmount * 3.75 : item.pendingAmount,
  })), 7, "PEN");
  assert.deepEqual(contact.receivable, webExposure.receivable);
  assert.deepEqual(contact.payable, webExposure.payable);
  assert.deepEqual(money.analyticsMonthKeys(new Date("2026-10-01T04:30:00Z")), webMoney.analyticsMonthKeys(new Date("2026-10-01T04:30:00Z")));
  console.log("catalog cross-client: OK — actual web/mobile implementations agree on cashflow, exposure and months");
} else console.log("catalog cross-client: not run — sibling web checkout unavailable");
