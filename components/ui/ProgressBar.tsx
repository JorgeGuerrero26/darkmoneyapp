import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { COLORS, GLASS, RADIUS } from "../../constants/theme";

type Props = {
  percent: number; // 0–100
  alertPercent?: number;
  height?: number;
  style?: StyleProp<ViewStyle>;
};

export function ProgressBar({ percent, alertPercent = 80, height = 6, style }: Props) {
  const clamped = Math.min(Math.max(percent, 0), 100);

  let fillColor = COLORS.pine;
  if (clamped >= 100) fillColor = COLORS.rosewood;
  else if (clamped >= alertPercent) fillColor = COLORS.gold;

  return (
    <View style={[styles.track, { height }, style]}>
      <View
        style={[styles.fill, { width: `${clamped}%`, backgroundColor: fillColor, height }]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    width: "100%",
    backgroundColor: GLASS.card,
    borderRadius: RADIUS.full,
    overflow: "hidden",
    borderWidth: 0.5,
    borderColor: GLASS.cardBorder,
  },
  fill: {
    borderRadius: RADIUS.full,
  },
});
