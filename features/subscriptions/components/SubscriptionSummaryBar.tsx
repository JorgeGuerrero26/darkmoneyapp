
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
  /* "1 activa · 1 pausada, no suma al mes" era una lista de datos con una aclaración pegada.
     Dicho en frases, se lee de un vistazo. */
  const activas = activeCount === 1 ? "Una activa" : `${activeCount} activas`;
  const pausadas = pausedCount === 0
    ? null
    : pausedCount === 1
      ? "La pausada no suma."
      : "Las pausadas no suman.";

  return (
    <MetricSummaryBar
      label="Al mes"
      value={formatCurrency(monthlyTotal, currencyCode)}
      /* Hueso, no clay: es lo que se VA a gastar, no lo que ya se gastó. */
      valueColor={COLORS.ink}
      support={[`${activas}.`, pausadas].filter(Boolean).join(" ")}
      help={{
        title: "Gasto mensual en suscripciones",
        description: "Suma de tus suscripciones activas llevada a su equivalente mensual.",
      }}
    />
  );
}
