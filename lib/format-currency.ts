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
 * Las piezas se sacan del texto que devuelve `formatCurrency`, NO de `Intl.formatToParts`.
 *
 * Parece el camino tosco y es justo al revés. Hermes —el motor de JavaScript del teléfono—
 * trae un ICU recortado en el que las dos funciones NO coinciden: `format()` devuelve el
 * símbolo ("S/") y `formatToParts()` devuelve el código ("PEN"). En Node coinciden, así que el
 * fallo pasó los tests y solo se vio en el iPhone: el encabezado del día mostraba "S/ 168.40"
 * y la fila de al lado "PEN 42.90", porque cada uno iba por un camino distinto.
 *
 * Partiendo el texto ya formateado, la cifra que se enseña es SIEMPRE la misma que sale por la
 * vía de toda la vida. El símbolo puede ir delante o detrás: se toma lo que queda fuera del
 * bloque numérico, sea de un lado o del otro.
 */
export function formatCurrencyParts(amount: number, currencyCode: string): CurrencyParts {
  const formatted = formatCurrency(Math.abs(amount), currencyCode);
  // Dígitos con sus separadores de miles y decimal, sin comerse el símbolo.
  const match = /\d[\d.,   ]*\d|\d/.exec(formatted);
  if (!match) {
    const [integer = "0", fraction = "00"] = Math.abs(amount).toFixed(2).split(".");
    return { symbol: currencyCode, integer, fraction: `.${fraction}` };
  }

  const numeric = match[0];
  const symbol = (formatted.slice(0, match.index) + formatted.slice(match.index + numeric.length))
    .replace(/[  ]/g, " ")
    .trim();

  // Siempre se formatea con 2 decimales, así que los últimos 3 caracteres son <separador><dd>.
  const hasFraction = /[.,]\d{2}$/.test(numeric);
  return {
    symbol: symbol || currencyCode,
    integer: hasFraction ? numeric.slice(0, -3) : numeric,
    fraction: hasFraction ? numeric.slice(-3) : "",
  };
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
