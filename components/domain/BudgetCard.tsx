import { memo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { ChevronRight } from "lucide-react-native";

import { ResourceCard } from "../ui/ResourceCard";
import { formatCurrency } from "../ui/AmountDisplay";
import { COLORS, FONT_FAMILY, FONT_SIZE, RADIUS, SPACING, SURFACE } from "../../constants/theme";
import { daysLeft, expectedPace } from "../../features/budgets/lib/budgetRules";
import { todayPeru } from "../../lib/date";
import { useUiStore } from "../../store/ui-store";
import type { BudgetOverview } from "../../types/domain";

type Props = {
  budget: BudgetOverview;
  selected?: boolean;
  onPress?: () => void;
  onLongPress?: () => void;
};

/** Ledger row: what remains is the answer; spent versus limit and pace explain it. */
function BudgetCardBase({ budget, selected, onPress, onLongPress }: Props) {
  // Suscripción propia: invalida el memo cuando cambia el modo privacidad
  // (los props no cambian al alternar, sin esto la fila mostraría el monto viejo).
  useUiStore((state) => state.privacyMode);

  const today = todayPeru();
  const over = budget.spentAmount > budget.limitAmount;
  const money = (value: number) => formatCurrency(value, budget.currencyCode);
  const restantes = daysLeft(budget, today);
  const pace = expectedPace(budget, today);
  const percent = budget.limitAmount > 0 ? (budget.spentAmount / budget.limitAmount) * 100 : 0;
  const difference = Math.abs(budget.limitAmount - budget.spentAmount);

  return (
    <ResourceCard
      variant="line"
      pinned={budget.isPinned}
      title={budget.name}
      subtitle={`${money(budget.spentAmount)} de ${money(budget.limitAmount)} · ${restantes === 1 ? "1 día" : `${restantes} días`}`}
      selected={selected}
      onPress={onPress}
      onLongPress={onLongPress}
      trailing={
        <View style={styles.trailing}>
          <View style={styles.amountBlock}>
            <Text style={[styles.amount, over && styles.amountOver]} numberOfLines={1} adjustsFontSizeToFit>
              {money(difference)}
            </Text>
            <Text style={styles.amountLabel}>{over ? "de más" : "quedan"}</Text>
          </View>
          <ChevronRight size={18} color={COLORS.textDisabled} />
        </View>
      }
      meta={
        <View style={styles.track}>
          <View style={[styles.fill, { width: `${Math.min(100, Math.max(0, percent))}%` }, over && styles.fillOver]} />
          {!over && pace > 0 && pace < 1 ? (
            <View style={[styles.pace, { left: `${pace * 100}%` }]} />
          ) : null}
        </View>
      }
    />
  );
}

const styles = StyleSheet.create({
  trailing: { flexDirection: "row", alignItems: "center", gap: SPACING.sm },
  amountBlock: { alignItems: "flex-end", maxWidth: 112 },
  amount: { fontFamily: FONT_FAMILY.heading, fontSize: FONT_SIZE.md, color: COLORS.ink },
  amountOver: { color: COLORS.expense },
  amountLabel: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.xs, color: COLORS.storm },
  track: {
    width: "100%",
    height: 4,
    borderRadius: RADIUS.full,
    backgroundColor: SURFACE.track,
    overflow: "hidden",
  },
  fill: { height: "100%", borderRadius: RADIUS.full, backgroundColor: COLORS.ink },
  fillOver: { backgroundColor: COLORS.expense },
  pace: {
    position: "absolute",
    top: 0,
    bottom: 0,
    width: 2,
    backgroundColor: COLORS.storm,
  },
});

export const BudgetCard = memo(BudgetCardBase);
