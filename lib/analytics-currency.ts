export type AnalyticsCurrencyAmount = {
  currencyCode?: string | null;
  amount: number;
  amountInBaseCurrency?: number | null;
};

export type CurrencyBreakdownRow = {
  currencyCode: string;
  total: number;
  totalInBaseCurrency: number | null;
  count: number;
};

export function buildCurrencyBreakdown(items: AnalyticsCurrencyAmount[]): CurrencyBreakdownRow[] {
  const map = new Map<string, CurrencyBreakdownRow>();

  for (const item of items) {
    const currencyCode = item.currencyCode?.trim().toUpperCase();
    if (!currencyCode || !Number.isFinite(item.amount) || item.amount <= 0) continue;
    const previous = map.get(currencyCode);
    if (previous) {
      previous.total += item.amount;
      previous.count += 1;
      if (item.amountInBaseCurrency != null && Number.isFinite(item.amountInBaseCurrency)) {
        previous.totalInBaseCurrency = (previous.totalInBaseCurrency ?? 0) + item.amountInBaseCurrency;
      }
      continue;
    }
    map.set(currencyCode, {
      currencyCode,
      total: item.amount,
      totalInBaseCurrency:
        item.amountInBaseCurrency != null && Number.isFinite(item.amountInBaseCurrency)
          ? item.amountInBaseCurrency
          : null,
      count: 1,
    });
  }

  return [...map.values()].sort((left, right) => right.total - left.total);
}

export function formatCurrencyBreakdownLine(
  rows: CurrencyBreakdownRow[],
  maxItems = 3,
) {
  if (rows.length === 0) return "Sin moneda identificada";
  return rows
    .slice(0, maxItems)
    .map((row) => `${formatCurrencyLocal(row.total, row.currencyCode)} (${row.currencyCode})`)
    .join(" · ");
}

function formatCurrencyLocal(amount: number, currencyCode: string) {
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
