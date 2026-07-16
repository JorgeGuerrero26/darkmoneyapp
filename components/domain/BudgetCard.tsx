import { memo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { AlertTriangle, BarChart2, Pin, PinOff, Target, Zap } from "lucide-react-native";
import { format } from "date-fns";
import { es } from "date-fns/locale";

import { formatCurrency } from "../ui/AmountDisplay";
import { ProgressBar } from "../ui/ProgressBar";
import { useUiStore } from "../../store/ui-store";
import {
  ResourceCard,
  ResourceCardBadge,
  ResourceCardIcon,
  ResourceCardMetaText,
} from "../ui/ResourceCard";
import { COLORS, FONT_FAMILY, FONT_SIZE, SPACING } from "../../constants/theme";
import { parseDisplayDate } from "../../lib/date";
import type { BudgetOverview } from "../../types/domain";

function formatPeriodRange(periodStart: string, periodEnd: string): string {
  const start = format(parseDisplayDate(periodStart), "d MMM", { locale: es });
  const end = format(parseDisplayDate(periodEnd), "d MMM", { locale: es });
  return `${start} – ${end}`;
}

type Props = {
  budget: BudgetOverview;
  selected?: boolean;
  onPress?: () => void;
  onLongPress?: () => void;
  onAnalytics?: () => void;
  onQuickEdit?: () => void;
  onTogglePin?: () => void;
};

function BudgetCardBase({ budget, selected, onPress, onLongPress, onAnalytics, onQuickEdit, onTogglePin }: Props) {
  // Suscripción propia: invalida el memo cuando cambia el modo privacidad
  // (los props no cambian al alternar, sin esto la fila mostraría el monto viejo).
  useUiStore((state) => state.privacyMode);
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
      actions={[
        ...(onTogglePin ? [{
          key: "pin",
          icon: budget.isPinned ? PinOff : Pin,
          onPress: onTogglePin,
          color: budget.isPinned ? COLORS.primary : COLORS.storm,
          accessibilityLabel: budget.isPinned ? "Desfijar presupuesto" : "Fijar presupuesto",
        }] : []),
        ...(onAnalytics ? [{
          key: "analytics",
          icon: BarChart2,
          onPress: onAnalytics,
          accessibilityLabel: "Ver analítica del presupuesto",
        }] : []),
      ]}
      trailing={
        onQuickEdit ? (
          <Pressable
            onPress={(event) => {
              event.stopPropagation();
              onQuickEdit();
            }}
            hitSlop={8}
            style={({ pressed }) => [styles.trailing, pressed && styles.trailingPressed]}
            accessibilityRole="button"
            accessibilityLabel="Ajuste rápido del límite"
          >
            <Text style={[styles.percent, { color: statusColor }]}>
              {Math.round(budget.usedPercent)}%
            </Text>
            <Text style={styles.trailingLabel}>tocar para editar</Text>
          </Pressable>
        ) : (
          <View style={styles.trailing}>
            <Text style={[styles.percent, { color: statusColor }]}>
              {Math.round(budget.usedPercent)}%
            </Text>
            <Text style={styles.trailingLabel}>usado</Text>
          </View>
        )
      }
      meta={
        <>
          <ResourceCardBadge label={statusLabel} color={statusColor} />
          <ResourceCardBadge label={formatPeriodRange(budget.periodStart, budget.periodEnd)} color={COLORS.storm} />
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
  trailingPressed: {
    opacity: 0.6,
  },
  percent: {
    fontFamily: FONT_FAMILY.heading,
    fontSize: FONT_SIZE.xl,
  },
  trailingLabel: {
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.xs,
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
    gap: SPACING.xs,
  },
  alertLabel: {
    fontFamily: FONT_FAMILY.bodySemibold,
    fontSize: FONT_SIZE.xs,
  },
});

/** Memoizado: los cards se renderizan en listas largas; evita re-renders cuando las props son estables. */
export const BudgetCard = memo(BudgetCardBase);
