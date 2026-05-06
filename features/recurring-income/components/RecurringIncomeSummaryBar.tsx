import { CalendarClock, Pause, TrendingUp } from "lucide-react-native";

import { formatCurrency } from "../../../components/ui/AmountDisplay";
import { MetricSummaryBar } from "../../../components/ui/MetricSummaryBar";
import { COLORS } from "../../../constants/theme";

type Props = {
  monthlyTotal: number;
  activeCount: number;
  upcomingCount: number;
  pausedCount: number;
  currencyCode: string;
};

export function RecurringIncomeSummaryBar({
  monthlyTotal,
  activeCount,
  upcomingCount,
  pausedCount,
  currencyCode,
}: Props) {
  return (
    <MetricSummaryBar
      items={[
        {
          key: "monthly",
          icon: TrendingUp,
          value: formatCurrency(monthlyTotal, currencyCode),
          label: "al mes",
          color: COLORS.income,
          strong: true,
          helpTitle: "Ingreso mensual estimado",
          helpDescription: "Suma los ingresos fijos activos convertidos a un equivalente mensual en la moneda base del workspace.",
        },
        {
          key: "active",
          icon: CalendarClock,
          value: String(activeCount),
          label: "activos",
          color: COLORS.primary,
          helpTitle: "Ingresos activos",
          helpDescription: "Cantidad de ingresos fijos activos que se consideran para próximas llegadas y para el total mensual estimado.",
        },
        {
          key: "paused",
          icon: Pause,
          value: String(pausedCount),
          label: "pausados",
          compactLabel: "pausa",
          color: pausedCount > 0 ? COLORS.gold : COLORS.storm,
          helpTitle: "Ingresos pausados",
          helpDescription: `Cantidad de ingresos fijos pausados. No se suman al estimado mensual ni generan próximas llegadas. Activos próximos en 30 días: ${upcomingCount}.`,
        },
      ]}
    />
  );
}
