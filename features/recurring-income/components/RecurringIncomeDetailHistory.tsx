import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { format } from "date-fns";
import { es } from "date-fns/locale";

import { Card } from "../../../components/ui/Card";
import { formatCurrency } from "../../../components/ui/AmountDisplay";
import { useRecurringIncomeOccurrencesQuery } from "../../../services/queries/subscriptions-recurring-income";
import { COLORS, FONT_FAMILY, FONT_SIZE, FONT_WEIGHT, RADIUS, SPACING } from "../../../constants/theme";
import type { RecurringIncomeOccurrenceSummary } from "../../../types/domain";

const COLLAPSED_LIMIT = 12;

type Props = {
  workspaceId: number | null;
  recurringIncomeId: number;
  fallbackCurrencyCode: string;
};

function parseYmd(ymd: string): Date {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function RecurringIncomeDetailHistory({
  workspaceId,
  recurringIncomeId,
  fallbackCurrencyCode,
}: Props) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  const { data: occurrences = [], isLoading } = useRecurringIncomeOccurrencesQuery(
    workspaceId,
    recurringIncomeId,
  );

  if (isLoading) {
    return (
      <Card>
        <Text style={styles.title}>Historial de llegadas</Text>
        <Text style={styles.subtitle}>Cargando...</Text>
      </Card>
    );
  }

  if (occurrences.length === 0) {
    return (
      <Card>
        <Text style={styles.title}>Historial de llegadas</Text>
        <Text style={styles.empty}>
          Aún no se ha confirmado ninguna llegada. La primera aparecerá aquí.
        </Text>
      </Card>
    );
  }

  const visible: RecurringIncomeOccurrenceSummary[] = expanded
    ? occurrences
    : occurrences.slice(0, COLLAPSED_LIMIT);
  const remaining = occurrences.length - visible.length;

  return (
    <Card>
      <Text style={styles.title}>Historial de llegadas · {occurrences.length}</Text>
      {visible.map((occurrence) => {
        const onTime = occurrence.status === "on_time";
        const expectedDate = occurrence.expectedDate
          ? parseYmd(occurrence.expectedDate)
          : null;
        const actualDate = occurrence.actualDate
          ? parseYmd(occurrence.actualDate)
          : null;
        const handlePress = () => {
          if (occurrence.movementId == null) return;
          router.push(`/movement/${occurrence.movementId}?from=recurring-income`);
        };
        const inner = (
          <View style={styles.row}>
            <View style={styles.left}>
              <Text style={styles.dateText}>
                {actualDate
                  ? format(actualDate, "d MMM yyyy", { locale: es })
                  : "Sin fecha"}
              </Text>
              {expectedDate && actualDate && expectedDate.getTime() !== actualDate.getTime() ? (
                <Text style={styles.meta}>
                  Esperada {format(expectedDate, "d MMM", { locale: es })}
                </Text>
              ) : null}
            </View>
            <View style={styles.right}>
              <Text style={styles.amount}>
                {formatCurrency(occurrence.amount, occurrence.currencyCode || fallbackCurrencyCode)}
              </Text>
              <View
                style={[
                  styles.badge,
                  { backgroundColor: (onTime ? COLORS.income : COLORS.gold) + "22" },
                ]}
              >
                <Text
                  style={[
                    styles.badgeText,
                    { color: onTime ? COLORS.income : COLORS.gold },
                  ]}
                >
                  {onTime ? "A tiempo" : "Tardío"}
                </Text>
              </View>
            </View>
          </View>
        );
        if (occurrence.movementId == null) {
          return <View key={occurrence.id}>{inner}</View>;
        }
        return (
          <Pressable
            key={occurrence.id}
            onPress={handlePress}
            style={({ pressed }) => [pressed && styles.rowPressed]}
          >
            {inner}
          </Pressable>
        );
      })}
      {remaining > 0 ? (
        <Pressable onPress={() => setExpanded(true)} style={styles.toggle}>
          <Text style={styles.toggleText}>Ver las {remaining} restantes</Text>
        </Pressable>
      ) : expanded && occurrences.length > COLLAPSED_LIMIT ? (
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
  subtitle: {
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.sm,
    color: COLORS.textMuted,
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
    alignItems: "center",
  },
  rowPressed: { opacity: 0.6 },
  left: { flex: 1, gap: SPACING.xs / 2 },
  dateText: {
    fontFamily: FONT_FAMILY.bodyMedium,
    fontSize: FONT_SIZE.sm,
    color: COLORS.text,
  },
  meta: {
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.xs,
    color: COLORS.textMuted,
  },
  right: { alignItems: "flex-end", gap: SPACING.xs },
  amount: {
    fontFamily: FONT_FAMILY.heading,
    fontSize: FONT_SIZE.sm,
    fontWeight: FONT_WEIGHT.semibold,
    color: COLORS.income,
  },
  badge: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs / 2,
    borderRadius: RADIUS.full,
  },
  badgeText: {
    fontFamily: FONT_FAMILY.bodySemibold,
    fontSize: FONT_SIZE.xs,
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
