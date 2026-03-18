import { StyleSheet, Text, View } from "react-native";
import { Card } from "../ui/Card";
import { AmountDisplay, formatCurrency } from "../ui/AmountDisplay";
import { COLORS, FONT_SIZE, FONT_WEIGHT, RADIUS, SPACING } from "../../constants/theme";
import type { AccountSummary } from "../../types/domain";

type Props = {
  account: AccountSummary;
  onPress?: () => void;
};

const ACCOUNT_TYPE_LABELS: Record<string, string> = {
  checking: "Cuenta corriente",
  savings: "Ahorro",
  credit_card: "Tarjeta de crédito",
  cash: "Efectivo",
  investment: "Inversión",
  loan: "Préstamo",
  other: "Otro",
};

export function AccountCard({ account, onPress }: Props) {
  const typeLabel = ACCOUNT_TYPE_LABELS[account.type] ?? account.type;
  const isNegative = account.currentBalance < 0;

  return (
    <Card onPress={onPress} style={styles.card}>
      <View style={styles.header}>
        <View style={[styles.iconWrap, { backgroundColor: account.color + "33" }]}>
          <Text style={[styles.icon, { color: account.color }]}>💳</Text>
        </View>
        <View style={styles.info}>
          <Text style={styles.name} numberOfLines={1}>
            {account.name}
          </Text>
          <Text style={styles.type}>{typeLabel}</Text>
        </View>
        <View style={styles.balanceWrap}>
          <Text
            style={[styles.balance, isNegative ? styles.balanceNegative : styles.balancePositive]}
          >
            {formatCurrency(account.currentBalance, account.currencyCode)}
          </Text>
          <Text style={styles.currency}>{account.currencyCode}</Text>
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: SPACING.md,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.md,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: RADIUS.md,
    alignItems: "center",
    justifyContent: "center",
  },
  icon: {
    fontSize: 20,
  },
  info: {
    flex: 1,
    gap: 2,
  },
  name: {
    fontSize: FONT_SIZE.sm,
    fontWeight: FONT_WEIGHT.semibold,
    color: COLORS.text,
  },
  type: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.textMuted,
  },
  balanceWrap: {
    alignItems: "flex-end",
    gap: 2,
  },
  balance: {
    fontSize: FONT_SIZE.md,
    fontWeight: FONT_WEIGHT.bold,
  },
  balancePositive: {
    color: COLORS.text,
  },
  balanceNegative: {
    color: COLORS.danger,
  },
  currency: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.textMuted,
  },
});
