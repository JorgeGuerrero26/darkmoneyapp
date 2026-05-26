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
