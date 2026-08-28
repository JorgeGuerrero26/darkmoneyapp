import { memo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { CalendarClock } from "lucide-react-native";
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
import { todayPeru } from "../../lib/date";
import type { SubscriptionSummary } from "../../types/domain";

type Props = {
  subscription: SubscriptionSummary;
  onPress: () => void;
  onLongPress?: () => void;
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
  onPress,
  onLongPress,
  selected = false,
}: Props) {
  const statusColor = getStatusColor(subscription.status);
  return (
    <ResourceCard
      pinned={subscription.isPinned}
      variant="row"
      title={subscription.name}
      subtitle={subscription.vendor || subscription.categoryName || "Suscripción"}
      archived={subscription.status === "cancelled"}
      selected={selected}
      onPress={onPress}
      onLongPress={onLongPress}
      leading={<ResourceCardIcon icon={CalendarClock} color={statusColor} />}
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
        // Sin el equivalente mensual: ya estaba escrito arriba a la derecha, y el total del mes
        // vive en el resumen de la pantalla. Aquí solo queda cuándo toca el próximo cobro.
        subscription.status === "cancelled" ? (
          <ResourceCardMetaText>Sin cobros programados</ResourceCardMetaText>
        ) : subscription.status === "active" && subscription.nextDueDate < todayPeru() ? (
          <Text style={styles.overdue}>Venció el {formatYmdLocal(subscription.nextDueDate)} · marca el pago</Text>
        ) : (
          <ResourceCardMetaText>Próximo: {formatYmdLocal(subscription.nextDueDate)}</ResourceCardMetaText>
        )
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
  overdue: {
    flexShrink: 1,
    fontSize: FONT_SIZE.xs,
    color: COLORS.rosewood,
    fontFamily: FONT_FAMILY.bodySemibold,
  },
});

/** Memoizado: los cards se renderizan en listas largas; evita re-renders cuando las props son estables. */
export const SubscriptionCard = memo(SubscriptionCardBase);
