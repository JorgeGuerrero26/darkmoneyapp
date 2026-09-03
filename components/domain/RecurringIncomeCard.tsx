import { memo } from "react";
import { StyleSheet, Text } from "react-native";
import { format } from "date-fns";
import { es } from "date-fns/locale";

import { formatCurrency } from "../ui/AmountDisplay";
import { ResourceCard } from "../ui/ResourceCard";
import { COLORS, FONT_FAMILY, FONT_SIZE, SPACING } from "../../constants/theme";
import { todayPeru } from "../../lib/date";
import { subscriptionRecurrencePhrase } from "../../lib/subscription-helpers";
import { recurringIncomeStanding } from "../../features/recurring-income/lib/recurringIncomeStanding";
import type { RecurringIncomeSummary } from "../../types/domain";

type Props = {
  item: RecurringIncomeSummary;
  monthlyAmount: number;
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
 * Un ingreso fijo en la lista: la misma línea que suscripciones y movimientos.
 *
 * **La cápsula "Activo" en verde se va**, igual que en la revisión 25 — y aquí hacía más daño:
 * decía "Activo" mientras la fecha esperada llevaba treinta y seis días atrás, en gris y con el
 * mismo peso que cualquier otro dato. Nada distinguía "va a llegar el 29" de "se esperaba el 29
 * y no llegó". El estado lo dice ahora la sección, y el subtítulo dice la cuenta.
 *
 * **El equivalente mensual solo aparece cuando la cadencia no es mensual.** Al pie de cada fila
 * salía "~S/ 2,630.50/mes" para un ingreso mensual de S/ 2,630.50: el mismo número tres veces
 * en la misma pantalla —total, monto y pie— porque se calculaba el equivalente mensual de algo
 * que ya era mensual. Donde sí dice algo —un quincenal, uno anual— va pegado a la cadencia.
 */
function RecurringIncomeCardBase({
  item,
  monthlyAmount,
  onPress,
  onLongPress,
  selected = false,
}: Props) {
  const isActive = item.status === "active";
  const standing = recurringIncomeStanding({
    item,
    today: todayPeru(),
    formatAmount: (value) => formatCurrency(value, item.currencyCode),
    formatDate: formatYmdLocal,
  });

  const cadence = subscriptionRecurrencePhrase(item.intervalCount, item.frequency, item.dayOfMonth);
  const isMonthlyAlready = item.frequency === "monthly" && item.intervalCount <= 1;
  const cadenceLine = isMonthlyAlready
    ? cadence.toLowerCase()
    : `${cadence.toLowerCase()} · ${formatCurrency(monthlyAmount, item.currencyCode)}/mes`;

  return (
    <ResourceCard
      variant="line"
      pinned={item.isPinned}
      title={item.name}
      muted={!isActive}
      subtitle={standing.detail}
      subtitleTone={standing.tone === "unconfirmed" ? "alert" : "muted"}
      archived={item.status === "cancelled"}
      selected={selected}
      onPress={onPress}
      onLongPress={onLongPress}
      trailing={
        <>
          <Text style={[styles.amount, !isActive && styles.amountMuted]}>
            {formatCurrency(item.amount, item.currencyCode)}
          </Text>
          <Text style={styles.cadence} numberOfLines={1}>{cadenceLine}</Text>
        </>
      }
    />
  );
}

const styles = StyleSheet.create({
  /* Hueso, no menta: la menta se reserva para el ingreso YA confirmado, en Movimientos. Aquí
     es lo que se espera, y esperar no es haber cobrado. */
  amount: { fontFamily: FONT_FAMILY.heading, fontSize: FONT_SIZE.md, color: COLORS.ink },
  amountMuted: { color: COLORS.storm },
  cadence: {
    marginTop: SPACING.xs / 2,
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.xs,
    color: COLORS.storm,
  },
});

export const RecurringIncomeCard = memo(RecurringIncomeCardBase);
