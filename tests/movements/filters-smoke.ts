import {
  applyMovementFilters,
  type MovementFilters,
  type MovementFiltersBuilder,
} from "../../features/movements/lib/filters";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

type Call =
  | ["in", string, readonly (string | number)[]]
  | ["eq", string, string | number]
  | ["gte", string, string]
  | ["lte", string, string]
  | ["or", string]
  | ["is", string, null]
  | ["ilike", string, string];

/**
 * Mock fluent que registra cada llamada en orden. Cada método retorna
 * `this` para encadenar como el cliente supabase.
 */
function mockBuilder(): MovementFiltersBuilder<MockBuilder> & { calls: Call[] } {
  return new MockBuilder();
}

class MockBuilder implements MovementFiltersBuilder<MockBuilder> {
  calls: Call[] = [];

  in(column: string, values: readonly (string | number)[]): MockBuilder {
    this.calls.push(["in", column, values]);
    return this;
  }
  eq(column: string, value: string | number): MockBuilder {
    this.calls.push(["eq", column, value]);
    return this;
  }
  gte(column: string, value: string): MockBuilder {
    this.calls.push(["gte", column, value]);
    return this;
  }
  lte(column: string, value: string): MockBuilder {
    this.calls.push(["lte", column, value]);
    return this;
  }
  or(filter: string): MockBuilder {
    this.calls.push(["or", filter]);
    return this;
  }
  is(column: string, value: null): MockBuilder {
    this.calls.push(["is", column, value]);
    return this;
  }
  ilike(column: string, pattern: string): MockBuilder {
    this.calls.push(["ilike", column, pattern]);
    return this;
  }
}

function methodCalls(b: MockBuilder, method: Call[0]): Call[] {
  return b.calls.filter((c) => c[0] === method);
}

function run(filters: MovementFilters): MockBuilder {
  const b = mockBuilder() as MockBuilder;
  applyMovementFilters(b, filters);
  return b;
}

function runFiltersVacioNoEmiteLlamadas() {
  const b = run({});
  assert(b.calls.length === 0, "filtros vacíos no emiten llamadas");
}

function runFiltroTypeSingle() {
  const b = run({ type: "expense" });
  const eqCalls = methodCalls(b, "eq");
  assert(eqCalls.length === 1, "type emite una llamada eq");
  assert(eqCalls[0][1] === "movement_type", "eq sobre movement_type");
  assert(eqCalls[0][2] === "expense", "eq value expense");
}

function runFiltroTypesMultiPrevalecesobreSingle() {
  const b = run({ type: "expense", types: ["income", "transfer"] });
  const inCalls = methodCalls(b, "in");
  const eqCalls = methodCalls(b, "eq");
  assert(inCalls.length === 1, "types emite una llamada in");
  assert(inCalls[0][1] === "movement_type", "in sobre movement_type");
  assert(
    Array.isArray(inCalls[0][2]) && (inCalls[0][2] as string[]).join(",") === "income,transfer",
    "in values correctos",
  );
  assert(eqCalls.length === 0, "type single no se aplica si hay types");
}

function runFiltroStatus() {
  const b = run({ status: "pending" });
  const eqCalls = methodCalls(b, "eq");
  assert(eqCalls.some((c) => c[1] === "status" && c[2] === "pending"), "eq status");
}

function runFiltroDateRange() {
  const b = run({ dateFrom: "2026-01-01", dateTo: "2026-01-31" });
  const gte = methodCalls(b, "gte");
  const lte = methodCalls(b, "lte");
  assert(gte.length === 1 && gte[0][1] === "occurred_at", "gte occurred_at");
  assert(lte.length === 1 && lte[0][1] === "occurred_at", "lte occurred_at");
}

function runFiltroAccountIdOrSourceOrDest() {
  const b = run({ accountId: 42 });
  const ors = methodCalls(b, "or");
  assert(ors.length === 1, "accountId emite or");
  assert(
    typeof ors[0][1] === "string" &&
      ors[0][1].includes("source_account_id.eq.42") &&
      ors[0][1].includes("destination_account_id.eq.42"),
    "or busca en origen y destino",
  );
}

function runFiltroUncategorizedRestringeATiposCashflow() {
  const b = run({ uncategorized: true });
  const isCalls = methodCalls(b, "is");
  const inCalls = methodCalls(b, "in");
  assert(isCalls.length === 1 && isCalls[0][1] === "category_id" && isCalls[0][2] === null, "is category_id null");
  assert(inCalls.length === 1 && inCalls[0][1] === "movement_type", "in movement_type cashflow");
  const types = inCalls[0][2] as string[];
  assert(types.includes("expense") && types.includes("income"), "incluye expense+income");
  assert(!types.includes("transfer") && !types.includes("adjustment"), "excluye transfer/adjustment");
}

function runFiltroUncategorizedPisaCategoryId() {
  const b = run({ uncategorized: true, categoryId: 99 });
  const eqCalls = methodCalls(b, "eq");
  assert(
    !eqCalls.some((c) => c[1] === "category_id"),
    "uncategorized prevalece sobre categoryId — no se aplica eq category_id",
  );
}

function runFiltroCategoryIdSolo() {
  const b = run({ categoryId: 7 });
  const eqCalls = methodCalls(b, "eq");
  assert(eqCalls.some((c) => c[1] === "category_id" && c[2] === 7), "eq category_id 7");
}

function runFiltroSearchIlikeConWildcards() {
  const b = run({ search: "Yape" });
  const ilike = methodCalls(b, "ilike");
  assert(ilike.length === 1, "search emite ilike");
  assert(ilike[0][1] === "description", "ilike sobre description");
  assert(ilike[0][2] === "%Yape%", "wildcards a ambos lados");
}

function runFiltroMovementIdsIn() {
  const b = run({ movementIds: [10, 20, 30] });
  const ins = methodCalls(b, "in").filter((c) => c[1] === "id");
  assert(ins.length === 1, "movementIds emite in id");
  const ids = ins[0][2] as number[];
  assert(ids.length === 3 && ids[0] === 10 && ids[2] === 30, "in id preserva orden");
}

function runFiltroMovementIdsVacioNoEmite() {
  const b = run({ movementIds: [] });
  assert(b.calls.length === 0, "movementIds vacío no emite llamada");
}

function runCombinacionRicaTypesStatusSearchDateRange() {
  const b = run({
    types: ["expense", "income"],
    status: "posted",
    search: "café",
    dateFrom: "2026-05-01",
    dateTo: "2026-05-27",
    accountId: 3,
  });
  // Debe contener: in(movement_type, [...]), eq(status), gte, lte, or(account)
  // ilike (search) — todo ello sin pisarse
  assert(methodCalls(b, "in").some((c) => c[1] === "movement_type"), "types aplicado");
  assert(methodCalls(b, "eq").some((c) => c[1] === "status" && c[2] === "posted"), "status aplicado");
  assert(methodCalls(b, "gte").length === 1, "dateFrom aplicado");
  assert(methodCalls(b, "lte").length === 1, "dateTo aplicado");
  assert(methodCalls(b, "or").length === 1, "accountId aplicado");
  assert(methodCalls(b, "ilike").length === 1, "search aplicado");
}

function main() {
  const tests: Array<[string, () => void]> = [
    ["filtros vacíos no emiten llamadas", runFiltersVacioNoEmiteLlamadas],
    ["type single emite eq movement_type", runFiltroTypeSingle],
    ["types multi prevalece sobre type single", runFiltroTypesMultiPrevalecesobreSingle],
    ["status emite eq status", runFiltroStatus],
    ["dateFrom + dateTo emiten gte+lte", runFiltroDateRange],
    ["accountId busca como origen O destino vía or", runFiltroAccountIdOrSourceOrDest],
    ["uncategorized restringe a tipos cashflow", runFiltroUncategorizedRestringeATiposCashflow],
    ["uncategorized prevalece sobre categoryId", runFiltroUncategorizedPisaCategoryId],
    ["categoryId solo emite eq", runFiltroCategoryIdSolo],
    ["search emite ilike con %wildcards%", runFiltroSearchIlikeConWildcards],
    ["movementIds emite in id", runFiltroMovementIdsIn],
    ["movementIds vacío no emite", runFiltroMovementIdsVacioNoEmite],
    ["combinación rica de filtros", runCombinacionRicaTypesStatusSearchDateRange],
  ];

  let passed = 0;
  let failed = 0;
  for (const [label, fn] of tests) {
    try {
      fn();
      console.log(`  ✓ ${label}`);
      passed++;
    } catch (error) {
      console.error(`  ✗ ${label}: ${(error as Error).message}`);
      failed++;
    }
  }
  console.log(`\nfilters-smoke: ${passed} passed, ${failed} failed`);
  if (failed > 0) throw new Error(`${failed} test(s) failed`);
}

main();
