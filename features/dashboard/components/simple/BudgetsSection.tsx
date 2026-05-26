import { Text, TouchableOpacity, View } from "react-native";
import type { useRouter } from "expo-router";
import { differenceInDays } from "date-fns";

import { formatCurrency } from "../../../../components/ui/AmountDisplay";
import { ProgressBar } from "../../../../components/ui/ProgressBar";
import { COLORS } from "../../../../constants/theme";
import { parseDisplayDate } from "../../../../lib/date";
import { SectionTitle } from "./SectionTitle";
import { dashboardSimpleStyles as subStyles } from "./styles";

type BudgetRow = {
  id: number;
  name: string;
  usedPercent: number;
  alertPercent: number;
  spentAmount: number;
  limitAmount: number;
  currencyCode: string;
  isOverLimit: boolean;
  isNearLimit: boolean;
  periodStart: string;
  periodEnd: string;
};

type BudgetsSectionProps = {
  budgets: BudgetRow[];
  router: ReturnType<typeof useRouter>;
};

export function BudgetsSection({ budgets, router }: BudgetsSectionProps) {
  const today = new Date();

  const burnRateTier = budgets.filter((b) => {
    if (b.isOverLimit || b.isNearLimit) return false;
    const periodEnd = parseDisplayDate(b.periodEnd);
    const periodStart = parseDisplayDate(b.periodStart);
    const daysLeft = Math.max(1, differenceInDays(periodEnd, today));
    const daysTotal = Math.max(1, differenceInDays(periodEnd, periodStart));
    const daysElapsed = Math.max(1, daysTotal - daysLeft);
    const dailyBurn = b.spentAmount / daysElapsed;
    const projectedSpend = b.spentAmount + dailyBurn * daysLeft;
    return projectedSpend / b.limitAmount > 0.95;
  });

  const alert = budgets.filter((b) => b.isOverLimit || b.isNearLimit);
  const visible = [...alert, ...burnRateTier.filter((b) => !alert.find((a) => a.id === b.id))];
  if (visible.length === 0) return null;

  return (
    <View>
      <SectionTitle>Presupuestos con alerta</SectionTitle>
      {visible.map((b) => {
        const isBurnTier = !b.isOverLimit && !b.isNearLimit;
        const periodEnd = parseDisplayDate(b.periodEnd);
        const periodStart = parseDisplayDate(b.periodStart);
        const daysLeft = Math.max(1, differenceInDays(periodEnd, today));
        const daysTotal = Math.max(1, differenceInDays(periodEnd, periodStart));
        const daysElapsed = Math.max(1, daysTotal - daysLeft);
        const dailyBurn = b.spentAmount / daysElapsed;
        const projectedPercent = Math.min(140, ((b.spentAmount + dailyBurn * daysLeft) / b.limitAmount) * 100);
        const daysUntilLimit = dailyBurn > 0 ? Math.max(0, Math.round(b.limitAmount / dailyBurn - daysElapsed)) : 999;

        return (
          <TouchableOpacity
            key={b.id}
            style={subStyles.budgetRow}
            onPress={() => router.push("/budgets?from=dashboard")}
            activeOpacity={0.8}
          >
            <View style={subStyles.budgetHeader}>
              <Text style={subStyles.budgetName} numberOfLines={1}>
                {b.name}
              </Text>
              <Text
                style={[
                  subStyles.budgetPct,
                  b.isOverLimit
                    ? { color: COLORS.expense }
                    : isBurnTier
                      ? { color: COLORS.gold }
                      : { color: COLORS.warning },
                ]}
              >
                {Math.round(b.usedPercent)}%
              </Text>
            </View>
            <View style={{ position: "relative" }}>
              <ProgressBar percent={b.usedPercent} alertPercent={b.alertPercent} height={6} />
              {isBurnTier && projectedPercent > b.usedPercent ? (
                <View
                  style={{
                    position: "absolute",
                    top: 0,
                    left: `${Math.min(b.usedPercent, 98)}%` as unknown as number,
                    width: `${Math.min(projectedPercent - b.usedPercent, 100 - b.usedPercent)}%` as unknown as number,
                    height: 6,
                    backgroundColor: COLORS.gold + "66",
                    borderRadius: 3,
                  }}
                />
              ) : null}
            </View>
            <Text style={subStyles.budgetMeta}>
              {isBurnTier
                ? `A este ritmo: excede en ${daysUntilLimit}d · ${formatCurrency(b.spentAmount, b.currencyCode)} de ${formatCurrency(b.limitAmount, b.currencyCode)}`
                : `${formatCurrency(b.spentAmount, b.currencyCode)} de ${formatCurrency(b.limitAmount, b.currencyCode)}`}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}
