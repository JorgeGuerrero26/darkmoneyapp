import { formatCurrency } from "../../../components/ui/AmountDisplay";
import { MetricSummaryBar } from "../../../components/ui/MetricSummaryBar";
import { COLORS } from "../../../constants/theme";

type Props = {
  monthlyTotal: number | null;
  activeCount: number;
  unconfirmedCount: number;
  excludedCount: number;
  currencyCode: string;
};

export function RecurringIncomeSummaryBar({
  monthlyTotal,
  activeCount,
  unconfirmedCount,
  excludedCount,
  currencyCode,
}: Props) {
  const activeLabel = `${activeCount} ${activeCount === 1 ? "ingreso activo" : "ingresos activos"}`;
  const pendingLabel = unconfirmedCount > 0
    ? ` · ${unconfirmedCount} por confirmar`
    : " · todo al día";
  const excludedLabel = excludedCount === 1
    ? "1 ingreso en otra moneda sin conversión queda fuera del total."
    : `${excludedCount} ingresos en otras monedas sin conversión quedan fuera del total.`;

  return (
    <MetricSummaryBar
      /* "Al mes" en menta sonaba a plata que entró. Esto es lo que se ESPERA, y hasta que no
         llega no es un ingreso: va en hueso y el rótulo lo dice. La menta se reserva para el
         ingreso ya confirmado, en Movimientos, que es donde significa algo. */
      label="Esperado al mes"
      value={monthlyTotal == null ? null : formatCurrency(monthlyTotal, currencyCode)}
      valueColor={COLORS.ink}
      support={`${activeLabel}${pendingLabel}`}
      footnote={excludedCount > 0 ? excludedLabel : null}
      help={{
        title: "Ingreso mensual esperado",
        description: "Suma de tus ingresos fijos activos según la frecuencia de cada uno. No incluye ingresos pausados ni confirma que el dinero haya llegado.",
      }}
    />
  );
}
