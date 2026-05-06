import { StyleSheet, Text, View } from "react-native";

import { COLORS, FONT_FAMILY, FONT_SIZE, SPACING } from "../../constants/theme";

type Props = {
  children: string | null | undefined;
};

export function ResourceContextNote({ children }: Props) {
  if (!children) return null;

  return (
    <View style={styles.root}>
      <Text style={styles.text}>{children}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.xs,
  },
  text: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.textDisabled,
    fontFamily: FONT_FAMILY.body,
    lineHeight: 18,
  },
});
