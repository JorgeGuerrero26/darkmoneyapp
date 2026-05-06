import { useRef, type ComponentType, type ReactNode } from "react";
import { Animated, PanResponder, StyleSheet, Text, TouchableOpacity, View, type StyleProp, type ViewStyle } from "react-native";
import * as Haptics from "expo-haptics";

import { COLORS, FONT_FAMILY, FONT_SIZE, RADIUS } from "../../constants/theme";

type SwipeActionIcon = ComponentType<{
  size?: number;
  color?: string;
  strokeWidth?: number;
}>;

export type SwipeAction = {
  label: string;
  icon: SwipeActionIcon;
  onPress: () => void;
  color?: string;
  backgroundColor?: string;
  haptic?: "light" | "medium" | "warning";
};

type RenderContentArgs = {
  close: () => void;
  isOpen: () => boolean;
};

type Props = {
  leftAction?: SwipeAction | null;
  rightAction?: SwipeAction | null;
  revealWidth?: number;
  borderRadius?: number;
  style?: StyleProp<ViewStyle>;
  contentContainerStyle?: StyleProp<ViewStyle>;
  children: ReactNode | ((args: RenderContentArgs) => ReactNode);
};

export function SwipeActionRow({
  leftAction,
  rightAction,
  revealWidth = 90,
  borderRadius = RADIUS.xl,
  style,
  contentContainerStyle,
  children,
}: Props) {
  const translateX = useRef(new Animated.Value(0)).current;
  const openDir = useRef<"right" | "left" | null>(null);

  const leftOpacity = translateX.interpolate({
    inputRange: [0, 16, revealWidth],
    outputRange: [0, 0.6, 1],
    extrapolate: "clamp",
  });
  const rightOpacity = translateX.interpolate({
    inputRange: [-revealWidth, -16, 0],
    outputRange: [1, 0.6, 0],
    extrapolate: "clamp",
  });

  const snapTo = (toValue: number, cb?: () => void) => {
    if (toValue === 0) openDir.current = null;
    else if (toValue > 0) openDir.current = "right";
    else openDir.current = "left";
    Animated.spring(translateX, {
      toValue,
      useNativeDriver: true,
      tension: 80,
      friction: 11,
    }).start(cb);
  };

  const close = () => snapTo(0);
  const isOpen = () => openDir.current !== null;

  function runActionHaptic(action: SwipeAction) {
    if (action.haptic === "warning") {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      return;
    }
    void Haptics.impactAsync(
      action.haptic === "medium"
        ? Haptics.ImpactFeedbackStyle.Medium
        : Haptics.ImpactFeedbackStyle.Light,
    );
  }

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, { dx, dy }) =>
        Math.abs(dx) > Math.abs(dy) * 1.5 && Math.abs(dx) > 10,
      onPanResponderGrant: () => {
        translateX.stopAnimation();
      },
      onPanResponderMove: (_, { dx }) => {
        const base = openDir.current === "right" ? revealWidth : openDir.current === "left" ? -revealWidth : 0;
        const raw = base + dx;
        const minX = rightAction ? -revealWidth * 1.4 : Math.min(0, base);
        const maxX = leftAction ? revealWidth * 1.4 : Math.max(0, base);
        translateX.setValue(Math.min(maxX, Math.max(minX, raw)));
      },
      onPanResponderRelease: (_, { dx, vx }) => {
        const base = openDir.current === "right" ? revealWidth : openDir.current === "left" ? -revealWidth : 0;
        const finalX = base + dx;
        if (leftAction && (finalX > revealWidth / 2 || vx > 0.4)) {
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          snapTo(revealWidth);
        } else if (rightAction && (finalX < -revealWidth / 2 || vx < -0.4)) {
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          snapTo(-revealWidth);
        } else {
          snapTo(0);
        }
      },
    }),
  ).current;

  function handleActionPress(action: SwipeAction) {
    runActionHaptic(action);
    snapTo(0, action.onPress);
  }

  return (
    <View style={[styles.container, { borderRadius }, style]}>
      {leftAction ? (
        <Animated.View
          style={[
            styles.leftActionBg,
            {
              opacity: leftOpacity,
              width: revealWidth,
              backgroundColor: leftAction.backgroundColor ?? COLORS.pine + "30",
              borderTopRightRadius: borderRadius,
              borderBottomRightRadius: borderRadius,
            },
          ]}
        >
          <ActionButton action={leftAction} onPress={() => handleActionPress(leftAction)} />
        </Animated.View>
      ) : null}

      {rightAction ? (
        <Animated.View
          style={[
            styles.rightActionBg,
            {
              opacity: rightOpacity,
              width: revealWidth,
              backgroundColor: rightAction.backgroundColor ?? COLORS.danger + "28",
              borderTopLeftRadius: borderRadius,
              borderBottomLeftRadius: borderRadius,
            },
          ]}
        >
          <ActionButton action={rightAction} onPress={() => handleActionPress(rightAction)} />
        </Animated.View>
      ) : null}

      <Animated.View
        style={[styles.contentContainer, { transform: [{ translateX }] }, contentContainerStyle]}
        {...panResponder.panHandlers}
      >
        {typeof children === "function" ? children({ close, isOpen }) : children}
      </Animated.View>
    </View>
  );
}

function ActionButton({ action, onPress }: { action: SwipeAction; onPress: () => void }) {
  const Icon = action.icon;
  const color = action.color ?? COLORS.danger;
  return (
    <TouchableOpacity style={styles.actionBtn} onPress={onPress} activeOpacity={0.8}>
      <Icon size={20} color={color} strokeWidth={2} />
      <Text style={[styles.actionLabel, { color }]}>{action.label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "relative",
    overflow: "hidden",
  },
  contentContainer: {
    width: "100%",
  },
  leftActionBg: {
    position: "absolute",
    top: 0,
    left: 0,
    bottom: 0,
    justifyContent: "center",
    alignItems: "center",
  },
  rightActionBg: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    justifyContent: "center",
    alignItems: "center",
  },
  actionBtn: {
    flex: 1,
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  actionLabel: {
    fontSize: FONT_SIZE.xs,
    fontFamily: FONT_FAMILY.bodySemibold,
  },
});
