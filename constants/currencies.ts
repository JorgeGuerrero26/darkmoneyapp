export const DEFAULT_EXCHANGE_CURRENCY = "USD";

export type SupportedCurrency = {
  code: string;
  name: string;
};

export const SUPPORTED_CURRENCIES: SupportedCurrency[] = [
  { code: "PEN", name: "Sol peruano" },
  { code: "USD", name: "Dolar estadounidense" },
  { code: "EUR", name: "Euro" },
  { code: "GBP", name: "Libra esterlina" },
  { code: "JPY", name: "Yen japones" },
  { code: "CAD", name: "Dolar canadiense" },
  { code: "AUD", name: "Dolar australiano" },
  { code: "CHF", name: "Franco suizo" },
  { code: "CNY", name: "Yuan chino" },
  { code: "MXN", name: "Peso mexicano" },
  { code: "BRL", name: "Real brasileno" },
  { code: "CLP", name: "Peso chileno" },
  { code: "COP", name: "Peso colombiano" },
  { code: "ARS", name: "Peso argentino" },
  { code: "UYU", name: "Peso uruguayo" },
  { code: "BOB", name: "Boliviano" },
  { code: "PYG", name: "Guarani paraguayo" },
  { code: "CRC", name: "Colon costarricense" },
  { code: "DOP", name: "Peso dominicano" },
  { code: "GTQ", name: "Quetzal guatemalteco" },
];

export const SUPPORTED_CURRENCY_CODES = SUPPORTED_CURRENCIES.map((currency) => currency.code);

export function normalizeSupportedCurrencyCode(code: string | null | undefined, fallback = "PEN") {
  const normalized = code?.trim().toUpperCase();
  if (normalized && SUPPORTED_CURRENCY_CODES.includes(normalized)) return normalized;
  return fallback;
}

/**
 * El plural coloquial de cada moneda.
 *
 * Para las frases donde el código ISO no se lee como lo diría una persona: "las dos cuentas son
 * en soles", no "las dos cuentas son en PEN". Si la moneda no está en la lista, se devuelve el
 * código, que es peor pero nunca es falso.
 */
const CURRENCY_PLURALS: Record<string, string> = {
  PEN: "soles",
  USD: "dólares",
  EUR: "euros",
  GBP: "libras",
  JPY: "yenes",
  CAD: "dólares canadienses",
  AUD: "dólares australianos",
  CHF: "francos suizos",
  CNY: "yuanes",
  MXN: "pesos mexicanos",
  BRL: "reales",
  CLP: "pesos chilenos",
  COP: "pesos colombianos",
  ARS: "pesos argentinos",
  UYU: "pesos uruguayos",
  BOB: "bolivianos",
  PYG: "guaraníes",
  CRC: "colones",
  DOP: "pesos dominicanos",
  GTQ: "quetzales",
};

export function currencyPluralName(code: string | null | undefined) {
  const normalized = code?.trim().toUpperCase();
  if (!normalized) return "";
  return CURRENCY_PLURALS[normalized] ?? normalized;
}

/**
 * El plural con mayúscula inicial, para filas y títulos: "Soles", "Dólares".
 *
 * En una fila de formulario el código ISO no se lee: "PEN" es para el backend, no para quien
 * abre una cuenta.
 */
export function currencyPluralTitle(code: string | null | undefined) {
  const plural = currencyPluralName(code);
  if (!plural) return "";
  return plural.charAt(0).toUpperCase() + plural.slice(1);
}
