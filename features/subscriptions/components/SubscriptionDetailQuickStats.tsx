import { StyleSheet, Text, View } from "react-native";
import { format } from "date-fns";
import { es } from "date-fns/locale";

import { Card } from "../../../components/ui/Card";
import { COLORS, FONT_FAMILY, FONT_SIZE, FONT_WEIGHT, RADIUS, SPACING } from "../../../constants/theme";
import type { SubscriptionSummary } from "../../../types/domain";

type Props = {
  subscription: SubscriptionSummary;
};

function parseYmd(ymd: string): Date {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function daysUntil(ymd: string): number {
  const target = parseYmd(ymd);
  const today = new Date();
  target.setHours(0, 0, 0, 0);
  today.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

export function SubscriptionDetailQuickStats({ subscription }: Props) {
  const days = daysUntil(subscription.nextDueDate);
  const daysLabel =
    days < 0 ? `Hace ${Math.abs(days)} día${Math.abs(days) === 1 ? "" : "s"}` :
    days === 0 ? "Hoy" :
    `En ${days} día${days === 1 ? "" : "s"}`;
  const daysColor = days < 0 ? COLORS.rosewood : days <= 3 ? COLORS.gold : COLORS.text;

  return (
    <Card>
      <View style={styles.row}>
        <View style={styles.cell}>
          <Text style={styles.label}>Próximo cobro</Text>
          <Text style={styles.value}>
            {format(parseYmd(subscription.nextDueDate), "d MMM yyyy", { locale: es })}
          </Text>
          <Text style={[styles.subValue, { color: daysColor }]}>{daysLabel}</Text>
        </View>
        <View style={styles.divider} />
        <View style={styles.cell}>
          <Text style={styles.label}>Cuenta</Text>
          <Text style={styles.value}>{subscription.accountName ?? "Sin cuenta"}</Text>
          {subscription.autoCreateMovement ? (
            <Text style={styles.subValue}>Auto-genera movimiento</Text>
          ) : null}
        </View>
      </View>
      <View style={[styles.row, styles.rowBottom]}>
        <View style={styles.cell}>
          <Text style={styles.label}>Categoría</Text>
          <Text style={styles.value}>{subscription.categoryName ?? "Sin categoría"}</Text>
        </View>
        <View style={styles.divider} />
        <View style={styles.cell}>
          <Text style={styles.label}>Recordatorio</Text>
          <Text style={styles.value}>
            {subscription.remindDaysBefore > 0
              ? `${subscription.remindDaysBefore} día${subscription.remindDaysBefore === 1 ? "" : "s"} antes`
              : "Sin recordatorio"}
          </Text>
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: SPACING.md,
  },
  rowBottom: {
    marginTop: SPACING.md,
    paddingTop: SPACING.md,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  cell: {
    flex: 1,
    gap: SPACING.xs,
  },
  divider: {
    width: 1,
    alignSelf: "stretch",
    backgroundColor: COLORS.border,
    borderRadius: RADIUS.sm,
  },
  label: {
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.xs,
    color: COLORS.textMuted,
  },
  value: {
    fontFamily: FONT_FAMILY.bodyMedium,
    fontSize: FONT_SIZE.sm,
    fontWeight: FONT_WEIGHT.medium,
    color: COLORS.text,
  },
  subValue: {
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.xs,
    color: COLORS.textMuted,
  },
});
