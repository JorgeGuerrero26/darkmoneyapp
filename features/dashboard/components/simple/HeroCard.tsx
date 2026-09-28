import { Text, TouchableOpacity, View } from "react-native";

import { formatCurrency } from "../../../../components/ui/AmountDisplay";
import { COLORS } from "../../../../constants/theme";
import { useCountUp } from "../../hooks/useCountUp";
import { PERIOD_LABELS } from "../../lib/constants";
import type { Period } from "../../lib/types";
import { dashboardSimpleStyles as subStyles } from "./styles";

type HeroCardProps = {
  netWorth: number;
  income: number;
  expense: number;
  currency: string;
  period: Period;
  setPeriod: (p: Period) => void;
  currencyOptions: string[];
  onCurrencyChange: (c: string) => void;
};

export function HeroCard({
  netWorth,
  income,
  expense,
  currency,
  period,
  setPeriod,
  currencyOptions,
  onCurrencyChange,
}: HeroCardProps) {
  const animNetWorth = useCountUp(netWorth);
  const animIncome = useCountUp(income);
  const animExpense = useCountUp(expense);
  const net = animIncome - animExpense;
  const allPeriods: Period[] = ["today", "week", "month", "last_30"];

  return (
    <View style={subStyles.heroCard}>
      <View style={subStyles.heroTopRow}>
        <Text style={subStyles.heroLabel}>Patrimonio neto</Text>
        {currencyOptions.length > 1 && (
          <View style={subStyles.heroCurrencyRow}>
            {currencyOptions.map((c) => (
              <TouchableOpacity
                key={c}
                style={[subStyles.heroCurrencyBtn, currency === c && subStyles.heroCurrencyBtnActive]}
                onPress={() => onCurrencyChange(c)}
              >
                <Text style={[subStyles.heroCurrencyText, currency === c && subStyles.heroCurrencyTextActive]}>
                  {c}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>

      <Text style={subStyles.heroValue} numberOfLines={1} adjustsFontSizeToFit>
        {formatCurrency(animNetWorth, currency)}
      </Text>

      <View style={subStyles.heroNetPill}>
        <Text style={[subStyles.heroNetText, { color: net >= 0 ? COLORS.pine : COLORS.rosewood }]}>
          {net >= 0 ? "+" : ""}
          {formatCurrency(Math.abs(net), currency)} neto
        </Text>
      </View>

      <View style={subStyles.heroPeriodRow}>
        {allPeriods.map((p) => (
          <TouchableOpacity
            key={p}
            style={[subStyles.heroPeriodBtn, period === p && subStyles.heroPeriodBtnActive]}
            onPress={() => setPeriod(p)}
            accessibilityRole="button"
            accessibilityState={{ selected: period === p }}
          >
            <Text style={[subStyles.heroPeriodText, period === p && subStyles.heroPeriodTextActive]}>
              {PERIOD_LABELS[p]}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={subStyles.heroFlow}>
        <View style={[subStyles.heroFlowItem, subStyles.heroFlowItemFirst]}>
          <Text style={subStyles.heroFlowLabel}>Ingresos</Text>
          <Text style={[subStyles.heroFlowAmt, { color: COLORS.pine }]}>{formatCurrency(animIncome, currency)}</Text>
        </View>
        <View style={subStyles.heroFlowItem}>
          <Text style={subStyles.heroFlowLabel}>Gastos</Text>
          <Text style={[subStyles.heroFlowAmt, { color: COLORS.rosewood }]}>{formatCurrency(animExpense, currency)}</Text>
        </View>
      </View>
    </View>
  );
}
