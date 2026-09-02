import { useMemo, useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { ChevronRight } from "lucide-react-native";
import { differenceInCalendarDays as daysBetween, format, parseISO } from "date-fns";
import { es } from "date-fns/locale";

import { formatCurrency } from "../../../../components/ui/AmountDisplay";
import { COLORS, FONT_FAMILY, FONT_SIZE, SPACING, SURFACE } from "../../../../constants/theme";
import { coverPlan, parsePaymentPlan, type ActualPayment, type PlanCoverage } from "../../lib/payment-plan";
import type { ObligationSummary } from "../../../../types/domain";

type Props = {
  obligation: ObligationSummary;
};

/** Cuántas cuotas por venir se ven junto a la que toca. */
const AHEAD = 2;

function capitalize(text: string) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * El plan de pagos contra lo que de verdad entró.
 *
 * **Filas, no bloques.** Cada pago ocupaba tres líneas —mes, fecha, y una explicación de la
 * desviación repetida en todas— y se pintaban las doce: casi tres pantallas para un dato que se
 * mira de reojo. Ahora es una fila por cuota, como en Movimientos, sobre el lienzo y sin recuadro
 * propio.
 *
 * **Una ventana, no la lista entera.** La tarjeta de justo debajo ya enseñaba tres movimientos y
 * ofrecía "Ver los 26"; esta era la única que no lo hacía. Pero un plan mira al futuro, así que no
 * se corta por el final —eso escondería justo la cuota que toca—: lo ya cubierto se pliega en una
 * línea con su total, y se ven la que toca y las dos siguientes.
 *
 * **Y desaparecieron las nueve notas al pie.** "Se suma al final; el plan no cambia" salía en cada
 * fila pagada porque cada pago se emparejaba con una cuota y casi ninguno coincidía. Con la
 * cascada no hay desviación que explicar: el dinero llena cuotas en orden y lo que sobra pasa a la
 * siguiente.
 */
export function PlanVsPaymentsCard({ obligation }: Props) {
  const plan = parsePaymentPlan(obligation.paymentPlan);
  const [expanded, setExpanded] = useState(false);

  const rows = useMemo(() => {
    if (!plan) return [];
    const payments: ActualPayment[] = obligation.events
      .filter((event) => event.eventType === "payment")
      .map((event) => ({ amount: event.amount, date: event.eventDate }));
    return coverPlan({
      plan,
      openingPrincipal: obligation.principalAmount,
      // La deuda de hoy: apertura + aumentos − reducciones. Es la misma cifra que enseña la
      // tarjeta "Cómo llegó a S/ …" justo arriba.
      currentDebt:
        obligation.currentPrincipalAmount && obligation.currentPrincipalAmount > 0
          ? obligation.currentPrincipalAmount
          : obligation.principalAmount,
      startDate: obligation.startDate,
      payments,
    });
  }, [obligation, plan]);

  if (!plan || rows.length === 0) return null;

  const money = (amount: number) => formatCurrency(amount, obligation.currencyCode);

  const coveredRows = rows.filter((row) => row.status === "covered");
  const openIndex = rows.findIndex((row) => row.status !== "covered");
  const visible = expanded
    ? rows
    : openIndex < 0
      ? []
      : rows.slice(openIndex, openIndex + 1 + AHEAD);
  const hiddenAhead = expanded ? 0 : Math.max(0, rows.length - (openIndex < 0 ? rows.length : openIndex + 1 + AHEAD));
  const coveredTotal = coveredRows.reduce((sum, row) => sum + row.covered, 0);

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.title}>Plan y pagos</Text>
        <Text style={styles.scope}>
          {coveredRows.length} de {rows.length} cubiertas
        </Text>
      </View>

      {/* Lo cubierto se pliega: son cuotas cerradas, no hay nada que hacer con ellas. */}
      {!expanded && coveredRows.length > 0 ? (
        <TouchableOpacity
          style={styles.row}
          onPress={() => setExpanded(true)}
          activeOpacity={0.72}
          accessibilityRole="button"
          accessibilityLabel={`Ver las ${coveredRows.length} cuotas cubiertas`}
        >
          <View style={styles.rowCopy}>
            <Text style={styles.support}>
              {coveredRows.length} {coveredRows.length === 1 ? "cuota cubierta" : "cuotas cubiertas"}
            </Text>
          </View>
          <Text style={[styles.amount, styles.amountCovered]}>{money(coveredTotal)}</Text>
        </TouchableOpacity>
      ) : null}

      {visible.map((row) => (
        <PlanRow
          key={row.seq}
          row={row}
          money={money}
          isNext={openIndex >= 0 && row.seq === rows[openIndex].seq}
        />
      ))}

      {hiddenAhead > 0 ? (
        <TouchableOpacity
          style={styles.seeAll}
          onPress={() => setExpanded(true)}
          activeOpacity={0.72}
          accessibilityRole="button"
        >
          <Text style={styles.seeAllText}>Ver el plan completo ({rows.length} pagos)</Text>
          <ChevronRight size={15} color={COLORS.storm} />
        </TouchableOpacity>
      ) : null}

      {expanded ? (
        <TouchableOpacity
          style={styles.seeAll}
          onPress={() => setExpanded(false)}
          activeOpacity={0.72}
          accessibilityRole="button"
        >
          <Text style={styles.seeAllText}>Ver menos</Text>
        </TouchableOpacity>
      ) : hiddenAhead === 0 ? (
        <View style={styles.bottomRule} />
      ) : null}
    </View>
  );
}

function PlanRow({
  row,
  money,
  isNext,
}: {
  row: PlanCoverage;
  money: (amount: number) => string;
  isNext: boolean;
}) {
  /* Una sola línea de apoyo, y solo cuando dice algo: la cubierta dice cuándo se cerró, la que
     toca cuánto le falta, y las de más adelante no dicen nada porque no hay nada que decir. */
  const support =
    row.status === "covered"
      ? row.coveredAt
        ? `Cubierta el ${format(parseISO(row.coveredAt), "d 'de' MMM", { locale: es })}`
        : "Cubierta"
      : row.status === "partial"
        ? `Cubierta ${money(row.covered)} · faltan ${money(row.remaining)}`
        : isNext
          ? dueLabel(row.dueDate)
          : null;

  return (
    <View style={styles.row}>
      <View style={styles.rowCopy}>
        {/* Con el año: un plan largo enseña dos veces "marzo". */}
        <Text style={styles.month}>{capitalize(format(parseISO(row.dueDate), "LLL yyyy", { locale: es }))}</Text>
        {support ? <Text style={styles.support}>{support}</Text> : null}
      </View>
      <View style={styles.amounts}>
        <Text style={[styles.amount, row.status === "covered" && styles.amountCovered]} numberOfLines={1}>
          {money(row.amount)}
        </Text>
      </View>
    </View>
  );
}

/** Lo que importa es cuánto falta, no el día exacto. */
function dueLabel(dueDate: string) {
  const days = daysBetween(parseISO(dueDate), new Date());
  if (days > 1) return `Toca en ${days} días`;
  if (days === 1) return "Toca mañana";
  if (days === 0) return "Toca hoy";
  const late = Math.abs(days);
  return `Venció hace ${late} ${late === 1 ? "día" : "días"}`;
}

const styles = StyleSheet.create({
  /**
   * Sin caja, igual que la lista de Movimientos de esta misma pantalla.
   *
   * Tenía borde, fondo propio y esquinas redondeadas: una tarjeta apilada entre tarjetas, con las
   * filas metidas dentro. El plan es **la otra lista** de la pantalla, así que se lee igual que
   * aquélla — rótulo en el margen, filas sobre el lienzo, y una línea fina entre una y otra.
   */
  card: {},
  header: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: SPACING.md,
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
    paddingVertical: SPACING.sm + 2,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: SURFACE.separator,
  },
  rowCopy: { flex: 1, gap: 2 },
  month: { fontFamily: FONT_FAMILY.bodyMedium, fontSize: FONT_SIZE.md, color: COLORS.ink },
  support: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.xs, color: COLORS.storm },
  amounts: { alignItems: "flex-end", gap: 2 },
  amount: { fontFamily: FONT_FAMILY.heading, fontSize: FONT_SIZE.md, color: COLORS.ink },
  /** Lo cubierto ya no reclama nada: baja a gris y deja el hueso para lo que falta. */
  amountCovered: { color: COLORS.storm },

  seeAll: {
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: SURFACE.separator,
  },
  seeAllText: { fontFamily: FONT_FAMILY.bodyMedium, fontSize: FONT_SIZE.sm, color: COLORS.fog },
  /** Cierra la lista cuando no hay nada que desplegar. */
  bottomRule: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: SURFACE.separator,
  },
});
