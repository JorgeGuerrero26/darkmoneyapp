
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
  const partes = [`${activeCount} activa${activeCount === 1 ? "" : "s"}`];
  if (pausedCount > 0) partes.push(`${pausedCount} pausada${pausedCount === 1 ? "" : "s"}, no suma al mes`);

  return (
    <MetricSummaryBar
      label="Al mes"
      value={formatCurrency(monthlyTotal, currencyCode)}
      valueColor={COLORS.expense}
      support={partes.join(" · ")}
      help={{
        title: "Gasto mensual en suscripciones",
        description: "Suma de tus suscripciones activas llevada a su equivalente mensual.",
      }}
    />
  );
}
