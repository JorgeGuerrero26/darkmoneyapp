import { AlertTriangle, PiggyBank, Target } from "lucide-react-native";

import { formatAmountPlain, formatCurrency } from "../../../components/ui/AmountDisplay";
import { MetricSummaryBar } from "../../../components/ui/MetricSummaryBar";
import { COLORS } from "../../../constants/theme";

type Props = {
  limitTotal: number;
  spentTotal: number;
  remainingTotal: number;
  attentionCount: number;
  currencyCode: string;
};

export function BudgetSummaryBar({
  limitTotal,
  spentTotal,
  remainingTotal,
  attentionCount,
  currencyCode,
}: Props) {
  const excedido = remainingTotal < 0;
  const partes = [
    `${formatCurrency(spentTotal, currencyCode)} de ${formatCurrency(limitTotal, currencyCode)}`,
  ];
  if (attentionCount > 0) {
    partes.push(`${attentionCount} presupuesto${attentionCount === 1 ? "" : "s"} cerca del tope`);
  }

  return (
    <MetricSummaryBar
      label={excedido ? "Te pasaste" : "Disponible"}
      value={formatCurrency(Math.abs(remainingTotal), currencyCode)}
      valueColor={excedido ? COLORS.expense : COLORS.ink}
      support={partes.join(" · ")}
      help={{
        title: excedido ? "Te pasaste del tope" : "Disponible",
        description: "Diferencia entre el tope de tus presupuestos activos y lo que llevas gastado.",
      }}
    />
  );
}
