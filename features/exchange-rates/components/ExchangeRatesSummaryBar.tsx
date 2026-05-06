import { Coins, Repeat2 } from "lucide-react-native";

import { MetricSummaryBar } from "../../../components/ui/MetricSummaryBar";
import { COLORS } from "../../../constants/theme";

type Props = {
  pairCount: number;
  currencyCount: number;
};

export function ExchangeRatesSummaryBar({ pairCount, currencyCount }: Props) {
  return (
    <MetricSummaryBar
      items={[
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
