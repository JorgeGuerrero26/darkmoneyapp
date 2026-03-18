import { StyleSheet, View } from "react-native";
import { COLORS, RADIUS } from "../../constants/theme";

import type { StyleProp, ViewStyle } from "react-native";

type Props = {
  percent: number; // 0–100
  alertPercent?: number;
  height?: number;
  style?: StyleProp<ViewStyle>;
};

export function ProgressBar({ percent, alertPercent = 80, height = 8, style }: Props) {
  const clamped = Math.min(Math.max(percent, 0), 100);

  let fillColor = COLORS.budgetGood;
  if (clamped >= 100) fillColor = COLORS.budgetOver;
  else if (clamped >= alertPercent) fillColor = COLORS.budgetWarn;

  return (
    <View style={[styles.track, { height }, style]}>
      <View
        style={[
          styles.fill,
          {
            width: `${clamped}%`,
            backgroundColor: fillColor,
            height,
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    width: "100%",
    backgroundColor: COLORS.border,
    borderRadius: RADIUS.full,
    overflow: "hidden",
  },
  fill: {
    borderRadius: RADIUS.full,
  },
});
