import { memo } from "react";
import { StyleSheet, Text } from "react-native";
import { format } from "date-fns";
import { es } from "date-fns/locale";

import { formatCurrency } from "../ui/AmountDisplay";
import { ResourceCard } from "../ui/ResourceCard";
import { COLORS, FONT_FAMILY, FONT_SIZE, SPACING } from "../../constants/theme";
import { todayPeru } from "../../lib/date";
import { subscriptionRecurrencePhrase } from "../../lib/subscription-helpers";
import type { SubscriptionSummary } from "../../types/domain";

type Props = {
  subscription: SubscriptionSummary;
  onPress: () => void;
  onLongPress?: () => void;
  selected?: boolean;
};

function formatYmdLocal(ymd: string) {
  const p = ymd.split("-").map(Number);
  if (p.length !== 3 || p.some((n) => Number.isNaN(n))) return ymd;
  return format(new Date(p[0], p[1] - 1, p[2]), "d MMM", { locale: es });
}

/**
 * Una suscripción en la lista: una línea, como en Movimientos y Cuentas.
 *
 * **La cápsula se fue.** Decía "Activa" en verde mientras el renglón de debajo decía "Venció el
 * 4 jun" en clay: dos señales para un estado, contradiciéndose dentro de la misma fila. Es la
 * misma contradicción que el detalle arrastraba (revisión 24). Si venció lo dice el subtítulo;
 * si está pausada lo dice la sección que la agrupa. **Ningún estado necesita a la vez una
 * cápsula, un color y una línea de texto.**
 *
 * Y al salir la cápsula, el renglón clay deja de ser una línea suelta de ancho completo que
 * rompía el ritmo de la lista: pasa a ser la segunda línea de su propia fila.
 *
 * Se van también el recuadro del ícono —idéntico en todas las filas, así que no distinguía
 * nada—, el subtítulo "Suscripción" —lo dice el título de la pantalla— y el chevrón.
 */
function SubscriptionCardBase({
  subscription,
  onPress,
  onLongPress,
  selected = false,
}: Props) {
  const isActive = subscription.status === "active";
  const overdue = isActive && subscription.nextDueDate < todayPeru();

  const subtitle =
    subscription.status === "cancelled"
      ? "Cancelada · sin cobros programados"
      : subscription.status === "paused"
        ? /* "Próximo: 12 may" anunciaba un cobro que no va a ocurrir. Y no decimos "en pausa
             desde": la fecha que tenemos es el cobro que quedó pendiente, no el día en que se
             pausó — no hay columna que lo guarde y no vale inventarla para una línea. */
          `Pausada · el cobro quedó en el ${formatYmdLocal(subscription.nextDueDate)}`
        : overdue
          ? `Venció el ${formatYmdLocal(subscription.nextDueDate)}`
          : `Se cobra el ${formatYmdLocal(subscription.nextDueDate)}`;

  return (
    <ResourceCard
      variant="line"
      pinned={subscription.isPinned}
      title={subscription.name}
      muted={!isActive}
      subtitle={subtitle}
      subtitleTone={overdue ? "alert" : "muted"}
      archived={subscription.status === "cancelled"}
      selected={selected}
      onPress={onPress}
      onLongPress={onLongPress}
      trailing={
        <>
          <Text style={[styles.amount, !isActive && styles.amountMuted]}>
            {formatCurrency(subscription.amount, subscription.currencyCode)}
          </Text>
          <Text style={styles.cadence}>
            {subscriptionRecurrencePhrase(subscription.intervalCount, subscription.frequency).toLowerCase()}
          </Text>
        </>
      }
    />
  );
}

const styles = StyleSheet.create({
  amount: {
    fontFamily: FONT_FAMILY.heading,
    fontSize: FONT_SIZE.md,
    color: COLORS.ink,
  },
  /** Lo pausado no suma al total, así que tampoco compite en la lista. */
  amountMuted: { color: COLORS.storm },
  cadence: {
    marginTop: SPACING.xs / 2,
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.xs,
    color: COLORS.storm,
  },
});

/** Memoizado: los cards se renderizan en listas largas; evita re-renders cuando las props son estables. */
export const SubscriptionCard = memo(SubscriptionCardBase);
