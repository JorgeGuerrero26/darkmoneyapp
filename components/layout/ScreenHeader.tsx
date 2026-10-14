import { StyleSheet, Text, TouchableOpacity, View, type StyleProp, type ViewStyle } from "react-native";
import { ChevronLeft } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { COLORS, FONT_FAMILY, FONT_SIZE, RADIUS, SPACING, SURFACE } from "../../constants/theme";
import { PlanStatusBadge } from "../ui/PlanStatusBadge";
import { useHaptics } from "../../hooks/useHaptics";
import { useSyncLine } from "../../hooks/useSyncLine";
import { SyncStatusLine } from "../offline/SyncStatusLine";

type Props = {
  title: string;
  subtitle?: string;
  rightAction?: React.ReactNode;
  onBack?: () => void;
  style?: StyleProp<ViewStyle>;
  withSafeArea?: boolean;
  showPlanBadge?: boolean;
  compactPlanBadge?: boolean;
  fullWidthMeta?: boolean;
  /** No mostrar la línea de sincronización (modo sin conexión) en este encabezado. */
  hideSyncStatus?: boolean;
};

export function ScreenHeader({
  title,
  subtitle,
  rightAction,
  onBack,
  style,
  withSafeArea = false,
  showPlanBadge = false,
  compactPlanBadge = false,
  fullWidthMeta = false,
  hideSyncStatus = false,
}: Props) {
  const insets = useSafeAreaInsets();
  const haptics = useHaptics();
  // Modo sin conexión (Revisión 54): cuando hay algo que decir, reemplaza a "Actualizado hace…"; si no, el encabezado es el de siempre.
  const syncLine = useSyncLine();
  const line = hideSyncStatus ? null : syncLine;

  return (
    <View
      style={[
        styles.container,
        fullWidthMeta && styles.containerStack,
        withSafeArea ? { paddingTop: insets.top + SPACING.md } : null,
        style,
      ]}
    >
      <View style={styles.mainRow}>
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
          {!fullWidthMeta && (subtitle || showPlanBadge || line) ? (
            <View style={styles.metaRow}>
              {line ? <SyncStatusLine line={line} /> : subtitle ? (
                <Text style={styles.subtitle} numberOfLines={1}>
                  {subtitle}
                </Text>
              ) : null}
              {showPlanBadge ? <PlanStatusBadge compact={compactPlanBadge} /> : null}
            </View>
          ) : null}
        </View>
        {rightAction ? <View style={styles.right}>{rightAction}</View> : null}
      </View>
      {fullWidthMeta && (subtitle || showPlanBadge || line) ? (
        <View style={styles.metaRow}>
          {line ? <SyncStatusLine line={line} /> : subtitle ? <Text style={styles.subtitle} numberOfLines={1}>{subtitle}</Text> : null}
          {showPlanBadge ? <PlanStatusBadge compact={compactPlanBadge} /> : null}
        </View>
      ) : null}
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
    borderBottomColor: SURFACE.sheetBorder,
  },
  containerStack: { flexDirection: "column", alignItems: "stretch" },
  mainRow: { width: "100%", flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  backBtn: {
    marginRight: SPACING.sm,
    width: 32,
    height: 32,
    borderRadius: RADIUS.lg,
    backgroundColor: SURFACE.card,
    borderWidth: 1,
    borderColor: SURFACE.cardBorder,
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
