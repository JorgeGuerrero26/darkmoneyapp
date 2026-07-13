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
