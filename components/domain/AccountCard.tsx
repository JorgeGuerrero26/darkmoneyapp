import { memo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Archive, ArchiveRestore } from "lucide-react-native";

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
import { TYPE_PRESETS } from "../../features/accounts/lib/account-types";
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
  /**
   * La moneda NO va en el subtítulo: el monto de al lado ya empieza por su símbolo, y cuando la
   * cuenta está en otra moneda que el patrimonio ya lo dice su distintivo. Escrito en las dos
   * filas y en las dos iguales, no distinguía una de otra.
   */
  const subtitle = institution ? institution.label : typeLabel;
  /**
   * El color solo cuando lo eligió el usuario en Apariencia. Al crear la cuenta se pone el del
   * preset de su tipo, así que pintar por él hacía que dos cuentas "Banco" salieran de colores
   * distintos sin que eso significara nada.
   */
  const presetColor = TYPE_PRESETS[account.type]?.color;
  const chosenColor = account.color && account.color !== presetColor ? account.color : null;

  return (
    <ResourceCard
      variant="row"
      title={account.name}
      subtitle={subtitle}
      selected={selected}
      archived={account.isArchived}
      onPress={onPress}
      onLongPress={onLongPress}
      leading={<ResourceCardIcon icon={AccountIcon} color={chosenColor} />}
      meta={
        badge ? (
          <View style={[styles.badge, badge.tone === "danger" && styles.badgeDanger, badge.tone === "muted" && styles.badgeMuted, badge.tone === "info" && styles.badgeInfo]}>
            <Text style={[styles.badgeText, badge.tone === "danger" && styles.badgeTextDanger, badge.tone === "muted" && styles.badgeTextMuted, badge.tone === "info" && styles.badgeTextInfo]}>
              {badge.label}
            </Text>
          </View>
        ) : null
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
    <SwipeActionRow rightAction={rightAction} borderRadius={0}>
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
