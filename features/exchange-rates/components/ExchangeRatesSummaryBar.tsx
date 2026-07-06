import { Coins, DollarSign, Repeat2 } from "lucide-react-native";

import { MetricSummaryBar } from "../../../components/ui/MetricSummaryBar";
import { COLORS } from "../../../constants/theme";
import type { UsdReferenceRate } from "../lib/usdReferenceRate";

type Props = {
  pairCount: number;
  currencyCount: number;
  /** Tasa USD → moneda base más reciente (regla: USD como referencia por defecto). */
  usdReference?: UsdReferenceRate | null;
};

export function ExchangeRatesSummaryBar({ pairCount, currencyCount, usdReference }: Props) {
  return (
    <MetricSummaryBar
      items={[
        ...(usdReference
          ? [{
              key: "usd",
              icon: DollarSign,
              value: usdReference.rate.toLocaleString("es-PE", { maximumFractionDigits: 3 }),
              label: `${usdReference.baseCurrencyCode}/USD`,
              color: COLORS.gold,
              strong: true,
              helpTitle: "Referencia USD",
              helpDescription: `Cuántos ${usdReference.baseCurrencyCode} equivalen a 1 USD según la tasa sincronizada más reciente. USD es la referencia por defecto para comparaciones.`,
            }]
          : []),
        {
          key: "pairs",
          icon: Repeat2,
          value: String(pairCount),
          label: "pares",
          color: COLORS.primary,
          strong: true,
          helpTitle: "Pares de cambio",
          helpDescription: "Cantidad de combinaciones origen/destino disponibles para convertir montos entre monedas.",
        },
        {
          key: "currencies",
          icon: Coins,
          value: String(currencyCount),
          label: "monedas",
          color: COLORS.pine,
          helpTitle: "Monedas disponibles",
          helpDescription: "Cantidad de monedas consideradas por los tipos de cambio actuales del workspace.",
        },
      ]}
      trailingLabel="1 origen = tasa destino"
    />
  );
}
