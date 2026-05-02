import { useEffect, useRef } from "react";
import { Animated, Easing } from "react-native";

type Props = {
  index: number;
  children: React.ReactNode;
  maxStagger?: number; // indices beyond this render instantly
};

export function StaggeredItem({ index, children, maxStagger = 10 }: Props) {
  const opacity = useRef(new Animated.Value(index < maxStagger ? 0 : 1)).current;
  const translateY = useRef(new Animated.Value(index < maxStagger ? 14 : 0)).current;

  useEffect(() => {
    if (index >= maxStagger) return;
    const delay = Math.min(index * 45, 360);
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 340,
        delay,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: 0,
        duration: 380,
        delay,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  // index never changes for a given item instance
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Animated.View style={{ opacity, transform: [{ translateY }] }}>
      {children}
    </Animated.View>
  );
}
