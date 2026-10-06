import { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import type { CategoryOverview, CategoryPostedMovement } from "../../types/domain";
import { buildCategoryAnalytics } from "../../features/categories/lib/category-analytics";
import { formatCurrency } from "../ui/AmountDisplay";
import { BottomSheet } from "../ui/BottomSheet";
import { AnalyticsRow } from "../ui/AnalyticsRow";
import { SkeletonCard, SkeletonList } from "../ui/Skeleton";
import { COLORS, FONT_FAMILY, FONT_SIZE, SPACING, SURFACE } from "../../constants/theme";

type Props = { visible: boolean; onClose: () => void; category: CategoryOverview | null; movements: CategoryPostedMovement[]; baseCurrencyCode: string; historyError?: string; loading?: boolean };
const monthLabel = (ym: string) => { const [year, month] = ym.split("-").map(Number); return format(new Date(year, month - 1, 1), "MMM yy", { locale: es }); };

export function CategoryAnalyticsModal({ visible, onClose, category, movements, baseCurrencyCode, historyError, loading = false }: Props) {
  const analytics = useMemo(() => category ? buildCategoryAnalytics(movements, category.id, baseCurrencyCode) : null, [category, movements, baseCurrencyCode]);
  if (!category || !analytics) return null;
  return <BottomSheet visible={visible} onClose={onClose} title={`Analítica · ${category.name}`} snapHeight={0.9} entranceAnimation="springFade" contentStyle={styles.body}>
    {loading ? <SkeletonList><SkeletonCard /><SkeletonCard /></SkeletonList> : historyError ? <Text style={styles.note}>{historyError} Actualiza la lista para volver a intentarlo.</Text> : <>
      <View style={styles.section}>
        <Text style={styles.note}>Actividad de los últimos 12 meses</Text>
        <Text style={styles.amount}>{formatCurrency(analytics.totalLast12, baseCurrencyCode)}</Text>
        <Text style={styles.note}>{analytics.paymentCount} movimientos en el historial</Text>
        {analytics.unconvertedCount > 0 ? <Text style={styles.note}>{analytics.unconvertedCount} sin conversión: se conservan en su moneda original.</Text> : null}
      </View>
      <View style={styles.section}>
        <Text style={styles.title}>Mes a mes</Text>
        <Text style={styles.note}>Importes comparables en {baseCurrencyCode}</Text>
        {analytics.last12.slice().reverse().map((month) => <View key={month.ym} style={styles.month}>
          <AnalyticsRow label={monthLabel(month.ym)} value={formatCurrency(month.totalBase, baseCurrencyCode)} last />
          <View style={styles.track}><View style={[styles.fill, { width: `${month.totalBase / analytics.maxBar * 100}%` }]} /></View>
        </View>)}
      </View>
      <View style={styles.section}>
        <Text style={styles.title}>Todo el historial</Text>
        <AnalyticsRow label="Entró" value={analytics.received.map((item) => formatCurrency(item.amount, item.currencyCode)).join(" · ") || "Sin ingresos"} />
        <AnalyticsRow label="Salió" value={analytics.spent.map((item) => formatCurrency(item.amount, item.currencyCode)).join(" · ") || "Sin gastos"} />
        <AnalyticsRow label="Total comparable" value={formatCurrency(analytics.totalBase, baseCurrencyCode)} />
        <AnalyticsRow label="Promedio por movimiento" value={formatCurrency(analytics.averageBase, baseCurrencyCode)} detail={`${analytics.comparableCount} con conversión`} last />
      </View>
    </>}
  </BottomSheet>;
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: SPACING.xl, paddingBottom: SPACING.xxxl },
  section: { marginBottom: SPACING.xxxl, gap: SPACING.sm },
  title: { fontFamily: FONT_FAMILY.bodySemibold, fontSize: FONT_SIZE.lg, color: COLORS.ink },
  amount: { fontFamily: FONT_FAMILY.heading, fontSize: FONT_SIZE.xxxl, color: COLORS.ink },
  note: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.sm, color: COLORS.storm, lineHeight: 20 },
  month: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: SURFACE.separator, paddingBottom: SPACING.sm },
  track: { height: 3, backgroundColor: SURFACE.card },
  fill: { height: 3, backgroundColor: COLORS.fog },
});
