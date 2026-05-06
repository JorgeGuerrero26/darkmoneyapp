import { StyleSheet, Text } from "react-native";
import { Archive, ArchiveRestore, BarChart2 } from "lucide-react-native";

import {
  ResourceCard,
  ResourceCardIcon,
} from "../ui/ResourceCard";
import { SwipeActionRow } from "../ui/SwipeActionRow";
import { formatCurrency } from "../ui/AmountDisplay";
import { COLORS, FONT_FAMILY, FONT_SIZE, RADIUS } from "../../constants/theme";
import { getAccountIcon } from "../../lib/account-icons";
import type { AccountSummary } from "../../types/domain";

type Props = {
  account: AccountSummary;
  onPress?: () => void;
  onArchive?: () => void;
  onRestore?: () => void;
  onAnalytics?: () => void;
  onLongPress?: () => void;
  selected?: boolean;
  selectMode?: boolean;
};

const ACCOUNT_TYPE_LABELS: Record<string, string> = {
  checking: "Cuenta corriente",
  savings: "Ahorro",
  credit_card: "Tarjeta de crédito",
  cash: "Efectivo",
  investment: "Inversión",
  loan: "Préstamo",
  loan_wallet: "Cartera préstamos",
  bank: "Banco",
  other: "Otro",
};

function AccountCardContent({
  account,
  onPress,
  onLongPress,
  onAnalytics,
  selected,
}: {
  account: AccountSummary;
  onPress?: () => void;
  onLongPress?: () => void;
  onAnalytics?: () => void;
  selected?: boolean;
}) {
  const typeLabel = ACCOUNT_TYPE_LABELS[account.type] ?? account.type;
  const isNegative = account.currentBalance < 0;
  const AccountIcon = getAccountIcon(account.icon, account.type);

  return (
    <ResourceCard
      title={account.name}
      subtitle={`${typeLabel} · ${account.currencyCode}`}
      selected={selected}
      archived={account.isArchived}
      onPress={onPress}
      onLongPress={onLongPress}
      leading={<ResourceCardIcon icon={AccountIcon} color={account.color} />}
      actions={
        onAnalytics
          ? [{
              key: "analytics",
              icon: BarChart2,
              onPress: onAnalytics,
              accessibilityLabel: "Ver analítica de cuenta",
            }]
          : []
      }
      trailing={
        <Text style={[styles.balance, isNegative && styles.balanceNegative]}>
          {formatCurrency(account.currentBalance, account.currencyCode)}
        </Text>
      }
    />
  );
}

export function AccountCard({
  account,
  onPress,
  onArchive,
  onRestore,
  onAnalytics,
  onLongPress,
  selected,
}: Props) {
  const isSwipeable = Boolean(onArchive || onRestore);
  const rightAction = account.isArchived
    ? {
        label: "Restaurar",
        icon: ArchiveRestore,
        onPress: () => onRestore?.(),
        color: COLORS.pine,
        backgroundColor: COLORS.pine + "30",
      }
    : {
        label: "Archivar",
        icon: Archive,
        onPress: () => onArchive?.(),
        color: COLORS.ember,
        backgroundColor: COLORS.ember + "30",
      };

  if (!isSwipeable) {
    return (
      <AccountCardContent
        account={account}
        onPress={onPress}
        onLongPress={onLongPress}
        onAnalytics={onAnalytics}
        selected={selected}
      />
    );
  }

  return (
    <SwipeActionRow rightAction={rightAction} borderRadius={RADIUS.xl}>
      {({ close, isOpen }) => (
        <AccountCardContent
          account={account}
          onAnalytics={onAnalytics}
          selected={selected}
          onLongPress={onLongPress}
          onPress={() => {
            if (isOpen()) {
              close();
              return;
            }
            onPress?.();
          }}
        />
      )}
    </SwipeActionRow>
  );
}

const styles = StyleSheet.create({
  balance: {
    fontFamily: FONT_FAMILY.heading,
    fontSize: FONT_SIZE.md,
    color: COLORS.ink,
  },
  balanceNegative: {
    color: COLORS.rosewood,
  },
});
