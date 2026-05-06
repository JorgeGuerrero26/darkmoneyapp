import { StyleSheet, Text, View } from "react-native";
import { AlertTriangle, BarChart2, Target, Zap } from "lucide-react-native";

import { formatCurrency } from "../ui/AmountDisplay";
import { ProgressBar } from "../ui/ProgressBar";
import {
  ResourceCard,
  ResourceCardBadge,
  ResourceCardIcon,
  ResourceCardMetaText,
} from "../ui/ResourceCard";
import { COLORS, FONT_FAMILY, FONT_SIZE, SPACING } from "../../constants/theme";
import type { BudgetOverview } from "../../types/domain";

type Props = {
  budget: BudgetOverview;
  selected?: boolean;
  onPress?: () => void;
  onLongPress?: () => void;
  onAnalytics?: () => void;
};

export function BudgetCard({ budget, selected, onPress, onLongPress, onAnalytics }: Props) {
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

  return (
    <ResourceCard
      title={budget.name}
      subtitle={budget.scopeLabel}
      selected={selected}
      onPress={onPress}
      onLongPress={onLongPress}
      leading={<ResourceCardIcon icon={Target} color={statusColor} />}
      actions={onAnalytics ? [{
        key: "analytics",
        icon: BarChart2,
        onPress: onAnalytics,
        accessibilityLabel: "Ver analítica del presupuesto",
      }] : []}
      trailing={
        <View style={styles.trailing}>
          <Text style={[styles.percent, { color: statusColor }]}>
            {Math.round(budget.usedPercent)}%
          </Text>
          <Text style={styles.trailingLabel}>usado</Text>
        </View>
      }
      meta={
        <>
          <ResourceCardBadge label={statusLabel} color={statusColor} />
          <ResourceCardBadge label={`${budget.movementCount} mov`} color={COLORS.storm} />
          {budget.rolloverEnabled ? <ResourceCardBadge label="Rollover" color={COLORS.primary} /> : null}
        </>
      }
      footer={
        <View style={styles.footer}>
          <ProgressBar percent={budget.usedPercent} alertPercent={budget.alertPercent} />
          <View style={styles.amountRow}>
            <ResourceCardMetaText>
              {formatCurrency(budget.spentAmount, budget.currencyCode)} gastado
            </ResourceCardMetaText>
            <Text style={styles.limit} numberOfLines={1}>
              de {formatCurrency(budget.limitAmount, budget.currencyCode)}
            </Text>
          </View>
          {budget.isOverLimit ? (
            <View style={styles.alertRow}>
              <AlertTriangle size={12} color={COLORS.rosewood} />
              <Text style={[styles.alertLabel, { color: COLORS.rosewood }]}>Presupuesto excedido</Text>
            </View>
          ) : budget.isNearLimit ? (
            <View style={styles.alertRow}>
              <Zap size={12} color={COLORS.gold} />
              <Text style={[styles.alertLabel, { color: COLORS.gold }]}>Cerca del límite</Text>
            </View>
          ) : null}
        </View>
      }
    />
  );
}

const styles = StyleSheet.create({
  trailing: {
    alignItems: "flex-end",
    gap: 1,
  },
  percent: {
    fontFamily: FONT_FAMILY.heading,
    fontSize: FONT_SIZE.xl,
  },
  trailingLabel: {
    fontFamily: FONT_FAMILY.body,
    fontSize: 10,
    color: COLORS.textDisabled,
  },
  footer: {
    gap: SPACING.sm,
  },
  amountRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: SPACING.sm,
  },
  limit: {
    flexShrink: 0,
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.xs,
    color: COLORS.storm,
  },
  alertRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  alertLabel: {
    fontFamily: FONT_FAMILY.bodySemibold,
    fontSize: FONT_SIZE.xs,
  },
});
