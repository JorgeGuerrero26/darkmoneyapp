import { CalendarClock, Pause, Wallet } from "lucide-react-native";

import { formatCurrency } from "../../../components/ui/AmountDisplay";
import { MetricSummaryBar } from "../../../components/ui/MetricSummaryBar";
import { COLORS } from "../../../constants/theme";

type Props = {
  monthlyTotal: number;
  activeCount: number;
  pausedCount: number;
  currencyCode: string;
};

export function SubscriptionSummaryBar({
  monthlyTotal,
  activeCount,
  pausedCount,
  currencyCode,
}: Props) {
  return (
    <MetricSummaryBar
      items={[
        {
          key: "monthly",
          icon: Wallet,
          value: formatCurrency(monthlyTotal, currencyCode),
          label: "al mes",
          color: COLORS.expense,
          strong: true,
          helpTitle: "Costo mensual estimado",
          helpDescription: "Suma las suscripciones activas convertidas a un equivalente mensual en la moneda base del workspace.",
        },
        {
          key: "active",
          icon: CalendarClock,
          value: String(activeCount),
          label: "activas",
          color: COLORS.primary,
          helpTitle: "Suscripciones activas",
          helpDescription: "Cantidad de suscripciones activas que se consideran para próximos pagos y para el costo mensual estimado.",
        },
        {
          key: "paused",
          icon: Pause,
          value: String(pausedCount),
          label: "pausadas",
          color: pausedCount > 0 ? COLORS.gold : COLORS.storm,
          helpTitle: "Suscripciones pausadas",
          helpDescription: "Suscripciones que siguen registradas pero no se consideran activas para próximos pagos ni para el costo mensual estimado.",
        },
      ]}
    />
  );
}
