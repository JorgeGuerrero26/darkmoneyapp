import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { COLORS, FONT_FAMILY, FONT_SIZE, GLASS, SPACING } from "../../constants/theme";

type Props = {
  title: string;
  subtitle?: string;
  rightAction?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  withSafeArea?: boolean;
};

export function ScreenHeader({ title, subtitle, rightAction, style, withSafeArea = false }: Props) {
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[
        styles.container,
        withSafeArea ? { paddingTop: insets.top + SPACING.md } : null,
        style,
      ]}
    >
      <View style={styles.left}>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={styles.subtitle} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {rightAction ? <View style={styles.right}>{rightAction}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    backgroundColor: "transparent",
    borderBottomWidth: 0.5,
    borderBottomColor: GLASS.sheetBorder,
  },
  left: {
    flex: 1,
    gap: 2,
  },
  right: {
    marginLeft: SPACING.md,
  },
  title: {
    fontFamily: FONT_FAMILY.heading,
    fontSize: FONT_SIZE.xl,
    color: COLORS.ink,
  },
  subtitle: {
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.sm,
    color: COLORS.storm,
  },
});
