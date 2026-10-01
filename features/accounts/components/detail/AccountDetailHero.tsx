import { memo } from "react";
import { StyleSheet, Text, View } from "react-native";

import { AmountDisplay, formatCurrency } from "../../../../components/ui/AmountDisplay";
import { COLORS, FONT_FAMILY, FONT_SIZE, SPACING, SURFACE } from "../../../../constants/theme";
import type { AccountSummary } from "../../../../types/domain";
import { accountDetailTypeLabel } from "../../lib/account-detail-labels";

type Props = {
  account: AccountSummary;
  displayBalance: number;
  displayCurrency: string;
};

export const AccountDetailHero = memo(function AccountDetailHero({ account, displayBalance, displayCurrency }: Props) {
  const converted = displayCurrency !== account.currencyCode;
  return (
    <View style={styles.hero}>
      <Text style={styles.labels}>
        {accountDetailTypeLabel(account.type)} · {account.isArchived ? "Archivada" : "Activa"}
      </Text>
      <AmountDisplay
        flat
        amount={displayBalance}
        currencyCode={displayCurrency}
        size="xl"
        color={displayBalance < 0 ? COLORS.expense : COLORS.ink}
        prefix=""
      />
      <Text style={styles.caption}>
        {converted
          ? `Saldo actual · ${formatCurrency(account.currentBalance, account.currencyCode)} en su moneda`
          : "Saldo actual"}
      </Text>
    </View>
  );
});

const styles = StyleSheet.create({
  hero: {
    alignItems: "center",
    gap: SPACING.xs,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: SURFACE.separator,
  },
  labels: {
    fontFamily: FONT_FAMILY.bodyMedium,
    fontSize: FONT_SIZE.xs,
    color: COLORS.storm,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  caption: {
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.sm,
    color: COLORS.storm,
    textAlign: "center",
  },
});
