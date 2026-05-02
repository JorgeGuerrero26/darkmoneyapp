import { useEffect, useRef, useState } from "react";
import { Animated, Easing, View } from "react-native";
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

function buildArcs(
  segments: RingSegment[],
  cx: number,
  cy: number,
  outerR: number,
  innerR: number,
  drawProgress: number,
) {
  const positive = segments.filter((s) => s.value > 0);
  const total = positive.reduce((acc, s) => acc + s.value, 0);
  if (total <= 0 || positive.length === 0) return [];

  const gapTotal = positive.length > 1 ? SEGMENT_GAP * positive.length : 0;
  const availableSweep = 2 * Math.PI - gapTotal;
  const drawAngle = drawProgress * availableSweep;
  let angle = -Math.PI / 2;
  let drawn = 0;
  const result: { d: string; color: string; key: string }[] = [];

  for (const seg of positive) {
    if (drawn >= drawAngle) break;

    const sweep = (seg.value / total) * availableSweep;
    const remaining = drawAngle - drawn;
    const actualSweep = Math.min(sweep, remaining);
    const a2 = angle + actualSweep;

    if (actualSweep < 0.001) break;

    const cos1 = Math.cos(angle), sin1 = Math.sin(angle);
    const cos2 = Math.cos(a2), sin2 = Math.sin(a2);

    const ox1 = cx + outerR * cos1, oy1 = cy + outerR * sin1;
    const ox2 = cx + outerR * cos2, oy2 = cy + outerR * sin2;
    const ix2 = cx + innerR * cos2, iy2 = cy + innerR * sin2;
    const ix1 = cx + innerR * cos1, iy1 = cy + innerR * sin1;

    const large = actualSweep > Math.PI ? 1 : 0;

    const d = [
      `M${ox1.toFixed(2)} ${oy1.toFixed(2)}`,
      `A${outerR} ${outerR} 0 ${large} 1 ${ox2.toFixed(2)} ${oy2.toFixed(2)}`,
      `L${ix2.toFixed(2)} ${iy2.toFixed(2)}`,
      `A${innerR} ${innerR} 0 ${large} 0 ${ix1.toFixed(2)} ${iy1.toFixed(2)}`,
      "Z",
    ].join(" ");

    result.push({ d, color: seg.color, key: seg.key });
    drawn += actualSweep;
    angle = a2 + (actualSweep === sweep ? SEGMENT_GAP : 0);
  }

  return result;
}

export function RingChart({ segments, size = 120, thickness = 20 }: Props) {
  const cx = size / 2;
  const cy = size / 2;
  const outerR = size / 2 - 2;
  const innerR = outerR - thickness;

  const [drawProgress, setDrawProgress] = useState(0);
  const animRef = useRef(new Animated.Value(0));
  const segKey = segments.map((s) => `${s.key}${s.value.toFixed(2)}`).join("|");

  useEffect(() => {
    animRef.current.setValue(0);
    setDrawProgress(0);
    const id = animRef.current.addListener(({ value }) => setDrawProgress(value));
    Animated.timing(animRef.current, {
      toValue: 1,
      duration: 950,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
    return () => {
      animRef.current.removeListener(id);
      animRef.current.stopAnimation();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [segKey]);

  const arcs = buildArcs(segments, cx, cy, outerR, innerR, drawProgress);

  if (segments.filter((s) => s.value > 0).length === 0) return null;

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
