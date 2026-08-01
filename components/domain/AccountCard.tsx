import { memo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Archive, ArchiveRestore, BarChart2 } from "lucide-react-native";

import {
  ResourceCard,
  ResourceCardIcon,
} from "../ui/ResourceCard";
import { SwipeActionRow } from "../ui/SwipeActionRow";
import { formatCurrency } from "../ui/AmountDisplay";
import { useUiStore } from "../../store/ui-store";
import { COLORS, FONT_FAMILY, FONT_SIZE, RADIUS, SPACING } from "../../constants/theme";
import { getAccountIcon } from "../../lib/account-icons";
import { findInstitution } from "../../lib/account-institutions";
import { pickAccountBadge } from "../../features/accounts/lib/badges";
import type { AccountSummary } from "../../types/domain";

type Props = {
  account: AccountSummary;
  /** Workspace base currency, used to detect foreign-currency accounts. */
  baseCurrencyCode?: string;
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
  baseCurrencyCode,
  onPress,
  onLongPress,
  onAnalytics,
  selected,
}: {
  account: AccountSummary;
  baseCurrencyCode?: string;
  onPress?: () => void;
  onLongPress?: () => void;
  onAnalytics?: () => void;
  selected?: boolean;
}) {
  const typeLabel = ACCOUNT_TYPE_LABELS[account.type] ?? account.type;
  const isNegative = account.currentBalance < 0;
  const AccountIcon = getAccountIcon(account.icon, account.type);
  const badge = pickAccountBadge(account, baseCurrencyCode);
  const institution = findInstitution(account.institutionCode);
  const subtitle = institution
    ? `${institution.label} · ${typeLabel} · ${account.currencyCode}`
    : `${typeLabel} · ${account.currencyCode}`;

  return (
    <ResourceCard
      title={account.name}
      subtitle={subtitle}
      selected={selected}
      archived={account.isArchived}
      onPress={onPress}
      onLongPress={onLongPress}
      leading={<ResourceCardIcon icon={AccountIcon} color={account.color} />}
      meta={
        badge ? (
          <View style={[styles.badge, badge.tone === "danger" && styles.badgeDanger, badge.tone === "muted" && styles.badgeMuted, badge.tone === "info" && styles.badgeInfo]}>
            <Text style={[styles.badgeText, badge.tone === "danger" && styles.badgeTextDanger, badge.tone === "muted" && styles.badgeTextMuted, badge.tone === "info" && styles.badgeTextInfo]}>
              {badge.label}
            </Text>
          </View>
        ) : null
      }
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

function AccountCardBase({
  account,
  baseCurrencyCode,
  onPress,
  onArchive,
  onRestore,
  onAnalytics,
  onLongPress,
  selected,
}: Props) {
  // Suscripción propia: invalida el memo cuando cambia el modo privacidad
  // (los props no cambian al alternar, sin esto la fila mostraría el monto viejo).
  useUiStore((state) => state.privacyMode);
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
        baseCurrencyCode={baseCurrencyCode}
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
          baseCurrencyCode={baseCurrencyCode}
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
  badge: {
    alignSelf: "flex-start",
    paddingHorizontal: SPACING.sm,
    paddingVertical: 2,
    borderRadius: RADIUS.full,
    borderWidth: StyleSheet.hairlineWidth,
  },
  badgeDanger: {
    backgroundColor: COLORS.dangerSoft + "1F",
    borderColor: COLORS.dangerSoft + "55",
  },
  badgeMuted: {
    backgroundColor: COLORS.storm + "1A",
    borderColor: COLORS.storm + "44",
  },
  badgeInfo: {
    backgroundColor: COLORS.ember + "1F",
    borderColor: COLORS.ember + "55",
  },
  badgeText: {
    fontFamily: FONT_FAMILY.bodyMedium,
    fontSize: FONT_SIZE.xs,
    letterSpacing: 0.2,
  },
  badgeTextDanger: { color: COLORS.dangerSoft },
  badgeTextMuted: { color: COLORS.storm },
  badgeTextInfo: { color: COLORS.ember },
});

/** Memoizado: los cards se renderizan en listas largas; evita re-renders cuando las props son estables. */
export const AccountCard = memo(AccountCardBase);
