import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { format } from "date-fns";
import { es } from "date-fns/locale";

import { DetailFieldRow } from "../../../components/ui/DetailFieldRow";
import { formatCurrency } from "../../../components/ui/AmountDisplay";
import { COLORS, FONT_FAMILY, FONT_SIZE, SPACING, SURFACE } from "../../../constants/theme";
import type { SubscriptionPostedMovement } from "../../../types/domain";

const COLLAPSED_LIMIT = 5;

type Props = {
  subscriptionId: number;
  currencyCode: string;
  allPostedMovements: SubscriptionPostedMovement[];
};

export function SubscriptionDetailMovements({
  subscriptionId,
  currencyCode,
  allPostedMovements,
}: Props) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  const movements = allPostedMovements
    .filter((movement) => movement.subscriptionId === subscriptionId)
    .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
  const visible = expanded ? movements : movements.slice(0, COLLAPSED_LIMIT);

  return (
    <View style={styles.section}>
      <Text style={styles.title}>Pagos anotados · {movements.length}</Text>
      {movements.length === 0 ? (
        <Text style={styles.empty}>Aún no hay pagos anotados.</Text>
      ) : (
        <>
          {visible.map((movement, index) => (
            <DetailFieldRow
              key={movement.id}
              action
              label={format(new Date(movement.occurredAt), "d MMM yyyy", { locale: es })}
              value={formatCurrency(
                Number(movement.sourceAmount ?? movement.destinationAmount ?? 0),
                movement.amountCurrencyCode ?? currencyCode,
              )}
              onPress={() => router.push(`/movement/${movement.id}?from=subscription`)}
              last={index === visible.length - 1 && (expanded || movements.length <= COLLAPSED_LIMIT)}
            />
          ))}
          {movements.length > COLLAPSED_LIMIT ? (
            <Pressable
              onPress={() => setExpanded((current) => !current)}
              style={styles.toggle}
              accessibilityRole="button"
            >
              <Text style={styles.toggleText}>
                {expanded ? "Mostrar menos" : `Ver los ${movements.length - COLLAPSED_LIMIT} restantes`}
              </Text>
            </Pressable>
          ) : null}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    marginTop: SPACING.lg,
    paddingTop: SPACING.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: SURFACE.separator,
  },
  title: {
    fontFamily: FONT_FAMILY.bodySemibold,
    fontSize: FONT_SIZE.md,
    color: COLORS.ink,
    marginBottom: SPACING.sm,
  },
  empty: {
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.sm,
    color: COLORS.storm,
  },
  toggle: { minHeight: 48, justifyContent: "center" },
  toggleText: { fontFamily: FONT_FAMILY.bodyMedium, fontSize: FONT_SIZE.sm, color: COLORS.fog },
});
