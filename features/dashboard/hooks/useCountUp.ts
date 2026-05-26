import { useEffect, useRef, useState } from "react";
import { Animated, Easing } from "react-native";

export function useCountUp(target: number, duration = 950): number {
  const animRef = useRef(new Animated.Value(0));
  const [displayed, setDisplayed] = useState(0);
  useEffect(() => {
    animRef.current.setValue(0);
    const id = animRef.current.addListener(({ value }) => setDisplayed(value));
    Animated.timing(animRef.current, {
      toValue: target,
      duration,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
    return () => {
      animRef.current.removeListener(id);
      animRef.current.stopAnimation();
    };
  }, [target, duration]);
  return displayed;
}
