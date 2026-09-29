import { addDays, format } from "date-fns";
import { es } from "date-fns/locale";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { ChevronRight } from "lucide-react-native";

import { formatCurrency } from "../../../../components/ui/AmountDisplay";
import { COLORS, FONT_FAMILY, FONT_SIZE, RADIUS, SPACING, SURFACE } from "../../../../constants/theme";
import type { FutureFlowItem, FutureFlowWindow } from "../../lib/dashboard-builders";
import { SummaryDetailSheet } from "./SummaryDetailSheet";

type Props = {
  items: FutureFlowItem[];
  window: FutureFlowWindow;
  status: "Bajo presión" | "Cubierto" | "Estable" | "Por revisar";
  availableBalance: number;
  cushionDays: number;
  currency: string;
  onClose: () => void;
  onOpenItem: (item: FutureFlowItem) => void;
  onReviewSubscriptions: () => void;
};

export function WeekOutlookSheet({ items, window, status, availableBalance, cushionDays, currency, onClose, onOpenItem, onReviewSubscriptions }: Props) {
  const now = new Date();
  const start = addDays(now, 1);
  const end = addDays(now, 7);
  const dateRange = `${format(start, "d MMM", { locale: es })} – ${format(end, "d MMM", { locale: es })}`;
  const net = window.expectedInflow - window.expectedOutflow;
  const outgoing = items.filter((item) => item.direction === "outflow");
  const incoming = items.filter((item) => item.direction === "inflow");
  const calculation = "Se suman los pagos, cobros, suscripciones e ingresos fijos con fecha en los próximos 7 días. Las cuotas usan el importe pendiente de esta cuota. La cobertura parte del saldo disponible y comprueba cada pago antes de contar los cobros de ese día. Los importes sin tipo de cambio quedan pendientes de revisión.";

  function renderRows(rows: FutureFlowItem[]) {
    return rows.map((item, index) => (
      <TouchableOpacity key={`${item.source}-${item.id}-${index}`} style={styles.row} onPress={() => onOpenItem(item)} activeOpacity={0.82} accessibilityRole="button">
        <Text style={styles.day}>{format(item.date, "EEE d", { locale: es })}</Text>
        <View style={styles.rowCopy}>
          <Text style={styles.rowTitle} numberOfLines={1}>{item.title}</Text>
          <Text style={styles.rowSubtitle}>{item.source === "subscription" ? "Suscripción" : item.source === "obligation" ? "Crédito o deuda" : "Ingreso fijo"}</Text>
        </View>
        <Text style={[styles.rowAmount, { color: item.direction === "inflow" ? COLORS.income : COLORS.expense }]}>
          {item.amount === null ? "Sin tasa" : `${item.direction === "inflow" ? "+" : "−"}${formatCurrency(item.amount, currency)}`}
        </Text>
        <ChevronRight size={15} color={COLORS.textDisabled} />
      </TouchableOpacity>
    ));
  }

  return (
    <SummaryDetailSheet title="Próximos 7 días" subtitle={dateRange} onClose={onClose} calculation={calculation} actionLabel="Revisar suscripciones" onAction={onReviewSubscriptions}>
      <View style={styles.figure}>
        <View style={styles.figureLine}>
          <Text style={[styles.value, net < 0 && styles.negative]}>{net < 0 ? "−" : net > 0 ? "+" : ""}{formatCurrency(Math.abs(net), currency)}</Text>
          <View style={[styles.pill, status === "Bajo presión" && styles.warningPill]}><Text style={[styles.pillText, status === "Bajo presión" && styles.warningText]}>{status}</Text></View>
        </View>
        <Text style={styles.detail}>Entran {formatCurrency(window.expectedInflow, currency)} · salen {formatCurrency(window.expectedOutflow, currency)}</Text>
        {window.unconvertedCount > 0 ? <Text style={styles.missing}>{window.unconvertedCount} importe{window.unconvertedCount === 1 ? "" : "s"} sin tipo de cambio; el neto es parcial.</Text> : null}
      </View>

      <View style={styles.coverage}>
        <Text style={styles.coverageTitle}>{status === "Bajo presión" ? "Tu caja no cubre toda la semana" : status === "Por revisar" ? "Cobertura por confirmar" : status === "Estable" ? "Sin pagos previstos" : "Tu caja lo cubre"}</Text>
        <Text style={styles.coverageDetail}>{formatCurrency(availableBalance, currency)} disponibles · {cushionDays} días al ritmo actual</Text>
      </View>

      <Text style={styles.kicker}>LO QUE SALE</Text>
      {outgoing.length ? renderRows(outgoing) : <Text style={styles.empty}>Nada previsto esta semana</Text>}
      <Text style={styles.kicker}>LO QUE ENTRA</Text>
      {incoming.length ? renderRows(incoming) : <Text style={styles.empty}>Nada previsto esta semana</Text>}
    </SummaryDetailSheet>
  );
}

const styles = StyleSheet.create({
  figure: { gap: SPACING.sm, marginBottom: SPACING.xl },
  figureLine: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: SPACING.md },
  value: { fontFamily: FONT_FAMILY.heading, fontSize: FONT_SIZE.display, color: COLORS.ink, letterSpacing: -1 },
  negative: { color: COLORS.expense },
  detail: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.sm, color: COLORS.storm },
  missing: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.sm, color: COLORS.warning },
  pill: { backgroundColor: SURFACE.input, borderRadius: RADIUS.full, paddingHorizontal: SPACING.sm, paddingVertical: SPACING.xs },
  pillText: { fontFamily: FONT_FAMILY.bodyMedium, fontSize: FONT_SIZE.xs, color: COLORS.fog },
  warningPill: { backgroundColor: COLORS.dangerMuted },
  warningText: { color: COLORS.expense },
  coverage: { backgroundColor: SURFACE.input, borderRadius: RADIUS.xl, padding: SPACING.md, gap: SPACING.xs, marginBottom: SPACING.xxxl },
  coverageTitle: { fontFamily: FONT_FAMILY.bodySemibold, fontSize: FONT_SIZE.md, color: COLORS.ink },
  coverageDetail: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.sm, color: COLORS.storm },
  kicker: { fontFamily: FONT_FAMILY.bodyMedium, fontSize: FONT_SIZE.xs, color: COLORS.storm, letterSpacing: 1.1, marginTop: SPACING.xl, marginBottom: SPACING.xs },
  row: { minHeight: 76, flexDirection: "row", alignItems: "center", gap: SPACING.sm, borderBottomWidth: 1, borderBottomColor: SURFACE.separator },
  day: { width: 48, fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.sm, color: COLORS.storm },
  rowCopy: { flex: 1, gap: SPACING.xs },
  rowTitle: { fontFamily: FONT_FAMILY.bodyMedium, fontSize: FONT_SIZE.md, color: COLORS.ink },
  rowSubtitle: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.sm, color: COLORS.storm },
  rowAmount: { fontFamily: FONT_FAMILY.heading, fontSize: FONT_SIZE.md },
  empty: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.md, color: COLORS.storm, paddingVertical: SPACING.md },
});
