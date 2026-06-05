import { StyleSheet, Text, View } from "react-native";
import { format } from "date-fns";
import { es } from "date-fns/locale";

import { Card } from "../../../components/ui/Card";
import { ProgressBar } from "../../../components/ui/ProgressBar";
import { parseDisplayDate } from "../../../lib/date";
import { COLORS, FONT_FAMILY, FONT_SIZE, FONT_WEIGHT, RADIUS, SPACING } from "../../../constants/theme";
import type { BudgetOverview } from "../../../types/domain";

type Props = {
  budget: BudgetOverview;
};

function daysLeft(periodEnd: string): number {
  const end = parseDisplayDate(periodEnd);
  const today = new Date();
  end.setHours(0, 0, 0, 0);
  today.setHours(0, 0, 0, 0);
  return Math.max(0, Math.round((end.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)));
}

export function BudgetDetailHeader({ budget }: Props) {
  const statusColor = budget.isOverLimit
    ? COLORS.rosewood
    : budget.isNearLimit
      ? COLORS.gold
      : COLORS.pine;
  const statusLabel = budget.isOverLimit
    ? "Excedido"
    : budget.isNearLimit
      ? "Cerca del límite"
      : "En rango";
  const remainingDays = daysLeft(budget.periodEnd);

  return (
    <Card style={styles.hero}>
      <Text style={styles.scopeChip}>{budget.scopeLabel}</Text>
      <Text style={[styles.percent, { color: statusColor }]}>
        {Math.round(budget.usedPercent)}%
      </Text>
      <Text style={[styles.statusLabel, { color: statusColor }]}>{statusLabel}</Text>

      <View style={styles.progressWrap}>
        <ProgressBar percent={budget.usedPercent} alertPercent={budget.alertPercent} />
      </View>

      <View style={styles.periodRow}>
        <Text style={styles.periodLabel}>
          {format(parseDisplayDate(budget.periodStart), "d MMM", { locale: es })} —{" "}
          {format(parseDisplayDate(budget.periodEnd), "d MMM yyyy", { locale: es })}
        </Text>
        <Text style={[styles.daysLabel, remainingDays === 0 && styles.daysLabelEnded]}>
          {remainingDays === 0 ? "Período terminado" : `${remainingDays} día${remainingDays === 1 ? "" : "s"} restante${remainingDays === 1 ? "" : "s"}`}
        </Text>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  hero: {
    alignItems: "center",
    paddingVertical: SPACING.xl,
    gap: SPACING.sm,
  },
  scopeChip: {
    fontFamily: FONT_FAMILY.bodySemibold,
    fontSize: FONT_SIZE.xs,
    color: COLORS.textMuted,
    textTransform: "uppercase",
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.bgInput,
  },
  percent: {
    fontFamily: FONT_FAMILY.heading,
    fontSize: FONT_SIZE.xxxl,
    fontWeight: FONT_WEIGHT.bold,
  },
  statusLabel: {
    fontFamily: FONT_FAMILY.bodySemibold,
    fontSize: FONT_SIZE.sm,
  },
  progressWrap: {
    width: "100%",
    paddingHorizontal: SPACING.lg,
    marginTop: SPACING.sm,
  },
  periodRow: {
    alignItems: "center",
    gap: SPACING.xs,
    marginTop: SPACING.sm,
  },
  periodLabel: {
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.sm,
    color: COLORS.text,
  },
  daysLabel: {
    fontFamily: FONT_FAMILY.bodySemibold,
    fontSize: FONT_SIZE.xs,
    color: COLORS.textMuted,
  },
  daysLabelEnded: {
    color: COLORS.rosewood,
  },
});
