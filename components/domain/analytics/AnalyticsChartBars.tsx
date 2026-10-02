import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { formatCurrency } from "../../ui/AmountDisplay";
import { formatSignedCurrencyValue } from "../../../lib/obligation-analytics-helpers";
import type { MonthlySeriesPoint, MonthlySeriesScope } from "../../../lib/obligation-monthly-series";
import { COLORS, FONT_FAMILY, FONT_SIZE, RADIUS, SPACING, SURFACE } from "../../../constants/theme";

type Props = {
  title: string;
  series: MonthlySeriesPoint[];
  maxAbsValue: number;
  currency: string;
  signedDisplay: boolean;
  chartScope: MonthlySeriesScope;
  onChangeChartScope: (scope: MonthlySeriesScope) => void;
};

const OPTIONS: { id: MonthlySeriesScope; label: string }[] = [
  { id: "6", label: "6 meses" },
  { id: "12", label: "12 meses" },
  { id: "all", label: "Todo" },
];

export function AnalyticsChartBars({
  title,
  series,
  maxAbsValue,
  currency,
  signedDisplay,
  chartScope,
  onChangeChartScope,
}: Props) {
  const hasActivity = series.some((month) => month.total !== 0);

  return (
    <View style={styles.section}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.subtitle}>{signedDisplay ? "Solo movimientos asociados a una cuenta" : "Importes registrados por mes"}</Text>
      <View style={styles.selector}>
        {OPTIONS.map((option) => (
          <TouchableOpacity
            key={option.id}
            style={[styles.segment, chartScope === option.id && styles.segmentSelected]}
            onPress={() => onChangeChartScope(option.id)}
            accessibilityRole="button"
            accessibilityState={{ selected: chartScope === option.id }}
          >
            <Text style={[styles.segmentText, chartScope === option.id && styles.segmentTextSelected]}>{option.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {hasActivity ? series.map((month) => {
        const width = `${Math.max(2, Math.abs(month.total) / maxAbsValue * (signedDisplay ? 50 : 100))}%` as const;
        return (
          <View key={month.key} style={styles.monthRow}>
            <Text style={styles.monthLabel}>{month.label}</Text>
            <View style={styles.track}>
              {signedDisplay ? <View style={styles.zeroLine} /> : null}
              {month.total !== 0 ? (
                <View style={[
                  styles.fill,
                  {
                    width,
                    left: signedDisplay ? month.total > 0 ? "50%" : undefined : 0,
                    right: signedDisplay && month.total < 0 ? "50%" : undefined,
                  },
                ]} />
              ) : null}
            </View>
            <Text style={[styles.monthValue, signedDisplay && month.total !== 0 && { color: month.total > 0 ? COLORS.income : COLORS.expense }]} numberOfLines={1} adjustsFontSizeToFit>
              {month.total === 0 ? "—" : signedDisplay ? formatSignedCurrencyValue(month.total, currency) : formatCurrency(month.total, currency)}
            </Text>
          </View>
        );
      }) : (
        <Text style={styles.empty}>Aún no hay pagos en este período.</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginTop: SPACING.xxxl },
  title: { fontFamily: FONT_FAMILY.heading, fontSize: FONT_SIZE.xl, color: COLORS.ink },
  subtitle: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.sm, color: COLORS.storm, marginTop: SPACING.xs },
  selector: { flexDirection: "row", alignSelf: "flex-start", padding: SPACING.xs / 2, backgroundColor: SURFACE.card, borderRadius: RADIUS.md, marginTop: SPACING.md, marginBottom: SPACING.sm },
  segment: { paddingHorizontal: SPACING.md, minHeight: 36, justifyContent: "center", borderRadius: RADIUS.sm },
  segmentSelected: { backgroundColor: SURFACE.cardBorder },
  segmentText: { fontFamily: FONT_FAMILY.bodyMedium, fontSize: FONT_SIZE.sm, color: COLORS.storm },
  segmentTextSelected: { fontFamily: FONT_FAMILY.bodySemibold, color: COLORS.ink },
  monthRow: { minHeight: 52, flexDirection: "row", alignItems: "center", gap: SPACING.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: SURFACE.separator },
  monthLabel: { width: 64, fontFamily: FONT_FAMILY.bodyMedium, fontSize: FONT_SIZE.sm, color: COLORS.ink, textTransform: "capitalize" },
  track: { flex: 1, height: 6, borderRadius: RADIUS.full, backgroundColor: SURFACE.track, overflow: "hidden" },
  zeroLine: { position: "absolute", left: "50%", width: 1, height: "100%", backgroundColor: COLORS.storm },
  fill: { position: "absolute", height: "100%", borderRadius: RADIUS.full, backgroundColor: COLORS.ink },
  monthValue: { width: 88, textAlign: "right", fontFamily: FONT_FAMILY.heading, fontSize: FONT_SIZE.sm, color: COLORS.ink },
  empty: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.sm, color: COLORS.storm, paddingVertical: SPACING.lg },
});
