import { useMemo, useState } from "react";
import { addDays, differenceInCalendarDays, format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { ArrowRight, ChevronDown, Sparkles } from "lucide-react-native";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { formatCurrency } from "../../../../components/ui/AmountDisplay";
import { COLORS, FONT_FAMILY, FONT_SIZE, RADIUS, SPACING, SURFACE } from "../../../../constants/theme";
import { obligationViewerDirection } from "../../../../lib/obligation-viewer-labels";
import { convertDashboardCurrency, type FutureFlowWindow } from "../../lib/dashboard-builders";
import { firstNegativeMonth, upcomingSubscriptionCharges, visibleProjectionMonths } from "../../lib/flow-view";
import { transferAmt } from "../../lib/aggregations";
import type { DashboardMovementRow } from "../../lib/dashboard-row";
import type { ConversionCtx } from "../../lib/types";
import { useCashflowProjection, type CashflowProjectionInputs } from "../../hooks/useCashflowProjection";

type Obligation = { id: number; title: string; direction: string; status: string; counterparty: string; pendingAmount: number; currencyCode: string; dueDate: string | null };
type Account = { id: number; name: string };
type TransferRoute = { srcName: string; dstName: string; total: number; count: number; movementIds: number[] };
type Props = {
  projectionInputs: CashflowProjectionInputs;
  windows: FutureFlowWindow[];
  obligations: Obligation[];
  movements: DashboardMovementRow[];
  accounts: Account[];
  conversionCtx: ConversionCtx;
  onOpenAi: () => void;
  onOpenObligation: (id: number) => void;
  onOpenSubscription: (id: number) => void;
  onOpenRoute: (route: TransferRoute) => void;
};

const HORIZONS = [3, 6, 12] as const;
const WINDOWS = [7, 15, 30] as const;

function signedAmount(value: number, currency: string) {
  return `${value < 0 ? "−" : "+"}${formatCurrency(Math.abs(value), currency)}`;
}

function balanceAmount(value: number, currency: string) {
  return `${value < 0 ? "−" : ""}${formatCurrency(Math.abs(value), currency)}`;
}

function monthName(key: string) {
  return format(parseISO(`${key}-01`), "LLLL", { locale: es });
}

function shortDate(date: Date) {
  return format(date, "d MMM", { locale: es });
}

function SectionHeading({ title, amount, tone = COLORS.ink, scope }: { title: string; amount?: string; tone?: string; scope?: string }) {
  return <View style={styles.heading}>
    <View style={styles.headingLine}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {amount ? <Text style={[styles.sectionAmount, { color: tone }]}>{amount}</Text> : null}
    </View>
    {scope ? <Text style={styles.meta}>{scope}</Text> : null}
  </View>;
}

export function FlowTab({ projectionInputs, windows, obligations, movements, accounts, conversionCtx, onOpenAi, onOpenObligation, onOpenSubscription, onOpenRoute }: Props) {
  const [horizon, setHorizon] = useState<(typeof HORIZONS)[number]>(6);
  const [showAllMonths, setShowAllMonths] = useState(false);
  const [explain, setExplain] = useState(false);
  const [days, setDays] = useState<(typeof WINDOWS)[number]>(7);
  const { projection, typicalSpend } = useCashflowProjection(projectionInputs, horizon);
  const now = new Date();
  const currency = projectionInputs.displayCurrency;
  const closingMonth = projection.months[projection.months.length - 1];
  const firstNegative = firstNegativeMonth(projection.months);
  const maxBalance = Math.max(1, ...projection.months.map((month) => Math.abs(month.closingBalance)));
  const activeWindow = windows.find((window) => window.days === days) ?? windows[0];
  const previousWindow = windows.find((window) => window.days === (days === 15 ? 7 : 15));
  const sameAsEarlierWindow = days !== 7 && previousWindow?.expectedInflow === activeWindow.expectedInflow && previousWindow?.expectedOutflow === activeWindow.expectedOutflow;

  const receivables = useMemo(() => obligations
    .filter((obligation) => obligation.status === "active" && obligationViewerDirection(obligation) === "receivable")
    .sort((a, b) => (a.dueDate ? parseISO(a.dueDate).getTime() : Infinity) - (b.dueDate ? parseISO(b.dueDate).getTime() : Infinity)), [obligations]);
  const receivableAmounts = receivables.map((obligation) => convertDashboardCurrency(obligation.pendingAmount, obligation.currencyCode, currency, projectionInputs.exchangeRateMap, projectionInputs.baseCurrency));
  const receivableTotal = receivableAmounts.reduce<number>((sum, amount) => sum + (amount ?? 0), 0);
  const subscriptionCharges = upcomingSubscriptionCharges(projection.months, now);
  const subscriptionTotal = subscriptionCharges.reduce((sum, item) => sum + (item.amount ?? 0), 0);

  const routes = useMemo(() => {
    const names = new Map(accounts.map((account) => [account.id, account.name.replace(/^Cuenta\s+(?=\D)/i, "")]));
    const byRoute = new Map<string, { sourceId: number; targetId: number; total: number; count: number; movementIds: number[] }>();
    for (const movement of movements) {
      if (movement.movementType !== "transfer" || movement.status !== "posted" || !movement.sourceAccountId || !movement.destinationAccountId) continue;
      const key = `${movement.sourceAccountId}-${movement.destinationAccountId}`;
      const existing = byRoute.get(key);
      if (existing) {
        existing.total += transferAmt(movement, conversionCtx);
        existing.count += 1;
        existing.movementIds.push(movement.id);
      } else {
        byRoute.set(key, { sourceId: movement.sourceAccountId, targetId: movement.destinationAccountId, total: transferAmt(movement, conversionCtx), count: 1, movementIds: [movement.id] });
      }
    }
    return [...byRoute.values()].sort((a, b) => b.total - a.total).slice(0, 3).map((route) => ({
      srcName: names.get(route.sourceId) ?? `Cuenta ${route.sourceId}`,
      dstName: names.get(route.targetId) ?? `Cuenta ${route.targetId}`,
      total: route.total,
      count: route.count,
      movementIds: route.movementIds,
    }));
  }, [accounts, conversionCtx, movements]);

  return <View style={styles.page}>
    <View style={styles.section}>
      <View style={styles.segment}>
        {HORIZONS.map((option) => <Pressable key={option} style={[styles.segmentItem, horizon === option && styles.segmentActive]} onPress={() => { setHorizon(option); setShowAllMonths(false); }} accessibilityRole="button" accessibilityState={{ selected: horizon === option }}>
          <Text style={[styles.segmentText, horizon === option && styles.segmentTextActive]}>{option} meses</Text>
        </Pressable>)}
      </View>
      {closingMonth ? <>
        <Text style={styles.meta}>Si todo sigue igual, a fin de {monthName(closingMonth.monthKey)} tendrías</Text>
        <Text style={[styles.hero, projection.endingBalance < 0 && styles.negativeTone]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.65}>{balanceAmount(projection.endingBalance, currency)}</Text>
        {firstNegative ? <Text style={styles.meta}>Tu saldo pasaría a negativo en <Text style={styles.negativeStrong}>{monthName(firstNegative.monthKey)}</Text></Text> : <Text style={styles.meta}>Tu saldo se mantendría por encima de cero en este plazo.</Text>}
        <View style={styles.chart} accessibilityLabel="Saldo proyectado por mes">
          {projection.months.map((month) => {
            const height = Math.max(3, Math.abs(month.closingBalance) / maxBalance * 58);
            return <View key={month.monthKey} style={styles.chartColumn}>
              <View style={styles.chartPositive}>{month.closingBalance >= 0 ? <View style={[styles.chartBar, styles.chartBarPositive, { height }]} /> : null}</View>
              <View style={styles.zeroLine} />
              <View style={styles.chartNegative}>{month.closingBalance < 0 ? <View style={[styles.chartBar, styles.chartBarNegative, { height }]} /> : null}</View>
              <Text style={[styles.chartLabel, month.monthKey === firstNegative?.monthKey && styles.negativeStrong]} numberOfLines={1}>{format(parseISO(`${month.monthKey}-01`), "MMM", { locale: es })}</Text>
            </View>;
          })}
        </View>
        {visibleProjectionMonths(projection.months, showAllMonths).map((month) => <View key={month.monthKey} style={styles.projectionRow}>
          <Text style={styles.projectionMonth} numberOfLines={1}>{monthName(month.monthKey)}{month.isPartial ? " · resto" : ""}</Text>
          <Text style={[styles.projectionNet, month.netFlow < 0 ? styles.negative : styles.positive]} numberOfLines={1}>{signedAmount(month.netFlow, currency)}</Text>
          <Text style={[styles.projectionBalance, month.closingBalance < 0 && styles.negativeTone]} numberOfLines={1}>{balanceAmount(month.closingBalance, currency)}</Text>
        </View>)}
        {!showAllMonths && projection.months.length > 3 ? <Pressable style={styles.expandRow} onPress={() => setShowAllMonths(true)} accessibilityRole="button"><Text style={styles.rowTitle}>Ver los {horizon} meses</Text><ChevronDown size={16} color={COLORS.storm} /></Pressable> : null}
        <Pressable onPress={() => setExplain((value) => !value)} accessibilityRole="button" style={styles.explainLink}>
          <Text style={styles.meta}>Gasto típico: {formatCurrency(typicalSpend.typical, currency)} al mes · Cómo se calcula {explain ? "⌃" : "›"}</Text>
        </Pressable>
        {typicalSpend.monthsUsed < 3 ? <Text style={styles.warning}>Proyección con poco historial: {typicalSpend.monthsUsed} {typicalSpend.monthsUsed === 1 ? "mes completo" : "meses completos"}.</Text> : null}
        {projection.unconvertedCount > 0 ? <Text style={styles.warning}>{projection.unconvertedCount} compromiso{projection.unconvertedCount === 1 ? "" : "s"} sin tipo de cambio disponible no se sumaron.</Text> : null}
        {explain ? <Text style={styles.meta}>Usamos la mediana de {typicalSpend.monthsUsed} {typicalSpend.monthsUsed === 1 ? "mes completo" : "meses completos"} de gastos. Sumamos los cobros y pagos programados en su fecha; el gasto habitual se reparte entre los días restantes. {typicalSpend.monthsUsed < 3 ? "Hay poco historial para una proyección estable." : "Un mes atípico pesa menos que en un promedio."}</Text> : null}
      </> : null}
    </View>

    <Pressable style={styles.aiRow} onPress={onOpenAi} accessibilityRole="button">
      <View style={styles.aiIcon}><Sparkles size={18} color={COLORS.pro} /></View>
      <View style={styles.flex}><Text style={styles.rowTitle}>Informe con IA</Text><Text style={styles.meta}>Qué cambiar para no llegar a negativo</Text></View>
      <ArrowRight size={16} color={COLORS.storm} />
    </Pressable>

    <View style={styles.section}>
      <View style={styles.headingLine}>
        <Text style={styles.sectionTitle}>Próximas semanas</Text>
        <View style={styles.segment}>{WINDOWS.map((option) => <Pressable key={option} style={[styles.segmentItem, days === option && styles.segmentActive]} onPress={() => setDays(option)} accessibilityRole="button" accessibilityState={{ selected: days === option }}><Text style={[styles.segmentText, days === option && styles.segmentTextActive]}>{option} d</Text></Pressable>)}</View>
      </View>
      <View style={styles.simpleRow}><Text style={styles.rowLabel}>Entra</Text><Text style={styles.positive}>+{formatCurrency(activeWindow.expectedInflow, currency)}</Text></View>
      <View style={styles.simpleRow}><Text style={styles.rowLabel}>Sale</Text><Text style={styles.negative}>−{formatCurrency(activeWindow.expectedOutflow, currency)}</Text></View>
      <View style={styles.simpleRow}><Text style={styles.rowTitle}>Caja al {shortDate(addDays(now, days))}</Text><Text style={styles.rowAmount}>{balanceAmount(activeWindow.estimatedBalance, currency)}</Text></View>
      {sameAsEarlierWindow ? <Text style={styles.meta}>No hay cobros ni pagos nuevos en este plazo.</Text> : null}
      {activeWindow.unconvertedCount > 0 ? <Text style={styles.warning}>Hay {activeWindow.unconvertedCount} compromiso{activeWindow.unconvertedCount === 1 ? "" : "s"} sin tipo de cambio en este plazo.</Text> : null}
    </View>

    {receivables.length > 0 ? <View style={styles.section}>
      <SectionHeading title="Por cobrar" amount={formatCurrency(receivableTotal, currency)} tone={COLORS.income} />
      {receivables.map((obligation, index) => {
        const daysUntil = obligation.dueDate ? differenceInCalendarDays(parseISO(obligation.dueDate), now) : null;
        const when = daysUntil == null ? "sin fecha" : daysUntil < 0 ? `venció hace ${-daysUntil} días` : daysUntil === 0 ? "hoy" : `en ${daysUntil} días`;
        const amount = receivableAmounts[index];
        return <Pressable key={obligation.id} style={styles.detailRow} onPress={() => onOpenObligation(obligation.id)} accessibilityRole="button">
          <View style={styles.flex}><Text style={styles.rowTitle} numberOfLines={1}>{obligation.counterparty?.trim() || obligation.title}</Text><Text style={styles.meta} numberOfLines={1}>{obligation.title} · {when}</Text></View>
          <Text style={styles.rowAmount}>{formatCurrency(amount ?? obligation.pendingAmount, amount == null ? obligation.currencyCode : currency)}</Text>
        </Pressable>;
      })}
      {receivableAmounts.some((amount) => amount == null) ? <Text style={styles.meta}>El total excluye montos sin tipo de cambio disponible.</Text> : null}
    </View> : null}

    <View style={styles.section}>
      <SectionHeading title="Suscripciones" amount={formatCurrency(subscriptionTotal, currency)} tone={COLORS.expense} scope="Cobros de los próximos 30 días" />
      {subscriptionCharges.length === 0 ? <Text style={styles.meta}>No hay cobros previstos en este plazo.</Text> : subscriptionCharges.map((charge, index) => <Pressable key={`${charge.id}-${charge.date.toISOString()}-${index}`} style={styles.detailRow} onPress={() => charge.id > 0 && onOpenSubscription(charge.id)} accessibilityRole="button">
        <View style={styles.flex}><Text style={styles.rowTitle} numberOfLines={1}>{charge.title}</Text><Text style={styles.meta}>Se cobra el {shortDate(charge.date)}</Text></View>
        <Text style={styles.rowAmount}>{formatCurrency(charge.amount ?? 0, currency)}</Text>
      </Pressable>)}
    </View>

    {routes.length > 0 ? <View style={styles.section}>
      <SectionHeading title="Entre tus cuentas" scope="Transferencias · últimos 90 días" />
      {routes.map((route) => <Pressable key={`${route.srcName}-${route.dstName}`} style={styles.detailRow} onPress={() => onOpenRoute(route)} accessibilityRole="button">
        <View style={styles.flex}><Text style={styles.rowTitle} numberOfLines={1}>{route.srcName} → {route.dstName}</Text><Text style={styles.meta}>{route.count} {route.count === 1 ? "transferencia" : "transferencias"}</Text></View>
        <Text style={styles.rowAmount}>{formatCurrency(route.total, currency)}</Text>
      </Pressable>)}
    </View> : null}
  </View>;
}

const styles = StyleSheet.create({
  page: { gap: SPACING.xxxl },
  section: { gap: SPACING.xs },
  heading: { gap: SPACING.xs, marginBottom: SPACING.sm },
  headingLine: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: SPACING.sm },
  sectionTitle: { flex: 1, fontFamily: FONT_FAMILY.heading, fontSize: FONT_SIZE.lg, color: COLORS.ink },
  sectionAmount: { fontFamily: FONT_FAMILY.heading, fontSize: FONT_SIZE.md },
  meta: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.sm, color: COLORS.storm, lineHeight: 20 },
  warning: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.sm, color: COLORS.gold, lineHeight: 20 },
  hero: { fontFamily: FONT_FAMILY.heading, fontSize: FONT_SIZE.display, color: COLORS.ink, marginVertical: SPACING.xs },
  positive: { fontFamily: FONT_FAMILY.bodySemibold, fontSize: FONT_SIZE.md, color: COLORS.income },
  negative: { fontFamily: FONT_FAMILY.bodySemibold, fontSize: FONT_SIZE.md, color: COLORS.expense },
  negativeTone: { color: COLORS.expense },
  negativeStrong: { color: COLORS.expense, fontFamily: FONT_FAMILY.bodySemibold },
  segment: { flexDirection: "row", alignSelf: "flex-start", backgroundColor: SURFACE.input, borderRadius: RADIUS.md, padding: 3 },
  segmentItem: { paddingVertical: SPACING.xs, paddingHorizontal: SPACING.sm, borderRadius: RADIUS.sm },
  segmentActive: { backgroundColor: SURFACE.pressed },
  segmentText: { fontFamily: FONT_FAMILY.bodySemibold, fontSize: FONT_SIZE.sm, color: COLORS.storm },
  segmentTextActive: { color: COLORS.ink },
  chart: { flexDirection: "row", marginTop: SPACING.lg, marginBottom: SPACING.md, gap: 3 },
  chartColumn: { flex: 1, minWidth: 0, alignItems: "center" },
  chartPositive: { height: 58, width: "100%", justifyContent: "flex-end", alignItems: "center" },
  chartNegative: { height: 58, width: "100%", justifyContent: "flex-start", alignItems: "center" },
  chartBar: { width: "70%", maxWidth: 42, borderRadius: RADIUS.sm },
  chartBarPositive: { backgroundColor: COLORS.ink },
  chartBarNegative: { backgroundColor: COLORS.expense },
  zeroLine: { height: 1, width: "100%", backgroundColor: SURFACE.separator },
  chartLabel: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.xs, color: COLORS.storm, marginTop: SPACING.xs },
  projectionRow: { flexDirection: "row", alignItems: "center", gap: SPACING.xs, minHeight: 50, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: SURFACE.separator },
  projectionMonth: { flex: 1.2, fontFamily: FONT_FAMILY.bodySemibold, fontSize: FONT_SIZE.sm, color: COLORS.ink, textTransform: "capitalize" },
  projectionNet: { flex: 1, textAlign: "right" },
  projectionBalance: { flex: 1.1, fontFamily: FONT_FAMILY.heading, fontSize: FONT_SIZE.sm, color: COLORS.ink, textAlign: "right" },
  expandRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: SPACING.md },
  explainLink: { paddingVertical: SPACING.sm },
  aiRow: { flexDirection: "row", alignItems: "center", gap: SPACING.md, padding: SPACING.lg, borderRadius: RADIUS.lg, backgroundColor: SURFACE.card, borderWidth: 1, borderColor: SURFACE.cardBorder },
  aiIcon: { width: 36, height: 36, borderRadius: RADIUS.lg, backgroundColor: COLORS.proMuted, alignItems: "center", justifyContent: "center" },
  flex: { flex: 1, minWidth: 0, gap: SPACING.xs },
  rowTitle: { fontFamily: FONT_FAMILY.bodySemibold, fontSize: FONT_SIZE.md, color: COLORS.ink },
  rowLabel: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.md, color: COLORS.fog },
  rowAmount: { fontFamily: FONT_FAMILY.heading, fontSize: FONT_SIZE.md, color: COLORS.ink },
  simpleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: SPACING.sm, minHeight: 54, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: SURFACE.separator },
  detailRow: { flexDirection: "row", alignItems: "center", gap: SPACING.sm, minHeight: 72, paddingVertical: SPACING.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: SURFACE.separator },
});
