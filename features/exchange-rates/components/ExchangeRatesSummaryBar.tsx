
import { MetricSummaryBar } from "../../../components/ui/MetricSummaryBar";

import type { UsdReferenceRate } from "../lib/usdReferenceRate";

type Props = {
  pairCount: number;
  currencyCount: number;
  /** Tasa USD → moneda base más reciente (regla: USD como referencia por defecto). */
  usdReference?: UsdReferenceRate | null;
};

export function ExchangeRatesSummaryBar({ pairCount, currencyCount, usdReference }: Props) {
  const partes = [`${pairCount} par${pairCount === 1 ? "" : "es"} configurado${pairCount === 1 ? "" : "s"}`];
  if (currencyCount > 0) partes.push(`${currencyCount} moneda${currencyCount === 1 ? "" : "s"}`);

  return (
    <MetricSummaryBar
      label={usdReference ? `1 USD en ${usdReference.baseCurrencyCode}` : undefined}
      value={usdReference ? String(usdReference.rate) : null}
      support={partes.join(" · ")}
      footnote="1 unidad de la moneda origen equivale a la tasa mostrada en la moneda destino."
    />
  );
}
