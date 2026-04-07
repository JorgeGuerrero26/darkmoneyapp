import { StyleSheet, Text, View } from "react-native";

import { useMovementQuery } from "../../services/queries/movements";
import { obligationViewerActsAsCollector } from "../../lib/obligation-viewer-labels";
import type {
  AccountSummary,
  ObligationEventSummary,
  ObligationSummary,
  SharedObligationSummary,
} from "../../types/domain";
import { formatCurrency } from "../ui/AmountDisplay";
import { COLORS, FONT_FAMILY, FONT_SIZE, GLASS, RADIUS, SPACING } from "../../constants/theme";

type Props = {
  event: ObligationEventSummary;
  obligation: ObligationSummary | SharedObligationSummary;
  accounts: AccountSummary[];
  actor: "owner" | "viewer";
  viewerLinkedAccountId?: number | null;
};

export function ObligationEventDeleteImpact({
  event,
  obligation,
  accounts,
  actor,
  viewerLinkedAccountId = null,
}: Props) {
  const { data: ownerMovement } = useMovementQuery(actor === "owner" ? event.movementId ?? null : null);

  if (event.eventType !== "payment") return null;

  const projectedPending = obligation.pendingAmount + event.amount;
  const ownerActsAsCollector = obligationViewerActsAsCollector(obligation.direction, false);
  const viewerActsAsCollector = obligationViewerActsAsCollector(obligation.direction, true);
  const accountDelta =
    actor === "owner"
      ? (ownerActsAsCollector ? -event.amount : event.amount)
      : (viewerActsAsCollector ? -event.amount : event.amount);

  const accountId =
    actor === "owner"
      ? (ownerMovement?.sourceAccountId ?? ownerMovement?.destinationAccountId ?? null)
      : viewerLinkedAccountId;
  const affectedAccount = accountId != null
    ? accounts.find((account) => account.id === accountId) ?? null
    : null;
  const projectedAccountBalance = affectedAccount
    ? affectedAccount.currentBalance + accountDelta
    : null;

  return (
    <View style={styles.container}>
      <View style={styles.row}>
        <Text style={styles.label}>Pendiente obligación</Text>
        <View style={styles.values}>
          <Text style={styles.from}>{formatCurrency(obligation.pendingAmount, obligation.currencyCode)}</Text>
          <Text style={styles.arrow}>→</Text>
          <Text style={styles.to}>{formatCurrency(projectedPending, obligation.currencyCode)}</Text>
        </View>
      </View>

      {affectedAccount && projectedAccountBalance != null ? (
        <View style={styles.accountCard}>
          <Text style={styles.accountTitle}>Cuenta afectada: {affectedAccount.name}</Text>
          <View style={styles.accountRow}>
            <Text style={styles.accountLabel}>Saldo actual</Text>
            <Text style={styles.accountValue}>
              {formatCurrency(affectedAccount.currentBalance, affectedAccount.currencyCode)}
            </Text>
          </View>
          <View style={styles.accountRow}>
            <Text style={styles.accountLabel}>Ajuste al eliminar</Text>
            <Text
              style={[
                styles.accountValue,
                accountDelta >= 0 ? styles.accountPositive : styles.accountNegative,
              ]}
            >
              {accountDelta >= 0 ? "+" : "-"}
              {formatCurrency(Math.abs(accountDelta), affectedAccount.currencyCode)}
            </Text>
          </View>
          <View style={styles.accountRow}>
            <Text style={styles.accountLabel}>Quedará en</Text>
            <Text style={styles.accountStrong}>
              {formatCurrency(projectedAccountBalance, affectedAccount.currencyCode)}
            </Text>
          </View>
        </View>
      ) : event.movementId || viewerLinkedAccountId ? (
        <Text style={styles.note}>El movimiento contable vinculado también se eliminará.</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: SPACING.xs,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.08)",
    paddingTop: SPACING.sm,
    gap: SPACING.sm,
  },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: SPACING.sm },
  label: { fontSize: FONT_SIZE.xs, color: COLORS.storm },
  values: { flexDirection: "row", alignItems: "center", gap: SPACING.xs },
  from: { fontSize: FONT_SIZE.xs, color: COLORS.textDisabled },
  arrow: { fontSize: FONT_SIZE.xs, color: COLORS.textDisabled },
  to: { fontSize: FONT_SIZE.xs, fontFamily: FONT_FAMILY.bodySemibold, color: COLORS.warning },
  accountCard: {
    backgroundColor: GLASS.card,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: GLASS.cardBorder,
    padding: SPACING.md,
    gap: SPACING.xs,
  },
  accountTitle: {
    fontSize: FONT_SIZE.sm,
    fontFamily: FONT_FAMILY.bodySemibold,
    color: COLORS.ink,
  },
  accountRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: SPACING.sm,
  },
  accountLabel: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.storm,
    fontFamily: FONT_FAMILY.bodyMedium,
  },
  accountValue: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.ink,
    fontFamily: FONT_FAMILY.bodySemibold,
  },
  accountStrong: {
    fontSize: FONT_SIZE.md,
    color: COLORS.ink,
    fontFamily: FONT_FAMILY.heading,
  },
  accountPositive: { color: COLORS.income },
  accountNegative: { color: COLORS.danger },
  note: { fontSize: FONT_SIZE.xs, color: COLORS.textDisabled, fontStyle: "italic" },
});
