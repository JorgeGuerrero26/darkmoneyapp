import { memo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { BarChart3, CalendarClock, Pin, PinOff } from "lucide-react-native";
import { format } from "date-fns";
import { es } from "date-fns/locale";

import { formatCurrency } from "../ui/AmountDisplay";
import {
  ResourceCard,
  ResourceCardBadge,
  ResourceCardIcon,
  ResourceCardMetaText,
} from "../ui/ResourceCard";
import { COLORS, FONT_FAMILY, FONT_SIZE, SPACING } from "../../constants/theme";
import type { SubscriptionSummary } from "../../types/domain";

type Props = {
  subscription: SubscriptionSummary;
  monthlyAmount: number;
  onPress: () => void;
  onAnalytics: () => void;
  onLongPress?: () => void;
  onTogglePin?: () => void;
  selected?: boolean;
};

const STATUS_LABEL = {
  active: "Activa",
  paused: "Pausada",
  cancelled: "Cancelada",
} as const;

function getStatusColor(status: SubscriptionSummary["status"]) {
  if (status === "active") return COLORS.primary;
  if (status === "paused") return COLORS.gold;
  return COLORS.storm;
}

function formatYmdLocal(ymd: string) {
  const p = ymd.split("-").map(Number);
  if (p.length !== 3 || p.some((n) => Number.isNaN(n))) return ymd;
  return format(new Date(p[0], p[1] - 1, p[2]), "d MMM", { locale: es });
}

function SubscriptionCardBase({
  subscription,
  monthlyAmount,
  onPress,
  onAnalytics,
  onLongPress,
  onTogglePin,
  selected = false,
}: Props) {
  const statusColor = getStatusColor(subscription.status);
  return (
    <ResourceCard
      title={subscription.name}
      subtitle={subscription.vendor || subscription.categoryName || "Suscripción"}
      archived={subscription.status === "cancelled"}
      selected={selected}
      onPress={onPress}
      onLongPress={onLongPress}
      leading={<ResourceCardIcon icon={CalendarClock} color={statusColor} />}
      actions={[
        ...(onTogglePin ? [{
          key: "pin",
          icon: subscription.isPinned ? PinOff : Pin,
          onPress: onTogglePin,
          color: subscription.isPinned ? COLORS.primary : COLORS.storm,
          accessibilityLabel: subscription.isPinned ? "Desfijar suscripción" : "Fijar suscripción",
        }] : []),
        {
          key: "analytics",
          icon: BarChart3,
          onPress: onAnalytics,
          accessibilityLabel: "Ver analítica de la suscripción",
        },
      ]}
      trailing={
        <View style={styles.trailing}>
          <Text style={[styles.amount, subscription.status !== "active" && styles.amountMuted]}>
            {formatCurrency(subscription.amount, subscription.currencyCode)}
          </Text>
          <Text style={styles.frequency}>{subscription.frequencyLabel}</Text>
        </View>
      }
      meta={
        <>
          <ResourceCardBadge label={STATUS_LABEL[subscription.status]} color={statusColor} />
          {subscription.autoCreateMovement ? <ResourceCardBadge label="Auto" color={COLORS.pine} /> : null}
          {subscription.accountName ? <ResourceCardMetaText>{subscription.accountName}</ResourceCardMetaText> : null}
        </>
      }
      footer={
        <View style={styles.footer}>
          <ResourceCardMetaText>
            Próximo: {formatYmdLocal(subscription.nextDueDate)}
          </ResourceCardMetaText>
          <Text style={styles.monthly}>
            ~{formatCurrency(monthlyAmount, subscription.currencyCode)}/mes
          </Text>
        </View>
      }
    />
  );
}

const styles = StyleSheet.create({
  trailing: {
    alignItems: "flex-end",
    gap: SPACING.xs / 2,
  },
  amount: {
    fontSize: FONT_SIZE.md,
    fontFamily: FONT_FAMILY.heading,
    color: COLORS.expense,
  },
  amountMuted: {
    color: COLORS.storm,
  },
  frequency: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.storm,
    fontFamily: FONT_FAMILY.body,
  },
  footer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: SPACING.sm,
  },
  monthly: {
    flexShrink: 0,
    fontSize: FONT_SIZE.xs,
    color: COLORS.storm,
    fontFamily: FONT_FAMILY.body,
  },
});

/** Memoizado: los cards se renderizan en listas largas; evita re-renders cuando las props son estables. */
export const SubscriptionCard = memo(SubscriptionCardBase);
