import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { Card } from "../../../../components/ui/Card";
import { formatCurrency } from "../../../../components/ui/AmountDisplay";
import { COLORS, FONT_FAMILY, FONT_SIZE, RADIUS, SPACING, SURFACE } from "../../../../constants/theme";
import {
  buildCashflowCalendar,
  typicalMonthlySpend,
  type ProjectedMonth,
  type ProjectionLine,
} from "../../../projection/lib/cashflow-calendar";
import { monthlyDiscretionarySpend } from "../../../projection/lib/discretionary-history";
import { convertAmt, expenseAmt, isExpense } from "../../lib/aggregations";
import type { DashboardMovementRow } from "../../lib/dashboard-row";
import { movementActsAsIncome, movementDisplayAccountId, movementDisplayAmount } from "../../../../lib/movement-amounts";
import type { ConversionCtx } from "../../lib/types";
import { SectionTitle } from "./SectionTitle";
import { DASHBOARD_MOVEMENTS_WINDOW_DAYS } from "../../../../services/queries/workspace-data";

/** Cuántos meses TERMINADOS se miran para sacar la mediana del gasto típico. */
const HISTORY_MONTHS = 6;
const HORIZON_OPTIONS = [3, 6, 12] as const;

type ProjectionObligationInput = {
  title: string;
  direction: string;
  status: string;
  currencyCode: string;
  pendingAmount: number;
  currentPrincipalAmount?: number | null;
  principalAmount: number;
  startDate: string;
  dueDate: string | null;
  paymentPlan?: unknown;
  installmentAmount?: number | null;
};

type CashflowProjectionSectionProps = {
  movements: DashboardMovementRow[];
  obligations: ProjectionObligationInput[];
  subscriptions: Array<{
    name: string;
    amount: number;
    currencyCode: string;
    frequency: string;
    intervalCount?: number | null;
    nextDueDate: string;
    endDate?: string | null;
    status: string;
  }>;
  recurringIncome: Array<{
    name: string;
    amount: number;
    currencyCode: string;
    frequency: string;
    intervalCount?: number | null;
    nextExpectedDate: string;
    endDate?: string | null;
    status: string;
  }>;
  displayCurrency: string;
  baseCurrency: string;
  exchangeRateMap: Map<string, number>;
  accountCurrencyMap: Map<number, string>;
  currentVisibleBalance: number;
};

function monthLabel(monthKey: string): string {
  const [year, month] = monthKey.split("-").map(Number);
  const names = [
    "Enero",
    "Febrero",
    "Marzo",
    "Abril",
    "Mayo",
    "Junio",
    "Julio",
    "Agosto",
    "Setiembre",
    "Octubre",
    "Noviembre",
    "Diciembre",
  ];
  const name = names[(month ?? 1) - 1] ?? monthKey;
  return `${name} ${year}`;
}

/** Agrupa las líneas repetidas: doce "Netflix" en un mes serían doce filas idénticas. */
function groupLines(lines: ProjectionLine[]): Array<{ label: string; amount: number; estimated: boolean }> {
  const byLabel = new Map<string, { label: string; amount: number; estimated: boolean }>();
  for (const line of lines) {
    const existing = byLabel.get(line.label);
    if (existing) existing.amount += line.amount;
    else byLabel.set(line.label, { label: line.label, amount: line.amount, estimated: line.source === "estimated" });
  }
  return [...byLabel.values()].sort((a, b) => b.amount - a.amount);
}

function MonthRow({
  month,
  currency,
  expanded,
  onToggle,
}: {
  month: ProjectedMonth;
  currency: string;
  expanded: boolean;
  onToggle: () => void;
}) {
  const positive = month.netFlow >= 0;
  return (
    <View style={styles.monthBlock}>
      <Pressable
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityLabel={`${monthLabel(month.monthKey)}, ver detalle`}
        style={styles.monthRow}
      >
        <View style={styles.monthNameCell}>
          <Text style={styles.monthName} maxFontSizeMultiplier={1.4}>
            {monthLabel(month.monthKey)}
          </Text>
          {month.isPartial ? (
            <Text style={styles.monthHint} maxFontSizeMultiplier={1.4}>
              lo que queda del mes
            </Text>
          ) : null}
        </View>
        <Text
          style={[styles.monthNet, { color: positive ? COLORS.pine : COLORS.dangerSoft }]}
          maxFontSizeMultiplier={1.3}
        >
          {positive ? "+" : "−"}
          {formatCurrency(Math.abs(month.netFlow), currency)}
        </Text>
        <Text style={styles.monthBalance} maxFontSizeMultiplier={1.3}>
          {formatCurrency(month.closingBalance, currency)}
        </Text>
      </Pressable>

      {expanded ? (
        <View style={styles.detail}>
          {groupLines(month.inflows).map((line) => (
            <View key={`in-${line.label}`} style={styles.detailRow}>
              <Text style={styles.detailLabel} numberOfLines={1} maxFontSizeMultiplier={1.4}>
                {line.label}
                {line.estimated ? " · estimado" : ""}
              </Text>
              <Text style={[styles.detailAmount, { color: COLORS.pine }]} maxFontSizeMultiplier={1.3}>
                +{formatCurrency(line.amount, currency)}
              </Text>
            </View>
          ))}
          {groupLines(month.outflows).map((line) => (
            <View key={`out-${line.label}`} style={styles.detailRow}>
              <Text style={styles.detailLabel} numberOfLines={1} maxFontSizeMultiplier={1.4}>
                {line.label}
                {line.estimated ? " · estimado" : ""}
              </Text>
              <Text style={[styles.detailAmount, { color: COLORS.dangerSoft }]} maxFontSizeMultiplier={1.3}>
                −{formatCurrency(line.amount, currency)}
              </Text>
            </View>
          ))}
          {month.inflows.length === 0 && month.outflows.length === 0 ? (
            <Text style={styles.detailEmpty} maxFontSizeMultiplier={1.4}>
              Nada registrado para este mes.
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

/**
 * La proyección mes a mes: en qué acaba tu saldo si todo sigue como está registrado.
 *
 * Se lee al revés que `FutureFlowPreview`, su vecina: aquella responde "qué me viene en 30 días"
 * y esta "en qué termino". Por eso el número grande es el cierre del último mes y no el flujo del
 * primero — es la cifra por la que se abre la pantalla.
 *
 * El aviso de confianza no es decoración. Un cierre a 12 meses construido sobre un mes bien
 * registrado y once de suposición se ve idéntico a uno sólido si nadie dice qué parte está
 * pactada, y la única forma de que el usuario sepa cuánto creerle es decírselo.
 */
export function CashflowProjectionSection({
  movements,
  obligations,
  subscriptions,
  recurringIncome,
  displayCurrency,
  baseCurrency,
  exchangeRateMap,
  accountCurrencyMap,
  currentVisibleBalance,
}: CashflowProjectionSectionProps) {
  const [horizon, setHorizon] = useState<number>(6);
  const [openMonth, setOpenMonth] = useState<string | null>(null);

  const conversionCtx = useMemo<ConversionCtx>(
    () => ({ accountCurrencyMap, exchangeRateMap, displayCurrency, baseCurrency }),
    [accountCurrencyMap, exchangeRateMap, displayCurrency, baseCurrency],
  );

  const typicalSpend = useMemo(() => {
    // La query base del dashboard trae una ventana fija. Pedirle seis meses devolvería los
    // cargados más ceros, y esos ceros partirían la mediana por la mitad sin que se note.
    const coveredFrom = new Date();
    coveredFrom.setDate(coveredFrom.getDate() - DASHBOARD_MOVEMENTS_WINDOW_DAYS);

    const history = monthlyDiscretionarySpend({
      movements,
      months: HISTORY_MONTHS,
      earliestCoveredDate: coveredFrom,
      expenseAmountOf: (movement) => (isExpense(movement) ? expenseAmt(movement, conversionCtx) : 0),
    });
    return { typical: typicalMonthlySpend(history), monthsUsed: history.length };
  }, [movements, conversionCtx]);

  /**
   * Los gastos e ingresos que el usuario dejó anotados con fecha futura.
   *
   * Hasta ahora el estado `planned` existía en el formulario y no se leía en ninguna parte: se
   * registraba la maestría de abril y desaparecía. Aquí es donde por fin cuenta.
   */
  const plannedMovements = useMemo(() => {
    const now = new Date();
    return movements
      .filter((movement) => movement.status === "planned" && new Date(movement.occurredAt) > now)
      .map((movement) => {
        const income = movementActsAsIncome(movement);
        const accountId = movementDisplayAccountId(movement);
        return {
          description: movement.description || (income ? "Ingreso planificado" : "Gasto planificado"),
          signedAmount: movementDisplayAmount(movement) * (income ? 1 : -1),
          currencyCode: (accountId ? accountCurrencyMap.get(accountId) : undefined) ?? baseCurrency,
          occurredAt: movement.occurredAt,
        };
      });
  }, [movements, accountCurrencyMap, baseCurrency]);

  const projection = useMemo(() => {
    const today = new Date();
    const fromDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(
      today.getDate(),
    ).padStart(2, "0")}`;

    return buildCashflowCalendar({
      startingBalance: currentVisibleBalance,
      fromDate,
      months: horizon,
      typicalDiscretionarySpend: typicalSpend.typical,
      convert: (amount, fromCurrency) =>
        convertAmt(amount, fromCurrency, displayCurrency, exchangeRateMap, baseCurrency),
      recurringIncome,
      subscriptions,
      obligations: obligations.map((obligation) => ({
        title: obligation.title,
        direction: obligation.direction,
        status: obligation.status,
        currencyCode: obligation.currencyCode,
        pendingAmount: obligation.pendingAmount,
        // El principal vigente es el que manda: con aumentos o reducciones, el de apertura ya
        // no dice cuánto se lleva pagado y las cuotas saldrían corridas.
        principalCurrentAmount: obligation.currentPrincipalAmount ?? obligation.principalAmount,
        startDate: obligation.startDate,
        dueDate: obligation.dueDate,
        paymentPlan: obligation.paymentPlan,
        installmentAmount: obligation.installmentAmount,
      })),
      plannedMovements,
    });
  }, [
    baseCurrency,
    currentVisibleBalance,
    displayCurrency,
    exchangeRateMap,
    horizon,
    obligations,
    plannedMovements,
    recurringIncome,
    subscriptions,
    typicalSpend,
  ]);

  const lastMonth = projection.months[projection.months.length - 1];
  const scheduledPercent = Math.round(projection.overallScheduledShare * 100);
  const delta = projection.endingBalance - currentVisibleBalance;

  return (
    <Card>
      <SectionTitle>Proyección</SectionTitle>

      <View style={styles.horizonRow}>
        {HORIZON_OPTIONS.map((option) => {
          const active = option === horizon;
          return (
            <Pressable
              key={option}
              onPress={() => {
                setHorizon(option);
                setOpenMonth(null);
              }}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              accessibilityLabel={`Proyectar ${option} meses`}
              style={[styles.horizonPill, active && styles.horizonPillActive]}
            >
              <Text
                style={[styles.horizonPillText, active && styles.horizonPillTextActive]}
                maxFontSizeMultiplier={1.3}
              >
                {option} meses
              </Text>
            </Pressable>
          );
        })}
      </View>

      {lastMonth ? (
        <View style={styles.headline}>
          <Text style={styles.headlineKicker} maxFontSizeMultiplier={1.4}>
            Si todo sigue como está, cierras {monthLabel(lastMonth.monthKey).toLowerCase()} con
          </Text>
          <Text style={styles.headlineAmount} maxFontSizeMultiplier={1.2}>
            {formatCurrency(projection.endingBalance, displayCurrency)}
          </Text>
          <Text style={styles.headlineDelta} maxFontSizeMultiplier={1.4}>
            {delta >= 0 ? "Son " : "Son "}
            {formatCurrency(Math.abs(delta), displayCurrency)} {delta >= 0 ? "más" : "menos"} que hoy.
          </Text>
        </View>
      ) : null}

      <View style={styles.tableHead}>
        <Text style={[styles.tableHeadText, styles.monthNameCell]} maxFontSizeMultiplier={1.3}>
          Mes
        </Text>
        <Text style={[styles.tableHeadText, styles.monthNet]} maxFontSizeMultiplier={1.3}>
          Flujo
        </Text>
        <Text style={[styles.tableHeadText, styles.monthBalance]} maxFontSizeMultiplier={1.3}>
          Saldo
        </Text>
      </View>

      {projection.months.map((month) => (
        <MonthRow
          key={month.monthKey}
          month={month}
          currency={displayCurrency}
          expanded={openMonth === month.monthKey}
          onToggle={() => setOpenMonth((current) => (current === month.monthKey ? null : month.monthKey))}
        />
      ))}

      <Text style={styles.confidence} maxFontSizeMultiplier={1.4}>
        {typicalSpend.typical > 0
          ? `El ${scheduledPercent}% de este movimiento está pactado; el resto es tu gasto típico de ${formatCurrency(
              typicalSpend.typical,
              displayCurrency,
            )} al mes. Es la mediana de ${typicalSpend.monthsUsed} ${
              typicalSpend.monthsUsed === 1 ? "mes" : "meses"
            } —el mes de en medio, no el promedio— para que una compra grande no se te cobre todos los meses.`
          : "Todavía no hay historial suficiente para estimar tu gasto del día a día, así que aquí solo ves lo que está pactado. El cierre real va a ser más bajo que este."}
      </Text>

      {projection.unconvertedCount > 0 ? (
        <Text style={styles.warning} maxFontSizeMultiplier={1.4}>
          {projection.unconvertedCount} compromiso{projection.unconvertedCount === 1 ? "" : "s"} en otra moneda sin
          tipo de cambio disponible: {projection.unconvertedCount === 1 ? "no está" : "no están"} sumado
          {projection.unconvertedCount === 1 ? "" : "s"} arriba.
        </Text>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  horizonRow: {
    flexDirection: "row" as const,
    gap: SPACING.xs,
    marginBottom: SPACING.md,
  },
  horizonPill: {
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.sm,
    borderRadius: RADIUS.full,
    backgroundColor: SURFACE.input,
    borderWidth: 1,
    borderColor: SURFACE.inputBorder,
  },
  horizonPillActive: {
    backgroundColor: COLORS.action,
    borderColor: COLORS.action,
  },
  horizonPillText: {
    fontFamily: FONT_FAMILY.bodySemibold,
    fontSize: FONT_SIZE.xs,
    color: COLORS.fog,
  },
  horizonPillTextActive: {
    color: COLORS.actionText,
  },
  headline: {
    gap: SPACING.xs,
    marginBottom: SPACING.md,
  },
  headlineKicker: {
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.sm,
    color: COLORS.fog,
  },
  headlineAmount: {
    fontFamily: FONT_FAMILY.heading,
    fontSize: FONT_SIZE.xxxl,
    color: COLORS.ink,
  },
  headlineDelta: {
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.xs,
    color: COLORS.storm,
  },
  tableHead: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: SPACING.sm,
    paddingBottom: SPACING.xs,
  },
  tableHeadText: {
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.xs,
    color: COLORS.storm,
  },
  monthBlock: {
    borderTopWidth: 1,
    borderTopColor: SURFACE.cardBorder,
  },
  monthRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: SPACING.sm,
    paddingVertical: SPACING.sm,
  },
  monthNameCell: {
    flex: 1.4,
  },
  monthName: {
    fontFamily: FONT_FAMILY.bodySemibold,
    fontSize: FONT_SIZE.sm,
    color: COLORS.ink,
  },
  monthHint: {
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.xs,
    color: COLORS.storm,
  },
  monthNet: {
    flex: 1,
    textAlign: "right" as const,
    fontFamily: FONT_FAMILY.bodySemibold,
    fontSize: FONT_SIZE.sm,
  },
  monthBalance: {
    flex: 1,
    textAlign: "right" as const,
    fontFamily: FONT_FAMILY.heading,
    fontSize: FONT_SIZE.sm,
    color: COLORS.ink,
  },
  detail: {
    gap: SPACING.xs,
    paddingBottom: SPACING.sm,
    paddingLeft: SPACING.sm,
  },
  detailRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
    gap: SPACING.sm,
  },
  detailLabel: {
    flex: 1,
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.xs,
    color: COLORS.fog,
  },
  detailAmount: {
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.xs,
  },
  detailEmpty: {
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.xs,
    color: COLORS.storm,
  },
  confidence: {
    marginTop: SPACING.md,
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.xs,
    color: COLORS.storm,
    lineHeight: 18,
  },
  warning: {
    marginTop: SPACING.xs,
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.xs,
    color: COLORS.gold,
    lineHeight: 18,
  },
});
