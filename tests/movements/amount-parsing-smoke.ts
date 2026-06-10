import { parseAmountInput, parsePositiveAmountInput } from "../../lib/amount-parsing";

let passed = 0;
let failed = 0;

function check(label: string, actual: unknown, expected: unknown) {
  if (Object.is(actual, expected)) {
    passed += 1;
    console.log(`  ✓ ${label}`);
  } else {
    failed += 1;
    console.log(`  ✗ ${label}: esperado ${String(expected)}, recibido ${String(actual)}`);
  }
}

// Formato US
check('"1,234.56" → 1234.56', parseAmountInput("1,234.56"), 1234.56);
check('"999.99" → 999.99', parseAmountInput("999.99"), 999.99);
// Formato europeo
check('"1.234,56" → 1234.56', parseAmountInput("1.234,56"), 1234.56);
check('"1234,5" → 1234.5', parseAmountInput("1234,5"), 1234.5);
check('"0,99" → 0.99', parseAmountInput("0,99"), 0.99);
// Un solo separador con 3 dígitos a la derecha: miles para montos…
check('"12,345" (amount) → 12345', parseAmountInput("12,345"), 12345);
check('"1.500" (amount) → 1500', parseAmountInput("1.500"), 1500);
// …pero decimal para tipos de cambio
check('"3,672" (rate) → 3.672', parseAmountInput("3,672", { kind: "rate" }), 3.672);
check('"3,6725" (rate) → 3.6725', parseAmountInput("3,6725", { kind: "rate" }), 3.6725);
// Agrupación múltiple
check('"1.234.567" → 1234567', parseAmountInput("1.234.567"), 1234567);
check('"1,234,567.89" → 1234567.89', parseAmountInput("1,234,567.89"), 1234567.89);
// Símbolos de moneda y espacios (incluye NBSP)
check('"S/ 67.00" → 67', parseAmountInput("S/ 67.00"), 67);
check('"S/ 1 234,56" → 1234.56', parseAmountInput("S/ 1 234,56"), 1234.56);
check('"USD 15.99" → 15.99', parseAmountInput("USD 15.99"), 15.99);
// Decimales simples
check('"67.0" → 67', parseAmountInput("67.0"), 67);
check('"12,5" → 12.5', parseAmountInput("12,5"), 12.5);
check('"1500" → 1500', parseAmountInput("1500"), 1500);
// Inválidos
check('"" → null', parseAmountInput(""), null);
check('"abc" → null', parseAmountInput("abc"), null);
check("null → null", parseAmountInput(null), null);
check('"1.23.4,5" agrupación malformada → null', parseAmountInput("1.23.4,5"), null);
check('"1.2.3" grupos inválidos → null', parseAmountInput("1.2.3"), null);
// Positivos estrictos
check('parsePositive "0" → null', parsePositiveAmountInput("0"), null);
check('parsePositive "-5" → null', parsePositiveAmountInput("-5"), null);
check('parsePositive "5" → 5', parsePositiveAmountInput("5"), 5);

console.log(`\namount-parsing-smoke: ${passed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} test(s) failed`);
