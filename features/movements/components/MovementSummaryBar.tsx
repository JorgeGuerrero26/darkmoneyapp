import { TrendingDown, TrendingUp } from "lucide-react-native";

import { formatCurrency } from "../../../components/ui/AmountDisplay";
import { MetricSummaryBar } from "../../../components/ui/MetricSummaryBar";
import { COLORS } from "../../../constants/theme";

type MovementFilterSummary = {
  incomeTotal: number;
  expenseTotal: number;
  incomeCount: number;
  expenseCount: number;
  net: number;
};

type Props = {
  summary: MovementFilterSummary;
  baseCurrency: string;
  partial?: boolean;
};

export function MovementSummaryBar({ summary, baseCurrency, partial }: Props) {
  return (
    <MetricSummaryBar
      items={[
        {
          key: "income",
          icon: TrendingUp,
          value: formatCurrency(summary.incomeTotal, baseCurrency),
          label: `${summary.incomeCount} mov`,
          color: COLORS.income,
          helpTitle: "Ingresos filtrados",
          helpDescription: "Total de movimientos de ingreso que coinciden con la búsqueda y filtros actuales. Se muestra en la moneda base.",
        },
        {
          key: "expense",
          icon: TrendingDown,
          value: formatCurrency(summary.expenseTotal, baseCurrency),
          label: `${summary.expenseCount} mov`,
          color: COLORS.expense,
          helpTitle: "Gastos filtrados",
          helpDescription: "Total de movimientos de gasto que coinciden con la búsqueda y filtros actuales. Se muestra en la moneda base.",
        },
        {
          key: "net",
          value: `${summary.net >= 0 ? "+" : "-"}${formatCurrency(Math.abs(summary.net), baseCurrency)}`,
          label: "neto",
          color: summary.net >= 0 ? COLORS.income : COLORS.expense,
          strong: true,
          helpTitle: "Neto del filtro",
          helpDescription: "Diferencia entre ingresos y gastos visibles. Si es positivo entró más dinero; si es negativo salió más dinero.",
        },
      ]}
      trailingLabel={partial ? "parcial ↓" : null}
    />
  );
}
