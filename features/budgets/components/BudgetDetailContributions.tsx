import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { format } from "date-fns";
import { es } from "date-fns/locale";

import { Card } from "../../../components/ui/Card";
import { formatCurrency } from "../../../components/ui/AmountDisplay";
import { parseDisplayDate } from "../../../lib/date";
import { COLORS, FONT_FAMILY, FONT_SIZE, FONT_WEIGHT, SPACING } from "../../../constants/theme";
import type { BudgetContribution } from "../../../lib/budget-metrics";

const COLLAPSED_LIMIT = 10;

type Props = {
  contributions: BudgetContribution[];
  currencyCode: string;
};

export function BudgetDetailContributions({ contributions, currencyCode }: Props) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);

  if (contributions.length === 0) {
    return (
      <Card>
        <Text style={styles.title}>Movimientos del período</Text>
        <Text style={styles.empty}>
          Aún no hay movimientos imputados a este presupuesto en el período actual.
        </Text>
      </Card>
    );
  }

  const visible = expanded ? contributions : contributions.slice(0, COLLAPSED_LIMIT);
  const remaining = contributions.length - visible.length;

  return (
    <Card>
      <Text style={styles.title}>
        Movimientos del período · {contributions.length}
      </Text>
      {visible.map((c) => (
        <Pressable
          key={c.movementId}
          onPress={() => router.push(`/movement/${c.movementId}?from=budget`)}
          style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
        >
          <View style={styles.left}>
            <Text style={styles.description} numberOfLines={1}>
              {c.description || "Sin descripción"}
            </Text>
            <Text style={styles.meta} numberOfLines={1}>
              {format(parseDisplayDate(c.occurredAt), "d MMM yyyy", { locale: es })}
              {c.categoryName ? ` · ${c.categoryName}` : ""}
              {c.accountName ? ` · ${c.accountName}` : ""}
            </Text>
          </View>
          <View style={styles.right}>
            <Text style={styles.amount}>{formatCurrency(c.amountInBudgetCurrency, currencyCode)}</Text>
            <Text style={styles.share}>{c.shareOfBudget.toFixed(1)}% del límite</Text>
          </View>
        </Pressable>
      ))}
      {remaining > 0 ? (
        <Pressable onPress={() => setExpanded(true)} style={styles.toggle}>
          <Text style={styles.toggleText}>Ver los {remaining} restantes</Text>
        </Pressable>
      ) : expanded && contributions.length > COLLAPSED_LIMIT ? (
        <Pressable onPress={() => setExpanded(false)} style={styles.toggle}>
          <Text style={styles.toggleText}>Mostrar menos</Text>
        </Pressable>
      ) : null}
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
    flexDirection: "row",
    paddingVertical: SPACING.sm,
    gap: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  rowPressed: {
    opacity: 0.6,
  },
  left: {
    flex: 1,
    gap: SPACING.xs,
  },
  description: {
    fontFamily: FONT_FAMILY.bodyMedium,
    fontSize: FONT_SIZE.sm,
    color: COLORS.text,
  },
  meta: {
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.xs,
    color: COLORS.textMuted,
  },
  right: {
    alignItems: "flex-end",
    gap: SPACING.xs,
  },
  amount: {
    fontFamily: FONT_FAMILY.heading,
    fontSize: FONT_SIZE.sm,
    fontWeight: FONT_WEIGHT.semibold,
    color: COLORS.expense,
  },
  share: {
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.xs,
    color: COLORS.textMuted,
  },
  toggle: {
    alignItems: "center",
    paddingVertical: SPACING.sm,
    marginTop: SPACING.sm,
  },
  toggleText: {
    fontFamily: FONT_FAMILY.bodySemibold,
    fontSize: FONT_SIZE.sm,
    color: COLORS.primary,
  },
});
