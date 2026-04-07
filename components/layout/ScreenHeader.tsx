import { StyleSheet, Text, TouchableOpacity, View, type StyleProp, type ViewStyle } from "react-native";
import { ChevronLeft } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { COLORS, FONT_FAMILY, FONT_SIZE, GLASS, SPACING } from "../../constants/theme";
import { PlanStatusBadge } from "../ui/PlanStatusBadge";
import { useHaptics } from "../../hooks/useHaptics";

type Props = {
  title: string;
  subtitle?: string;
  rightAction?: React.ReactNode;
  onBack?: () => void;
  style?: StyleProp<ViewStyle>;
  withSafeArea?: boolean;
  showPlanBadge?: boolean;
};

export function ScreenHeader({
  title,
  subtitle,
  rightAction,
  onBack,
  style,
  withSafeArea = false,
  showPlanBadge = false,
}: Props) {
  const insets = useSafeAreaInsets();
  const haptics = useHaptics();

  return (
    <View
      style={[
        styles.container,
        withSafeArea ? { paddingTop: insets.top + SPACING.md } : null,
        style,
      ]}
    >
      {onBack ? (
        <TouchableOpacity
          onPress={() => { haptics.light(); onBack(); }}
          style={styles.backBtn}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <ChevronLeft size={22} color={COLORS.ink} strokeWidth={2} />
        </TouchableOpacity>
      ) : null}
      <View style={[styles.left, onBack ? styles.leftWithBack : null]}>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        {(subtitle || showPlanBadge) ? (
          <View style={styles.metaRow}>
            {subtitle ? (
              <Text style={styles.subtitle} numberOfLines={1}>
                {subtitle}
              </Text>
            ) : null}
            {showPlanBadge ? <PlanStatusBadge /> : null}
          </View>
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
  backBtn: {
    marginRight: SPACING.sm,
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: GLASS.card,
    borderWidth: 1,
    borderColor: GLASS.cardBorder,
    alignItems: "center",
    justifyContent: "center",
  },
  left: {
    flex: 1,
    gap: 2,
  },
  leftWithBack: {
    // no extra style needed, flex:1 handles it
  },
  right: {
    marginLeft: SPACING.md,
  },
  title: {
    fontFamily: FONT_FAMILY.heading,
    fontSize: FONT_SIZE.xl,
    color: COLORS.ink,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
    flexWrap: "wrap",
    marginTop: 2,
  },
  subtitle: {
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.sm,
    color: COLORS.storm,
    flexShrink: 1,
  },
});
