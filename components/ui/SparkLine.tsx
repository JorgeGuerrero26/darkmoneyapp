import { useMemo } from "react";
import Svg, { Polyline, Line as SvgLine, Circle as SvgCircle } from "react-native-svg";

type Props = {
  values: number[];
  width: number;
  height: number;
  positiveColor?: string;
  negativeColor?: string;
};

export function SparkLine({
  values,
  width,
  height,
  positiveColor = "#10B981",
  negativeColor = "#EF4444",
}: Props) {
  const result = useMemo(() => {
    if (values.length === 0) return null;

    const pad = 6;
    const w = width - pad * 2;
    const h = height - pad * 2;

    const minV = Math.min(...values, 0);
    const maxV = Math.max(...values, 0);
    const range = maxV - minV || 1;

    const pts = values.map((v, i) => ({
      x: pad + (values.length > 1 ? (i / (values.length - 1)) * w : w / 2),
      y: pad + h - ((v - minV) / range) * h,
      v,
    }));

    const pointsStr = pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
    const baseY = pad + h - ((0 - minV) / range) * h;
    const last = pts[pts.length - 1];
    const lineColor = last.v >= 0 ? positiveColor : negativeColor;
    const showBaseline = values.some((v) => v < 0) && values.some((v) => v > 0);

    return { pointsStr, baseY, last, lineColor, showBaseline };
  }, [values, width, height, positiveColor, negativeColor]);

  if (!result) return null;

  return (
    <Svg width={width} height={height}>
      {result.showBaseline && (
        <SvgLine
          x1={6}
          y1={result.baseY}
          x2={width - 6}
          y2={result.baseY}
          stroke="rgba(255,255,255,0.18)"
          strokeWidth={1}
          strokeDasharray="3,2"
        />
      )}
      <Polyline
        points={result.pointsStr}
        fill="none"
        stroke={result.lineColor}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <SvgCircle cx={result.last.x} cy={result.last.y} r={3.5} fill={result.lineColor} />
    </Svg>
  );
}
