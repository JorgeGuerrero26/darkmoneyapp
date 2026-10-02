import { StyleSheet, Text, View } from "react-native";

import { formatCurrency } from "../../../components/ui/AmountDisplay";
import { DetailFieldRow } from "../../../components/ui/DetailFieldRow";
import { COLORS, FONT_FAMILY, FONT_SIZE, SPACING, SURFACE } from "../../../constants/theme";
import { describeVerdict, verifyBreakdown, type Deduction } from "../lib/incomeBreakdown";

type Props = {
  grossAmount?: number | null;
  deductions?: Deduction[];
  netAmount: number;
  currencyCode: string;
};

export function RecurringIncomeDetailBreakdown({ grossAmount, deductions = [], netAmount, currencyCode }: Props) {
  const hasGross = grossAmount != null && grossAmount > 0;
  if (!hasGross && deductions.length === 0) return null;

  const money = (amount: number) => formatCurrency(amount, currencyCode);
  const verdict = verifyBreakdown(grossAmount ?? null, deductions, netAmount);
  const difference = verdict.status === "differs" ? describeVerdict(verdict, money) : null;

  return (
    <View style={styles.section}>
      <Text style={styles.title}>Desglose</Text>
      {hasGross ? <DetailFieldRow label="Bruto" value={money(grossAmount)} /> : null}
      {deductions.map((deduction, index) => (
        <DetailFieldRow
          key={`${deduction.name}-${index}`}
          label={deduction.name}
          value={`−${money(deduction.amount)}`}
        />
      ))}
      <DetailFieldRow label="Llega a tu cuenta" value={money(netAmount)} last />
      {difference ? <Text style={styles.note}>{difference}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    marginTop: SPACING.lg,
    paddingTop: SPACING.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: SURFACE.separator,
  },
  title: {
    fontFamily: FONT_FAMILY.bodySemibold,
    fontSize: FONT_SIZE.md,
    color: COLORS.ink,
    marginBottom: SPACING.sm,
  },
  note: {
    paddingTop: SPACING.sm,
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.sm,
    color: COLORS.storm,
  },
});
