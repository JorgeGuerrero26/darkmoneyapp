import { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import Svg, { Circle, G } from "react-native-svg";

import { formatCurrency } from "../../../components/ui/AmountDisplay";
import { COLORS, FONT_FAMILY, FONT_SIZE, RADIUS, SPACING, SURFACE } from "../../../constants/theme";
import type { Composition } from "../lib/composition";

type Props = {
  composition: Composition;
  currencyCode: string;
  size?: number;
};

/**
 * Donut + legend showing the breakdown of assets by account type, with
 * separate debt and net-worth callouts.
 *
 * Drawn with `<Circle>` strokeDasharray segments — no external chart library.
 */
export function NetWorthCompositionChart({ composition, currencyCode, size = 140 }: Props) {
  const { assets, debts, totalAssets, netWorth } = composition;
  const stroke = 18;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;

  // Build cumulative percentages so each <Circle> covers one slice via
  // strokeDashoffset. Zero-length / NaN slices are skipped.
  const segments = useMemo(() => {
    if (totalAssets <= 0) return [];
    let cumulative = 0;
    return assets
      .filter((slice) => slice.value > 0)
      .map((slice) => {
        const fraction = slice.value / totalAssets;
        const dashArray = `${fraction * circumference} ${circumference}`;
        const dashOffset = -cumulative * circumference;
        cumulative += fraction;
        return { ...slice, dashArray, dashOffset };
      });
  }, [assets, totalAssets, circumference]);

  return (
    <View style={styles.container}>
      <View style={styles.chartRow}>
        {/* Donut */}
        <View style={[styles.donutWrap, { width: size, height: size }]}>
          <Svg width={size} height={size}>
            {/* Background ring (shown when no assets to avoid empty space) */}
            <Circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              stroke={SURFACE.separator}
              strokeWidth={stroke}
              fill="none"
            />
            <G rotation={-90} origin={`${size / 2}, ${size / 2}`}>
              {segments.map((seg) => (
                <Circle
                  key={seg.type}
                  cx={size / 2}
                  cy={size / 2}
                  r={radius}
                  stroke={seg.color}
                  strokeWidth={stroke}
                  fill="none"
                  strokeDasharray={seg.dashArray}
                  strokeDashoffset={seg.dashOffset}
                  strokeLinecap="butt"
                />
              ))}
            </G>
          </Svg>
          {/* Center labels */}
          <View style={styles.centerLabel}>
            <Text style={styles.centerCaption}>Patrimonio</Text>
            <Text style={styles.centerAmount}>{formatCurrency(netWorth, currencyCode)}</Text>
          </View>
        </View>

        {/* Legend */}
        <View style={styles.legend}>
          {assets.length === 0 ? (
            <Text style={styles.emptyText}>
              Sin activos en patrimonio.
            </Text>
          ) : (
            assets.map((slice) => (
              <View key={slice.type} style={styles.legendRow}>
                <View style={[styles.legendDot, { backgroundColor: slice.color }]} />
                <View style={styles.legendInfo}>
                  <Text style={styles.legendLabel}>{slice.label}</Text>
                  <Text style={styles.legendValue}>
                    {formatCurrency(slice.value, currencyCode)} · {slice.pct.toFixed(0)}%
                  </Text>
                </View>
              </View>
            ))
          )}
          {debts > 0 ? (
            <View style={[styles.legendRow, styles.debtRow]}>
              <View style={[styles.legendDot, { backgroundColor: COLORS.dangerSoft }]} />
              <View style={styles.legendInfo}>
                <Text style={styles.legendLabel}>Deudas</Text>
                <Text style={[styles.legendValue, styles.debtValue]}>
                  -{formatCurrency(debts, currencyCode)}
                </Text>
              </View>
            </View>
          ) : null}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: SURFACE.card,
    borderWidth: 1,
    borderColor: SURFACE.cardBorder,
    borderRadius: RADIUS.xl,
    padding: SPACING.lg,
    marginHorizontal: SPACING.lg,
    marginBottom: SPACING.md,
  },
  chartRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.lg,
  },
  donutWrap: {
    alignItems: "center",
    justifyContent: "center",
  },
  centerLabel: {
    position: "absolute",
    alignItems: "center",
    justifyContent: "center",
  },
  centerCaption: {
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.xs,
    color: COLORS.storm,
  },
  centerAmount: {
    fontFamily: FONT_FAMILY.heading,
    fontSize: FONT_SIZE.md,
    color: COLORS.ink,
    textAlign: "center",
  },
  legend: {
    flex: 1,
    gap: SPACING.xs,
  },
  legendRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
  },
  debtRow: {
    marginTop: SPACING.xs,
    paddingTop: SPACING.xs,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: SURFACE.cardBorder,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  legendInfo: { flex: 1 },
  legendLabel: {
    fontFamily: FONT_FAMILY.bodyMedium,
    fontSize: FONT_SIZE.xs,
    color: COLORS.ink,
  },
  legendValue: {
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.xs,
    color: COLORS.storm,
  },
  debtValue: { color: COLORS.dangerSoft },
  emptyText: {
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.xs,
    color: COLORS.storm,
  },
});
