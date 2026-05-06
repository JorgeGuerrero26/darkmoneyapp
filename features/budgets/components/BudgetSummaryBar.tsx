import { AlertTriangle, PiggyBank, Target } from "lucide-react-native";

import { formatCurrency } from "../../../components/ui/AmountDisplay";
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
  return (
    <MetricSummaryBar
      items={[
        {
          key: "limit",
          icon: Target,
          value: formatCurrency(limitTotal, currencyCode),
          label: "límite",
          color: COLORS.primary,
          helpTitle: "Límite total",
          helpDescription: "Suma de los límites de los presupuestos visibles con los filtros actuales, convertida a la moneda base.",
        },
        {
          key: "spent",
          icon: PiggyBank,
          value: formatCurrency(spentTotal, currencyCode),
          label: "gastado",
          color: spentTotal > limitTotal ? COLORS.expense : COLORS.storm,
          helpTitle: "Gasto acumulado",
          helpDescription: "Suma de los movimientos reales que consumen los presupuestos visibles dentro de sus períodos y alcances configurados.",
        },
        {
          key: "remaining",
          icon: AlertTriangle,
          value: formatCurrency(Math.abs(remainingTotal), currencyCode),
          label: attentionCount > 0 ? `${attentionCount} alerta` : "disponible",
          compactLabel: attentionCount > 0 ? `${attentionCount} alerta` : "libre",
          color: remainingTotal < 0 ? COLORS.expense : COLORS.income,
          strong: true,
          helpTitle: attentionCount > 0 ? "Presupuestos con alerta" : "Disponible total",
          helpDescription: attentionCount > 0
            ? "Cantidad de presupuestos visibles que están cerca del límite o ya lo superaron."
            : "Monto disponible antes de llegar al límite total de los presupuestos visibles.",
        },
      ]}
    />
  );
}
