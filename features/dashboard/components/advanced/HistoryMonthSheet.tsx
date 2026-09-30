import { format } from "date-fns";
import { es } from "date-fns/locale";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { formatCurrency } from "../../../../components/ui/AmountDisplay";
import { COLORS, FONT_FAMILY, FONT_SIZE, RADIUS, SPACING, SURFACE } from "../../../../constants/theme";
import { parseDisplayDate } from "../../../../lib/date";
import type { AnnualHistoryMonth } from "./DashboardCharts";
import { SummaryDetailSheet } from "./SummaryDetailSheet";

type SignificantMovement = {
  id: number;
  title: string;
  amount: number;
  income: boolean;
  date: string;
  accountName: string;
  correction: boolean;
  expenseShare: number | null;
};

export type HistoryMonthDetail = {
  month: AnnualHistoryMonth;
  prevMonth: AnnualHistoryMonth | null;
  incomeCount: number;
  expenseCount: number;
  totalCount: number;
  savingsRate: number | null;
  correctionIds: number[];
  largestMovements: SignificantMovement[];
};

type Props = {
  detail: HistoryMonthDetail;
  currency: string;
  onClose: () => void;
  onOpenAll: () => void;
  onOpenCorrections: () => void;
  onOpenMovement: (movement: SignificantMovement) => void;
};

function comparison(current: number, previous: number, previousName: string, currency: string) {
  const difference = current - previous;
  if (Math.abs(difference) < 0.01) return `Igual que en ${previousName}`;
  return `${formatCurrency(Math.abs(difference), currency)} ${difference > 0 ? "más" : "menos"} que en ${previousName}`;
}

export function HistoryMonthSheet({ detail, currency, onClose, onOpenAll, onOpenCorrections, onOpenMovement }: Props) {
  const { month, prevMonth } = detail;
  const first = parseDisplayDate(month.dateFrom);
  const last = parseDisplayDate(month.dateTo);
  const monthName = format(first, "MMMM yyyy", { locale: es });
  const previousName = prevMonth ? format(parseDisplayDate(prevMonth.dateFrom), "MMMM", { locale: es }) : "";
  const isCurrent = format(first, "yyyy-MM") === format(new Date(), "yyyy-MM");
  const subtitle = `${format(first, "d", { locale: es })} – ${format(last, "d MMM", { locale: es })}${isCurrent ? " · en curso" : ""}`;
  const netComparison = prevMonth ? ` · ${comparison(month.net, prevMonth.net, previousName, currency)}` : "";
  const reading = detail.savingsRate != null && month.net >= 0
    ? `Te quedó el ${Math.round(detail.savingsRate)}% de lo que entró${netComparison}`
    : `Salió más de lo que entró${netComparison}`;

  return <SummaryDetailSheet title={`${monthName[0].toUpperCase()}${monthName.slice(1)}`} subtitle={subtitle} onClose={onClose} actionLabel={`Ver los ${detail.totalCount} movimientos`} onAction={onOpenAll}>
    <Text style={[styles.net, { color: month.net >= 0 ? COLORS.income : COLORS.expense }]}>{month.net >= 0 ? "+" : "−"}{formatCurrency(Math.abs(month.net), currency)}</Text>
    <Text style={styles.reading}>{reading}</Text>

    <View style={styles.totals}>
      <View style={styles.totalRow}>
        <View style={styles.flex}>
          <Text style={styles.totalLabel}>Entró · {detail.incomeCount} mov.</Text>
          {prevMonth ? <Text style={styles.meta}>{comparison(month.income, prevMonth.income, previousName, currency)}</Text> : null}
        </View>
        <Text style={styles.totalAmount}>{formatCurrency(month.income, currency)}</Text>
      </View>
      <View style={styles.totalRow}>
        <View style={styles.flex}>
          <Text style={styles.totalLabel}>Salió · {detail.expenseCount} mov.</Text>
          {prevMonth ? <Text style={styles.meta}>{comparison(month.expense, prevMonth.expense, previousName, currency)}</Text> : null}
        </View>
        <Text style={styles.totalAmount}>{formatCurrency(month.expense, currency)}</Text>
      </View>
    </View>

    {detail.correctionIds.length > 0 ? <TouchableOpacity style={styles.correctionRow} onPress={onOpenCorrections} activeOpacity={0.82} accessibilityRole="button">
      <Text style={styles.correctionText}>Hay {detail.correctionIds.length} correcciones de saldo fuera de estas cifras</Text>
      <Text style={styles.correctionAction}>Ver</Text>
    </TouchableOpacity> : null}

    {detail.largestMovements.length > 0 ? <View style={styles.list}>
      <Text style={styles.kicker}>LO QUE MÁS PESÓ</Text>
      {detail.largestMovements.map((movement) => <TouchableOpacity key={movement.id} style={styles.movementRow} onPress={() => onOpenMovement(movement)} activeOpacity={0.82} accessibilityRole="button">
        <View style={styles.flex}>
          <Text style={styles.movementTitle} numberOfLines={1}>{movement.title}</Text>
          <Text style={styles.meta} numberOfLines={1}>{movement.date} · {movement.accountName}{movement.correction ? " · Corrección de saldo" : movement.expenseShare != null ? ` · ${Math.round(movement.expenseShare)}% del gasto` : ""}</Text>
        </View>
        <Text style={[styles.movementAmount, { color: movement.income ? COLORS.income : COLORS.expense }]}>{movement.income ? "+" : "−"}{formatCurrency(movement.amount, currency)}</Text>
      </TouchableOpacity>)}
    </View> : null}
  </SummaryDetailSheet>;
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  net: { fontFamily: FONT_FAMILY.heading, fontSize: 44, marginBottom: SPACING.xs },
  reading: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.md, lineHeight: 22, color: COLORS.storm, marginBottom: SPACING.xl },
  totals: { marginBottom: SPACING.lg },
  totalRow: { minHeight: 72, flexDirection: "row", alignItems: "center", gap: SPACING.md, borderBottomWidth: 1, borderBottomColor: SURFACE.separator },
  totalLabel: { fontFamily: FONT_FAMILY.bodyMedium, fontSize: FONT_SIZE.md, color: COLORS.fog },
  totalAmount: { fontFamily: FONT_FAMILY.bodySemibold, fontSize: FONT_SIZE.md, color: COLORS.ink },
  meta: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.sm, color: COLORS.storm, marginTop: 3 },
  correctionRow: { minHeight: 54, flexDirection: "row", alignItems: "center", gap: SPACING.sm, paddingHorizontal: SPACING.md, borderRadius: RADIUS.lg, backgroundColor: SURFACE.subtle, marginBottom: SPACING.xl },
  correctionText: { flex: 1, fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.sm, color: COLORS.fog },
  correctionAction: { fontFamily: FONT_FAMILY.bodySemibold, fontSize: FONT_SIZE.sm, color: COLORS.ink },
  list: { gap: 0, marginBottom: SPACING.lg },
  kicker: { fontFamily: FONT_FAMILY.bodyMedium, fontSize: FONT_SIZE.xs, letterSpacing: 2, color: COLORS.storm, marginBottom: SPACING.sm },
  movementRow: { minHeight: 73, flexDirection: "row", alignItems: "center", gap: SPACING.sm, borderBottomWidth: 1, borderBottomColor: SURFACE.separator },
  movementTitle: { fontFamily: FONT_FAMILY.bodySemibold, fontSize: FONT_SIZE.sm, color: COLORS.ink },
  movementAmount: { fontFamily: FONT_FAMILY.bodySemibold, fontSize: FONT_SIZE.sm },
});
