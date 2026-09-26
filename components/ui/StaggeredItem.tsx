import { useEffect, useRef } from "react";
import { Animated, Easing } from "react-native";

type Props = {
  index: number;
  children: React.ReactNode;
  maxStagger?: number; // indices beyond this render instantly
  enabled?: boolean;
};

export function StaggeredItem({ index, children, maxStagger = 10, enabled = true }: Props) {
  // Decide on mount only. Removing this wrapper later would remount native gesture hosts.
  const shouldAnimate = useRef(enabled && index < maxStagger).current;
  const opacity = useRef(new Animated.Value(shouldAnimate ? 0 : 1)).current;
  const translateY = useRef(new Animated.Value(shouldAnimate ? 14 : 0)).current;

  useEffect(() => {
    if (!shouldAnimate) return;
    const delay = Math.min(index * 45, 360);
    const animation = Animated.parallel([
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
    ]);
    animation.start();
    return () => animation.stop();
  // Entrance timing is chosen on mount, even if the same item later changes index.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Animated.View style={{ opacity, transform: [{ translateY }] }}>
      {children}
    </Animated.View>
  );
}
