import { memo } from "react";
import { StyleSheet, Text, View } from "react-native";

import { ConfirmDialog } from "../../../../components/ui/ConfirmDialog";
import { formatCurrency } from "../../../../components/ui/AmountDisplay";
import {
  COLORS,
  FONT_FAMILY,
  FONT_SIZE,
  RADIUS,
  SPACING,
  SURFACE,
} from "../../../../constants/theme";

export type VoidAccountImpact = {
  key: string;
  name: string;
  currencyCode: string;
  currentBalance: number;
  delta: number;
  projectedBalance: number;
};

type Props = {
  visible: boolean;
  impacts: VoidAccountImpact[];
  onCancel: () => void;
  onConfirm: () => void;
};

export const VoidMovementConfirm = memo(function VoidMovementConfirm({
  visible,
  impacts,
  onCancel,
  onConfirm,
}: Props) {
  return (
    <ConfirmDialog
      visible={visible}
      title="Anular movimiento"
      body="El movimiento quedara anulado y se revertira su efecto en tus balances."
      confirmLabel="Anular"
      cancelLabel="Cancelar"
      onCancel={onCancel}
      onConfirm={onConfirm}
    >
      {impacts.length > 0 ? (
        <View style={styles.container}>
          {impacts.map((impact) => (
            <View key={impact.key} style={styles.card}>
              <Text style={styles.title}>Cuenta afectada: {impact.name}</Text>
              <View style={styles.row}>
                <Text style={styles.label}>Saldo actual</Text>
                <Text style={styles.value}>
                  {formatCurrency(impact.currentBalance, impact.currencyCode)}
                </Text>
              </View>
              <View style={styles.row}>
                <Text style={styles.label}>Ajuste al anular</Text>
                <Text
                  style={[
                    styles.value,
                    impact.delta >= 0 ? styles.positive : styles.negative,
                  ]}
                >
                  {impact.delta >= 0 ? "+" : "-"}
                  {formatCurrency(Math.abs(impact.delta), impact.currencyCode)}
                </Text>
              </View>
              <View style={styles.row}>
                <Text style={styles.label}>Quedara en</Text>
                <Text style={styles.strong}>
                  {formatCurrency(impact.projectedBalance, impact.currencyCode)}
                </Text>
              </View>
            </View>
          ))}
        </View>
      ) : null}
    </ConfirmDialog>
  );
});

const styles = StyleSheet.create({
  container: {
    marginTop: SPACING.xs,
    borderTopWidth: 1,
    borderTopColor: SURFACE.separator,
    paddingTop: SPACING.sm,
    gap: SPACING.sm,
  },
  card: {
    backgroundColor: SURFACE.card,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: SURFACE.cardBorder,
    padding: SPACING.md,
    gap: SPACING.xs,
  },
  title: {
    fontSize: FONT_SIZE.sm,
    fontFamily: FONT_FAMILY.bodySemibold,
    color: COLORS.ink,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: SPACING.sm,
  },
  label: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.storm,
    fontFamily: FONT_FAMILY.bodyMedium,
  },
  value: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.ink,
    fontFamily: FONT_FAMILY.bodySemibold,
  },
  strong: {
    fontSize: FONT_SIZE.md,
    color: COLORS.ink,
    fontFamily: FONT_FAMILY.heading,
  },
  positive: { color: COLORS.income },
  negative: { color: COLORS.danger },
});
