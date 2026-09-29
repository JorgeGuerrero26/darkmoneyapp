import { useState } from "react";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { ArrowRight, ChevronDown, Sparkles } from "lucide-react-native";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";

import { formatCurrency } from "../../../../components/ui/AmountDisplay";
import { COLORS, FONT_FAMILY, FONT_SIZE, RADIUS, SPACING, SURFACE } from "../../../../constants/theme";
import { displayCategoryName } from "../../../../lib/category-display-name";
import type { HistoryFactorAnalysis } from "../../../../services/analytics/history-factor-analysis";
import { historyYearTotals, monthReading, observedHistoryMonths, recentNetComparison, type HistoryMonth } from "../../lib/history-view";
import type { AnnualHistoryMonth } from "./DashboardCharts";

type Props = {
  years: number[];
  selectedYear: number;
  onSelectYear: (year: number) => void;
  months: AnnualHistoryMonth[];
  currency: string;
  loading: boolean;
  error: boolean;
  onRetry: () => void;
  factorAnalysis: HistoryFactorAnalysis | null;
  seasonalComparison: { expenseLabel: string; curExpense: number; prevExpense: number } | null;
  onOpenMonth: (month: AnnualHistoryMonth) => void;
  onOpenCategory: (categoryId: number | null, name: string) => void;
  onOpenAi: () => void;
};

function balanceAmount(value: number, currency: string) {
  return `${value < 0 ? "−" : "+"}${formatCurrency(Math.abs(value), currency)}`;
}

function periodLabel(months: HistoryMonth[]) {
  return `${format(parseISO(months[0].dateFrom), "MMM", { locale: es })} – ${format(parseISO(months[months.length - 1].dateFrom), "MMM", { locale: es })}`;
}

export function HistoryTab({ years, selectedYear, onSelectYear, months, currency, loading, error, onRetry, factorAnalysis, seasonalComparison, onOpenMonth, onOpenCategory, onOpenAi }: Props) {
  const [showAllMonths, setShowAllMonths] = useState(false);
  const observed = observedHistoryMonths(months);
  const descending = [...observed].reverse();
  const totals = historyYearTotals(months);
  const comparison = recentNetComparison(months);
  const maxNet = Math.max(1, ...observed.map((month) => Math.abs(month.net)));
  const factors = factorAnalysis?.topCategories.filter((category) => category.direction === "sube_con_el_cambio") ?? [];
  const currentMonth = format(new Date(), "yyyy-MM");

  return <View style={styles.page}>
    <View style={styles.section}>
      <View style={styles.segment}>
        {years.map((year) => <Pressable key={year} style={[styles.segmentItem, year === selectedYear && styles.segmentActive]} onPress={() => { onSelectYear(year); setShowAllMonths(false); }} accessibilityRole="button" accessibilityState={{ selected: year === selectedYear }}>
          <Text style={[styles.segmentText, year === selectedYear && styles.segmentTextActive]}>{year}</Text>
        </Pressable>)}
      </View>
      {loading ? <View style={styles.loading}><ActivityIndicator color={COLORS.storm} /><Text style={styles.meta}>Cargando historial anual…</Text></View> : error ? <Pressable style={styles.loading} onPress={onRetry} accessibilityRole="button"><Text style={styles.meta}>No se pudo cargar el historial. Toca para reintentar.</Text></Pressable> : observed.length === 0 ? <Text style={styles.meta}>Aún no hay ingresos ni gastos registrados en {selectedYear}.</Text> : <>
        <Text style={styles.meta}>{selectedYear === new Date().getFullYear() ? "Te quedaste en lo que va del año" : `Te quedaste en ${selectedYear}`}</Text>
        <Text style={[styles.hero, totals.net < 0 ? styles.negativeTone : styles.positiveTone]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.65}>{balanceAmount(totals.net, currency)}</Text>
        {totals.savingsRate == null ? <Text style={styles.meta}>Aún no hay ingresos para calcular el ahorro.</Text> : <Text style={styles.meta}>{totals.savingsRate >= 0 ? "Ahorraste" : "Salió de más"} el <Text style={totals.savingsRate >= 0 ? styles.positiveTone : styles.negativeTone}>{Math.abs(totals.savingsRate).toFixed(1)}%</Text> de lo que entró</Text>}
        <View style={styles.amountRow}><Text style={styles.rowLabel}>Entró</Text><Text style={styles.rowAmount}>{formatCurrency(totals.income, currency)}</Text></View>
        <View style={styles.amountRow}><Text style={styles.rowLabel}>Salió</Text><Text style={styles.rowAmount}>{formatCurrency(totals.expense, currency)}</Text></View>
        <View style={styles.chart} accessibilityLabel="Saldo neto de cada mes del año">
          {months.map((month) => {
            const hasData = !month.isFuture && (month.income > 0.009 || month.expense > 0.009);
            const height = hasData ? Math.max(3, Math.abs(month.net) / maxNet * 66) : 0;
            return <Pressable key={month.dateFrom} style={styles.chartColumn} onPress={hasData ? () => onOpenMonth(month) : undefined} accessibilityRole={hasData ? "button" : undefined}>
              <View style={styles.chartTop}>{hasData && month.net > 0 ? <View style={[styles.chartBar, styles.chartBarPositive, { height }]} /> : null}</View>
              <View style={styles.zeroLine} />
              <View style={styles.chartBottom}>{hasData && month.net < 0 ? <View style={[styles.chartBar, styles.chartBarNegative, { height }]} /> : null}</View>
              <Text style={styles.chartLabel}>{format(parseISO(month.dateFrom), "MMMMM", { locale: es }).toUpperCase()}</Text>
            </Pressable>;
          })}
        </View>
      </>}
    </View>

    {!loading && !error && observed.length > 0 ? <>
      <Pressable style={styles.aiRow} onPress={onOpenAi} accessibilityRole="button">
        <View style={styles.aiIcon}><Sparkles size={18} color={COLORS.pro} /></View>
        <View style={styles.flex}><Text style={styles.rowTitle}>Informe con IA</Text><Text style={styles.meta}>Cómo cambió tu año, en palabras</Text></View>
        <ArrowRight size={16} color={COLORS.storm} />
      </Pressable>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Mes a mes</Text>
        <Text style={styles.meta}>Lo que te quedó cada mes · toca para ver por qué</Text>
        {descending.length === 0 ? <Text style={styles.meta}>Aún no hay movimientos en este año.</Text> : (showAllMonths ? descending : descending.slice(0, 4)).map((month) => <Pressable key={month.dateFrom} style={styles.detailRow} onPress={() => onOpenMonth(month)} accessibilityRole="button">
          <View style={styles.flex}><Text style={styles.rowTitle}>{format(parseISO(month.dateFrom), "MMMM", { locale: es })}</Text><Text style={styles.meta} numberOfLines={1}>{monthReading(month, months, month.dateFrom.startsWith(currentMonth))}</Text></View>
          <Text style={[styles.rowAmount, month.net < 0 ? styles.negativeTone : styles.positiveTone]} numberOfLines={1}>{balanceAmount(month.net, currency)}</Text>
          <ArrowRight size={15} color={COLORS.storm} />
        </Pressable>)}
        {!showAllMonths && descending.length > 4 ? <Pressable style={styles.expandRow} onPress={() => setShowAllMonths(true)} accessibilityRole="button"><Text style={styles.rowTitle}>Ver los {descending.length} meses</Text><ChevronDown size={16} color={COLORS.storm} /></Pressable> : null}
      </View>

      {comparison ? <View style={styles.comparisonCard}>
        <Text style={styles.kicker}>ÚLTIMOS 3 MESES</Text>
        <Text style={styles.sectionTitle}>{comparison.title}</Text>
        <View style={styles.comparisonValues}>
          <View style={styles.flex}><Text style={styles.meta}>{periodLabel(comparison.recent)}</Text><Text style={styles.rowAmount}>{formatCurrency(comparison.recentAverage, currency)}/mes</Text></View>
          <View style={styles.flex}><Text style={styles.meta}>{periodLabel(comparison.previous)}</Text><Text style={styles.previousAmount}>{formatCurrency(comparison.previousAverage, currency)}/mes</Text></View>
        </View>
      </View> : null}

      {factors.length > 0 ? <View style={styles.section}>
        <Text style={styles.sectionTitle}>Lo que hace variar tus meses</Text>
        <Text style={styles.meta}>Cuando estos gastos suben, el mes sale peor · {selectedYear}</Text>
        {factors.slice(0, 3).map((category, index) => <Pressable key={`${category.categoryId ?? "none"}-${category.name}`} style={styles.detailRow} onPress={() => onOpenCategory(category.categoryId, category.name)} accessibilityRole="button">
          <View style={styles.flex}><Text style={styles.rowTitle} numberOfLines={1}>{displayCategoryName(category.name)}</Text><Text style={styles.meta}>{index === 0 ? "La que más pesa" : "Pesa bastante"}</Text></View>
          <Text style={styles.rowAmount}>{formatCurrency(category.amount, currency)}</Text>
          <ArrowRight size={15} color={COLORS.storm} />
        </Pressable>)}
      </View> : null}

      {seasonalComparison ? <View style={styles.section}>
        <Text style={styles.sectionTitle}>Comparación estacional</Text>
        <Text style={styles.meta}>{seasonalComparison.expenseLabel}</Text>
        <View style={styles.amountRow}><Text style={styles.rowLabel}>Este mes</Text><Text style={styles.rowAmount}>{formatCurrency(seasonalComparison.curExpense, currency)}</Text></View>
        <View style={styles.amountRow}><Text style={styles.rowLabel}>Mismo mes del año pasado</Text><Text style={styles.rowAmount}>{formatCurrency(seasonalComparison.prevExpense, currency)}</Text></View>
      </View> : null}
    </> : null}
  </View>;
}

const styles = StyleSheet.create({
  page: { gap: SPACING.xxxl },
  section: { gap: SPACING.xs },
  segment: { flexDirection: "row", alignSelf: "flex-start", backgroundColor: SURFACE.input, borderRadius: RADIUS.md, padding: 3, marginBottom: SPACING.md },
  segmentItem: { paddingVertical: SPACING.xs, paddingHorizontal: SPACING.lg, borderRadius: RADIUS.sm },
  segmentActive: { backgroundColor: SURFACE.pressed },
  segmentText: { fontFamily: FONT_FAMILY.bodySemibold, fontSize: FONT_SIZE.sm, color: COLORS.storm },
  segmentTextActive: { color: COLORS.ink },
  meta: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.sm, color: COLORS.storm, lineHeight: 20 },
  loading: { minHeight: 160, alignItems: "center", justifyContent: "center", gap: SPACING.md },
  hero: { fontFamily: FONT_FAMILY.heading, fontSize: FONT_SIZE.display, marginVertical: SPACING.xs },
  positiveTone: { color: COLORS.income },
  negativeTone: { color: COLORS.expense },
  amountRow: { minHeight: 50, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: SPACING.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: SURFACE.separator },
  rowLabel: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.md, color: COLORS.fog },
  rowAmount: { fontFamily: FONT_FAMILY.heading, fontSize: FONT_SIZE.md, color: COLORS.ink },
  chart: { flexDirection: "row", gap: 2, marginTop: SPACING.xl },
  chartColumn: { flex: 1, minWidth: 0, alignItems: "center" },
  chartTop: { height: 66, width: "100%", justifyContent: "flex-end", alignItems: "center" },
  chartBottom: { height: 66, width: "100%", justifyContent: "flex-start", alignItems: "center" },
  chartBar: { width: "70%", borderRadius: RADIUS.sm },
  chartBarPositive: { backgroundColor: COLORS.ink },
  chartBarNegative: { backgroundColor: COLORS.expense },
  zeroLine: { height: 1, width: "100%", backgroundColor: SURFACE.separator },
  chartLabel: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.xs, color: COLORS.storm, marginTop: SPACING.xs },
  aiRow: { flexDirection: "row", alignItems: "center", gap: SPACING.md, padding: SPACING.lg, borderRadius: RADIUS.lg, backgroundColor: SURFACE.card, borderWidth: 1, borderColor: SURFACE.cardBorder },
  aiIcon: { width: 36, height: 36, borderRadius: RADIUS.lg, backgroundColor: COLORS.proMuted, alignItems: "center", justifyContent: "center" },
  flex: { flex: 1, minWidth: 0, gap: SPACING.xs },
  rowTitle: { fontFamily: FONT_FAMILY.bodySemibold, fontSize: FONT_SIZE.md, color: COLORS.ink },
  sectionTitle: { fontFamily: FONT_FAMILY.heading, fontSize: FONT_SIZE.lg, color: COLORS.ink },
  detailRow: { minHeight: 72, flexDirection: "row", alignItems: "center", gap: SPACING.sm, paddingVertical: SPACING.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: SURFACE.separator },
  expandRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: SPACING.md },
  comparisonCard: { gap: SPACING.md, padding: SPACING.lg, backgroundColor: SURFACE.card, borderWidth: 1, borderColor: SURFACE.cardBorder, borderRadius: RADIUS.lg },
  kicker: { fontFamily: FONT_FAMILY.bodyMedium, fontSize: FONT_SIZE.xs, color: COLORS.storm },
  comparisonValues: { flexDirection: "row", gap: SPACING.lg },
  previousAmount: { fontFamily: FONT_FAMILY.heading, fontSize: FONT_SIZE.md, color: COLORS.storm },
});
