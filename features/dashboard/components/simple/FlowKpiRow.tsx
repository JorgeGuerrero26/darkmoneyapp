import { View } from "react-native";

import { COLORS } from "../../../../constants/theme";
import { pctChange } from "../../lib/aggregations";
import { MetricSummaryCard } from "../shared/MetricSummaryCard";
import { dashboardSimpleStyles as subStyles } from "./styles";

type FlowRowProps = {
  income: number;
  expense: number;
  net: number;
  currency: string;
  prevIncome: number;
  prevExpense: number;
};

export function FlowRow({ income, expense, net, currency, prevIncome, prevExpense }: FlowRowProps) {
  const incomePct = pctChange(income, prevIncome);
  const expPct = pctChange(expense, prevExpense);

  return (
    <View style={subStyles.kpiRow}>
      <MetricSummaryCard
        label="Ingresos"
        value={income}
        currency={currency}
        change={incomePct}
        higherIsGood
        accent={COLORS.pine}
      />
      <MetricSummaryCard
        label="Gastos"
        value={expense}
        currency={currency}
        change={expPct}
        higherIsGood={false}
        accent={COLORS.rosewood}
      />
      <MetricSummaryCard
        label="Neto"
        value={net}
        currency={currency}
        accent={net >= 0 ? COLORS.pine : COLORS.rosewood}
      />
    </View>
  );
}
