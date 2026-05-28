import {
  categoryKindForMovementType,
  cleanDetectedMerchantName,
  convertDetectedAmountForAccount,
  filterCategoriesForMovementType,
  normalizeCurrencyCode,
  parseDetectedAmountLabel,
  recommendedAccountForDetectedCurrency,
  resolveExchangeRate,
  sortAccountsForDetectedCurrency,
} from "../../features/movements/lib/movement-creation-rules";
import type {
  AccountSummary,
  CategorySummary,
  ExchangeRateSummary,
} from "../../types/domain";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function approxEqual(actual: number, expected: number, tolerance = 0.001): boolean {
  return Math.abs(actual - expected) < tolerance;
}

function cat(id: number, name: string, kind: "expense" | "income" | "both", isActive = true): CategorySummary {
  return {
    id,
    name,
    kind,
    isActive,
  };
}

function account(id: number, name: string, currency: string, isArchived = false): AccountSummary {
  return {
    id,
    workspaceId: 1,
    name,
    type: "bank",
    currencyCode: currency,
    openingBalance: 0,
    currentBalance: 0,
    includeInNetWorth: true,
    lastActivity: "2026-05-26",
    color: "",
    icon: "",
    isArchived,
  };
}

function rate(from: string, to: string, value: number, effectiveAt = "2026-05-26"): ExchangeRateSummary {
  return {
    fromCurrencyCode: from,
    toCurrencyCode: to,
    rate: value,
    effectiveAt,
  } as ExchangeRateSummary;
}

function runNormalizeCurrencyCode() {
  assert(normalizeCurrencyCode("usd") === "USD", "lowercase → uppercase");
  assert(normalizeCurrencyCode("  PEN  ") === "PEN", "trim espacios");
  assert(normalizeCurrencyCode(null) === "PEN", "null → fallback PEN");
  assert(normalizeCurrencyCode("", "USD") === "USD", "vacío → fallback custom");
  assert(normalizeCurrencyCode(undefined) === "PEN", "undefined → fallback PEN");
}

function runCategoryKindForMovementType() {
  assert(categoryKindForMovementType("income") === "income", "income → income");
  assert(categoryKindForMovementType("expense") === "expense", "expense → expense");
  assert(categoryKindForMovementType("transfer") === null, "transfer → null (no categorías)");
}

function runFilterCategoriesForExpense() {
  const categories = [
    cat(1, "Comida", "expense"),
    cat(2, "Sueldo", "income"),
    cat(3, "Ajuste", "both"),
    cat(4, "Inactiva", "expense", false),
  ];
  const filtered = filterCategoriesForMovementType(categories, "expense");
  const ids = filtered.map((c) => c.id);
  assert(ids.includes(1), "incluye 'Comida' (expense activa)");
  assert(ids.includes(3), "incluye 'Ajuste' (both activa)");
  assert(!ids.includes(2), "excluye 'Sueldo' (income)");
  assert(!ids.includes(4), "excluye categoría inactiva");
}

function runFilterCategoriesForTransferIsEmpty() {
  const categories = [cat(1, "Comida", "expense"), cat(2, "Sueldo", "income")];
  const filtered = filterCategoriesForMovementType(categories, "transfer");
  assert(filtered.length === 0, "transfer no tiene categorías");
}

function runParseDetectedAmountLabel() {
  const usd = parseDetectedAmountLabel("USD 27.50");
  assert(usd?.amount === 27.5 && usd?.currencyCode === "USD", `USD 27.50 → ${JSON.stringify(usd)}`);

  const pen = parseDetectedAmountLabel("S/ 8.50");
  assert(pen?.amount === 8.5 && pen?.currencyCode === "PEN", `S/ 8.50 → ${JSON.stringify(pen)}`);

  const dollarOnly = parseDetectedAmountLabel("$45");
  assert(dollarOnly?.amount === 45 && dollarOnly?.currencyCode === "USD", `$45 → USD 45`);

  const withComma = parseDetectedAmountLabel("S/ 8,50");
  assert(withComma?.amount === 8.5, "coma decimal soportada");

  assert(parseDetectedAmountLabel(null) === null, "null → null");
  assert(parseDetectedAmountLabel("texto sin monto") === null, "sin números → null");
  assert(parseDetectedAmountLabel("S/ 0") === null, "monto 0 → null (rechazado)");
}

function runSortAccountsExcludesArchived() {
  const accounts = [
    account(1, "Cuenta archivada", "PEN", true),
    account(2, "Banco USD", "USD"),
    account(3, "Banco PEN", "PEN"),
  ];
  const sorted = sortAccountsForDetectedCurrency(accounts, "PEN");
  assert(sorted.length === 2, "archivadas excluidas");
  assert(sorted[0].id === 3, "cuenta PEN debe ir primero (matches detected)");
}

function runRecommendedAccountUsesPreferredIfMatchesCurrency() {
  const accounts = [
    account(1, "PEN", "PEN"),
    account(2, "USD", "USD"),
  ];
  const result = recommendedAccountForDetectedCurrency(accounts, "USD", 2);
  assert(result?.id === 2, "preferred match currency → usa preferred");
}

function runRecommendedAccountFallsBackIfPreferredDoesNotMatch() {
  const accounts = [
    account(1, "PEN", "PEN"),
    account(2, "USD", "USD"),
  ];
  // preferred=1 (PEN) pero detected=USD → debe fallback al primero ordenado (USD)
  const result = recommendedAccountForDetectedCurrency(accounts, "USD", 1);
  assert(result?.id === 2, "preferred no matches currency → usa el ordenado por currency");
}

function runResolveExchangeRateSameCurrency() {
  const result = resolveExchangeRate([], "USD", "USD");
  assert(result?.rate === 1 && result?.source === "same_currency", "same currency → rate 1");
}

function runResolveExchangeRateDirect() {
  const rates = [rate("PEN", "USD", 0.27)];
  const result = resolveExchangeRate(rates, "PEN", "USD");
  assert(result?.rate === 0.27 && result?.source === "direct", "direct rate");
}

function runResolveExchangeRateInverse() {
  const rates = [rate("PEN", "USD", 0.27)];
  const result = resolveExchangeRate(rates, "USD", "PEN");
  assert(result != null && approxEqual(result.rate, 1 / 0.27), "inverse rate");
  assert(result?.source === "inverse", "source debe ser inverse");
}

function runResolveExchangeRateBaseCross() {
  // De CLP → EUR sin tasa directa, vía PEN (base)
  const rates = [rate("CLP", "PEN", 0.004), rate("PEN", "EUR", 0.25)];
  const result = resolveExchangeRate(rates, "CLP", "EUR", "PEN");
  assert(result != null, "base_cross debe encontrar ruta");
  assert(result?.source === "base_cross", `source esperado base_cross, recibido ${result?.source}`);
  assert(approxEqual(result!.rate, 0.004 * 0.25), `rate base_cross esperado ${0.004 * 0.25}, recibido ${result?.rate}`);
}

function runResolveExchangeRateReturnsNullWhenNoPath() {
  const result = resolveExchangeRate([], "CLP", "EUR", "PEN");
  assert(result === null, "sin rates → null");
}

function runConvertDetectedAmount() {
  const rates = [rate("PEN", "USD", 0.27)];
  const result = convertDetectedAmountForAccount({
    amount: 100,
    detectedCurrencyCode: "PEN",
    accountCurrencyCode: "USD",
    exchangeRates: rates,
  });
  assert(approxEqual(result.amount, 27), `100 PEN → USD = 27, recibido ${result.amount}`);
  assert(result.converted === true, "converted true");
  assert(result.originalAmount === 100, "originalAmount preservado");
}

function runConvertDetectedAmountSameCurrencyNoConversion() {
  const result = convertDetectedAmountForAccount({
    amount: 100,
    detectedCurrencyCode: "USD",
    accountCurrencyCode: "USD",
    exchangeRates: [],
  });
  assert(result.amount === 100, "same currency no convierte");
  assert(result.converted === false, "converted false");
}

function runCleanDetectedMerchantName() {
  assert(cleanDetectedMerchantName("NETFLIX*SUBSCR") === "Netflix", "alias NETFLIX");
  assert(cleanDetectedMerchantName("SPOTIFY USA") === "Spotify", "alias SPOTIFY");
  assert(cleanDetectedMerchantName("OPENAI CHATGPT") === "ChatGPT", "alias ChatGPT");
  assert(cleanDetectedMerchantName("") === "", "vacío");
  assert(cleanDetectedMerchantName(null) === "", "null");
  assert(cleanDetectedMerchantName("PAGO VISA AMAZON.COM") === "Amazon", "alias dentro de ruido");
}

function main() {
  const tests: Array<[string, () => void]> = [
    ["normalizeCurrencyCode", runNormalizeCurrencyCode],
    ["categoryKindForMovementType", runCategoryKindForMovementType],
    ["filterCategories expense excluye income e inactivas", runFilterCategoriesForExpense],
    ["filterCategories transfer es vacío", runFilterCategoriesForTransferIsEmpty],
    ["parseDetectedAmountLabel USD/PEN/coma", runParseDetectedAmountLabel],
    ["sortAccounts excluye archived y prioriza currency", runSortAccountsExcludesArchived],
    ["recommendedAccount usa preferred si match currency", runRecommendedAccountUsesPreferredIfMatchesCurrency],
    ["recommendedAccount fallback si preferred no match", runRecommendedAccountFallsBackIfPreferredDoesNotMatch],
    ["resolveExchangeRate same currency", runResolveExchangeRateSameCurrency],
    ["resolveExchangeRate direct", runResolveExchangeRateDirect],
    ["resolveExchangeRate inverse", runResolveExchangeRateInverse],
    ["resolveExchangeRate base cross", runResolveExchangeRateBaseCross],
    ["resolveExchangeRate sin ruta → null", runResolveExchangeRateReturnsNullWhenNoPath],
    ["convertDetectedAmount con conversión", runConvertDetectedAmount],
    ["convertDetectedAmount same currency", runConvertDetectedAmountSameCurrencyNoConversion],
    ["cleanDetectedMerchantName aliases", runCleanDetectedMerchantName],
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
  console.log(`\ncreation-rules-smoke: ${passed} passed, ${failed} failed`);
  if (failed > 0) throw new Error(`${failed} test(s) failed`);
}

main();
