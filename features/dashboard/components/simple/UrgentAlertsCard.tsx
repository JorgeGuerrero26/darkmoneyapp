import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import type { useRouter } from "expo-router";
import { differenceInDays } from "date-fns";
import { AlertCircle, AlertTriangle, ArrowRight, Bell, Clock } from "lucide-react-native";

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
  budgets: Array<{ id: number; name: string; isOverLimit: boolean; isNearLimit: boolean; usedPercent: number }>;
  subscriptions: Array<{ id: number; name: string; nextDueDate: string; status: string }>;
  router: ReturnType<typeof useRouter>;
};

export function UrgentAlertsCard({ obligations, budgets, subscriptions, router }: UrgentAlertsCardProps) {
  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);

  type AlertItem = { key: string; icon: React.ReactNode; label: string; sub: string; route: string; tone: string };
  const items: AlertItem[] = [];

  for (const o of obligations) {
    if (items.length >= 3) break;
    if (!o.dueDate || o.pendingAmount <= 0.009 || o.status === "paid") continue;
    if (o.dueDate >= todayStr) continue;
    const daysLate = differenceInDays(today, parseDisplayDate(o.dueDate));
    items.push({
      key: `ob-${o.id}`,
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
    items.push({
      key: `bg-${b.id}`,
      icon: <AlertCircle size={14} color={b.isOverLimit ? COLORS.expense : COLORS.warning} />,
      label: b.name,
      sub: b.isOverLimit
        ? `Límite superado · ${Math.round(b.usedPercent)}% usado`
        : `Cerca del límite · ${Math.round(b.usedPercent)}% usado`,
      route: "/(app)/budgets",
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
      icon: <Clock size={14} color={COLORS.gold} />,
      label: s.name,
      sub: diff === 0 ? "Vence hoy" : `Vence en ${diff} día${diff === 1 ? "" : "s"}`,
      route: "/subscriptions",
      tone: COLORS.gold,
    });
  }

  if (items.length === 0) return null;

  return (
    <View style={alertStyles.container}>
      <View style={alertStyles.header}>
        <Bell size={13} color={COLORS.warning} />
        <Text style={alertStyles.headerText}>Alertas</Text>
      </View>
      {items.map((item, idx) => (
        <TouchableOpacity
          key={item.key}
          style={[alertStyles.row, idx < items.length - 1 && alertStyles.rowBorder]}
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
    gap: SPACING.md,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
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
