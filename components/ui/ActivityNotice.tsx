import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Animated, StyleSheet, Text, View } from "react-native";

import { COLORS, FONT_FAMILY, FONT_SIZE, RADIUS, SPACING } from "../../constants/theme";
import { useUiStore, type ActivityNotice } from "../../store/ui-store";
import { SafeBlurView } from "./SafeBlurView";

export function ActivityNoticeContainer() {
  const activityNotice = useUiStore((state) => state.activityNotice);
  const toastCount = useUiStore((state) => state.toasts.length);
  const [renderedNotice, setRenderedNotice] = useState<ActivityNotice | null>(activityNotice);
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(18)).current;
  const scale = useRef(new Animated.Value(0.94)).current;
  const exitingRef = useRef(false);

  const runEnter = useCallback(() => {
    opacity.setValue(0);
    translateY.setValue(18);
    scale.setValue(0.94);

    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 180,
        useNativeDriver: true,
      }),
      Animated.spring(translateY, {
        toValue: 0,
        useNativeDriver: true,
        tension: 78,
        friction: 10,
      }),
      Animated.spring(scale, {
        toValue: 1,
        useNativeDriver: true,
        tension: 72,
        friction: 10,
      }),
    ]).start();
  }, [opacity, scale, translateY]);

  const runExit = useCallback((onDone?: () => void) => {
    if (exitingRef.current) return;
    exitingRef.current = true;
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 0,
        duration: 140,
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: 12,
        duration: 140,
        useNativeDriver: true,
      }),
      Animated.timing(scale, {
        toValue: 0.97,
        duration: 140,
        useNativeDriver: true,
      }),
    ]).start(() => {
      exitingRef.current = false;
      onDone?.();
    });
  }, [opacity, scale, translateY]);

  useEffect(() => {
    if (activityNotice) {
      setRenderedNotice(activityNotice);
      return;
    }
    if (renderedNotice) {
      runExit(() => setRenderedNotice(null));
    }
  }, [activityNotice, renderedNotice, runExit]);

  useEffect(() => {
    if (!renderedNotice) return;
    runEnter();
  }, [renderedNotice?.id, runEnter]);

  if (!renderedNotice || toastCount > 0) return null;

  return (
    <View pointerEvents="box-none" style={styles.overlay}>
      <Animated.View
        pointerEvents="none"
        style={[
          styles.card,
          {
            opacity,
            transform: [{ translateY }, { scale }],
          },
        ]}
      >
        <SafeBlurView
          intensity={26}
          tint="dark"
          fallbackColor="rgba(7,11,20,0.92)"
          style={StyleSheet.absoluteFillObject}
        />
        <View style={styles.cardTint} />
        <ActivityIndicator size="small" color={COLORS.pine} />
        <Text style={styles.title}>{renderedNotice.message}</Text>
        {renderedNotice.description ? (
          <Text style={styles.description}>{renderedNotice.description}</Text>
        ) : null}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: SPACING.lg,
    zIndex: 120,
  },
  card: {
    minWidth: 240,
    maxWidth: 360,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 22,
    paddingVertical: 18,
    borderRadius: RADIUS.xl,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    backgroundColor: "rgba(7,11,20,0.92)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.28,
    shadowRadius: 24,
    elevation: 14,
  },
  cardTint: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(5,7,11,0.26)",
  },
  title: {
    color: COLORS.ink,
    fontFamily: FONT_FAMILY.heading,
    fontSize: FONT_SIZE.lg,
    textAlign: "center",
  },
  description: {
    color: COLORS.storm,
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.sm,
    lineHeight: 18,
    textAlign: "center",
  },
});
