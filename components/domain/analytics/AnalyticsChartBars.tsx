import {
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import { formatCurrency } from "../../ui/AmountDisplay";
import { formatSignedCurrencyValue } from "../../../lib/obligation-analytics-helpers";
import type {
  MonthlySeriesPoint,
  MonthlySeriesScope,
} from "../../../lib/obligation-monthly-series";
import { styles } from "../ObligationAnalyticsModal.styles";

type ChartScopeOption = {
  id: MonthlySeriesScope;
  label: string;
};

const SCOPE_OPTIONS: readonly ChartScopeOption[] = [
  { id: "6", label: "6 meses" },
  { id: "12", label: "12 meses" },
  { id: "all", label: "Todo" },
];

type Props = {
  title: string;
  series: MonthlySeriesPoint[];
  maxAbsValue: number;
  currency: string;
  signedDisplay: boolean;
  needsScroll: boolean;
  chartScope: MonthlySeriesScope;
  onChangeChartScope: (scope: MonthlySeriesScope) => void;
};

export function AnalyticsChartBars({
  title,
  series,
  maxAbsValue,
  currency,
  signedDisplay,
  needsScroll,
  chartScope,
  onChangeChartScope,
}: Props) {
  const bars = (fixed: boolean) =>
    series.map((m) => (
      <View key={m.key} style={[styles.chartBar, fixed && styles.chartBarFixed]}>
        <View style={styles.barTrack}>
          <View
            style={[
              styles.barFill,
              m.total > 0 ? styles.barFillPositive : m.total < 0 ? styles.barFillNegative : null,
              { height: `${Math.round((Math.abs(m.total) / maxAbsValue) * 100)}%` as any },
              m.total === 0 && styles.barEmpty,
            ]}
          />
        </View>
        <Text style={styles.barLabel} numberOfLines={1}>
          {m.label}
        </Text>
        {m.total !== 0 ? (
          <Text style={styles.barValue} numberOfLines={1}>
            {(signedDisplay
              ? formatSignedCurrencyValue(m.total, currency)
              : formatCurrency(m.total, currency)
            ).replace(/\s/g, "")}
          </Text>
        ) : null}
      </View>
    ));

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {needsScroll ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator
          contentContainerStyle={styles.chartScroll}
        >
          <View style={[styles.chart, styles.chartWide]}>{bars(true)}</View>
        </ScrollView>
      ) : (
        <View style={styles.chart}>{bars(false)}</View>
      )}
      <View style={styles.pillRowWrap}>
        {SCOPE_OPTIONS.map((opt) => (
          <TouchableOpacity
            key={opt.id}
            style={[styles.filterPill, chartScope === opt.id && styles.filterPillActive]}
            onPress={() => onChangeChartScope(opt.id)}
          >
            <Text style={[styles.filterPillText, chartScope === opt.id && styles.filterPillTextActive]}>
              {opt.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}
