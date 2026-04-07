import { useEffect, useRef } from "react";
import { Animated, Dimensions, PanResponder } from "react-native";

const SCREEN_HEIGHT = Dimensions.get("window").height;
const DISMISS_THRESHOLD = 88;

type Options = {
  visible: boolean;
  onClose: () => void;
  enabled?: boolean;
};

export function useDismissibleSheet({ visible, onClose, enabled = true }: Options) {
  const translateY = useRef(new Animated.Value(0)).current;
  const closingRef = useRef(false);

  useEffect(() => {
    if (!visible) return;
    closingRef.current = false;
    translateY.stopAnimation();
    translateY.setValue(36);
    Animated.spring(translateY, {
      toValue: 0,
      useNativeDriver: true,
      tension: 72,
      friction: 12,
    }).start();
  }, [translateY, visible]);

  function animateBack() {
    Animated.spring(translateY, {
      toValue: 0,
      useNativeDriver: true,
      tension: 76,
      friction: 12,
    }).start();
  }

  function animateClose() {
    if (closingRef.current) return;
    closingRef.current = true;
    Animated.timing(translateY, {
      toValue: SCREEN_HEIGHT,
      duration: 220,
      useNativeDriver: true,
    }).start(({ finished }) => {
      closingRef.current = false;
      translateY.setValue(0);
      if (finished) onClose();
    });
  }

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, gesture) =>
        enabled &&
        gesture.dy > 6 &&
        Math.abs(gesture.dy) > Math.abs(gesture.dx),
      onPanResponderMove: (_, gesture) => {
        if (gesture.dy > 0) translateY.setValue(gesture.dy);
      },
      onPanResponderRelease: (_, gesture) => {
        if (gesture.dy > DISMISS_THRESHOLD || gesture.vy > 0.78) {
          animateClose();
        } else {
          animateBack();
        }
      },
      onPanResponderTerminate: animateBack,
    }),
  ).current;

  const sheetStyle = {
    transform: [{ translateY }],
  };

  const backdropStyle = {
    opacity: translateY.interpolate({
      inputRange: [0, SCREEN_HEIGHT * 0.45],
      outputRange: [1, 0],
      extrapolate: "clamp",
    }),
  };

  return {
    backdropStyle,
    panHandlers: panResponder.panHandlers,
    sheetStyle,
  };
}
