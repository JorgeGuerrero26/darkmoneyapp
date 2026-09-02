import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { format } from "date-fns";
import { es } from "date-fns/locale";

import { Card } from "../../../components/ui/Card";
import { formatCurrency } from "../../../components/ui/AmountDisplay";
import { COLORS, FONT_FAMILY, FONT_SIZE, FONT_WEIGHT, SPACING } from "../../../constants/theme";
import type { SubscriptionPostedMovement } from "../../../types/domain";

const COLLAPSED_LIMIT = 12;

type Props = {
  subscriptionId: number;
  currencyCode: string;
  allPostedMovements: SubscriptionPostedMovement[];
};

function parseDateLocal(iso: string): Date {
  return new Date(iso);
}

function pickAmount(m: SubscriptionPostedMovement): number {
  return Number(m.sourceAmount ?? m.destinationAmount ?? 0);
}

export function SubscriptionDetailMovements({
  subscriptionId,
  currencyCode,
  allPostedMovements,
}: Props) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);

  const movements = allPostedMovements
    .filter((m) => m.subscriptionId === subscriptionId)
    .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));

  if (movements.length === 0) {
    return (
      <Card>
        {/* "Movimientos generados" es lenguaje de sistema; el usuario los llama pagos. Y el
            texto vacío decía cómo funciona el mecanismo en vez de qué hacer para llenarlo. */}
        <Text style={styles.title}>Pagos anotados</Text>
        <Text style={styles.empty}>
          Ninguno todavía. Cada vez que la marques como pagada, el gasto aparece acá.
        </Text>
      </Card>
    );
  }

  const visible = expanded ? movements : movements.slice(0, COLLAPSED_LIMIT);
  const remaining = movements.length - visible.length;

  return (
    <Card>
      <Text style={styles.title}>Pagos anotados · {movements.length}</Text>
      {visible.map((m) => {
        const amount = pickAmount(m);
        const code = m.amountCurrencyCode ?? currencyCode;
        return (
          <Pressable
            key={m.id}
            onPress={() => router.push(`/movement/${m.id}?from=subscription`)}
            style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
          >
            <View style={styles.left}>
              <Text style={styles.date}>
                {format(parseDateLocal(m.occurredAt), "d MMM yyyy", { locale: es })}
              </Text>
            </View>
            <Text style={styles.amount}>{formatCurrency(amount, code)}</Text>
          </Pressable>
        );
      })}
      {remaining > 0 ? (
        <Pressable onPress={() => setExpanded(true)} style={styles.toggle}>
          <Text style={styles.toggleText}>Ver los {remaining} restantes</Text>
        </Pressable>
      ) : expanded && movements.length > COLLAPSED_LIMIT ? (
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
    color: COLORS.storm,
    lineHeight: 20,
  },
  row: {
    flexDirection: "row",
    paddingVertical: SPACING.sm,
    gap: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    alignItems: "center",
  },
  rowPressed: {
    opacity: 0.6,
  },
  left: {
    flex: 1,
    gap: SPACING.xs,
  },
  date: {
    fontFamily: FONT_FAMILY.bodyMedium,
    fontSize: FONT_SIZE.sm,
    color: COLORS.text,
  },
  amount: {
    fontFamily: FONT_FAMILY.heading,
    fontSize: FONT_SIZE.sm,
    fontWeight: FONT_WEIGHT.semibold,
    color: COLORS.expense,
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
