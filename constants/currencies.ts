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
