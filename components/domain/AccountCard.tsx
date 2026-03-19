import { StyleSheet, Text, View } from "react-native";
import { CreditCard, Wallet, Landmark, PiggyBank, TrendingUp, Banknote } from "lucide-react-native";
import { Card } from "../ui/Card";
import { formatCurrency } from "../ui/AmountDisplay";
import { COLORS, FONT_FAMILY, FONT_SIZE, RADIUS, SPACING } from "../../constants/theme";
import type { AccountSummary } from "../../types/domain";

type Props = {
  account: AccountSummary;
  onPress?: () => void;
};

const ACCOUNT_TYPE_LABELS: Record<string, string> = {
  checking:    "Cuenta corriente",
  savings:     "Ahorro",
  credit_card: "Tarjeta de crédito",
  cash:        "Efectivo",
  investment:  "Inversión",
  loan:        "Préstamo",
  loan_wallet: "Cartera préstamos",
  bank:        "Banco",
  other:       "Otro",
};

const ACCOUNT_TYPE_ICON: Record<string, typeof CreditCard> = {
  credit_card: CreditCard,
  cash:        Banknote,
  savings:     PiggyBank,
  investment:  TrendingUp,
  bank:        Landmark,
  loan:        Wallet,
  loan_wallet: Wallet,
  other:       Wallet,
};

export function AccountCard({ account, onPress }: Props) {
  const typeLabel = ACCOUNT_TYPE_LABELS[account.type] ?? account.type;
  const isNegative = account.currentBalance < 0;
  const AccountIcon = ACCOUNT_TYPE_ICON[account.type] ?? Wallet;

  return (
    <Card onPress={onPress} style={styles.card}>
      <View style={styles.row}>
        {/* Colored icon — radius 22pt per spec */}
        <View style={[styles.iconWrap, { backgroundColor: account.color + "22" }]}>
          <AccountIcon size={20} color={account.color} />
        </View>

        {/* Name + type */}
        <View style={styles.info}>
          <Text style={styles.name} numberOfLines={1}>{account.name}</Text>
          <Text style={styles.sub}>{typeLabel} · {account.currencyCode}</Text>
        </View>

        {/* Balance */}
        <Text style={[styles.balance, isNegative && styles.balanceNeg]}>
          {formatCurrency(account.currentBalance, account.currencyCode)}
        </Text>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: SPACING.md,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.md,
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: RADIUS.lg,  // 22pt
    alignItems: "center",
    justifyContent: "center",
  },
  info: {
    flex: 1,
    gap: 3,
  },
  name: {
    fontFamily: FONT_FAMILY.bodySemibold,
    fontSize: FONT_SIZE.sm,
    color: COLORS.ink,
  },
  sub: {
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.xs,
    color: COLORS.storm,
  },
  balance: {
    fontFamily: FONT_FAMILY.heading,
    fontSize: FONT_SIZE.md,
    color: COLORS.ink,
  },
  balanceNeg: {
    color: COLORS.rosewood,
  },
});
