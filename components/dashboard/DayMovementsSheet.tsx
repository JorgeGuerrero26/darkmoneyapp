import type { ReactNode } from "react";
import { useMemo } from "react";
import { Animated, Modal, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Paperclip, X } from "lucide-react-native";

import type { DashboardMovementRow } from "../../services/queries/workspace-data";
import { useMovementAttachmentCountsQuery } from "../../services/queries/attachments";
import { formatCurrency } from "../ui/AmountDisplay";
import { COLORS, FONT_FAMILY, FONT_SIZE, GLASS, RADIUS, SPACING } from "../../constants/theme";
import {
  movementActsAsExpense,
  movementActsAsIncome,
  movementDisplayAccountId,
  movementDisplayAmount,
} from "../../lib/movement-display";
import { useDismissibleSheet } from "../ui/useDismissibleSheet";

export type ConversionCtx = {
  accountCurrencyMap: Map<number, string>;
  exchangeRateMap: Map<string, number>;
  displayCurrency: string;
};

function isIncome(m: DashboardMovementRow) {
  if (m.status !== "posted") return false;
  if (m.movementType === "obligation_opening") return false;
  return movementActsAsIncome(m);
}

function isExpense(m: DashboardMovementRow) {
  if (m.status !== "posted") return false;
  if (m.movementType === "obligation_opening") return false;
  return movementActsAsExpense(m);
}

function isTransfer(m: DashboardMovementRow) {
  return m.status === "posted" && m.movementType === "transfer";
}

function inRange(m: DashboardMovementRow, start: Date, end: Date) {
  const d = new Date(m.occurredAt);
  return d >= start && d <= end;
}

function convertAmt(
  amount: number,
  fromCurrency: string | null | undefined,
  toCurrency: string,
  map: Map<string, number>,
): number {
  if (!fromCurrency) return amount;
  if (fromCurrency.toUpperCase() === toCurrency.toUpperCase()) return amount;
  const key = `${fromCurrency.toUpperCase()}:${toCurrency.toUpperCase()}`;
  const direct = map.get(key);
  if (direct) return amount * direct;
  const inv = map.get(`${toCurrency.toUpperCase()}:${fromCurrency.toUpperCase()}`);
  if (inv) return amount / inv;
  return amount;
}

function incomeAmt(m: DashboardMovementRow, ctx: ConversionCtx): number {
  const raw = movementDisplayAmount(m);
  const accountId = movementDisplayAccountId(m);
  const currency = accountId ? ctx.accountCurrencyMap.get(accountId) : undefined;
  return convertAmt(raw, currency, ctx.displayCurrency, ctx.exchangeRateMap);
}

function expenseAmt(m: DashboardMovementRow, ctx: ConversionCtx): number {
  const raw = movementDisplayAmount(m);
  const accountId = movementDisplayAccountId(m);
  const currency = accountId ? ctx.accountCurrencyMap.get(accountId) : undefined;
  return convertAmt(raw, currency, ctx.displayCurrency, ctx.exchangeRateMap);
}

function transferAmt(m: DashboardMovementRow, ctx: ConversionCtx): number {
  const raw = movementDisplayAmount(m);
  const accountId = movementDisplayAccountId(m);
  const currency = accountId ? ctx.accountCurrencyMap.get(accountId) : undefined;
  return convertAmt(raw, currency, ctx.displayCurrency, ctx.exchangeRateMap);
}

const TYPE_LABEL: Record<string, string> = {
  expense: "Gasto",
  income: "Ingreso",
  transfer: "Transferencia",
  subscription_payment: "Suscripción",
  obligation_opening: "Obligación",
  obligation_payment: "Pago obligación",
  refund: "Devolución",
  adjustment: "Ajuste",
};

export type DaySheetMode = "all" | "expense" | "income" | "transfer";

type Props = {
  visible: boolean;
  onClose: () => void;
  dayStart: Date;
  dayEnd: Date;
  mode: DaySheetMode;
  movements: DashboardMovementRow[];
  ctx: ConversionCtx;
  categoryMap: Map<number, string>;
  accountMap: Map<number, string>;
  onMovementPress: (id: number) => void;
  workspaceId?: number | null;
};

export function DayMovementsSheet({
  visible,
  onClose,
  dayStart,
  dayEnd,
  mode,
  movements,
  ctx,
  categoryMap,
  accountMap,
  onMovementPress,
  workspaceId,
}: Props) {
  const insets = useSafeAreaInsets();
  const { backdropStyle, panHandlers, sheetStyle } = useDismissibleSheet({ visible, onClose });
  const inDay = useMemo(
    () => movements.filter((m) => inRange(m, dayStart, dayEnd)).sort(
      (a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime(),
    ),
    [movements, dayStart, dayEnd],
  );

  const inDayIds = useMemo(() => inDay.map((m) => m.id), [inDay]);
  const { data: attachmentCounts = {} } = useMovementAttachmentCountsQuery(workspaceId, inDayIds);

  const incomes = inDay.filter(isIncome);
  const expenses = inDay.filter(isExpense);
  const transfers = inDay.filter(isTransfer);

  const sumIn = incomes.reduce((s, m) => s + incomeAmt(m, ctx), 0);
  const sumEx = expenses.reduce((s, m) => s + expenseAmt(m, ctx), 0);
  const savings = sumIn - sumEx;

  const title = format(dayStart, "EEEE d MMMM yyyy", { locale: es });

  function renderMovementRow(m: DashboardMovementRow, amount: number, amountColor: string) {
    const cat = m.categoryId != null ? categoryMap.get(m.categoryId) : null;
    const accSrc = m.sourceAccountId != null ? accountMap.get(m.sourceAccountId) : null;
    const accDst = m.destinationAccountId != null ? accountMap.get(m.destinationAccountId) : null;
    const typeLabel = TYPE_LABEL[m.movementType] ?? m.movementType;
    const timeStr = format(new Date(m.occurredAt), "HH:mm", { locale: es });
    const attCount = attachmentCounts[m.id] ?? 0;
    return (
      <TouchableOpacity
        key={m.id}
        style={styles.movRow}
        onPress={() => onMovementPress(m.id)}
        activeOpacity={0.75}
      >
        <View style={styles.movRowMain}>
          <Text style={styles.movTitle} numberOfLines={2}>
            {m.description?.trim() || `Movimiento #${m.id}`}
          </Text>
          <View style={styles.movMetaRow}>
            <Text style={styles.movMeta}>
              {typeLabel}
              {cat ? ` · ${cat}` : ""}
              {m.movementType === "transfer" && accSrc && accDst ? ` · ${accSrc} → ${accDst}` : ""}
              {` · ${timeStr}`}
            </Text>
            {attCount > 0 ? (
              <View style={styles.attBadge}>
                <Paperclip size={9} color={COLORS.storm} />
                {attCount > 1 ? <Text style={styles.attBadgeText}>{attCount}</Text> : null}
              </View>
            ) : null}
          </View>
        </View>
        <Text style={[styles.movAmount, { color: amountColor }]}>{formatCurrency(amount, ctx.displayCurrency)}</Text>
      </TouchableOpacity>
    );
  }

  function section(titleText: string, children: ReactNode) {
    return (
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{titleText}</Text>
        {children}
      </View>
    );
  }

  const showAll = mode === "all";
  const listIncome = showAll || mode === "income";
  const listExpense = showAll || mode === "expense";
  const listTransfer = showAll || mode === "transfer";

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Animated.View style={[styles.overlay, backdropStyle]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <Animated.View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, SPACING.lg) }, sheetStyle]}>
          <View style={styles.sheetGrab} {...panHandlers}>
            <View style={styles.handle} />
            <TouchableOpacity onPress={onClose} style={styles.closeBtn} hitSlop={12}>
              <X size={22} color={COLORS.storm} strokeWidth={2} />
            </TouchableOpacity>
          </View>

          <Text style={styles.sheetTitle}>{title}</Text>
          <Text style={styles.sheetSubtitle}>
            {mode === "all" && "Ingresos, gastos y transferencias de ese día"}
            {mode === "expense" && "Solo gastos registrados"}
            {mode === "income" && "Solo ingresos registrados"}
            {mode === "transfer" && "Solo transferencias entre cuentas"}
          </Text>

          {showAll ? (
            <View style={styles.summaryCard}>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Ingresos</Text>
                <Text style={[styles.summaryValue, { color: COLORS.income }]}>{formatCurrency(sumIn, ctx.displayCurrency)}</Text>
              </View>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Gastos</Text>
                <Text style={[styles.summaryValue, { color: COLORS.expense }]}>{formatCurrency(sumEx, ctx.displayCurrency)}</Text>
              </View>
              <View style={[styles.summaryRow, styles.summaryRowLast]}>
                <Text style={styles.summaryLabelStrong}>Ahorro del día</Text>
                <Text style={[styles.summaryValueStrong, { color: savings >= 0 ? COLORS.primary : COLORS.expense }]}>
                  {formatCurrency(savings, ctx.displayCurrency)}
                </Text>
              </View>
              <Text style={styles.summaryHint}>
                Ahorro = ingresos − gastos (sin contar transferencias entre tus cuentas).
              </Text>
            </View>
          ) : null}

          <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
            {listIncome &&
              section(
                `Ingresos (${incomes.length})`,
                incomes.length === 0 ? (
                  <Text style={styles.empty}>Nada que mostrar este día.</Text>
                ) : (
                  incomes.map((m) => renderMovementRow(m, incomeAmt(m, ctx), COLORS.income))
                ),
              )}

            {listExpense &&
              section(
                `Gastos (${expenses.length})`,
                expenses.length === 0 ? (
                  <Text style={styles.empty}>Nada que mostrar este día.</Text>
                ) : (
                  expenses.map((m) => renderMovementRow(m, expenseAmt(m, ctx), COLORS.expense))
                ),
              )}

            {listTransfer &&
              section(
                `Transferencias (${transfers.length})`,
                transfers.length === 0 ? (
                  <Text style={styles.empty}>Nada que mostrar este día.</Text>
                ) : (
                  transfers.map((m) => renderMovementRow(m, transferAmt(m, ctx), COLORS.secondary))
                ),
              )}

            <Text style={styles.footerHint}>Toca un movimiento para ver el detalle.</Text>
          </ScrollView>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.55)",
  },
  sheet: {
    maxHeight: "88%",
    backgroundColor: "rgba(10,14,20,0.98)",
    borderTopLeftRadius: RADIUS.xl,
    borderTopRightRadius: RADIUS.xl,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderTopColor: "rgba(255,255,255,0.16)",
    borderLeftColor: "rgba(255,255,255,0.08)",
    borderRightColor: "rgba(255,255,255,0.08)",
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.sm,
  },
  sheetGrab: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: SPACING.sm,
    position: "relative",
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.2)",
  },
  closeBtn: {
    position: "absolute",
    right: 0,
    top: -4,
    padding: SPACING.xs,
  },
  sheetTitle: {
    fontFamily: FONT_FAMILY.bodySemibold,
    fontSize: FONT_SIZE.lg,
    color: COLORS.ink,
    textTransform: "capitalize",
    textAlign: "center",
  },
  sheetSubtitle: {
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.xs,
    color: COLORS.storm,
    textAlign: "center",
    marginTop: 4,
    marginBottom: SPACING.md,
  },
  summaryCard: {
    backgroundColor: GLASS.card,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: GLASS.cardBorder,
    padding: SPACING.md,
    marginBottom: SPACING.md,
    gap: SPACING.xs,
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  summaryRowLast: {
    marginTop: SPACING.xs,
    paddingTop: SPACING.sm,
    borderTopWidth: 1,
    borderTopColor: GLASS.separator,
  },
  summaryLabel: { fontSize: FONT_SIZE.sm, color: COLORS.storm, fontFamily: FONT_FAMILY.body },
  summaryValue: { fontSize: FONT_SIZE.sm, fontFamily: FONT_FAMILY.bodySemibold },
  summaryLabelStrong: { fontSize: FONT_SIZE.md, color: COLORS.ink, fontFamily: FONT_FAMILY.bodySemibold },
  summaryValueStrong: { fontSize: FONT_SIZE.md, fontFamily: FONT_FAMILY.heading },
  summaryHint: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.storm,
    fontFamily: FONT_FAMILY.body,
    marginTop: SPACING.xs,
    lineHeight: 16,
  },
  scroll: { maxHeight: 420 },
  scrollContent: { paddingBottom: SPACING.xl },
  section: { marginBottom: SPACING.lg },
  sectionTitle: {
    fontSize: FONT_SIZE.xs,
    fontFamily: FONT_FAMILY.bodySemibold,
    color: COLORS.storm,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: SPACING.sm,
  },
  empty: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.textDisabled,
    fontFamily: FONT_FAMILY.body,
    fontStyle: "italic",
  },
  movRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: SPACING.md,
    paddingVertical: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: GLASS.separator,
  },
  movRowMain: { flex: 1, minWidth: 0 },
  movTitle: {
    fontSize: FONT_SIZE.sm,
    fontFamily: FONT_FAMILY.bodyMedium,
    color: COLORS.ink,
  },
  movMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    flexWrap: "wrap",
    marginTop: 2,
  },
  movMeta: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.storm,
    fontFamily: FONT_FAMILY.body,
  },
  attBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: RADIUS.full,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 0.5,
    borderColor: "rgba(255,255,255,0.10)",
  },
  attBadgeText: {
    fontFamily: FONT_FAMILY.bodyMedium,
    fontSize: 9,
    color: COLORS.storm,
  },
  movAmount: {
    fontSize: FONT_SIZE.sm,
    fontFamily: FONT_FAMILY.bodySemibold,
    flexShrink: 0,
  },
  footerHint: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.storm,
    textAlign: "center",
    marginTop: SPACING.md,
  },
});
