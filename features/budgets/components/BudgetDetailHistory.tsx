import { StyleSheet, Text, View } from "react-native";
import { format } from "date-fns";
import { es } from "date-fns/locale";

import { Card } from "../../../components/ui/Card";
import { ProgressBar } from "../../../components/ui/ProgressBar";
import { formatCurrency } from "../../../components/ui/AmountDisplay";
import { parseDisplayDate } from "../../../lib/date";
import { COLORS, FONT_FAMILY, FONT_SIZE, FONT_WEIGHT, SPACING } from "../../../constants/theme";
import type { BudgetOverview } from "../../../types/domain";

const MAX_HISTORY = 6;

type Props = {
  current: BudgetOverview;
  allBudgets: BudgetOverview[];
};

function sameScope(a: BudgetOverview, b: BudgetOverview) {
  return (
    a.scopeKind === b.scopeKind &&
    (a.categoryId ?? null) === (b.categoryId ?? null) &&
    (a.accountId ?? null) === (b.accountId ?? null)
  );
}

export function BudgetDetailHistory({ current, allBudgets }: Props) {
  const history = allBudgets
    .filter((b) => b.id !== current.id && sameScope(current, b) && b.periodEnd < current.periodStart)
    .sort((a, b) => b.periodStart.localeCompare(a.periodStart))
    .slice(0, MAX_HISTORY);

  if (history.length === 0) {
    return (
      <Card>
        <Text style={styles.title}>Períodos anteriores</Text>
        <Text style={styles.empty}>
          Este es el primer período con presupuesto para este ámbito. Después de cerrar el actual, podrás comparar.
        </Text>
      </Card>
    );
  }

  return (
    <Card>
      <Text style={styles.title}>Períodos anteriores · {history.length}</Text>
      {history.map((b) => {
        const usedColor = b.isOverLimit
          ? COLORS.rosewood
          : b.isNearLimit
            ? COLORS.gold
            : COLORS.pine;
        return (
          <View key={b.id} style={styles.row}>
            <View style={styles.rowHeader}>
              <Text style={styles.periodLabel}>
                {format(parseDisplayDate(b.periodStart), "d MMM", { locale: es })} —{" "}
                {format(parseDisplayDate(b.periodEnd), "d MMM yyyy", { locale: es })}
              </Text>
              <Text style={[styles.percent, { color: usedColor }]}>
                {Math.round(b.usedPercent)}%
              </Text>
            </View>
            <ProgressBar percent={b.usedPercent} alertPercent={b.alertPercent} height={5} />
            <Text style={styles.amounts}>
              {formatCurrency(b.spentAmount, b.currencyCode)} de {formatCurrency(b.limitAmount, b.currencyCode)}
            </Text>
          </View>
        );
      })}
    </Card>
  );
}

const styles = StyleSheet.create({
  title: {
    fontFamily: FONT_FAMILY.bodySemibold,
    fontSize: FONT_SIZE.xs,
    color: COLORS.textMuted,
    textTransform: "uppercase",
    marginBottom: SPACING.sm,
  },
  empty: {
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.sm,
    color: COLORS.textMuted,
    fontStyle: "italic",
  },
  row: {
    gap: SPACING.xs,
    paddingVertical: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  rowHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
  },
  periodLabel: {
    fontFamily: FONT_FAMILY.bodyMedium,
    fontSize: FONT_SIZE.sm,
    color: COLORS.text,
  },
  percent: {
    fontFamily: FONT_FAMILY.heading,
    fontSize: FONT_SIZE.sm,
    fontWeight: FONT_WEIGHT.semibold,
  },
  amounts: {
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.xs,
    color: COLORS.textMuted,
  },
});
