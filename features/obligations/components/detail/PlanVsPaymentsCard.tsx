import { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { differenceInCalendarDays, format, parseISO } from "date-fns";
import { es } from "date-fns/locale";

import { formatCurrency } from "../../../../components/ui/AmountDisplay";
import { COLORS, FONT_FAMILY, FONT_SIZE, RADIUS, SPACING, SURFACE } from "../../../../constants/theme";
import { parsePaymentPlan, reconcilePlan, type ActualPayment } from "../../lib/payment-plan";
import type { ObligationSummary } from "../../../../types/domain";

type Props = {
  obligation: ObligationSummary;
};

function capitalize(text: string) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * El plan de pagos contra lo que de verdad entró.
 *
 * **Cada fila lleva las dos cifras**: el monto acordado en gris pequeño y lo pagado en hueso
 * grande. Cuando coinciden, la repetición no molesta porque se lee de un golpe; cuando no
 * —300 acordado, 320 pagado— la diferencia salta **sin pintar nada de rojo ni de verde**. No
 * hace falta color para mostrar una discrepancia si están los dos números juntos.
 *
 * Y el excedente no corrige los pagos siguientes, que son montos pactados con otra persona:
 * baja al último pago calculado, que ya existía para absorber el saldo. La explicación aparece
 * **solo en la fila que se desvió**, no como aviso general.
 */
export function PlanVsPaymentsCard({ obligation }: Props) {
  const plan = parsePaymentPlan(obligation.paymentPlan);

  const rows = useMemo(() => {
    if (!plan) return [];
    const payments: ActualPayment[] = obligation.events
      .filter((event) => event.eventType === "payment")
      .map((event) => ({ amount: event.amount, date: event.eventDate }));
    return reconcilePlan({
      plan,
      principal: obligation.principalAmount,
      startDate: obligation.startDate,
      payments,
    });
  }, [obligation.events, obligation.principalAmount, obligation.startDate, plan]);

  if (!plan || rows.length === 0) return null;

  const money = (amount: number) => formatCurrency(amount, obligation.currencyCode);
  const firstPendingSeq = rows.find((row) => row.paid == null)?.seq ?? null;
  const lastSeq = rows[rows.length - 1].seq;

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.title}>Plan y pagos</Text>
        <Text style={styles.columns}>Acordado · pagado</Text>
      </View>

      {rows.map((row) => {
        const isPaid = row.paid != null;
        const isLast = row.seq === lastSeq;
        const support = isPaid
          ? `Pagó el ${format(parseISO(row.paidDate ?? row.dueDate), "d 'de' MMM", { locale: es })}`
          : isLast && row.source === "calculated"
            ? row.adjustedFrom != null
              ? `Cierra el saldo · era ${money(row.adjustedFrom)}`
              : "Cierra el saldo"
            : row.seq === firstPendingSeq
              ? dueLabel(row.dueDate)
              : null;

        return (
          <View key={row.seq} style={styles.row}>
            <View style={styles.rowMain}>
              <View style={[styles.dot, isPaid && styles.dotPaid]} />
              <View style={styles.rowCopy}>
                <Text style={styles.month}>{capitalize(format(parseISO(row.dueDate), "LLLL", { locale: es }))}</Text>
                {support ? <Text style={styles.support}>{support}</Text> : null}
              </View>
              <View style={styles.amounts}>
                {isPaid ? <Text style={styles.agreed}>{money(row.amount)}</Text> : null}
                <Text style={styles.amount}>{money(isPaid ? row.paid! : row.amount)}</Text>
              </View>
            </View>
            {row.deviation != null ? (
              <Text style={styles.deviation}>
                {row.deviation > 0
                  ? `Pagó ${money(row.deviation)} más de lo acordado. Se descuenta del final; el plan no cambia.`
                  : `Pagó ${money(Math.abs(row.deviation))} menos de lo acordado. Se suma al final; el plan no cambia.`}
              </Text>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

/** Lo que importa es cuánto falta, no el día exacto. */
function dueLabel(dueDate: string) {
  const days = differenceInCalendarDays(parseISO(dueDate), new Date());
  if (days > 1) return `Toca en ${days} días`;
  if (days === 1) return "Toca mañana";
  if (days === 0) return "Toca hoy";
  const late = Math.abs(days);
  return `Venció hace ${late} ${late === 1 ? "día" : "días"}`;
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
  title: { fontFamily: FONT_FAMILY.bodySemibold, fontSize: FONT_SIZE.md, color: COLORS.ink },
  columns: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.xs, color: COLORS.storm },
  row: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: SURFACE.separator,
    paddingVertical: SPACING.sm,
  },
  rowMain: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.md,
    paddingHorizontal: SPACING.md,
  },
  // Los puntos distinguen pagado de pendiente sin repetir el color en cada fila.
  dot: {
    width: 7,
    height: 7,
    borderRadius: RADIUS.full,
    backgroundColor: SURFACE.track,
  },
  dotPaid: { backgroundColor: COLORS.fog },
  rowCopy: { flex: 1, gap: 2 },
  month: { fontFamily: FONT_FAMILY.bodyMedium, fontSize: FONT_SIZE.sm, color: COLORS.ink },
  support: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.xs, color: COLORS.storm },
  amounts: { alignItems: "flex-end", gap: 1 },
  agreed: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.xs, color: COLORS.storm },
  amount: { fontFamily: FONT_FAMILY.heading, fontSize: FONT_SIZE.md, color: COLORS.ink },
  deviation: {
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.xs,
    paddingLeft: SPACING.md + 7 + SPACING.md,
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.xs,
    color: COLORS.storm,
    lineHeight: 17,
  },
});
