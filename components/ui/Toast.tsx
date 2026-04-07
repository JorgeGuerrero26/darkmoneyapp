import { useCallback, useEffect, useMemo, useRef } from "react";
import {
  Animated,
  Easing,
  Image,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useUiStore } from "../../store/ui-store";
import { COLORS, FONT_FAMILY, FONT_SIZE, SPACING } from "../../constants/theme";
import { TOAST_DURATION_MS } from "../../constants/config";

const TOAST_LOGO = require("../../assets/images/logo-darkmoney.png");
const BUBBLE_SIZE = 56;
const TOAST_PROGRESS_DURATION_MS = TOAST_DURATION_MS + 500;

export function ToastContainer() {
  const toast = useUiStore((state) => state.toasts[0] ?? null);
  const dismissToast = useUiStore((state) => state.dismissToast);
  const handleDismiss = useCallback(() => {
    if (!toast) return;
    dismissToast(toast.id);
  }, [dismissToast, toast]);
  if (!toast) return null;
  return (
    <ToastItem
      key={toast.id}
      message={toast.message}
      variant={toast.variant}
      onDismiss={handleDismiss}
    />
  );
}

type ToastItemProps = {
  message: string;
  variant: "success" | "error" | "info" | "warning";
  onDismiss: () => void;
};

const VARIANT_CONFIG: Record<string, { color: string; bg: string }> = {
  success: { color: COLORS.success, bg: COLORS.successMuted },
  error: { color: COLORS.danger, bg: COLORS.dangerMuted },
  warning: { color: COLORS.warning, bg: COLORS.warningMuted },
  info: { color: COLORS.info, bg: COLORS.infoMuted },
};

function ToastItem({ message, variant, onDismiss }: ToastItemProps) {
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const config = VARIANT_CONFIG[variant] ?? VARIANT_CONFIG.info;
  const expandedWidth = Math.min(windowWidth - SPACING.lg * 2, 396);
  const bubbleShiftTarget = -Math.max(0, expandedWidth / 2 - BUBBLE_SIZE / 2 - 10);
  const collapsedScaleX = BUBBLE_SIZE / expandedWidth;

  const cardScaleX = useRef(new Animated.Value(collapsedScaleX)).current;
  const surfaceOpacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(-74)).current;
  const dragY = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const bubbleTranslateX = useRef(new Animated.Value(0)).current;
  const textOpacity = useRef(new Animated.Value(0)).current;
  const textTranslateX = useRef(new Animated.Value(14)).current;
  const progress = useRef(new Animated.Value(1)).current;
  const dismissingRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearDismissTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const runExit = useCallback(() => {
    if (dismissingRef.current) return;
    dismissingRef.current = true;
    clearDismissTimer();
    Animated.sequence([
      Animated.parallel([
        Animated.timing(textOpacity, {
          toValue: 0,
          duration: 100,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(textTranslateX, {
          toValue: 8,
          duration: 100,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
      Animated.parallel([
        Animated.timing(cardScaleX, {
          toValue: collapsedScaleX,
          duration: 220,
          easing: Easing.inOut(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(surfaceOpacity, {
          toValue: 0,
          duration: 180,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(bubbleTranslateX, {
          toValue: 0,
          duration: 220,
          easing: Easing.inOut(Easing.cubic),
          useNativeDriver: true,
        }),
      ]),
      Animated.parallel([
        Animated.timing(translateY, {
          toValue: -74,
          duration: 180,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(dragY, {
          toValue: 0,
          duration: 160,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0,
          duration: 150,
          easing: Easing.in(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    ]).start(() => {
      dismissingRef.current = false;
      onDismiss();
    });
  }, [
    bubbleTranslateX,
    cardScaleX,
    clearDismissTimer,
    collapsedScaleX,
    dragY,
    onDismiss,
    opacity,
    surfaceOpacity,
    textOpacity,
    textTranslateX,
    translateY,
  ]);

  useEffect(() => {
    let isActive = true;
    translateY.setValue(-74);
    dragY.setValue(0);
    opacity.setValue(0);
    cardScaleX.setValue(collapsedScaleX);
    surfaceOpacity.setValue(0);
    bubbleTranslateX.setValue(0);
    textOpacity.setValue(0);
    textTranslateX.setValue(10);
    progress.setValue(1);

    const revealAnimation = Animated.parallel([
      Animated.timing(textOpacity, {
        toValue: 1,
        duration: 170,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(textTranslateX, {
        toValue: 0,
        duration: 170,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
    ]);

    const entryAnimation = Animated.sequence([
      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 1,
          duration: 110,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(translateY, {
          toValue: 0,
          duration: 380,
          easing: Easing.bezier(0.34, 1.56, 0.64, 1),
          useNativeDriver: true,
        }),
      ]),
      Animated.parallel([
        Animated.timing(cardScaleX, {
          toValue: 1,
          duration: 320,
          easing: Easing.bezier(0.22, 1, 0.36, 1),
          useNativeDriver: true,
        }),
        Animated.timing(surfaceOpacity, {
          toValue: 1,
          duration: 240,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(bubbleTranslateX, {
          toValue: bubbleShiftTarget,
          duration: 290,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]),
    ]);

    entryAnimation.start(({ finished }) => {
      if (!finished || !isActive || dismissingRef.current) return;

      revealAnimation.start();
      timerRef.current = setTimeout(runExit, TOAST_PROGRESS_DURATION_MS);
      Animated.timing(progress, {
        toValue: 0,
        duration: TOAST_PROGRESS_DURATION_MS,
        useNativeDriver: false,
      }).start();
    });

    return () => {
      isActive = false;
      entryAnimation.stop();
      revealAnimation.stop();
      progress.stopAnimation();
      clearDismissTimer();
    };
  }, [
    bubbleShiftTarget,
    bubbleTranslateX,
    cardScaleX,
    clearDismissTimer,
    collapsedScaleX,
    dragY,
    expandedWidth,
    opacity,
    progress,
    runExit,
    surfaceOpacity,
    textOpacity,
    textTranslateX,
    translateY,
  ]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_evt, gestureState) =>
          gestureState.dy < -6 && Math.abs(gestureState.dy) > Math.abs(gestureState.dx),
        onPanResponderMove: (_evt, gestureState) => {
          dragY.setValue(Math.min(0, gestureState.dy));
        },
        onPanResponderRelease: (_evt, gestureState) => {
          if (gestureState.dy < -42 || gestureState.vy < -0.75) {
            runExit();
            return;
          }
          Animated.spring(dragY, {
            toValue: 0,
            useNativeDriver: true,
            tension: 85,
            friction: 10,
          }).start();
        },
        onPanResponderTerminate: () => {
          Animated.spring(dragY, {
            toValue: 0,
            useNativeDriver: true,
            tension: 85,
            friction: 10,
          }).start();
        },
      }),
    [dragY, runExit],
  );

  const progressWidth = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, expandedWidth - SPACING.sm * 2],
  });

  return (
    <View style={styles.portal} pointerEvents="box-none">
      <View pointerEvents="box-none" style={[styles.wrapper, { top: insets.top + SPACING.sm }]}>
        <Animated.View
          {...panResponder.panHandlers}
          style={{
            width: expandedWidth,
            opacity,
            transform: [{ translateY: Animated.add(translateY, dragY) }],
          }}
        >
          <Pressable onPress={runExit}>
            <View style={styles.card}>
              <Animated.View
                pointerEvents="none"
                style={[
                  styles.surface,
                  {
                    opacity: surfaceOpacity,
                    transform: [{ scaleX: cardScaleX }],
                  },
                ]}
              >
                <View style={styles.tint} />
              </Animated.View>

              <Animated.View
                pointerEvents="none"
                style={[
                  styles.logoOrbit,
                  {
                    transform: [{ translateX: bubbleTranslateX }],
                  },
                ]}
              >
                <View style={styles.logoBubble}>
                  <Image source={TOAST_LOGO} style={styles.logo} resizeMode="contain" />
                </View>
              </Animated.View>

              <Animated.View
                pointerEvents="none"
                style={[
                  styles.messageWrap,
                  {
                    opacity: textOpacity,
                    transform: [{ translateX: textTranslateX }],
                  },
                ]}
              >
                <Text style={styles.message} numberOfLines={3}>
                  {message}
                </Text>
              </Animated.View>

              <Animated.View style={[styles.progressTrack, { opacity: textOpacity }]}>
                <Animated.View
                  style={[
                    styles.progressFill,
                    {
                      backgroundColor: config.color,
                      width: progressWidth,
                    },
                  ]}
                />
              </Animated.View>
            </View>
          </Pressable>
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  portal: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 9999,
    elevation: 9999,
  },
  wrapper: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "center",
  },
  card: {
    width: "100%",
    minHeight: BUBBLE_SIZE,
    justifyContent: "center",
  },
  surface: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: COLORS.mist,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    borderRadius: BUBBLE_SIZE / 2,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 10,
    elevation: 8,
  },
  tint: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(255,255,255,0.02)",
  },
  logoOrbit: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  logoBubble: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "rgba(8,12,20,0.98)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.16,
    shadowRadius: 8,
  },
  logo: {
    width: 22,
    height: 22,
  },
  messageWrap: {
    minHeight: BUBBLE_SIZE,
    justifyContent: "center",
    paddingLeft: BUBBLE_SIZE + 16,
    paddingRight: SPACING.md + 2,
    paddingVertical: SPACING.sm + 1,
  },
  message: {
    fontFamily: FONT_FAMILY.bodyMedium,
    fontSize: FONT_SIZE.sm,
    color: COLORS.ink,
    lineHeight: 18,
  },
  progressTrack: {
    position: "absolute",
    left: SPACING.sm,
    right: SPACING.sm,
    bottom: 6,
    height: 2,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  progressFill: {
    height: "100%",
    borderRadius: 999,
  },
});
