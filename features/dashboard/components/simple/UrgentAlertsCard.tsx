import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import type { useRouter } from "expo-router";
import { differenceInDays } from "date-fns";
import { AlertCircle, AlertTriangle, ArrowRight, Bell, Clock, X } from "lucide-react-native";

import { COLORS, FONT_FAMILY, FONT_SIZE, RADIUS, SPACING, SURFACE } from "../../../../constants/theme";
import { parseDisplayDate } from "../../../../lib/date";

type UrgentAlertsCardProps = {
  obligations: Array<{
    id: number;
    title: string;
    dueDate: string | null;
    pendingAmount: number;
    status: string;
    currencyCode: string;
  }>;
  budgets: Array<{
    id: number;
    name: string;
    isOverLimit: boolean;
    isNearLimit: boolean;
    usedPercent: number;
    /** Alcance (categoría/cuenta/global): desambigua presupuestos con el mismo nombre. */
    scopeLabel?: string;
  }>;
  subscriptions: Array<{ id: number; name: string; nextDueDate: string; status: string }>;
  router: ReturnType<typeof useRouter>;
  /** Descarte inteligente: oculta la alerta hasta que su firma (estado) cambie. */
  isDismissed?: (key: string, signature: string) => boolean;
  onDismiss?: (key: string, signature: string) => void;
};

export function UrgentAlertsCard({ obligations, budgets, subscriptions, router, isDismissed, onDismiss }: UrgentAlertsCardProps) {
  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);

  type AlertItem = { key: string; signature: string; icon: React.ReactNode; label: string; sub: string; route: string; tone: string };
  const items: AlertItem[] = [];

  for (const o of obligations) {
    if (items.length >= 3) break;
    if (!o.dueDate || o.pendingAmount <= 0.009 || o.status === "paid") continue;
    if (o.dueDate >= todayStr) continue;
    const daysLate = differenceInDays(today, parseDisplayDate(o.dueDate));
    items.push({
      key: `ob-${o.id}`,
      // Reaparece cada semana adicional de mora.
      signature: `overdue-w${Math.floor(daysLate / 7)}`,
      icon: <AlertTriangle size={14} color={COLORS.expense} />,
      label: o.title,
      sub: `Vencido hace ${daysLate} día${daysLate === 1 ? "" : "s"}`,
      route: `/obligation/${o.id}`,
      tone: COLORS.expense,
    });
  }

  for (const b of budgets) {
    if (items.length >= 3) break;
    if (!b.isOverLimit && !b.isNearLimit) continue;
    // Con dos presupuestos del mismo nombre (distinto alcance), dos alertas idénticas
    // no dicen cuál es cuál: el alcance va en el título cuando existe y aporta.
    const scope = b.scopeLabel?.trim();
    items.push({
      key: `bg-${b.id}`,
      // Reaparece al pasar de "cerca" a "excedido" o cada +25% de sobregiro.
      signature: b.isOverLimit ? `over-${Math.floor(b.usedPercent / 25)}` : "near",
      icon: <AlertCircle size={14} color={b.isOverLimit ? COLORS.expense : COLORS.warning} />,
      label: scope && scope.toLowerCase() !== b.name.trim().toLowerCase() ? `${b.name} · ${scope}` : b.name,
      sub: b.isOverLimit
        ? `Límite superado · ${Math.round(b.usedPercent)}% usado`
        : `Cerca del límite · ${Math.round(b.usedPercent)}% usado`,
      route: `/budget/${b.id}?from=dashboard`,
      tone: b.isOverLimit ? COLORS.expense : COLORS.warning,
    });
  }

  for (const s of subscriptions) {
    if (items.length >= 3) break;
    if (s.status !== "active") continue;
    const due = parseDisplayDate(s.nextDueDate);
    const diff = differenceInDays(due, today);
    if (diff < 0 || diff > 3) continue;
    items.push({
      key: `sub-${s.id}`,
      signature: diff === 0 ? "due-today" : `soon-${diff}`,
      icon: <Clock size={14} color={COLORS.gold} />,
      label: s.name,
      sub: diff === 0 ? "Vence hoy" : `Vence en ${diff} día${diff === 1 ? "" : "s"}`,
      route: "/subscriptions",
      tone: COLORS.gold,
    });
  }

  const visibleItems = isDismissed ? items.filter((item) => !isDismissed(item.key, item.signature)) : items;
  if (visibleItems.length === 0) return null;

  return (
    <View style={alertStyles.container}>
      <View style={alertStyles.header}>
        <Bell size={13} color={COLORS.warning} />
        <Text style={alertStyles.headerText}>Alertas</Text>
      </View>
      {visibleItems.map((item, idx) => (
        <View key={item.key} style={[alertStyles.row, idx < visibleItems.length - 1 && alertStyles.rowBorder]}>
          <TouchableOpacity
            style={alertStyles.rowMain}
            onPress={() => router.push(item.route as Parameters<typeof router.push>[0])}
            activeOpacity={0.7}
          >
            <View style={[alertStyles.iconDot, { backgroundColor: item.tone + "22" }]}>{item.icon}</View>
            <View style={alertStyles.rowBody}>
              <Text style={alertStyles.rowLabel} numberOfLines={1}>
                {item.label}
              </Text>
              <Text style={alertStyles.rowSub}>{item.sub}</Text>
            </View>
            <ArrowRight size={14} color={COLORS.storm} />
          </TouchableOpacity>
          {onDismiss ? (
            <TouchableOpacity
              style={alertStyles.dismissBtn}
              onPress={() => onDismiss(item.key, item.signature)}
              hitSlop={{ top: 10, bottom: 10, left: 6, right: 10 }}
              accessibilityRole="button"
              accessibilityLabel={`Descartar alerta: ${item.label}`}
            >
              <X size={15} color={COLORS.storm} />
            </TouchableOpacity>
          ) : null}
        </View>
      ))}
    </View>
  );
}

const alertStyles = StyleSheet.create({
  container: {
    backgroundColor: SURFACE.card,
    borderWidth: 1,
    borderColor: SURFACE.cardBorder,
    borderRadius: RADIUS.xl,
    overflow: "hidden",
    marginBottom: SPACING.xs,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.xs,
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.sm,
  },
  headerText: {
    fontFamily: FONT_FAMILY.bodySemibold,
    fontSize: FONT_SIZE.xs,
    color: COLORS.warning,
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingRight: SPACING.md,
  },
  rowMain: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.md,
    paddingLeft: SPACING.lg,
    paddingVertical: SPACING.md,
  },
  dismissBtn: {
    padding: SPACING.xs,
    marginLeft: SPACING.xs,
  },
  rowBorder: {
    borderBottomWidth: 0.5,
    borderBottomColor: SURFACE.separator,
  },
  iconDot: {
    width: 28,
    height: 28,
    borderRadius: 99,
    alignItems: "center",
    justifyContent: "center",
  },
  rowBody: {
    flex: 1,
    gap: 2,
  },
  rowLabel: {
    fontFamily: FONT_FAMILY.bodySemibold,
    fontSize: FONT_SIZE.sm,
    color: COLORS.text,
  },
  rowSub: {
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.xs,
    color: COLORS.storm,
  },
});
