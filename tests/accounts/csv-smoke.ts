import { buildAccountCSV } from "../../features/accounts/lib/csv";
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

// ── BOM and headers ─────────────────────────────────────────────────────────

function testStartsWithBOM() {
  const csv = buildAccountCSV([]);
  assert(csv.charCodeAt(0) === 0xFEFF, "starts with UTF-8 BOM");
}

function testIncludesAllHeaders() {
  // Headers are emitted raw (no quoting) to match the legacy file format used
  // by existing exports; data cells *are* quoted.
  const csv = buildAccountCSV([]);
  const firstLine = csv.slice(1).split("\n")[0];
  const expected = "Nombre,Tipo,Institución,Moneda,Saldo actual,Saldo en moneda base,Saldo inicial,En patrimonio,Archivada,Última actividad";
  assert(firstLine === expected, `header line mismatch:\n  got: ${firstLine}\n  expected: ${expected}`);
}

// ── Cell encoding ───────────────────────────────────────────────────────────

function testQuotesAreDoubledInsideCells() {
  const csv = buildAccountCSV([acc({ name: 'Quote "evil" inside', currencyCode: "PEN" })]);
  const lines = csv.slice(1).split("\n");
  const dataRow = lines[1];
  assert(
    dataRow.startsWith('"Quote ""evil"" inside",'),
    `quoted name must double inner quotes — got: ${dataRow}`,
  );
}

function testBooleansAreLocalized() {
  const csv = buildAccountCSV([
    acc({ includeInNetWorth: true, isArchived: false }),
    acc({ includeInNetWorth: false, isArchived: true }),
  ]);
  const lines = csv.slice(1).split("\n");
  // Headers + 2 data rows
  assert(lines.length === 3, "expected 3 lines (header + 2 data)");
  assert(lines[1].includes('"Sí","No"'), "row 1 has Sí/No");
  assert(lines[2].includes('"No","Sí"'), "row 2 has No/Sí");
}

function testEmptyLastActivity() {
  const csv = buildAccountCSV([acc({ lastActivity: "" })]);
  const lines = csv.slice(1).split("\n");
  assert(lines[1].endsWith(',""'), "empty lastActivity → empty quoted cell");
}

function testNumbersAsStrings() {
  const csv = buildAccountCSV([acc({ currentBalance: 1234.56, openingBalance: 1000 })]);
  const lines = csv.slice(1).split("\n");
  assert(lines[1].includes('"1234.56"'), "currentBalance stringified verbatim");
  assert(lines[1].includes('"1000"'), "openingBalance stringified verbatim");
}

// ── Enriched columns (Phase 5) ──────────────────────────────────────────────

function testInstitutionResolvesToLabel() {
  const csv = buildAccountCSV([acc({ institutionCode: "bcp" })]);
  const lines = csv.slice(1).split("\n");
  // Institución is the 3rd column; expect "BCP" wrapped in quotes.
  assert(lines[1].split(",")[2] === '"BCP"', "institution code resolved to label");
}

function testInstitutionUnknownCodeBecomesEmpty() {
  const csv = buildAccountCSV([acc({ institutionCode: "this-bank-does-not-exist" })]);
  const lines = csv.slice(1).split("\n");
  assert(lines[1].split(",")[2] === '""', "unknown code → empty cell");
}

function testInstitutionNullBecomesEmpty() {
  const csv = buildAccountCSV([acc({ institutionCode: null })]);
  const lines = csv.slice(1).split("\n");
  assert(lines[1].split(",")[2] === '""', "null institution → empty cell");
}

function testBaseBalanceWrittenWhenPresent() {
  const csv = buildAccountCSV([
    acc({ currentBalance: 100, currentBalanceInBaseCurrency: 370 }),
  ]);
  const lines = csv.slice(1).split("\n");
  // Column order: Nombre, Tipo, Institución, Moneda, Saldo actual, Saldo en moneda base, ...
  const cells = lines[1].split(",");
  assert(cells[4] === '"100"', "currentBalance in column 5");
  assert(cells[5] === '"370"', "base currency balance in column 6");
}

function testBaseBalanceEmptyWhenMissing() {
  const csv = buildAccountCSV([
    acc({ currentBalance: 100, currentBalanceInBaseCurrency: null }),
  ]);
  const lines = csv.slice(1).split("\n");
  const cells = lines[1].split(",");
  assert(cells[5] === '""', "missing base balance → empty cell");
}

// ── Multiple rows ───────────────────────────────────────────────────────────

function testMultipleRows() {
  const csv = buildAccountCSV([
    acc({ name: "A", currencyCode: "PEN" }),
    acc({ name: "B", currencyCode: "USD" }),
    acc({ name: "C", currencyCode: "EUR" }),
  ]);
  const lines = csv.slice(1).split("\n");
  assert(lines.length === 4, "header + 3 rows");
}

// ── Runner ──────────────────────────────────────────────────────────────────

const tests: { name: string; fn: () => void }[] = [
  { name: "starts with UTF-8 BOM", fn: testStartsWithBOM },
  { name: "first line lists every header", fn: testIncludesAllHeaders },
  { name: "embedded quotes are doubled per RFC 4180", fn: testQuotesAreDoubledInsideCells },
  { name: "boolean columns localize to Sí/No", fn: testBooleansAreLocalized },
  { name: "empty lastActivity becomes empty quoted cell", fn: testEmptyLastActivity },
  { name: "numbers are emitted as their String form", fn: testNumbersAsStrings },
  { name: "institution code resolves to catalog label", fn: testInstitutionResolvesToLabel },
  { name: "unknown institution code emits empty cell", fn: testInstitutionUnknownCodeBecomesEmpty },
  { name: "null institution emits empty cell", fn: testInstitutionNullBecomesEmpty },
  { name: "base-currency balance written when present", fn: testBaseBalanceWrittenWhenPresent },
  { name: "base-currency balance empty when missing", fn: testBaseBalanceEmptyWhenMissing },
  { name: "multiple rows produce header + N data lines", fn: testMultipleRows },
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

console.log(`\ncsv: ${tests.length - failed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} test(s) failed`);
