import {
  buildAnomalyFindings,
  buildCategorySuggestions,
} from "../../features/dashboard/lib/advanced-builders";
import type { ConversionCtx } from "../../features/dashboard/lib/types";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

type Movement = {
  id: number;
  movementType: string;
  status: string;
  occurredAt: string;
  sourceAccountId: number | null;
  destinationAccountId: number | null;
  categoryId: number | null;
  counterpartyId: number | null;
  description: string;
  sourceAmount: number;
  destinationAmount: number;
};

function expense(
  id: number,
  amount: number,
  occurredAt: string,
  description: string,
  categoryId: number | null = null,
): Movement {
  return {
    id,
    movementType: "expense",
    status: "posted",
    occurredAt,
    sourceAccountId: 1,
    destinationAccountId: null,
    categoryId,
    counterpartyId: null,
    description,
    sourceAmount: amount,
    destinationAmount: 0,
  };
}

function ctx(): ConversionCtx {
  return {
    accountCurrencyMap: new Map<number, string>(),
    exchangeRateMap: new Map<string, number>(),
    displayCurrency: "PEN",
    baseCurrency: "PEN",
  };
}

function runCategorySuggestionsEmpty() {
  const result = buildCategorySuggestions([], [], ctx());
  assert(result.length === 0, "workspace vacío no genera sugerencias");
}

function runCategorySuggestionsLearned() {
  // Patrón: misma descripción categorizada 3 veces → la cuarta sin cat debe
  // sugerir la misma categoría. Esto valida que el wrapper conecta bien con
  // buildCategorySuggestionCandidates del módulo analytics.
  const movements: Movement[] = [
    expense(1, 50, "2026-05-01T10:00:00Z", "Starbucks Coffee", 5),
    expense(2, 55, "2026-05-05T10:00:00Z", "Starbucks Coffee", 5),
    expense(3, 60, "2026-05-09T10:00:00Z", "Starbucks Coffee", 5),
    expense(4, 52, "2026-05-15T10:00:00Z", "Starbucks Coffee", null), // pendiente de categorizar
  ];
  const categories = [{ id: 5, name: "Café" }];
  const result = buildCategorySuggestions(movements as never, categories, ctx());
  assert(result.length >= 1, `debe sugerir al menos 1 categoría, fueron ${result.length}`);
  const first = result[0];
  assert(first.movementId === 4, "sugerencia debe ser para el movimiento sin categoría (id 4)");
  assert(first.suggestedCategoryId === 5, "categoría sugerida debe ser id 5");
  assert(first.suggestedCategoryName === "Café", "nombre de categoría correcto");
}

function runAnomalyFindingsEmpty() {
  const result = buildAnomalyFindings([], ctx(), new Map(), new Map());
  assert(result.length === 0, "workspace vacío no genera anomalías");
}

function runAnomalyFindingsShape() {
  // Genero un patrón claro: 5 gastos pequeños similares + 1 gasto enorme
  const movements: Movement[] = [
    expense(1, 50, "2026-05-01T10:00:00Z", "Almuerzo", 10),
    expense(2, 55, "2026-05-03T10:00:00Z", "Almuerzo", 10),
    expense(3, 48, "2026-05-05T10:00:00Z", "Almuerzo", 10),
    expense(4, 52, "2026-05-07T10:00:00Z", "Almuerzo", 10),
    expense(5, 51, "2026-05-09T10:00:00Z", "Almuerzo", 10),
    expense(6, 800, "2026-05-15T10:00:00Z", "Almuerzo", 10), // outlier ~16x el promedio
  ];
  const categoryMap = new Map([[10, "Comida"]]);
  const accountMap = new Map([[1, "Cuenta Principal"]]);
  const result = buildAnomalyFindings(movements as never, ctx(), categoryMap, accountMap);
  // No asumimos cuántas devuelve el algoritmo, solo validamos shape de las que
  // sí devuelve.
  for (const finding of result) {
    assert(typeof finding.key === "string" && finding.key.length > 0, "finding.key string no vacío");
    assert(typeof finding.movementId === "number", "finding.movementId number");
    assert(typeof finding.title === "string", "finding.title string");
    assert(typeof finding.body === "string", "finding.body string");
    assert(typeof finding.meta === "string", "finding.meta string");
    assert(finding.level === "strong" || finding.level === "review", "level enum válido");
    assert(typeof finding.score === "number", "score number");
    assert(Array.isArray(finding.reasons), "reasons array");
  }
}

runCategorySuggestionsEmpty();
runCategorySuggestionsLearned();
runAnomalyFindingsEmpty();
runAnomalyFindingsShape();

console.log("advanced builders smoke tests passed");
