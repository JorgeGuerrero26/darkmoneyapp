import { useMemo } from "react";
import {
  Animated,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { format } from "date-fns";
import { es } from "date-fns/locale";

import type { CategoryOverview, CategoryPostedMovement } from "../../types/domain";
import { movementAmountForSubscriptionAnalytics } from "../../lib/subscription-helpers";
import { COLORS, FONT_FAMILY, FONT_SIZE, GLASS, RADIUS, SPACING } from "../../constants/theme";
import { useDismissibleSheet } from "../ui/useDismissibleSheet";

type Props = {
  visible: boolean;
  onClose: () => void;
  category: CategoryOverview | null;
  movements: CategoryPostedMovement[];
};

function ymFromOccurredAt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return format(d, "yyyy-MM");
}

function ymLabel(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  if (!y || !m) return ym;
  return format(new Date(y, m - 1, 1), "MMM yy", { locale: es });
}

export function CategoryAnalyticsModal({ visible, onClose, category, movements }: Props) {
  const insets = useSafeAreaInsets();
  const { backdropStyle, panHandlers, sheetStyle } = useDismissibleSheet({ visible, onClose });

  const filtered = useMemo(() => {
    if (!category) return [];
    return movements.filter((m) => m.categoryId === category.id);
  }, [movements, category]);

  const { paymentCount, totalSpent, last12, maxBar } = useMemo(() => {
    if (!category) {
      return {
        paymentCount: 0,
        totalSpent: 0,
        last12: [] as { ym: string; total: number }[],
        maxBar: 1,
      };
    }
    let total = 0;
    for (const m of filtered) {
      total += movementAmountForSubscriptionAnalytics(m);
    }
    const now = new Date();
    const keys: string[] = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      keys.push(format(d, "yyyy-MM"));
    }
    const bucket: Record<string, number> = {};
    for (const k of keys) bucket[k] = 0;
    for (const m of filtered) {
      const ym = ymFromOccurredAt(m.occurredAt);
      if (ym && bucket[ym] !== undefined) bucket[ym] += movementAmountForSubscriptionAnalytics(m);
    }
    const last12Arr = keys.map((ym) => ({ ym, total: bucket[ym] ?? 0 }));
    const maxBarVal = Math.max(1, ...last12Arr.map((x) => x.total));
    return { paymentCount: filtered.length, totalSpent: total, last12: last12Arr, maxBar: maxBarVal };
  }, [filtered, category]);

  if (!category) return null;

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <Animated.View style={[styles.backdrop, backdropStyle]}>
        <Animated.View style={[styles.sheet, { paddingBottom: insets.bottom + SPACING.md }, sheetStyle]}>
          <View style={styles.header} {...panHandlers}>
            <Text style={styles.title} numberOfLines={2}>
              Análisis · {category.name}
            </Text>
            <TouchableOpacity onPress={onClose} hitSlop={12}>
              <Text style={styles.close}>Cerrar</Text>
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
            <View style={styles.metrics}>
              <Metric label="Movimientos (publicados)" value={String(paymentCount)} />
              <Metric
                label="Suma importes (valor absoluto)"
                value={totalSpent.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              />
              <Metric label="Uso en suscripciones" value={String(category.subscriptionCount)} />
            </View>

            <Text style={styles.chartTitle}>Últimos 12 meses</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.barRow}>
              {last12.map(({ ym, total }) => {
                const barH = Math.max(4, (total / maxBar) * 120);
                return (
                  <View key={ym} style={styles.barCol}>
                    <View style={styles.barTrack}>
                      <View style={[styles.barFill, { height: barH }]} />
                    </View>
                    <Text style={styles.barLabel} numberOfLines={1}>
                      {ymLabel(ym)}
                    </Text>
                    <Text style={styles.barAmount} numberOfLines={1}>
                      {total > 0 ? total.toLocaleString("es-PE", { maximumFractionDigits: 0 }) : "—"}
                    </Text>
                  </View>
                );
              })}
            </ScrollView>

            <Text style={styles.hint}>
              Montos según importes del movimiento en moneda registrada; datos del snapshot (posted + categoría).
            </Text>
          </ScrollView>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "flex-end",
  },
  sheet: {
    maxHeight: "88%",
    backgroundColor: COLORS.bgModal,
    borderTopLeftRadius: RADIUS.lg,
    borderTopRightRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: GLASS.cardBorder,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.lg,
    paddingBottom: SPACING.md,
    borderBottomWidth: 0.5,
    borderBottomColor: GLASS.sheetBorder,
  },
  title: {
    flex: 1,
    fontFamily: FONT_FAMILY.heading,
    fontSize: FONT_SIZE.lg,
    color: COLORS.ink,
    marginRight: SPACING.md,
  },
  close: {
    fontFamily: FONT_FAMILY.bodySemibold,
    fontSize: FONT_SIZE.md,
    color: COLORS.primary,
  },
  body: { padding: SPACING.lg, gap: SPACING.md, paddingBottom: SPACING.xl },
  metrics: { gap: SPACING.sm },
  metric: {
    backgroundColor: GLASS.card,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: GLASS.cardBorder,
    padding: SPACING.md,
  },
  metricLabel: {
    fontSize: FONT_SIZE.xs,
    fontFamily: FONT_FAMILY.bodySemibold,
    color: COLORS.storm,
    textTransform: "uppercase",
    letterSpacing: 0.4,
    marginBottom: 4,
  },
  metricValue: {
    fontSize: FONT_SIZE.md,
    fontFamily: FONT_FAMILY.bodySemibold,
    color: COLORS.ink,
  },
  chartTitle: {
    marginTop: SPACING.sm,
    fontFamily: FONT_FAMILY.bodySemibold,
    fontSize: FONT_SIZE.sm,
    color: COLORS.ink,
  },
  barRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: SPACING.sm,
    paddingVertical: SPACING.sm,
  },
  barCol: { width: 56, alignItems: "center" },
  barTrack: {
    width: 28,
    height: 120,
    borderRadius: RADIUS.sm,
    backgroundColor: GLASS.card,
    borderWidth: 1,
    borderColor: GLASS.cardBorder,
    justifyContent: "flex-end",
    overflow: "hidden",
  },
  barFill: {
    width: "100%",
    backgroundColor: COLORS.primary,
    borderBottomLeftRadius: RADIUS.sm,
    borderBottomRightRadius: RADIUS.sm,
  },
  barLabel: {
    marginTop: 6,
    fontSize: 10,
    color: COLORS.storm,
    fontFamily: FONT_FAMILY.bodyMedium,
  },
  barAmount: {
    fontSize: 9,
    color: COLORS.ink,
    fontFamily: FONT_FAMILY.bodyMedium,
  },
  hint: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.storm,
    fontFamily: FONT_FAMILY.body,
    marginTop: SPACING.sm,
  },
});
