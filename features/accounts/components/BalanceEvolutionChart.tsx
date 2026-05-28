import { useMemo, useState } from "react";
import { LayoutChangeEvent, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import Svg, { Defs, LinearGradient, Path, Stop } from "react-native-svg";

import { formatCurrency } from "../../../components/ui/AmountDisplay";
import { COLORS, FONT_FAMILY, FONT_SIZE, RADIUS, SPACING, SURFACE } from "../../../constants/theme";
import {
  computeBalanceEvolution,
  downsample,
  summarizeTrend,
  type BalancePoint,
} from "../lib/balance-evolution";
import type { MovementRecord } from "../../../types/domain";

type Range = 30 | 90 | 180;

type Props = {
  accountId: number;
  currentBalance: number;
  currencyCode: string;
  movements: readonly MovementRecord[];
};

const RANGE_OPTIONS: { value: Range; label: string }[] = [
  { value: 30, label: "30d" },
  { value: 90, label: "90d" },
  { value: 180, label: "180d" },
];

/**
 * Large balance-evolution chart shown inside the account detail screen.
 * Combines a smoothed area path with a range toggle (30 / 90 / 180 days) and
 * a textual trend summary. Pure presentational — no queries.
 */
export function BalanceEvolutionChart({
  accountId,
  currentBalance,
  currencyCode,
  movements,
}: Props) {
  const [range, setRange] = useState<Range>(90);
  const [width, setWidth] = useState(0);
  const height = 140;

  const points = useMemo(
    () =>
      computeBalanceEvolution({
        accountId,
        currentBalance,
        movements,
        windowDays: range,
      }),
    [accountId, currentBalance, movements, range],
  );

  const trend = summarizeTrend(points);

  const { linePath, areaPath, minLabel, maxLabel } = useMemo(() => {
    if (width === 0 || points.length < 2) {
      return { linePath: null, areaPath: null, minLabel: "", maxLabel: "" };
    }
    const sampled = downsample(points, 60);
    const values = sampled.map((p) => p.value);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const span = max - min || 1;

    const padX = 4;
    const padY = 8;
    const innerW = Math.max(0, width - padX * 2);
    const innerH = Math.max(0, height - padY * 2);
    const stepX = sampled.length > 1 ? innerW / (sampled.length - 1) : 0;

    const coords = sampled.map((p, i) => ({
      x: padX + i * stepX,
      y: padY + innerH - ((p.value - min) / span) * innerH,
    }));

    const line = coords
      .map((c, i) => (i === 0 ? `M${c.x.toFixed(2)},${c.y.toFixed(2)}` : `L${c.x.toFixed(2)},${c.y.toFixed(2)}`))
      .join(" ");
    const area = `${line} L${coords[coords.length - 1].x.toFixed(2)},${(padY + innerH).toFixed(2)} L${coords[0].x.toFixed(2)},${(padY + innerH).toFixed(2)} Z`;

    return {
      linePath: line,
      areaPath: area,
      minLabel: formatCurrency(min, currencyCode),
      maxLabel: formatCurrency(max, currencyCode),
    };
  }, [points, width, height, currencyCode]);

  const stroke =
    trend.direction === "up" ? COLORS.pine
    : trend.direction === "down" ? COLORS.dangerSoft
    : COLORS.storm;
  const gradientId = `balanceArea-${accountId}-${range}`;

  function onLayout(e: LayoutChangeEvent) {
    setWidth(e.nativeEvent.layout.width);
  }

  return (
    <View style={styles.card}>
      {/* Header: title + range pills */}
      <View style={styles.header}>
        <Text style={styles.title}>Evolución del saldo</Text>
        <View style={styles.pillRow}>
          {RANGE_OPTIONS.map((r) => {
            const active = range === r.value;
            return (
              <TouchableOpacity
                key={r.value}
                style={[styles.pill, active && styles.pillActive]}
                onPress={() => setRange(r.value)}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                accessibilityLabel={`Rango ${r.label}`}
              >
                <Text style={[styles.pillText, active && styles.pillTextActive]}>{r.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* Trend summary */}
      <View style={styles.summaryRow}>
        <Text style={styles.summaryDelta}>
          {trend.delta >= 0 ? "+" : ""}
          {formatCurrency(trend.delta, currencyCode)}
        </Text>
        {trend.pct !== null ? (
          <Text style={[styles.summaryPct, trend.direction === "up" && styles.summaryPctUp, trend.direction === "down" && styles.summaryPctDown]}>
            {trend.pct >= 0 ? "+" : ""}
            {trend.pct.toFixed(1)}%
          </Text>
        ) : null}
        <Text style={styles.summaryRange}>· últimos {range} días</Text>
      </View>

      {/* Chart */}
      <View style={styles.chartWrap} onLayout={onLayout}>
        {linePath && areaPath ? (
          <Svg width={width} height={height}>
            <Defs>
              <LinearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={stroke} stopOpacity={0.25} />
                <Stop offset="1" stopColor={stroke} stopOpacity={0} />
              </LinearGradient>
            </Defs>
            <Path d={areaPath} fill={`url(#${gradientId})`} />
            <Path
              d={linePath}
              stroke={stroke}
              strokeWidth={2}
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </Svg>
        ) : null}
      </View>

      {/* Min / Max captions */}
      <View style={styles.minMaxRow}>
        <Text style={styles.minMaxLabel}>Mín: {minLabel}</Text>
        <Text style={styles.minMaxLabel}>Máx: {maxLabel}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: SURFACE.card,
    borderWidth: 1,
    borderColor: SURFACE.cardBorder,
    borderRadius: RADIUS.xl,
    padding: SPACING.lg,
    marginHorizontal: SPACING.lg,
    marginTop: SPACING.md,
    gap: SPACING.sm,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: SPACING.sm,
  },
  title: {
    fontFamily: FONT_FAMILY.bodySemibold,
    fontSize: FONT_SIZE.sm,
    color: COLORS.ink,
  },
  pillRow: { flexDirection: "row", gap: 4 },
  pill: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: 4,
    borderRadius: RADIUS.full,
    backgroundColor: SURFACE.separator,
    borderWidth: 1,
    borderColor: SURFACE.cardBorder,
  },
  pillActive: { backgroundColor: COLORS.pine + "22", borderColor: COLORS.pine + "55" },
  pillText: {
    fontFamily: FONT_FAMILY.bodyMedium,
    fontSize: FONT_SIZE.xs,
    color: COLORS.storm,
  },
  pillTextActive: { color: COLORS.pine },
  summaryRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: SPACING.xs,
    flexWrap: "wrap",
  },
  summaryDelta: {
    fontFamily: FONT_FAMILY.heading,
    fontSize: FONT_SIZE.lg,
    color: COLORS.ink,
  },
  summaryPct: {
    fontFamily: FONT_FAMILY.bodyMedium,
    fontSize: FONT_SIZE.sm,
    color: COLORS.storm,
  },
  summaryPctUp: { color: COLORS.pine },
  summaryPctDown: { color: COLORS.dangerSoft },
  summaryRange: {
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.xs,
    color: COLORS.storm,
  },
  chartWrap: {
    height: 140,
    width: "100%",
  },
  minMaxRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  minMaxLabel: {
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.xs,
    color: COLORS.storm,
  },
});
