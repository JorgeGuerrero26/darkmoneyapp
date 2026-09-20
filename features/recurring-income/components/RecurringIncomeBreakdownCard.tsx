import { StyleSheet, Text, View } from "react-native";

import { Card } from "../../../components/ui/Card";
import { formatCurrency } from "../../../components/ui/AmountDisplay";
import { COLORS, FONT_FAMILY, FONT_SIZE, SPACING, SURFACE } from "../../../constants/theme";
import { deductionsTotal, type Deduction } from "../lib/incomeBreakdown";

type Props = {
  grossAmount?: number | null;
  deductions?: Deduction[];
  /** Lo que llega a la cuenta: `recurring_income.amount`, el que manda. */
  netAmount: number;
  currencyCode: string;
};

/**
 * El desglose del sueldo en el detalle: bruto, descuentos y lo que llega.
 *
 * Siempre visible, no detrás de un segundo "ver más": si el usuario ya entró a ver el ingreso,
 * es exactamente donde va a buscarlo. (En el formulario sí va cerrado, porque ahí la mayoría de
 * ingresos fijos —un alquiler, unas clases— no tienen descuentos.)
 *
 * No se dibuja cuando no hay nada que desglosar. Una tarjeta con "Bruto —" no informa de nada.
 */
export function RecurringIncomeBreakdownCard({ grossAmount, deductions = [], netAmount, currencyCode }: Props) {
  const hasGross = grossAmount != null && grossAmount > 0;
  if (!hasGross && deductions.length === 0) return null;

  const money = (value: number) => formatCurrency(value, currencyCode);
  const total = deductionsTotal(deductions);

  return (
    <Card>
      <Text style={styles.title} maxFontSizeMultiplier={1.3}>
        Desglose
      </Text>

      {hasGross ? (
        <View style={styles.row}>
          <Text style={styles.label} maxFontSizeMultiplier={1.4}>
            Bruto
          </Text>
          <Text style={styles.amount} maxFontSizeMultiplier={1.3}>
            {money(grossAmount)}
          </Text>
        </View>
      ) : null}

      {deductions.map((deduction, index) => (
        <View key={`${deduction.name}-${index}`} style={styles.row}>
          <Text style={styles.label} numberOfLines={1} maxFontSizeMultiplier={1.4}>
            {deduction.name}
          </Text>
          <Text style={[styles.amount, styles.amountNegative]} maxFontSizeMultiplier={1.3}>
            − {money(deduction.amount)}
          </Text>
        </View>
      ))}

      <View style={[styles.row, styles.rowTotal]}>
        <Text style={styles.labelTotal} maxFontSizeMultiplier={1.4}>
          Llega a tu cuenta
        </Text>
        <Text style={styles.amountTotal} maxFontSizeMultiplier={1.3}>
          {money(netAmount)}
        </Text>
      </View>

      {/* La diferencia se dice, no se corrige: hay descuentos que la boleta no detalla y el
          registro es informativo. Callarla seria peor — el usuario veria tres cifras que no
          suman y no sabria si la app se equivoco. */}
      {hasGross && Math.abs(grossAmount - total - netAmount) >= 0.005 ? (
        <Text style={styles.note} maxFontSizeMultiplier={1.4}>
          El desglose no cuadra con lo que llega: faltan{" "}
          {money(Math.abs(grossAmount - total - netAmount))} por explicar.
        </Text>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  title: {
    fontFamily: FONT_FAMILY.bodySemibold,
    fontSize: FONT_SIZE.xs,
    letterSpacing: 1,
    textTransform: "uppercase",
    color: COLORS.storm,
    marginBottom: SPACING.sm,
  },
  row: {
    minHeight: 40,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: SPACING.md,
  },
  rowTotal: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: SURFACE.separator,
    marginTop: SPACING.xs,
    paddingTop: SPACING.sm,
  },
  label: {
    flex: 1,
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.md,
    color: COLORS.fog,
  },
  labelTotal: {
    flex: 1,
    fontFamily: FONT_FAMILY.bodySemibold,
    fontSize: FONT_SIZE.md,
    color: COLORS.ink,
  },
  amount: {
    fontFamily: FONT_FAMILY.heading,
    fontSize: FONT_SIZE.md,
    color: COLORS.ink,
  },
  amountNegative: { color: COLORS.fog },
  amountTotal: {
    fontFamily: FONT_FAMILY.heading,
    fontSize: FONT_SIZE.lg,
    color: COLORS.ink,
  },
  note: {
    marginTop: SPACING.sm,
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.xs,
    color: COLORS.dangerSoft,
    lineHeight: 17,
  },
});
