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
  const partes = [`${activeCount} activo${activeCount === 1 ? "" : "s"}`];
  if (upcomingCount > 0) partes.push(`${upcomingCount} por llegar`);
  if (pausedCount > 0) partes.push(`${pausedCount} pausado${pausedCount === 1 ? "" : "s"}`);

  return (
    <MetricSummaryBar
      label="Al mes"
      value={formatCurrency(monthlyTotal, currencyCode)}
      valueColor={COLORS.income}
      support={partes.join(" · ")}
      help={{
        title: "Ingreso mensual recurrente",
        description: "Suma de tus ingresos fijos activos llevada a su equivalente mensual.",
      }}
    />
  );
}
