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
  const activos = activeCount === 1 ? "Uno activo" : `${activeCount} activos`;
  const pausados = pausedCount === 0
    ? null
    : pausedCount === 1
      ? "El pausado no suma."
      : "Los pausados no suman.";

  return (
    <MetricSummaryBar
      /* "Al mes" en menta sonaba a plata que entró. Esto es lo que se ESPERA, y hasta que no
         llega no es un ingreso: va en hueso y el rótulo lo dice. La menta se reserva para el
         ingreso ya confirmado, en Movimientos, que es donde significa algo. */
      label="Esperado al mes"
      value={formatCurrency(monthlyTotal, currencyCode)}
      valueColor={COLORS.ink}
      support={[`${activos}.`, pausados].filter(Boolean).join(" ")}
      help={{
        title: "Ingreso mensual esperado",
        description: "Suma de tus ingresos fijos activos llevada a su equivalente mensual. No incluye los pausados ni confirma que hayan llegado.",
      }}
    />
  );
}
