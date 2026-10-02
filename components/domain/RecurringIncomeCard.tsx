import { memo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { ChevronRight } from "lucide-react-native";
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
  onPress: () => void;
  onLongPress?: () => void;
  selected?: boolean;
};

function formatYmdLocal(ymd: string) {
  const p = ymd.split("-").map(Number);
  if (p.length !== 3 || p.some((n) => Number.isNaN(n))) return ymd;
  return format(new Date(p[0], p[1] - 1, p[2]), "d MMM", { locale: es });
}

/** Fila de libro: nombre, fecha esperada, importe, frecuencia y acceso al detalle. */
function RecurringIncomeCardBase({
  item,
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
        <View style={styles.trailing}>
          <View style={styles.amountBlock}>
            <Text style={[styles.amount, !isActive && styles.amountMuted]}>
              {formatCurrency(item.amount, item.currencyCode)}
            </Text>
            <Text style={styles.cadence} numberOfLines={1}>{cadence.toLowerCase()}</Text>
          </View>
          <ChevronRight size={18} color={COLORS.textDisabled} />
        </View>
      }
    />
  );
}

const styles = StyleSheet.create({
  trailing: { flexDirection: "row", alignItems: "center", gap: SPACING.sm },
  amountBlock: { alignItems: "flex-end" },
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
