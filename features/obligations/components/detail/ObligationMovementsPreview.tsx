import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { ChevronRight } from "lucide-react-native";
import { format } from "date-fns";
import { es } from "date-fns/locale";

import { formatCurrency } from "../../../../components/ui/AmountDisplay";
import { parseDisplayDate } from "../../../../lib/date";
import { COLORS, FONT_FAMILY, FONT_SIZE, RADIUS, SPACING, SURFACE } from "../../../../constants/theme";
import { describeObligationEvent } from "../../lib/describe-event";
import type { ObligationEventSummary, ObligationSummary, SharedObligationSummary } from "../../../../types/domain";

type Props = {
  obligation: ObligationSummary | SharedObligationSummary;
  /** Todos los movimientos, del más reciente al más antiguo. */
  events: ObligationEventSummary[];
  /** El saldo que quedó después de cada movimiento, por id. */
  balances: Map<number, number>;
  isReceivable: boolean;
  onSeeAll: () => void;
};

/** Cuántos se enseñan antes de "Ver los N movimientos". */
const PREVIEW_COUNT = 3;

/**
 * Los últimos movimientos de la obligación, en una sola lista cronológica.
 *
 * Es lo que uno viene a ver en una cuenta que se mueve, y estaba al final de la pantalla detrás
 * de un filtro que por defecto respondía "ningún evento en este rango". Aquí abre solo, con los
 * más recientes arriba.
 *
 * **Cada fila dice con cuánto quedó la cuenta**, debajo del monto. Es lo que reemplaza a las dos
 * cápsulas que explicaban el modelo de datos: enseña la mecánica sin instrucciones.
 */
export function ObligationMovementsPreview({
  obligation,
  events,
  balances,
  isReceivable,
  onSeeAll,
}: Props) {
  if (events.length === 0) return null;

  const sellsOnCredit = obligation.originType === "sale_financed";
  const preview = events.slice(0, PREVIEW_COUNT);
  const money = (amount: number) => formatCurrency(amount, obligation.currencyCode);

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.title}>Movimientos</Text>
        <Text style={styles.scope}>Todos · {events.length}</Text>
      </View>

      {preview.map((event) => {
        const described = describeObligationEvent(event, { sellsOnCredit, isReceivable });
        const balance = balances.get(event.id);
        const dateLabel = format(parseDisplayDate(event.eventDate), "d MMM", { locale: es });
        const detail = [dateLabel, described.detail].filter(Boolean).join(" · ");
        return (
          <View key={event.id} style={styles.row}>
            <View style={styles.copy}>
              <Text
                style={[styles.rowTitle, described.missingDescription && styles.rowTitleMissing]}
                numberOfLines={1}
              >
                {described.title}
              </Text>
              <Text style={styles.rowDetail} numberOfLines={1}>{detail}</Text>
            </View>
            <View style={styles.amounts}>
              {/* El signo dice hacia dónde se movió la deuda; el saldo va debajo, sin la
                  palabra "quedan" repetida en cada fila: la columna siempre significa lo mismo. */}
              <Text style={styles.amount} numberOfLines={1}>
                {described.reduces ? "− " : "+ "}{money(event.amount)}
              </Text>
              {balance != null ? (
                <Text style={styles.balance} numberOfLines={1}>{money(balance)}</Text>
              ) : null}
            </View>
          </View>
        );
      })}

      {events.length > PREVIEW_COUNT ? (
        <TouchableOpacity
          style={styles.seeAll}
          onPress={onSeeAll}
          activeOpacity={0.72}
          accessibilityRole="button"
        >
          <Text style={styles.seeAllText}>Ver los {events.length} movimientos</Text>
          <ChevronRight size={16} color={COLORS.storm} />
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: SURFACE.cardBorder,
    backgroundColor: SURFACE.card,
    overflow: "hidden",
  },
  header: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: SPACING.md,
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.sm,
  },
  title: {
    fontFamily: FONT_FAMILY.bodySemibold,
    fontSize: FONT_SIZE.xs,
    color: COLORS.storm,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  scope: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.xs, color: COLORS.storm },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm + 2,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: SURFACE.separator,
  },
  copy: { flex: 1, gap: 2 },
  rowTitle: { fontFamily: FONT_FAMILY.bodyMedium, fontSize: FONT_SIZE.md, color: COLORS.ink },
  rowTitleMissing: { fontStyle: "italic", color: COLORS.storm },
  rowDetail: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.xs, color: COLORS.storm },
  amounts: { alignItems: "flex-end", gap: 2 },
  amount: { fontFamily: FONT_FAMILY.heading, fontSize: FONT_SIZE.md, color: COLORS.ink },
  balance: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.xs, color: COLORS.storm },
  seeAll: {
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: SPACING.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: SURFACE.separator,
  },
  seeAllText: { fontFamily: FONT_FAMILY.bodyMedium, fontSize: FONT_SIZE.sm, color: COLORS.fog },
});
