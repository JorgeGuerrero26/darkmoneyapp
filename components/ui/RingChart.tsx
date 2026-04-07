import { useMemo } from "react";
import { View } from "react-native";
import Svg, { Path } from "react-native-svg";

export type RingSegment = {
  key: string;
  value: number;
  color: string;
};

const SEGMENT_GAP = 0.025; // radians

type Props = {
  segments: RingSegment[];
  size?: number;
  thickness?: number;
};

export function RingChart({ segments, size = 120, thickness = 20 }: Props) {
  const cx = size / 2;
  const cy = size / 2;
  const outerR = size / 2 - 2;
  const innerR = outerR - thickness;

  const arcs = useMemo(() => {
    const positive = segments.filter((s) => s.value > 0);
    const total = positive.reduce((acc, s) => acc + s.value, 0);
    if (total <= 0 || positive.length === 0) return [];

    const gapTotal = positive.length > 1 ? SEGMENT_GAP * positive.length : 0;
    const availableSweep = 2 * Math.PI - gapTotal;
    let angle = -Math.PI / 2;

    return positive.map((seg) => {
      const sweep = (seg.value / total) * availableSweep;
      const a1 = angle;
      const a2 = angle + sweep;
      angle = a2 + SEGMENT_GAP;

      const cos1 = Math.cos(a1), sin1 = Math.sin(a1);
      const cos2 = Math.cos(a2), sin2 = Math.sin(a2);

      const ox1 = cx + outerR * cos1, oy1 = cy + outerR * sin1;
      const ox2 = cx + outerR * cos2, oy2 = cy + outerR * sin2;
      const ix2 = cx + innerR * cos2, iy2 = cy + innerR * sin2;
      const ix1 = cx + innerR * cos1, iy1 = cy + innerR * sin1;

      const large = sweep > Math.PI ? 1 : 0;

      const d = [
        `M${ox1.toFixed(2)} ${oy1.toFixed(2)}`,
        `A${outerR} ${outerR} 0 ${large} 1 ${ox2.toFixed(2)} ${oy2.toFixed(2)}`,
        `L${ix2.toFixed(2)} ${iy2.toFixed(2)}`,
        `A${innerR} ${innerR} 0 ${large} 0 ${ix1.toFixed(2)} ${iy1.toFixed(2)}`,
        "Z",
      ].join(" ");

      return { d, color: seg.color, key: seg.key };
    });
  }, [segments, cx, cy, outerR, innerR]);

  if (arcs.length === 0) return null;

  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size}>
        {arcs.map((arc) => (
          <Path key={arc.key} d={arc.d} fill={arc.color} />
        ))}
      </Svg>
    </View>
  );
}
