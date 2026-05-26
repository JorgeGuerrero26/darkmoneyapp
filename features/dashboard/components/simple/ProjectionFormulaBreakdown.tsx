import { Text, View } from "react-native";

import { formatCurrency } from "../../../../components/ui/AmountDisplay";
import { dashboardSimpleStyles as subStyles } from "./styles";

type ProjectionFormulaBreakdownProps = {
  activeCurrency: string;
  currentVisibleBalance: number;
  visibleBalanceLabel: string;
  visibleAccountSummary: string;
  committedNet: number;
  variableNet: number;
  expectedBalance: number;
};

export function ProjectionFormulaBreakdown({
  activeCurrency,
  currentVisibleBalance,
  visibleBalanceLabel,
  visibleAccountSummary,
  committedNet,
  variableNet,
  expectedBalance,
}: ProjectionFormulaBreakdownProps) {
  const rows = [
    { label: "Saldo visible", detail: visibleBalanceLabel, amount: currentVisibleBalance, tone: "base" as const },
    {
      label: "Agenda comprometida",
      detail: "Ingresos fijos, obligaciones y suscripciones",
      amount: committedNet,
      tone: committedNet >= 0 ? ("positive" as const) : ("negative" as const),
    },
    {
      label: "Ritmo variable",
      detail: "Proyección desde tu ritmo reciente",
      amount: variableNet,
      tone: variableNet >= 0 ? ("positive" as const) : ("negative" as const),
    },
  ];

  return (
    <View style={subStyles.projectionFormulaBox}>
      <View style={subStyles.projectionFormulaHeader}>
        <Text style={subStyles.projectionFormulaKicker}>Fórmula del cierre</Text>
        <Text style={subStyles.projectionFormulaTotal}>{formatCurrency(expectedBalance, activeCurrency)}</Text>
      </View>
      <Text style={subStyles.projectionFormulaSummary}>{visibleAccountSummary}</Text>
      <View style={subStyles.projectionFormulaRows}>
        {rows.map((row) => (
          <View key={row.label} style={subStyles.projectionFormulaRow}>
            <View style={subStyles.projectionFormulaCopy}>
              <Text style={subStyles.projectionFormulaLabel}>{row.label}</Text>
              <Text style={subStyles.projectionFormulaDetail}>{row.detail}</Text>
            </View>
            <Text
              style={[
                subStyles.projectionFormulaAmount,
                row.tone === "positive" && subStyles.projectionFormulaAmountPositive,
                row.tone === "negative" && subStyles.projectionFormulaAmountNegative,
              ]}
            >
              {row.amount >= 0 && row.tone !== "base" ? "+" : ""}
              {formatCurrency(row.amount, activeCurrency)}
            </Text>
          </View>
        ))}
      </View>
      <View style={subStyles.projectionFormulaEquals}>
        <Text style={subStyles.projectionFormulaEqualsText}>Resultado esperado</Text>
        <Text style={subStyles.projectionFormulaEqualsAmount}>{formatCurrency(expectedBalance, activeCurrency)}</Text>
      </View>
    </View>
  );
}
