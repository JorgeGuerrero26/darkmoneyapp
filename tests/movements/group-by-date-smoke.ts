import { groupMovementsByDate, __testing } from "../../features/movements/lib/group-by-date";
import type { MovementRecord } from "../../types/domain";

const { ymdInLima, dayDiff, formatDateLabel } = __testing;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function mv(id: number, occurredAt: string): MovementRecord {
  return {
    id,
    workspaceId: 1,
    movementType: "expense",
    status: "posted",
    description: `mv ${id}`,
    notes: null,
    category: "",
    categoryId: null,
    counterparty: "",
    counterpartyId: null,
    occurredAt,
    sourceAccountId: 1,
    sourceAccountName: null,
    sourceCurrencyCode: "PEN",
    sourceAmount: 10,
    destinationAccountId: null,
    destinationAccountName: null,
    destinationCurrencyCode: null,
    destinationAmount: null,
    fxRate: null,
    obligationId: null,
    subscriptionId: null,
    metadata: null,
  } as MovementRecord;
}

function runEmptyInput() {
  const result = groupMovementsByDate([]);
  assert(result.length === 0, "lista vacía → 0 secciones");
}

function runSingleSection() {
  const movs = [mv(1, "2026-05-26T10:00:00Z"), mv(2, "2026-05-26T11:00:00Z")];
  const result = groupMovementsByDate(movs, { now: new Date("2026-05-26T12:00:00Z") });
  assert(result.length === 1, "1 día → 1 sección");
  assert(result[0].data.length === 2, "ambos movimientos en el bucket");
  assert(result[0].label === "Hoy", `label esperado Hoy, recibido ${result[0].label}`);
}

function runMultipleDaysOrderedDescending() {
  const movs = [
    mv(1, "2026-05-26T10:00:00Z"),
    mv(2, "2026-05-25T10:00:00Z"),
    mv(3, "2026-05-25T08:00:00Z"),
    mv(4, "2026-05-24T10:00:00Z"),
  ];
  const result = groupMovementsByDate(movs, { now: new Date("2026-05-26T12:00:00Z") });
  assert(result.length === 3, `3 días distintos → 3 secciones, recibido ${result.length}`);
  assert(result[0].label === "Hoy", "primero hoy");
  assert(result[1].label === "Ayer", "segundo ayer");
  assert(result[0].data.length === 1, "hoy tiene 1");
  assert(result[1].data.length === 2, "ayer tiene 2");
  assert(result[2].data.length === 1, "anteayer tiene 1");
}

function runWeekdayLabelInRecentDays() {
  // 23 mayo 2026 es sábado → diff=3 desde 26 mayo
  const movs = [mv(1, "2026-05-23T10:00:00Z")];
  const result = groupMovementsByDate(movs, { now: new Date("2026-05-26T12:00:00Z") });
  assert(result.length === 1, "1 sección");
  // formato esperado: "{Dow} {día} {mes}"
  assert(/^(Dom|Lun|Mar|Mié|Jue|Vie|Sáb) \d+ \w+$/.test(result[0].label), `weekday label malformado: ${result[0].label}`);
}

function runOlderThanWeekUsesAbsoluteLabel() {
  const movs = [mv(1, "2026-05-10T10:00:00Z")];
  const result = groupMovementsByDate(movs, { now: new Date("2026-05-26T12:00:00Z") });
  assert(result.length === 1, "1 sección");
  // > 7 días, mismo año → "{día} {mes}"
  assert(result[0].label === "10 may", `esperado "10 may", recibido "${result[0].label}"`);
}

function runOlderYearIncludesYear() {
  const movs = [mv(1, "2025-12-20T10:00:00Z")];
  const result = groupMovementsByDate(movs, { now: new Date("2026-05-26T12:00:00Z") });
  assert(result[0].label === "20 dic 2025", `esperado "20 dic 2025", recibido "${result[0].label}"`);
}

function runHeaderVariantIsDivider() {
  const movs = [mv(1, "2026-05-26T10:00:00Z")];
  const result = groupMovementsByDate(movs, { now: new Date("2026-05-26T12:00:00Z") });
  assert(result[0].headerVariant === "divider", "headerVariant debe ser divider");
}

function runIgnoresInvalidDates() {
  const movs = [mv(1, "not-a-date"), mv(2, "2026-05-26T10:00:00Z")];
  const result = groupMovementsByDate(movs, { now: new Date("2026-05-26T12:00:00Z") });
  assert(result.length === 1, "invalid date skipped");
  assert(result[0].data.length === 1, "solo el válido en bucket");
  assert(result[0].data[0].id === 2, "el movimiento válido es id=2");
}

function runDayDiff() {
  assert(dayDiff("2026-05-26", "2026-05-26") === 0, "mismo día → 0");
  assert(dayDiff("2026-05-26", "2026-05-25") === 1, "26 vs 25 → 1");
  assert(dayDiff("2026-05-26", "2026-05-20") === 6, "26 vs 20 → 6");
  assert(dayDiff("2026-05-01", "2026-04-30") === 1, "cruce de mes");
  assert(dayDiff("2026-01-01", "2025-12-31") === 1, "cruce de año");
}

function runFormatDateLabel() {
  assert(formatDateLabel("2026-05-26", "2026-05-26") === "Hoy", "hoy");
  assert(formatDateLabel("2026-05-25", "2026-05-26") === "Ayer", "ayer");
  assert(formatDateLabel("2025-05-26", "2026-05-26") === "26 may 2025", "año previo incluye año");
}

function runYmdInLima() {
  // Sanity check: ymdInLima retorna formato YYYY-MM-DD
  const ymd = ymdInLima(new Date("2026-05-26T12:00:00Z"));
  assert(/^\d{4}-\d{2}-\d{2}$/.test(ymd), `formato YYYY-MM-DD, recibido ${ymd}`);
}

function main() {
  const tests: Array<[string, () => void]> = [
    ["empty input → 0 secciones", runEmptyInput],
    ["single section Hoy", runSingleSection],
    ["múltiples días ordenados", runMultipleDaysOrderedDescending],
    ["weekday label en días recientes", runWeekdayLabelInRecentDays],
    ["> 7 días usa label absoluto", runOlderThanWeekUsesAbsoluteLabel],
    ["año previo incluye año", runOlderYearIncludesYear],
    ["headerVariant=divider", runHeaderVariantIsDivider],
    ["ignora fechas inválidas", runIgnoresInvalidDates],
    ["dayDiff edge cases", runDayDiff],
    ["formatDateLabel cases", runFormatDateLabel],
    ["ymdInLima formato", runYmdInLima],
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
  console.log(`\ngroup-by-date-smoke: ${passed} passed, ${failed} failed`);
  if (failed > 0) throw new Error(`${failed} test(s) failed`);
}

main();
