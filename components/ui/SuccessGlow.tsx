import { useEffect, useRef } from "react";
import { Animated, Easing, StyleSheet, View } from "react-native";
import { useUiStore } from "../../store/ui-store";

const GLOW_COLOR = "#6BE4C5";

/**
 * Full-screen edge-rim glow that briefly appears on every success operation.
 * Inspired by Apple Pay / Revolut confirmation feedback:
 *   - A thin green border lights up the perimeter of the screen
 *   - A faint green vignette tints the overall UI
 *   - Fades in 90ms, holds ~60ms, fades out 380ms → total ~530ms
 *   - pointer-events none: never blocks interaction
 */
export function SuccessGlow() {
  const token = useUiStore((s) => s.successGlowToken);
  const opacity = useRef(new Animated.Value(0)).current;
  const prevToken = useRef(0);
  const animRef = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    if (token === 0 || token === prevToken.current) return;
    prevToken.current = token;

    animRef.current?.stop();
    opacity.setValue(0);

    animRef.current = Animated.sequence([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 90,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.delay(60),
      Animated.timing(opacity, {
        toValue: 0,
        duration: 380,
        easing: Easing.in(Easing.quad),
        useNativeDriver: true,
      }),
    ]);

    animRef.current.start();
  }, [token, opacity]);

  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.root, { opacity }]}
    >
      {/* Subtle green wash over the entire screen */}
      <View style={styles.tint} />
      {/* Edge rim — the "Siri border" effect */}
      <View style={styles.rim} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 9998,
  },
  tint: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: GLOW_COLOR,
    opacity: 0.04,
  },
  rim: {
    ...StyleSheet.absoluteFillObject,
    borderWidth: 1.5,
    borderColor: GLOW_COLOR,
    opacity: 0.55,
  },
});
