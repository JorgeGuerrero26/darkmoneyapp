import { useEffect, useRef, useState } from "react";
import { Animated, Pressable, StyleSheet, Text, View } from "react-native";
import { COLORS, FONT_FAMILY, FONT_SIZE, GLASS, RADIUS, SPACING } from "../../constants/theme";

type Props = {
  visible: boolean;
  message: string;
  onUndo: () => void;
  /** Duration of the auto-dismiss countdown in ms — must match the caller's delete timer */
  durationMs?: number;
  /** Distance from the screen bottom in px */
  bottomOffset?: number;
};

/**
 * Floating undo snackbar.
 * - Springs up from below with a subtle bounce when visible becomes true.
 * - Progress bar depletes over durationMs so the user knows when it auto-dismisses.
 * - Slides back down + fades when visible becomes false.
 * - Always mounted so the exit animation can play.
 */
export function UndoBanner({
  visible,
  message,
  onUndo,
  durationMs = 5000,
  bottomOffset = 80,
}: Props) {
  const translateY = useRef(new Animated.Value(100)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const progress = useRef(new Animated.Value(1)).current;
  const progressAnimRef = useRef<Animated.CompositeAnimation | null>(null);
  const [bannerWidth, setBannerWidth] = useState(0);

  useEffect(() => {
    if (visible) {
      progress.setValue(1);
      progressAnimRef.current?.stop();
      progressAnimRef.current = Animated.timing(progress, {
        toValue: 0,
        duration: durationMs,
        useNativeDriver: false,
      });
      progressAnimRef.current.start();

      Animated.parallel([
        Animated.spring(translateY, {
          toValue: 0,
          useNativeDriver: true,
          tension: 70,
          friction: 9,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 160,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      progressAnimRef.current?.stop();
      Animated.parallel([
        Animated.timing(translateY, {
          toValue: 100,
          duration: 240,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0,
          duration: 180,
          useNativeDriver: true,
        }),
      ]).start();
    }
  // durationMs intentionally excluded — only reset when visibility toggles
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const progressWidth =
    bannerWidth > 0
      ? progress.interpolate({ inputRange: [0, 1], outputRange: [0, bannerWidth] })
      : 0;

  return (
    <Animated.View
      pointerEvents={visible ? "auto" : "none"}
      style={[styles.banner, { bottom: bottomOffset, opacity, transform: [{ translateY }] }]}
      onLayout={(e) => {
        const w = e.nativeEvent.layout.width;
        if (w > 0) setBannerWidth(w);
      }}
    >
      {/* Glass tint */}
      <View style={styles.tint} />

      {/* Main row */}
      <View style={styles.row}>
        <Text style={styles.message} numberOfLines={1}>{message}</Text>
        <Pressable
          onPress={onUndo}
          style={({ pressed }) => [styles.undoBtn, pressed && styles.undoBtnPressed]}
          hitSlop={8}
        >
          <Text style={styles.undoBtnText}>Deshacer</Text>
        </Pressable>
      </View>

      {/* Progress bar */}
      <View style={styles.progressTrack}>
        <Animated.View style={[styles.progressFill, { width: progressWidth }]} />
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  banner: {
    position: "absolute",
    left: SPACING.lg,
    right: SPACING.lg,
    backgroundColor: "rgba(12,17,26,0.97)",
    borderRadius: RADIUS.lg,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderTopColor: "rgba(255,255,255,0.18)",
    borderLeftColor: "rgba(255,255,255,0.10)",
    borderRightColor: "rgba(255,255,255,0.08)",
    borderBottomColor: "rgba(255,255,255,0.04)",
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 16,
    zIndex: 50,
  },
  tint: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: GLASS.card,
    opacity: 0.18,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    gap: SPACING.md,
  },
  message: {
    fontFamily: FONT_FAMILY.bodyMedium,
    fontSize: FONT_SIZE.sm,
    color: COLORS.ink,
    flex: 1,
  },
  undoBtn: {
    paddingHorizontal: SPACING.md,
    paddingVertical: 6,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.primary + "20",
    borderWidth: 1,
    borderColor: COLORS.primary + "55",
  },
  undoBtnPressed: {
    backgroundColor: COLORS.primary + "40",
  },
  undoBtnText: {
    fontFamily: FONT_FAMILY.bodySemibold,
    fontSize: FONT_SIZE.sm,
    color: COLORS.pine,
  },
  progressTrack: {
    height: 2,
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  progressFill: {
    height: "100%",
    backgroundColor: COLORS.primary,
    opacity: 0.85,
  },
});
