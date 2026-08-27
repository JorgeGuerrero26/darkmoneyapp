/**
 * Pure (RN-free) currency formatter. Re-exported from
 * components/ui/AmountDisplay.tsx for backward compatibility. Living here
 * lets selectors/builders/tests format amounts without dragging React
 * Native through the resolver.
 */
export function formatCurrency(amount: number, currencyCode: string): string {
  try {
    return new Intl.NumberFormat("es-PE", {
      style: "currency",
      currency: currencyCode,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${currencyCode} ${amount.toFixed(2)}`;
  }
}

export type CurrencyParts = {
  /** "S/", "$", "US$"… ya sin el espacio separador. */
  symbol: string;
  /** Enteros con separador de miles: "18,420". */
  integer: string;
  /** Separador decimal incluido: ".65". Vacío si la moneda no usa decimales. */
  fraction: string;
};

/**
 * Parte una cifra en sus tres piezas para poder darles jerarquía tipográfica distinta.
 *
 * El rediseño pinta el símbolo al 43 % en peso medio, los enteros al 100 % en tinta plena y
 * los decimales al 48 % atenuados: así el número manda y la moneda no compite con el importe.
 * Los decimales están para la exactitud, no para el vistazo rápido.
 *
 * Usa `formatToParts` en vez de una expresión regular a propósito: el símbolo, el separador de
 * miles y el decimal cambian por moneda y por locale, y partir "S/ 1,234.56" a mano se rompe
 * en cuanto aparece una moneda que pone el símbolo detrás o usa la coma como decimal.
 */
export function formatCurrencyParts(amount: number, currencyCode: string): CurrencyParts {
  try {
    const parts = new Intl.NumberFormat("es-PE", {
      style: "currency",
      currency: currencyCode,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).formatToParts(Math.abs(amount));

    const pick = (...types: string[]) =>
      parts.filter((part) => types.includes(part.type)).map((part) => part.value).join("");

    const symbol = pick("currency").trim();
    const integer = pick("integer", "group");
    const fraction = pick("decimal", "fraction");
    // Si el locale devolvió algo inesperado, mejor una cifra entera que una vacía.
    if (!integer) return { symbol: symbol || currencyCode, integer: Math.abs(amount).toFixed(0), fraction: "" };
    return { symbol: symbol || currencyCode, integer, fraction };
  } catch {
    const [integer = "0", fraction = "00"] = Math.abs(amount).toFixed(2).split(".");
    return { symbol: currencyCode, integer, fraction: `.${fraction}` };
  }
}

/**
 * Etiqueta enmascarada para modo privacidad: conserva el símbolo de la moneda
 * y reemplaza la cifra por puntos. Pura: la decisión de CUÁNDO enmascarar vive
 * en components/ui/AmountDisplay.tsx (frontera RN), no aquí.
 */
export function maskedCurrencyLabel(currencyCode: string): string {
  try {
    const parts = new Intl.NumberFormat("es-PE", {
      style: "currency",
      currency: currencyCode,
    }).formatToParts(0);
    const symbol = parts.find((part) => part.type === "currency")?.value;
    if (symbol) return `${symbol} ••••`;
  } catch {
    // moneda desconocida: cae al código
  }
  return `${currencyCode} ••••`;
}
