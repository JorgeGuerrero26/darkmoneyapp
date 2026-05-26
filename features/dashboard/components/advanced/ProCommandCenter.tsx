import { useMemo } from "react";
import { Text, TouchableOpacity, View } from "react-native";
import type { useRouter } from "expo-router";
import { differenceInDays, endOfMonth, startOfMonth } from "date-fns";
import { ArrowRight, Target, TrendingUp } from "lucide-react-native";

import { Card } from "../../../../components/ui/Card";
import { formatCurrency } from "../../../../components/ui/AmountDisplay";
import { COLORS } from "../../../../constants/theme";
import { parseDisplayDate } from "../../../../lib/date";
import type { DashboardMovementRow } from "../../../../services/queries/workspace-data";
import { expenseAmt, inRange, incomeAmt, isExpense, isIncome } from "../../lib/aggregations";
import { buildFutureFlowWindows, buildReviewInboxSnapshot, convertDashboardCurrency } from "../../lib/dashboard-builders";
import { SectionTitle } from "../simple/SectionTitle";
import { dashboardSimpleStyles as subStyles } from "../simple/styles";

type ProCommandCenterProps = {
  movements: DashboardMovementRow[];
  obligations: Array<{
    id: number;
    title: string;
    direction: string;
    pendingAmount: number;
    installmentAmount?: number | null;
    currencyCode: string;
    dueDate: string | null;
    status: string;
    lastPaymentDate?: string | null;
    startDate?: string;
  }>;
  subscriptions: Array<{
    id: number;
    name: string;
    amount: number;
    currencyCode: string;
    nextDueDate: string;
    accountId?: number | null;
    status: string;
    frequency: string;
    intervalCount: number;
  }>;
  recurringIncome: Array<{ id: number; name: string; amount: number; currencyCode: string; nextExpectedDate: string; status: string }>;
  displayCurrency: string;
  exchangeRateMap: Map<string, number>;
  currentVisibleBalance: number;
  router: ReturnType<typeof useRouter>;
  accountCurrencyMap: Map<number, string>;
};

export function ProCommandCenter({
  movements,
  obligations,
  subscriptions,
  recurringIncome,
  displayCurrency,
  exchangeRateMap,
  currentVisibleBalance,
  router,
  accountCurrencyMap,
}: ProCommandCenterProps) {
  const review = useMemo(() => buildReviewInboxSnapshot(movements, subscriptions, obligations), [movements, obligations, subscriptions]);
  const windows = useMemo(
    () => buildFutureFlowWindows(obligations, subscriptions, recurringIncome, displayCurrency, exchangeRateMap, currentVisibleBalance),
    [currentVisibleBalance, displayCurrency, exchangeRateMap, obligations, recurringIncome, subscriptions],
  );
  const monthToDate = useMemo(() => {
    const now = new Date();
    const start = startOfMonth(now);
    const income = movements
      .filter((movement) => inRange(movement, start, now) && isIncome(movement))
      .reduce((sum, movement) => sum + incomeAmt(movement, { accountCurrencyMap, exchangeRateMap, displayCurrency }), 0);
    const expense = movements
      .filter((movement) => inRange(movement, start, now) && isExpense(movement))
      .reduce((sum, movement) => sum + expenseAmt(movement, { accountCurrencyMap, exchangeRateMap, displayCurrency }), 0);
    return { net: income - expense, daysElapsed: Math.max(1, differenceInDays(now, start) + 1) };
  }, [accountCurrencyMap, displayCurrency, exchangeRateMap, movements]);
  const monthRecurringIncomeProjection = useMemo(() => {
    const now = new Date();
    const monthEnd = endOfMonth(now);
    return recurringIncome
      .filter((income) => income.status === "active")
      .reduce((sum, income) => {
        const expectedDate = parseDisplayDate(income.nextExpectedDate);
        if (expectedDate < now || expectedDate > monthEnd) return sum;
        return sum + convertDashboardCurrency(income.amount, income.currencyCode, displayCurrency, exchangeRateMap);
      }, 0);
  }, [displayCurrency, exchangeRateMap, recurringIncome]);
  const daysInMonth = differenceInDays(endOfMonth(new Date()), startOfMonth(new Date())) + 1;
  const monthEndEstimate =
    currentVisibleBalance +
    (monthToDate.net / monthToDate.daysElapsed) * (daysInMonth - monthToDate.daysElapsed) +
    monthRecurringIncomeProjection;
  const weekWindow = windows[0];
  const actions = [
    review.overdueObligationsCount > 0
      ? { key: "overdue", title: "Resolver vencimientos", detail: `${review.overdueObligationsCount} cobros o pagos ya estan fuera de fecha.`, route: "/obligations" }
      : null,
    review.pendingMovementsCount > 0
      ? { key: "pending", title: "Aplicar cola pendiente", detail: `${review.pendingMovementsCount} movimientos aun no impactan tus saldos.`, route: "/movements" }
      : null,
    review.uncategorizedCount > 0
      ? { key: "uncategorized", title: "Categorizar gastos e ingresos", detail: `${review.uncategorizedCount} movimientos siguen sin categoria.`, route: "/movements" }
      : null,
    review.subscriptionsAttentionCount > 0
      ? { key: "subscriptions", title: "Confirmar suscripciones", detail: `${review.subscriptionsAttentionCount} cargos fijos necesitan cuenta o fecha revisada.`, route: "/subscriptions" }
      : null,
  ].filter(Boolean) as Array<{ key: string; title: string; detail: string; route: string }>;
  const recommendation =
    review.overdueObligationsCount > 0
      ? "Tu prioridad más rentable hoy es limpiar vencimientos de cartera antes de que se arrastre más el desfase."
      : weekWindow.expectedOutflow > weekWindow.expectedInflow
        ? "La próxima semana sale más dinero del que entra: revisa compromisos y mueve foco a liquidez."
        : review.uncategorizedCount > 0
          ? "Con unas cuantas categorías más, el dashboard puede darte comparativos y señales mucho más finas."
          : "No vemos fricción fuerte: aprovecha para ordenar metas, presupuestos o suscripciones.";

  return (
    <Card>
      <SectionTitle>Acciones y foco</SectionTitle>
      {actions.length === 0 ? (
        <View style={subStyles.richEmptyState}>
          <Target size={18} color={COLORS.income} />
          <Text style={subStyles.richEmptyTitle}>Sin urgencias fuertes</Text>
          <Text style={subStyles.richEmptyBody}>Buen momento para afinar metas, presupuestos o limpiar detalles pequenos del workspace.</Text>
        </View>
      ) : (
        <View style={subStyles.commandActions}>
          {actions.slice(0, 3).map((action) => (
            <TouchableOpacity key={action.key} style={subStyles.commandActionRow} onPress={() => router.push(action.route as never)} activeOpacity={0.82}>
              <View style={subStyles.commandActionCopy}>
                <Text style={subStyles.commandActionTitle}>{action.title}</Text>
                <Text style={subStyles.commandActionBody}>{action.detail}</Text>
              </View>
              <ArrowRight size={15} color={COLORS.storm} />
            </TouchableOpacity>
          ))}
        </View>
      )}
      <View style={subStyles.commandMetricGrid}>
        <View style={subStyles.commandMetricCard}>
          <Text style={subStyles.commandMetricLabel}>Presion 7 dias</Text>
          <Text style={subStyles.commandMetricValue}>
            {formatCurrency(weekWindow.expectedInflow - weekWindow.expectedOutflow, displayCurrency)}
          </Text>
          <Text style={subStyles.commandMetricHint}>
            Entra {formatCurrency(weekWindow.expectedInflow, displayCurrency)} · sale {formatCurrency(weekWindow.expectedOutflow, displayCurrency)}
          </Text>
        </View>
        <View style={subStyles.commandMetricCard}>
          <Text style={subStyles.commandMetricLabel}>Caja estimada fin de mes</Text>
          <Text style={subStyles.commandMetricValue}>{formatCurrency(monthEndEstimate, displayCurrency)}</Text>
          <Text style={subStyles.commandMetricHint}>
            {monthRecurringIncomeProjection > 0
              ? `Incluye ${formatCurrency(monthRecurringIncomeProjection, displayCurrency)} de ingresos fijos por entrar este mes.`
              : "Extrapola el neto diario del mes en curso."}
          </Text>
        </View>
      </View>
      <View style={subStyles.commandRecommendation}>
        <TrendingUp size={16} color={COLORS.gold} />
        <Text style={subStyles.commandRecommendationText}>{recommendation}</Text>
      </View>
    </Card>
  );
}
