import { useCallback, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { format } from "date-fns";
import { es } from "date-fns/locale";

import { ErrorBoundary } from "../../../components/ui/ErrorBoundary";
import { ScreenHeader } from "../../../components/layout/ScreenHeader";
import { ResourceModuleTemplate } from "../../../components/ui/ResourceModuleTemplate";
import { SkeletonCard, SkeletonList } from "../../../components/ui/Skeleton";
import { formatCurrency } from "../../../components/ui/AmountDisplay";
import { buildBudgetMovementDays, budgetMovementsTail } from "../../../features/budgets/lib/budgetMovementDays";
import { expectedPace } from "../../../features/budgets/lib/budgetRules";
import { useBudgetScopeMovementsQuery } from "../../../services/queries/budget-analytics";
import { useWorkspaceSnapshotQuery } from "../../../services/queries/workspace-data";
import { applyBudgetComputedMetrics, buildBudgetMetricsMap } from "../../../lib/budget-metrics";
import { useAuth } from "../../../lib/auth-context";
import { useWorkspace } from "../../../lib/workspace-context";
import { relativeDateLabel } from "../../../lib/calendar";
import { isoToDateStr, parseDisplayDate, todayPeru } from "../../../lib/date";
import { useOriginBackNavigation } from "../../../hooks/useOriginBackNavigation";
import { useUiStore } from "../../../store/ui-store";
import { COLORS, FONT_FAMILY, FONT_SIZE, RADIUS, SPACING, SURFACE } from "../../../constants/theme";

/** Cuántos se ven de entrada. El resto se pide, con sus cifras dichas. */
const VISIBLE = 6;

/**
 * Los movimientos de un presupuesto, en su propia pantalla.
 *
 * **Vive dentro del presupuesto y no en Movimientos.** "Ver los 28" llevaba a la lista general, y
 * allí el filtro no viajaba con la vista: en dos scrolls se lee como la lista de siempre y los
 * subtotales pasan a significar otra cosa. Por eso el encabezado repite el mes, el nombre del
 * presupuesto y la misma barra con su marca de ritmo — para que en ningún momento se pueda
 * confundir con la lista general.
 *
 * **Los subtotales por día son la razón de que exista.** La pregunta aquí no es qué pasó, es qué
 * llenó el presupuesto: "Ayer, 101.40" lo señala en una pasada, con el mercado de 86.40 dentro.
 */
function BudgetMovementsScreen() {
  useUiStore((state) => state.privacyMode);
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { handleBack } = useOriginBackNavigation({ defaultRoute: "/(app)/budgets" });
  const { profile } = useAuth();
  const { activeWorkspaceId, activeWorkspace } = useWorkspace();
  const [expanded, setExpanded] = useState(false);

  const budgetId = Number(id);
  const { data: snapshot, isLoading, dataUpdatedAt } = useWorkspaceSnapshotQuery(profile, activeWorkspaceId);
  const baseCurrencyCode = activeWorkspace?.baseCurrencyCode ?? profile?.baseCurrencyCode ?? "PEN";

  /* Mismo camino que el detalle: el gasto sale de los movimientos del ámbito, no de la vista,
     porque aquí hacen falta los movimientos uno a uno y no solo el total. */
  const rawBudget = useMemo(
    () => (snapshot?.budgets ?? []).find((item) => item.id === budgetId) ?? null,
    [snapshot?.budgets, budgetId],
  );
  const budgetsForQuery = useMemo(() => (rawBudget ? [rawBudget] : []), [rawBudget]);
  const { data: scopedMovements = [] } = useBudgetScopeMovementsQuery(
    activeWorkspaceId,
    budgetsForQuery,
    dataUpdatedAt,
  );
  const metricsMap = useMemo(
    () => buildBudgetMetricsMap(budgetsForQuery, scopedMovements, {
      workspaceBaseCurrencyCode: baseCurrencyCode,
      exchangeRates: snapshot?.exchangeRates ?? [],
    }),
    [baseCurrencyCode, budgetsForQuery, scopedMovements, snapshot?.exchangeRates],
  );
  const budget = useMemo(() => {
    if (!rawBudget) return null;
    const metrics = metricsMap.get(rawBudget.id);
    return metrics ? applyBudgetComputedMetrics(rawBudget, metrics) : rawBudget;
  }, [metricsMap, rawBudget]);
  const analytics = budget ? metricsMap.get(budget.id) ?? null : null;

  const today = todayPeru();
  const money = useCallback(
    (value: number) => formatCurrency(value, budget?.currencyCode ?? "PEN"),
    [budget?.currencyCode],
  );

  const contributions = analytics?.contributions ?? [];
  const { days, rest } = useMemo(
    () => buildBudgetMovementDays(contributions, isoToDateStr, expanded ? contributions.length : VISIBLE),
    [contributions, expanded],
  );
  const tail = budgetMovementsTail(rest, money);

  const periodLabel = budget
    ? capitalizeFirst(format(parseDisplayDate(budget.periodStart), "LLLL", { locale: es }))
    : "";
  const percent = budget && budget.limitAmount > 0
    ? (budget.spentAmount / budget.limitAmount) * 100
    : 0;
  const over = Boolean(budget && budget.spentAmount > budget.limitAmount);
  const pace = budget ? expectedPace(budget, today) : 0;

  return (
    <ResourceModuleTemplate
      topInset={insets.top}
      header={<ScreenHeader title={periodLabel || "Movimientos"} subtitle={budget?.name} onBack={handleBack} />}
      list={
        isLoading || !budget ? (
          <SkeletonList>
            <SkeletonCard />
            <SkeletonCard />
          </SkeletonList>
        ) : (
          <ScrollView contentContainerStyle={styles.content}>
            {/* El mismo encabezado del detalle: sin esto, en dos scrolls la pantalla se lee como
                la lista general y los subtotales pasan a significar otra cosa. */}
            <View style={styles.head}>
              <View style={styles.amountRow}>
                <Text style={[styles.spent, over && styles.spentOver]}>{money(budget.spentAmount)}</Text>
                <Text style={styles.limit}>
                  de {money(budget.limitAmount)} · {contributions.length} movimiento
                  {contributions.length === 1 ? "" : "s"}
                </Text>
              </View>
              <View style={styles.track}>
                <View
                  style={[styles.fill, { width: `${Math.min(100, Math.max(0, percent))}%` }, over && styles.fillOver]}
                />
                {!over && pace > 0 && pace < 1 ? (
                  <View style={[styles.pace, { left: `${pace * 100}%` }]} />
                ) : null}
              </View>
            </View>

            {days.map((day) => (
              <View key={day.date}>
                <View style={styles.dayHeader}>
                  <Text style={styles.dayLabel}>{relativeDateLabel(day.date, today)}</Text>
                  <Text style={styles.daySubtotal}>{money(day.subtotal)}</Text>
                </View>
                {day.movements.map((movement) => (
                  <Pressable
                    key={movement.movementId}
                    style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
                    onPress={() => router.push(`/movement/${movement.movementId}?from=budget`)}
                  >
                    <View style={styles.left}>
                      <Text style={styles.description} numberOfLines={1}>
                        {movement.description || "Sin descripción"}
                      </Text>
                      {movement.accountName ? (
                        <Text style={styles.meta} numberOfLines={1}>{movement.accountName}</Text>
                      ) : null}
                    </View>
                    <Text style={styles.amount}>{money(movement.amountInBudgetCurrency)}</Text>
                  </Pressable>
                ))}
              </View>
            ))}

            {/* La cola dice sus cifras, y cuadran con el total de arriba: un número que crece al
                desplazarse no se puede comprobar contra nada. */}
            {tail ? (
              <Pressable onPress={() => setExpanded(true)} style={({ pressed }) => [styles.tail, pressed && styles.rowPressed]}>
                <Text style={styles.tailText}>{tail}</Text>
              </Pressable>
            ) : null}
          </ScrollView>
        )
      }
    />
  );
}

function capitalizeFirst(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: SPACING.xl, paddingBottom: SPACING.xxl, gap: 0 },
  head: { gap: SPACING.sm, paddingBottom: SPACING.md },
  amountRow: { flexDirection: "row", alignItems: "baseline", gap: SPACING.sm, flexWrap: "wrap" },
  spent: {
    fontFamily: FONT_FAMILY.heading,
    fontSize: FONT_SIZE.xxl,
    color: COLORS.ink,
    letterSpacing: -0.5,
  },
  spentOver: { color: COLORS.expense },
  limit: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.sm, color: COLORS.storm },
  track: { height: 6, borderRadius: RADIUS.full, backgroundColor: COLORS.bgInput, overflow: "hidden" },
  fill: { height: "100%", borderRadius: RADIUS.full, backgroundColor: COLORS.fog },
  fillOver: { backgroundColor: COLORS.expense },
  pace: { position: "absolute", top: 0, bottom: 0, width: 2, backgroundColor: COLORS.storm },
  dayHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: SPACING.md,
    paddingBottom: SPACING.xs,
  },
  dayLabel: { fontFamily: FONT_FAMILY.bodyMedium, fontSize: FONT_SIZE.sm, color: COLORS.storm },
  daySubtotal: { fontFamily: FONT_FAMILY.heading, fontSize: FONT_SIZE.sm, color: COLORS.storm },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.md,
    minHeight: 56,
    paddingVertical: SPACING.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: SURFACE.separator,
  },
  rowPressed: { opacity: 0.6 },
  left: { flex: 1, gap: 2 },
  description: { fontFamily: FONT_FAMILY.bodySemibold, fontSize: FONT_SIZE.md, color: COLORS.ink },
  meta: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.xs, color: COLORS.storm },
  amount: { fontFamily: FONT_FAMILY.heading, fontSize: FONT_SIZE.md, color: COLORS.ink },
  tail: { paddingVertical: SPACING.lg },
  /* No va en el gris de deshabilitado: lleva una cifra que el propio texto pide verificar. */
  tailText: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.sm, color: "#8E877C" },
});

export default function BudgetMovementsScreenRoot() {
  return (
    <ErrorBoundary>
      <BudgetMovementsScreen />
    </ErrorBoundary>
  );
}
