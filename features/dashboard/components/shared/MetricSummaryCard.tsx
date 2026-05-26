import { Text, View } from "react-native";

import { formatCurrency } from "../../../../components/ui/AmountDisplay";
import { COLORS } from "../../../../constants/theme";
import { dashboardSimpleStyles as subStyles } from "../simple/styles";

export type MetricSummaryCardProps = {
  label: string;
  /** Numeric value. Will be formatted with formatCurrency when `currency` is provided. */
  value: number;
  /** ISO currency code (PEN/USD/etc). If omitted, value is rendered as a raw number string. */
  currency?: string;
  /** Optional percent change vs previous period. `null` or omitted renders a placeholder so heights stay even. */
  change?: number | null;
  /** When true, positive changes are good (green); when false, negative changes are good. */
  higherIsGood?: boolean;
  /** Color accent applied to the value and to the side indicator. */
  accent: string;
};

/**
 * Compact KPI card: label, currency-formatted value, optional delta % with up/down indicator.
 * Used in the dashboard simple "flow row" (Income / Expense / Net).
 * Replaces the local FlowCard component.
 */
export function MetricSummaryCard({ label, value, currency, change, higherIsGood, accent }: MetricSummaryCardProps) {
  const isGood =
    change !== null && change !== undefined ? (higherIsGood ? change >= 0 : change <= 0) : null;
  const changeColor = isGood === null ? COLORS.storm : isGood ? COLORS.pine : COLORS.rosewood;
  const arrow = change == null ? null : change >= 0 ? "^" : "v";
  const displayValue = currency ? formatCurrency(value, currency) : String(value);

  return (
    <View style={subStyles.kpiCard}>
      <View style={[subStyles.kpiAccent, { backgroundColor: accent + "14" }]} />
      <Text style={subStyles.kpiLabel}>{label}</Text>
      <Text style={[subStyles.kpiValue, { color: accent }]} numberOfLines={1} adjustsFontSizeToFit>
        {displayValue}
      </Text>
      {change !== null && change !== undefined ? (
        <Text style={[subStyles.kpiChange, { color: changeColor }]}>
          {arrow} {Math.abs(change).toFixed(1)}%
        </Text>
      ) : (
        <Text style={subStyles.kpiChangePlaceholder}> </Text>
      )}
    </View>
  );
}
