import { useEffect, useState } from "react";
import {
  Easing,
  cancelAnimation,
  runOnJS,
  useAnimatedReaction,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

/**
 * Anima un número desde 0 hasta `target` con easing easeOutCubic.
 * Migrado de Animated legacy a Reanimated. La animación corre en el UI thread;
 * el valor se sincroniza al JS thread vía useAnimatedReaction para que el
 * componente que lo consume haga el formateo del número.
 */
export function useCountUp(target: number, duration = 950): number {
  const progress = useSharedValue(0);
  const [displayed, setDisplayed] = useState(0);

  useEffect(() => {
    cancelAnimation(progress);
    progress.value = 0;
    progress.value = withTiming(target, {
      duration,
      easing: Easing.out(Easing.cubic),
    });
    return () => {
      cancelAnimation(progress);
    };
  }, [target, duration, progress]);

  useAnimatedReaction(
    () => progress.value,
    (value) => {
      runOnJS(setDisplayed)(value);
    },
    [],
  );

  return displayed;
}
