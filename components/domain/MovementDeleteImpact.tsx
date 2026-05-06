import { StyleSheet, Text, View } from "react-native";

import { COLORS, FONT_FAMILY, FONT_SIZE, GLASS, SPACING } from "../../constants/theme";
import type { WorkspaceSnapshot } from "../../services/queries/workspace-data";
import type { MovementRecord } from "../../types/domain";

type Props = {
  movement: MovementRecord;
  snapshot: WorkspaceSnapshot | undefined;
};

export function MovementDeleteImpact({ movement, snapshot }: Props) {
  const accounts = snapshot?.accounts ?? [];
  const obligations = snapshot?.obligations ?? [];

  const isIncome = movement.movementType === "income" || movement.movementType === "refund";
  const isExpense = !isIncome && movement.movementType !== "transfer";

  const sourceAcc = accounts.find((account) => account.id === movement.sourceAccountId);
  const destAcc = accounts.find((account) => account.id === movement.destinationAccountId);
  const obligation = obligations.find((item) => item.id === movement.obligationId);

  const projectedSource = sourceAcc != null
    ? isIncome
      ? null
      : sourceAcc.currentBalance + (movement.sourceAmount ?? 0)
    : null;

  const projectedDest = destAcc != null
    ? isExpense
      ? null
      : destAcc.currentBalance - (movement.destinationAmount ?? 0)
    : null;

  const projectedPending = obligation != null
    ? obligation.pendingAmount + (movement.sourceAmount ?? movement.destinationAmount ?? 0)
    : null;

  const items: { label: string; from: number; to: number; currency: string }[] = [];
  if (projectedSource !== null && sourceAcc) {
    items.push({ label: sourceAcc.name, from: sourceAcc.currentBalance, to: projectedSource, currency: sourceAcc.currencyCode });
  }
  if (projectedDest !== null && destAcc) {
    items.push({ label: destAcc.name, from: destAcc.currentBalance, to: projectedDest, currency: destAcc.currencyCode });
  }
  if (projectedPending !== null && obligation) {
    items.push({ label: `Pendiente: ${obligation.title}`, from: obligation.pendingAmount, to: projectedPending, currency: obligation.currencyCode });
  }

  if (items.length === 0) return null;

  return (
    <View style={styles.container}>
      {items.map((item) => (
        <ImpactRow key={item.label} {...item} />
      ))}
    </View>
  );
}

function ImpactRow({ label, from, to, currency }: { label: string; from: number; to: number; currency: string }) {
  const worse = to < from;
  return (
    <View style={styles.row}>
      <Text style={styles.label} numberOfLines={1}>{label}</Text>
      <View style={styles.values}>
        <Text style={styles.fromVal}>{formatImpactAmount(from, currency)}</Text>
        <Text style={styles.arrow}>→</Text>
        <Text style={[styles.toVal, worse && styles.toValWorse]}>
          {formatImpactAmount(to, currency)}
        </Text>
      </View>
    </View>
  );
}

function formatImpactAmount(amount: number, currency: string) {
  return `${currency} ${amount.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const styles = StyleSheet.create({
  container: {
    marginTop: SPACING.xs,
    borderTopWidth: 1,
    borderTopColor: GLASS.separator,
    paddingTop: SPACING.sm,
    gap: SPACING.xs + 2,
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
    flex: 1,
  },
  values: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.xs,
  },
  fromVal: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.textDisabled,
  },
  arrow: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.textDisabled,
  },
  toVal: {
    fontSize: FONT_SIZE.xs,
    fontFamily: FONT_FAMILY.bodySemibold,
    color: COLORS.primary,
  },
  toValWorse: {
    color: COLORS.danger,
  },
});
