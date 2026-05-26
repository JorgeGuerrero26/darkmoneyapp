import { ScrollView, Text, TouchableOpacity, View } from "react-native";
import { endOfMonth, format, startOfMonth, subMonths } from "date-fns";

import { Card } from "../../../../components/ui/Card";
import { RingChart, type RingSegment } from "../../../../components/ui/RingChart";
import { SparkLine } from "../../../../components/ui/SparkLine";
import { formatCurrency } from "../../../../components/ui/AmountDisplay";
import { COLORS, EXTENDED_PALETTE } from "../../../../constants/theme";
import { SectionTitle } from "../simple/SectionTitle";
import { dashboardSimpleStyles as subStyles } from "../simple/styles";

export function ProjectionBridgeChart({
  currentVisibleBalance,
  committedNet,
  variableNet,
  expectedBalance,
  currency,
  onOpenAccounts,
  onExplainProjection,
  onOpenMonthMovements,
}: {
  currentVisibleBalance: number;
  committedNet: number;
  variableNet: number;
  expectedBalance: number;
  currency: string;
  onOpenAccounts: () => void;
  onExplainProjection: () => void;
  onOpenMonthMovements: () => void;
}) {
  const rows = [
    { label: "Saldo visible hoy", detail: "Lo que suman tus cuentas visibles", amount: currentVisibleBalance, tone: "base" as const, action: "Abrir cuentas", onPress: onOpenAccounts },
    { label: "Agenda comprometida", detail: "Ingresos fijos menos pagos esperados", amount: committedNet, tone: committedNet >= 0 ? ("positive" as const) : ("negative" as const), action: "Entender agenda", onPress: onExplainProjection },
    { label: "Ritmo variable", detail: "Proyección de gastos e ingresos no fijos", amount: variableNet, tone: variableNet >= 0 ? ("positive" as const) : ("negative" as const), action: "Ver movimientos", onPress: onOpenMonthMovements },
    { label: "Cierre esperado", detail: "Resultado estimado de fin de mes", amount: expectedBalance, tone: expectedBalance >= currentVisibleBalance ? ("positive" as const) : ("warning" as const), action: "Ver cálculo", onPress: onExplainProjection },
  ];
  const maxAbs = Math.max(...rows.map((row) => Math.abs(row.amount)), 1);

  return (
    <Card>
      <Text style={subStyles.visualChartKicker}>Proyección</Text>
      <SectionTitle>Puente de cierre de mes</SectionTitle>
      <Text style={subStyles.visualChartIntro}>
        Te muestra qué empuja la caja estimada: saldo actual, agenda fija y ritmo variable. Si una barra va a la izquierda, resta.
      </Text>
      <View style={subStyles.bridgeChartStack}>
        {rows.map((row) => {
          const width = Math.max(3, Math.min(50, (Math.abs(row.amount) / maxAbs) * 50));
          const isNegative = row.amount < 0;
          const color =
            row.tone === "positive"
              ? COLORS.income
              : row.tone === "negative"
                ? COLORS.expense
                : row.tone === "warning"
                  ? COLORS.gold
                  : COLORS.primary;
          return (
            <TouchableOpacity key={row.label} style={subStyles.bridgeRow} onPress={row.onPress} activeOpacity={0.84}>
              <View style={subStyles.bridgeRowHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={subStyles.bridgeLabel}>{row.label}</Text>
                  <Text style={subStyles.bridgeDetail}>{row.detail}</Text>
                </View>
                <Text style={[subStyles.bridgeAmount, { color }]}>
                  {row.amount > 0 && row.tone !== "base" ? "+" : ""}
                  {formatCurrency(row.amount, currency)}
                </Text>
              </View>
              <View style={subStyles.bridgeTrack}>
                <View style={subStyles.bridgeAxis} />
                <View
                  style={[
                    subStyles.bridgeFill,
                    {
                      width: `${width}%` as any,
                      backgroundColor: color,
                      left: isNegative ? (`${50 - width}%` as any) : "50%",
                    },
                  ]}
                />
              </View>
              <Text style={subStyles.visualChartAction}>{row.action}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </Card>
  );
}

export function SavingsMomentumChart({
  data,
  currency,
  onOpenMonth,
}: {
  data: { label: string; income: number; expense: number }[];
  currency: string;
  onOpenMonth: (dateFrom: string, dateTo: string) => void;
}) {
  const netValues = data.map((item) => item.income - item.expense);
  const hasData = data.some((item) => item.income > 0 || item.expense > 0);
  if (!hasData) return null;

  let running = 0;
  const cumulative = netValues.map((value) => {
    running += value;
    return running;
  });
  const lastNet = netValues[netValues.length - 1] ?? 0;
  const bestNet = Math.max(...netValues);
  const worstNet = Math.min(...netValues);
  const maxAbs = Math.max(...netValues.map((value) => Math.abs(value)), 1);
  const trendText = cumulative[cumulative.length - 1] >= cumulative[0] ? "subiendo" : "bajando";
  const trendColor = cumulative[cumulative.length - 1] >= cumulative[0] ? COLORS.income : COLORS.expense;

  return (
    <Card>
      <Text style={subStyles.visualChartKicker}>Evolución</Text>
      <SectionTitle>Ahorro neto acumulado</SectionTitle>
      <Text style={subStyles.visualChartIntro}>
        Resume si tus meses recientes vienen dejando margen o consumiendo caja. Verde suma ahorro, rojo lo reduce.
      </Text>
      <View style={subStyles.savingsSparkWrap}>
        <SparkLine values={cumulative} width={260} height={86} positiveColor={COLORS.income} negativeColor={COLORS.expense} />
      </View>
      <View style={subStyles.savingsStatsRow}>
        <View style={subStyles.savingsStatCard}>
          <Text style={subStyles.savingsStatLabel}>Último mes</Text>
          <Text style={[subStyles.savingsStatValue, { color: lastNet >= 0 ? COLORS.income : COLORS.expense }]}>
            {lastNet >= 0 ? "+" : ""}
            {formatCurrency(lastNet, currency)}
          </Text>
        </View>
        <View style={subStyles.savingsStatCard}>
          <Text style={subStyles.savingsStatLabel}>Mejor</Text>
          <Text style={[subStyles.savingsStatValue, { color: bestNet >= 0 ? COLORS.income : COLORS.expense }]}>
            {bestNet >= 0 ? "+" : ""}
            {formatCurrency(bestNet, currency)}
          </Text>
        </View>
        <View style={subStyles.savingsStatCard}>
          <Text style={subStyles.savingsStatLabel}>Tendencia</Text>
          <Text style={[subStyles.savingsStatValue, { color: trendColor }]}>{trendText}</Text>
        </View>
      </View>
      <View style={subStyles.netBarsRow}>
        {data.map((item, index) => {
          const net = netValues[index] ?? 0;
          const height = Math.max(4, (Math.abs(net) / maxAbs) * 34);
          const isPositive = net >= 0;
          const monthDate = subMonths(new Date(), data.length - 1 - index);
          const dateFrom = format(startOfMonth(monthDate), "yyyy-MM-dd");
          const dateTo = format(index === data.length - 1 ? new Date() : endOfMonth(monthDate), "yyyy-MM-dd");
          return (
            <TouchableOpacity key={item.label} style={subStyles.netBarsCol} onPress={() => onOpenMonth(dateFrom, dateTo)} activeOpacity={0.84}>
              <View style={subStyles.netBarsBox}>
                <View style={subStyles.netBarsAxis} />
                <View
                  style={[
                    subStyles.netBar,
                    isPositive ? subStyles.netBarPositive : subStyles.netBarNegative,
                    { height, bottom: isPositive ? 34 : undefined, top: isPositive ? undefined : 34 },
                  ]}
                />
              </View>
              <Text style={subStyles.chartLabel}>{item.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
      <Text style={subStyles.visualChartFootnote}>Peor mes observado: {formatCurrency(worstNet, currency)}.</Text>
    </Card>
  );
}

export function CategoryDonutChart({
  catTotals,
  categories,
  currency,
  onOpenCategory,
}: {
  catTotals: Map<number | null, number>;
  categories: { id: number; name: string }[];
  currency: string;
  onOpenCategory: (categoryId: number | null) => void;
}) {
  const catMap = new Map(categories.map((category) => [category.id, category.name]));
  const allEntries = Array.from(catTotals.entries())
    .map(([id, total]) => ({ id, key: `${id ?? "none"}`, name: catMap.get(id ?? -1) ?? "Sin categoría", total }))
    .filter((entry) => entry.total > 0)
    .sort((a, b) => b.total - a.total);
  const total = allEntries.reduce((sum, entry) => sum + entry.total, 0);
  if (total <= 0) return null;

  const palette = [COLORS.expense, COLORS.gold, COLORS.primary, COLORS.secondary, EXTENDED_PALETTE.skySoft];
  const topEntries = allEntries.slice(0, 5);
  const rest = allEntries.slice(5).reduce((sum, entry) => sum + entry.total, 0);
  const visibleEntries = rest > 0 ? [...topEntries, { id: undefined, key: "rest", name: "Otros", total: rest }] : topEntries;
  const segments: RingSegment[] = visibleEntries.map((entry, index) => ({
    key: entry.key,
    value: entry.total,
    color: palette[index % palette.length] + "dd",
  }));
  const leader = visibleEntries[0];
  const leaderPct = Math.round((leader.total / total) * 100);

  return (
    <Card>
      <Text style={subStyles.visualChartKicker}>Distribución</Text>
      <SectionTitle>Mapa de gasto por categoría</SectionTitle>
      <Text style={subStyles.visualChartIntro}>
        Sirve para detectar si el mes está concentrado en una sola categoría o repartido en varios hábitos.
      </Text>
      <View style={subStyles.donutChartBody}>
        <TouchableOpacity style={subStyles.donutWrap} onPress={() => onOpenCategory(leader.id ?? null)} activeOpacity={0.84}>
          <RingChart segments={segments} size={132} thickness={22} />
          <View style={subStyles.donutCenter}>
            <Text style={subStyles.donutCenterValue}>{leaderPct}%</Text>
            <Text style={subStyles.donutCenterLabel} numberOfLines={1}>{leader.name}</Text>
          </View>
        </TouchableOpacity>
        <View style={subStyles.donutLegend}>
          {visibleEntries.map((entry, index) => (
            <TouchableOpacity
              key={entry.key}
              style={subStyles.donutLegendRow}
              onPress={entry.id === undefined ? undefined : () => onOpenCategory(entry.id ?? null)}
              activeOpacity={entry.id === undefined ? 1 : 0.84}
            >
              <View style={[subStyles.donutLegendDot, { backgroundColor: palette[index % palette.length] }]} />
              <View style={{ flex: 1 }}>
                <Text style={subStyles.donutLegendName} numberOfLines={1}>{entry.name}</Text>
                <Text style={subStyles.donutLegendPct}>{Math.round((entry.total / total) * 100)}% del gasto</Text>
              </View>
              <Text style={subStyles.donutLegendAmount}>{formatCurrency(entry.total, currency)}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    </Card>
  );
}

export type AnnualHistoryMonth = {
  label: string;
  income: number;
  expense: number;
  net: number;
  cumulativeNet: number;
  dateFrom: string;
  dateTo: string;
  isFuture: boolean;
};

export function AnnualHistoryPanel({
  years,
  selectedYear,
  onSelectYear,
  data,
  currency,
  onSelectMonth,
}: {
  years: number[];
  selectedYear: number;
  onSelectYear: (year: number) => void;
  data: AnnualHistoryMonth[];
  currency: string;
  onSelectMonth: (month: AnnualHistoryMonth) => void;
}) {
  const observed = data.filter((month) => !month.isFuture);
  const yearIncome = observed.reduce((sum, month) => sum + month.income, 0);
  const yearExpense = observed.reduce((sum, month) => sum + month.expense, 0);
  const yearNet = yearIncome - yearExpense;
  const savingsRate = yearIncome > 0 ? (yearNet / yearIncome) * 100 : null;
  const maxFlow = Math.max(...data.flatMap((month) => [month.income, month.expense]), 1);
  const maxNetAbs = Math.max(...observed.map((month) => Math.abs(month.net)), 1);
  const bestMonth = observed.reduce<AnnualHistoryMonth | null>((best, month) => (!best || month.net > best.net ? month : best), null);
  const worstMonth = observed.reduce<AnnualHistoryMonth | null>((worst, month) => (!worst || month.net < worst.net ? month : worst), null);

  if (observed.length === 0) return null;

  return (
    <Card>
      <View style={subStyles.annualHeaderRow}>
        <View style={{ flex: 1 }}>
          <Text style={subStyles.visualChartKicker}>Historial anual</Text>
          <SectionTitle>Ingresos, gastos y ahorro</SectionTitle>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={subStyles.annualYearList}>
          {years.map((year) => (
            <TouchableOpacity
              key={year}
              style={[subStyles.annualYearPill, selectedYear === year && subStyles.annualYearPillActive]}
              onPress={() => onSelectYear(year)}
              activeOpacity={0.84}
            >
              <Text style={[subStyles.annualYearText, selectedYear === year && subStyles.annualYearTextActive]}>{year}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>
      <Text style={subStyles.visualChartIntro}>
        Esta lectura compara cada mes del año y muestra si el neto acumulado está construyendo margen o consumiéndolo.
      </Text>

      <View style={subStyles.annualSummaryGrid}>
        <View style={subStyles.annualSummaryCard}>
          <Text style={subStyles.savingsStatLabel}>Ingresos</Text>
          <Text style={[subStyles.annualSummaryValue, { color: COLORS.income }]}>{formatCurrency(yearIncome, currency)}</Text>
        </View>
        <View style={subStyles.annualSummaryCard}>
          <Text style={subStyles.savingsStatLabel}>Gastos</Text>
          <Text style={[subStyles.annualSummaryValue, { color: COLORS.expense }]}>{formatCurrency(yearExpense, currency)}</Text>
        </View>
        <View style={subStyles.annualSummaryCard}>
          <Text style={subStyles.savingsStatLabel}>Neto</Text>
          <Text style={[subStyles.annualSummaryValue, { color: yearNet >= 0 ? COLORS.income : COLORS.expense }]}>
            {yearNet >= 0 ? "+" : ""}
            {formatCurrency(yearNet, currency)}
          </Text>
        </View>
        <View style={subStyles.annualSummaryCard}>
          <Text style={subStyles.savingsStatLabel}>Ahorro</Text>
          <Text style={[subStyles.annualSummaryValue, { color: savingsRate == null ? COLORS.storm : savingsRate >= 0 ? COLORS.gold : COLORS.expense }]}>
            {savingsRate == null ? "-" : `${savingsRate.toFixed(1)}%`}
          </Text>
        </View>
      </View>

      <View style={subStyles.annualFlowChart}>
        {data.map((month) => (
          <TouchableOpacity
            key={month.label}
            style={[subStyles.annualMonthCol, month.isFuture && subStyles.annualMonthColMuted]}
            onPress={month.isFuture ? undefined : () => onSelectMonth(month)}
            activeOpacity={month.isFuture ? 1 : 0.84}
          >
            <View style={subStyles.annualBarsBox}>
              <View
                style={[
                  subStyles.annualFlowBar,
                  { height: Math.max((month.income / maxFlow) * 70, month.income > 0 ? 3 : 0), backgroundColor: COLORS.income + "cc" },
                ]}
              />
              <View
                style={[
                  subStyles.annualFlowBar,
                  { height: Math.max((month.expense / maxFlow) * 70, month.expense > 0 ? 3 : 0), backgroundColor: COLORS.expense + "cc" },
                ]}
              />
            </View>
            <Text style={subStyles.chartLabel}>{month.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={subStyles.chartLegend}>
        <View style={subStyles.legendItem}><View style={[subStyles.legendDot, { backgroundColor: COLORS.income }]} /><Text style={subStyles.legendText}>Ingresos</Text></View>
        <View style={subStyles.legendItem}><View style={[subStyles.legendDot, { backgroundColor: COLORS.expense }]} /><Text style={subStyles.legendText}>Gastos</Text></View>
      </View>

      <View style={subStyles.annualNetList}>
        {observed.map((month) => {
          const width = Math.max(8, (Math.abs(month.net) / maxNetAbs) * 100);
          const positive = month.net >= 0;
          return (
            <TouchableOpacity key={month.label} style={subStyles.annualNetRow} onPress={() => onSelectMonth(month)} activeOpacity={0.84}>
              <Text style={subStyles.annualNetMonth}>{month.label}</Text>
              <View style={subStyles.annualNetTrack}>
                <View style={[subStyles.annualNetFill, { width: `${width}%` as any, backgroundColor: positive ? COLORS.income : COLORS.expense }]} />
              </View>
              <Text style={[subStyles.annualNetAmount, { color: positive ? COLORS.income : COLORS.expense }]}>
                {positive ? "+" : ""}
                {formatCurrency(month.net, currency)}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <Text style={subStyles.visualChartFootnote}>
        Mejor mes: {bestMonth ? `${bestMonth.label} (${formatCurrency(bestMonth.net, currency)})` : "-"} · Peor mes:{" "}
        {worstMonth ? `${worstMonth.label} (${formatCurrency(worstMonth.net, currency)})` : "-"}.
      </Text>
    </Card>
  );
}
