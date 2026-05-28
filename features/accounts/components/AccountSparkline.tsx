import { useMemo } from "react";
import { View } from "react-native";
import Svg, { Path } from "react-native-svg";

import { COLORS } from "../../../constants/theme";
import { downsample, summarizeTrend, type BalancePoint } from "../lib/balance-evolution";

type Props = {
  points: readonly BalancePoint[];
  width?: number;
  height?: number;
  /** Cap the number of segments for cheap rendering. Default 20. */
  maxSamples?: number;
};

/**
 * Tiny inline balance trend, sized to fit inside `ResourceCard.meta` /
 * `trailing`. Renders a single SVG path with no axes, no labels, no
 * interaction. Color follows the trend direction.
 */
export function AccountSparkline({ points, width = 72, height = 24, maxSamples = 20 }: Props) {
  const path = useMemo(() => {
    if (points.length < 2) return null;
    const sampled = downsample(points, maxSamples);
    const values = sampled.map((p) => p.value);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1; // avoid div/0 for flat lines

    // Map each sample to (x,y) in the SVG viewbox.
    const stepX = sampled.length > 1 ? width / (sampled.length - 1) : 0;
    const padY = 2;
    const innerH = height - padY * 2;

    const coords = sampled.map((p, i) => {
      const x = i * stepX;
      const y = padY + innerH - ((p.value - min) / range) * innerH;
      return { x, y };
    });

    return coords
      .map((c, i) => (i === 0 ? `M${c.x.toFixed(2)},${c.y.toFixed(2)}` : `L${c.x.toFixed(2)},${c.y.toFixed(2)}`))
      .join(" ");
  }, [points, width, height, maxSamples]);

  const trend = summarizeTrend(points);
  const stroke =
    trend.direction === "up" ? COLORS.pine
    : trend.direction === "down" ? COLORS.dangerSoft
    : COLORS.storm;

  if (!path) return <View style={{ width, height }} />;

  return (
    <Svg width={width} height={height}>
      <Path d={path} stroke={stroke} strokeWidth={1.5} fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}
