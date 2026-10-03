import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { ChevronDown } from "lucide-react-native";

import { COLORS, FONT_FAMILY, FONT_SIZE, RADIUS, SPACING, SURFACE } from "../../constants/theme";
import { buildRecurringIncomeAnalytics } from "../../features/recurring-income/lib/buildRecurringIncomeAnalytics";
import { parseDisplayDate } from "../../lib/date";
import { useWorkspace } from "../../lib/workspace-context";
import { useRecurringIncomeOccurrencesQuery } from "../../services/queries/workspace-data";
import type { ExchangeRateSummary, RecurringIncomeOccurrenceSummary, RecurringIncomeSummary } from "../../types/domain";
import { AnalyticsRow } from "../ui/AnalyticsRow";
import { formatCurrency } from "../ui/AmountDisplay";
import { BottomSheet } from "../ui/BottomSheet";

type Props = {
  visible: boolean;
  item: RecurringIncomeSummary | null;
  baseCurrencyCode: string;
  exchangeRates: ExchangeRateSummary[];
  onClose: () => void;
};

type ArrivalFilter = "all" | "on_time" | "late";

const ARRIVAL_FILTERS: { id: ArrivalFilter; label: string }[] = [
  { id: "all", label: "Todas" },
  { id: "on_time", label: "A tiempo" },
  { id: "late", label: "Tarde" },
];
const EMPTY_OCCURRENCES: RecurringIncomeOccurrenceSummary[] = [];

function formatArrivalDate(date: string) {
  return format(parseDisplayDate(date), "d MMM yyyy", { locale: es });
}

export function RecurringIncomeAnalyticsModal({
  visible,
  item,
  baseCurrencyCode,
  exchangeRates,
  onClose,
}: Props) {
  const router = useRouter();
  const { activeWorkspaceId } = useWorkspace();
  const { data: occurrences = EMPTY_OCCURRENCES, isLoading, isError, refetch } = useRecurringIncomeOccurrencesQuery(
    activeWorkspaceId,
    visible ? (item?.id ?? null) : null,
  );
  const [showAllMonths, setShowAllMonths] = useState(false);
  const [showAllArrivals, setShowAllArrivals] = useState(false);
  const [arrivalFilter, setArrivalFilter] = useState<ArrivalFilter>("all");
  const [calculationOpen, setCalculationOpen] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setShowAllMonths(false);
    setShowAllArrivals(false);
    setArrivalFilter("all");
    setCalculationOpen(false);
  }, [visible, item?.id]);

  const analysis = useMemo(
    () => buildRecurringIncomeAnalytics(occurrences, baseCurrencyCode, exchangeRates),
    [occurrences, baseCurrencyCode, exchangeRates],
  );
  const filteredArrivals = useMemo(
    () => arrivalFilter === "all"
      ? analysis.rows
      : analysis.rows.filter((row) => row.status === arrivalFilter),
    [analysis.rows, arrivalFilter],
  );

  if (!item) return null;

  const missingConversions = analysis.rows.length - analysis.comparableCount;
  const showComparableTotal = analysis.comparableCount > 0 && (
    analysis.currencies.length > 1
    || analysis.currencies[0]?.currencyCode !== baseCurrencyCode.toUpperCase()
  );
  const visibleMonths = showAllMonths ? analysis.months : analysis.months.slice(-6);
  const maxMonth = Math.max(1, ...analysis.months.map((month) => month.total));
  const hasMonthlyData = analysis.months.some((month) => month.count > 0);
  const visibleArrivals = showAllArrivals ? filteredArrivals : filteredArrivals.slice(0, 5);
  const showLoaded = !isLoading && !(isError && analysis.rows.length === 0);

  const openMovement = (movementId: number) => {
    onClose();
    router.push({ pathname: "/movement/[id]", params: { id: String(movementId), from: "recurring-income" } });
  };

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title="Analítica de ingreso fijo"
      entranceAnimation="springFade"
      snapHeight={0.9}
      headerStyle={styles.header}
      contentStyle={styles.content}
    >
      <Text style={styles.subtitle}>{item.name}</Text>

      <View style={styles.hero}>
        <Text style={styles.kicker}>MONTO POR LLEGADA</Text>
        <Text style={styles.heroAmount} adjustsFontSizeToFit numberOfLines={1}>
          {formatCurrency(item.amount, item.currencyCode)}
        </Text>
        <Text style={styles.heroDetail}>
          {item.frequencyLabel}
          {item.status === "active" ? " · Próxima: " + formatArrivalDate(item.nextExpectedDate) : ""}
        </Text>
      </View>

      {isLoading ? (
        <View style={styles.feedback}>
          <ActivityIndicator color={COLORS.storm} />
          <Text style={styles.empty}>Cargando llegadas…</Text>
        </View>
      ) : isError && analysis.rows.length === 0 ? (
        <View style={styles.feedback}>
          <Text style={styles.empty}>No se pudieron cargar las llegadas.</Text>
          <Pressable onPress={() => { void refetch(); }} accessibilityRole="button">
            <Text style={styles.retry}>Reintentar</Text>
          </Pressable>
        </View>
      ) : null}

      {showLoaded ? <>
        {isError ? (
          <Text style={styles.note}>No se pudo actualizar. Se muestran las llegadas guardadas.</Text>
        ) : null}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Llegadas anotadas</Text>
          <Text style={styles.sectionSubtitle}>
            {analysis.rows.length === 0
              ? "Aún no hay llegadas registradas"
              : analysis.rows.length + (analysis.rows.length === 1 ? " llegada registrada" : " llegadas registradas")}
          </Text>
          {analysis.currencies.map((currency, index) => (
            <AnalyticsRow
              key={currency.currencyCode}
              label={"Total en " + currency.currencyCode}
              detail={currency.count + (currency.count === 1 ? " llegada" : " llegadas")}
              value={formatCurrency(currency.total, currency.currencyCode)}
              last={index === analysis.currencies.length - 1 && !showComparableTotal && analysis.comparableCount === 0}
            />
          ))}
          {showComparableTotal ? (
            <AnalyticsRow
              label={"Total comparable en " + baseCurrencyCode}
              detail={analysis.comparableCount + " de " + analysis.rows.length + " llegadas"}
              value={formatCurrency(analysis.comparableTotal, baseCurrencyCode)}
            />
          ) : null}
          {analysis.comparableCount > 0 ? (
            <AnalyticsRow
              label="Promedio por llegada"
              detail={analysis.comparableCount + " comparables en " + baseCurrencyCode}
              value={formatCurrency(analysis.averageBase, baseCurrencyCode)}
              last
            />
          ) : null}
          {missingConversions > 0 && analysis.rows.length > 0 ? (
            <Text style={styles.note}>
              {missingConversions} {missingConversions === 1 ? "llegada no tiene" : "llegadas no tienen"} conversión a {baseCurrencyCode} y se excluyen del total comparable.
            </Text>
          ) : null}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Puntualidad</Text>
          <Text style={styles.sectionSubtitle}>Según la fecha esperada de cada llegada</Text>
          {analysis.rows.length > 0 ? <>
            <View style={styles.punctualityHeading}>
              <Text style={styles.punctualityValue}>
                {Math.round(analysis.punctualityPct)}%
              </Text>
              <Text style={styles.punctualityDetail}>
                {analysis.onTimeCount} de {analysis.rows.length} a tiempo
              </Text>
            </View>
            <View style={styles.track}>
              <View style={[styles.punctualityFill, { width: `${analysis.punctualityPct}%` as const }]} />
            </View>
            <AnalyticsRow label="A tiempo" value={String(analysis.onTimeCount)} />
            <AnalyticsRow
              label="Con retraso"
              value={String(analysis.lateCount)}
              valueColor={analysis.lateCount > 0 ? COLORS.gold : undefined}
            />
            <AnalyticsRow
              label="Retraso promedio"
              detail="Entre las llegadas tardías"
              value={analysis.lateCount > 0 ? Math.round(analysis.averageLateDays) + " días" : "—"}
              last
            />
          </> : <Text style={styles.empty}>Anota una llegada para ver si llegó a tiempo.</Text>}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Mes a mes</Text>
          <Text style={styles.sectionSubtitle}>
            Llegadas comparables en {baseCurrencyCode}
            {missingConversions > 0 ? " · " + missingConversions + " sin conversión" : ""}
          </Text>
          {hasMonthlyData ? visibleMonths.map((month) => (
            <View key={month.key} style={styles.monthRow}>
              <View style={styles.monthHeading}>
                <Text style={styles.monthLabel}>{month.label}</Text>
                <Text style={styles.monthAmount}>
                  {month.count > 0 ? formatCurrency(month.total, baseCurrencyCode) : "—"}
                </Text>
              </View>
              <View style={styles.track}>
                {month.total > 0 ? (
                  <View style={[styles.monthFill, { width: `${Math.max(2, month.total / maxMonth * 100)}%` as const }]} />
                ) : null}
              </View>
            </View>
          )) : (
            <Text style={styles.empty}>No hay llegadas comparables en los últimos 12 meses.</Text>
          )}
          {hasMonthlyData ? (
            <Pressable
              style={styles.expand}
              onPress={() => setShowAllMonths((value) => !value)}
              accessibilityRole="button"
              accessibilityState={{ expanded: showAllMonths }}
            >
              <Text style={styles.expandLabel}>{showAllMonths ? "Ver 6 meses" : "Ver 12 meses"}</Text>
              <ChevronDown size={16} color={COLORS.storm} style={showAllMonths && styles.chevronOpen} />
            </Pressable>
          ) : null}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Historial de llegadas</Text>
          <Text style={styles.sectionSubtitle}>Toca una llegada vinculada para abrir su movimiento</Text>
          <View style={styles.selector}>
            {ARRIVAL_FILTERS.map((filter) => (
              <Pressable
                key={filter.id}
                style={[styles.segment, arrivalFilter === filter.id && styles.segmentSelected]}
                onPress={() => { setArrivalFilter(filter.id); setShowAllArrivals(false); }}
                accessibilityRole="button"
                accessibilityState={{ selected: arrivalFilter === filter.id }}
              >
                <Text style={[styles.segmentText, arrivalFilter === filter.id && styles.segmentTextSelected]}>
                  {filter.label}
                </Text>
              </Pressable>
            ))}
          </View>
          {visibleArrivals.length > 0 ? visibleArrivals.map((arrival, index) => (
            <AnalyticsRow
              key={arrival.id}
              label={formatArrivalDate(arrival.actualDate)}
              detail={arrival.status === "late"
                ? "Llegó " + arrival.latenessDays + (arrival.latenessDays === 1 ? " día tarde" : " días tarde")
                : "A tiempo"}
              value={"+" + formatCurrency(arrival.amount, arrival.currencyCode)}
              valueColor={COLORS.income}
              onPress={arrival.movementId ? () => openMovement(arrival.movementId!) : undefined}
              last={index === visibleArrivals.length - 1}
            />
          )) : (
            <Text style={styles.empty}>
              {analysis.rows.length === 0 ? "Todavía no hay llegadas anotadas." : "No hay llegadas con este filtro."}
            </Text>
          )}
          {filteredArrivals.length > 5 ? (
            <Pressable
              style={styles.expand}
              onPress={() => setShowAllArrivals((value) => !value)}
              accessibilityRole="button"
              accessibilityState={{ expanded: showAllArrivals }}
            >
              <Text style={styles.expandLabel}>
                {showAllArrivals ? "Mostrar menos" : "Ver las " + filteredArrivals.length + " llegadas"}
              </Text>
              <ChevronDown size={16} color={COLORS.storm} style={showAllArrivals && styles.chevronOpen} />
            </Pressable>
          ) : null}
        </View>

        <Pressable
          style={styles.calculationRow}
          onPress={() => setCalculationOpen((value) => !value)}
          accessibilityRole="button"
          accessibilityState={{ expanded: calculationOpen }}
        >
          <Text style={styles.calculationLabel}>Cómo se calcula</Text>
          <ChevronDown size={16} color={COLORS.storm} style={calculationOpen && styles.chevronOpen} />
        </Pressable>
        {calculationOpen ? (
          <Text style={styles.calculationText}>
            El monto por llegada viene del ingreso fijo guardado. Los totales usan solo llegadas anotadas. La puntualidad compara la fecha real con la fecha esperada; el retraso promedio considera solo llegadas tardías. Cada moneda se suma por separado y el gráfico incluye únicamente importes convertibles a {baseCurrencyCode}.
          </Text>
        ) : null}
      </> : null}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: SPACING.xl, borderBottomWidth: 0 },
  content: { paddingHorizontal: SPACING.xl, paddingTop: SPACING.sm, paddingBottom: SPACING.xxxl },
  subtitle: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.sm, color: COLORS.storm },
  hero: { paddingTop: SPACING.lg, paddingBottom: SPACING.xl, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: SURFACE.separator },
  kicker: { fontFamily: FONT_FAMILY.bodyMedium, fontSize: FONT_SIZE.xs, letterSpacing: 1, color: COLORS.storm },
  heroAmount: { fontFamily: FONT_FAMILY.heading, fontSize: FONT_SIZE.display, color: COLORS.ink, marginTop: SPACING.sm },
  heroDetail: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.sm, color: COLORS.storm, marginTop: SPACING.xs },
  section: { marginTop: SPACING.xl },
  sectionTitle: { fontFamily: FONT_FAMILY.heading, fontSize: FONT_SIZE.xl, color: COLORS.ink },
  sectionSubtitle: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.sm, color: COLORS.storm, marginTop: SPACING.xs, marginBottom: SPACING.sm },
  empty: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.sm, color: COLORS.storm, paddingVertical: SPACING.md },
  feedback: { minHeight: 160, alignItems: "center", justifyContent: "center", gap: SPACING.md },
  retry: { fontFamily: FONT_FAMILY.bodySemibold, fontSize: FONT_SIZE.sm, color: COLORS.ink },
  note: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.sm, lineHeight: 19, color: COLORS.storm, paddingTop: SPACING.sm },
  punctualityHeading: { flexDirection: "row", alignItems: "baseline", gap: SPACING.md, marginTop: SPACING.md, marginBottom: SPACING.sm },
  punctualityValue: { fontFamily: FONT_FAMILY.heading, fontSize: FONT_SIZE.xxxl, color: COLORS.ink },
  punctualityDetail: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.sm, color: COLORS.storm },
  track: { height: 5, backgroundColor: SURFACE.track, borderRadius: RADIUS.full, overflow: "hidden" },
  punctualityFill: { height: "100%", backgroundColor: COLORS.ink, borderRadius: RADIUS.full },
  monthRow: { minHeight: 52, justifyContent: "center", gap: SPACING.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: SURFACE.separator },
  monthHeading: { flexDirection: "row", justifyContent: "space-between", gap: SPACING.sm },
  monthLabel: { fontFamily: FONT_FAMILY.bodyMedium, fontSize: FONT_SIZE.sm, color: COLORS.ink, textTransform: "capitalize" },
  monthAmount: { fontFamily: FONT_FAMILY.heading, fontSize: FONT_SIZE.sm, color: COLORS.ink },
  monthFill: { height: "100%", backgroundColor: COLORS.ink, borderRadius: RADIUS.full },
  expand: { minHeight: 48, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  expandLabel: { fontFamily: FONT_FAMILY.bodyMedium, fontSize: FONT_SIZE.sm, color: COLORS.fog },
  chevronOpen: { transform: [{ rotate: "180deg" }] },
  selector: { flexDirection: "row", alignSelf: "flex-start", padding: SPACING.xs / 2, backgroundColor: SURFACE.card, borderRadius: RADIUS.md, marginTop: SPACING.sm, marginBottom: SPACING.sm },
  segment: { paddingHorizontal: SPACING.md, minHeight: 36, justifyContent: "center", borderRadius: RADIUS.sm },
  segmentSelected: { backgroundColor: SURFACE.cardBorder },
  segmentText: { fontFamily: FONT_FAMILY.bodyMedium, fontSize: FONT_SIZE.sm, color: COLORS.storm },
  segmentTextSelected: { fontFamily: FONT_FAMILY.bodySemibold, color: COLORS.ink },
  calculationRow: { minHeight: 56, marginTop: SPACING.xl, flexDirection: "row", alignItems: "center", borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: SURFACE.separator },
  calculationLabel: { flex: 1, fontFamily: FONT_FAMILY.bodyMedium, fontSize: FONT_SIZE.md, color: COLORS.fog },
  calculationText: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.sm, lineHeight: 21, color: COLORS.storm },
});
