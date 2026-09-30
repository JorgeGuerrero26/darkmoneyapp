import { useEffect, useRef } from "react";
import { Animated, Dimensions, PanResponder } from "react-native";

const SCREEN_HEIGHT = Dimensions.get("window").height;
const DISMISS_THRESHOLD = 88;

/** Entrada corta con resorte compartida por las hojas del dashboard y el detalle del movimiento. */
export const SHORT_SHEET_ENTRANCE = { offset: 36, tension: 110, friction: 16, fadeDuration: 190 } as const;

/** La misma entrada cuando la hoja vive dentro de un Modal ya abierto. */
export function useInlineSpringFade(visible: boolean, enabled: boolean) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!enabled) return;
    opacity.stopAnimation();
    translateY.stopAnimation();
    if (!visible) {
      opacity.setValue(0);
      translateY.setValue(0);
      return;
    }
    opacity.setValue(0);
    translateY.setValue(SHORT_SHEET_ENTRANCE.offset);
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: SHORT_SHEET_ENTRANCE.fadeDuration, useNativeDriver: true }),
      Animated.spring(translateY, {
        toValue: 0,
        useNativeDriver: true,
        tension: SHORT_SHEET_ENTRANCE.tension,
        friction: SHORT_SHEET_ENTRANCE.friction,
      }),
    ]).start();
  }, [enabled, opacity, translateY, visible]);

  return {
    backdropStyle: { opacity },
    sheetStyle: { transform: [{ translateY }] },
  };
}

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
    translateY.setValue(SHORT_SHEET_ENTRANCE.offset);
    Animated.spring(translateY, {
      toValue: 0,
      useNativeDriver: true,
      tension: SHORT_SHEET_ENTRANCE.tension,
      friction: SHORT_SHEET_ENTRANCE.friction,
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
