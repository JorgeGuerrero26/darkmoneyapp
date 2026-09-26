import { useCallback, useContext, useEffect, useId, useMemo, useRef, type ComponentType, type ReactNode } from "react";
import { StyleSheet, Text, TouchableOpacity, View, type StyleProp, type ViewStyle } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  cancelAnimation,
  interpolate,
  runOnJS,
  runOnUI,
  useAnimatedStyle,
  useAnimatedReaction,
  useSharedValue,
  withSpring,
  Extrapolation,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";

import { COLORS, FONT_FAMILY, FONT_SIZE, RADIUS } from "../../constants/theme";
import { SwipeRowContext } from "./SwipeRowScope";
import { resolveSwipeTarget } from "../../lib/swipe-row-target";

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

// Horizontal intent must win before the list starts scrolling.
const ACTIVATE_X = 12;
const FAIL_Y = 10;
const SPRING = { damping: 24, stiffness: 260, mass: 0.9, overshootClamping: true } as const;
type OpenDir = 0 | 1 | -1;

/** A fixed native host owns the gesture; only its content moves. */
export function SwipeActionRow({
  leftAction,
  rightAction,
  revealWidth = 90,
  borderRadius = RADIUS.xl,
  style,
  contentContainerStyle,
  children,
}: Props) {
  const rowId = useId();
  const scope = useContext(SwipeRowContext);
  const localOwner = useSharedValue<string | null>(null);
  const localRevision = useSharedValue(0);
  const owner = scope?.owner ?? localOwner;
  const revision = scope?.revision ?? localRevision;
  const gestureRevision = useSharedValue(0);
  const translateX = useSharedValue(0);
  const grabbedAt = useSharedValue(0);
  const openDir = useSharedValue<OpenDir>(0);
  const dragging = useSharedValue(false);
  const actionLocked = useSharedValue(false);
  const hasLeft = Boolean(leftAction);
  const hasRight = Boolean(rightAction);

  const closeOnUI = useCallback(() => {
    "worklet";
    dragging.value = false;
    openDir.value = 0;
    translateX.value = withSpring(0, SPRING);
  }, [dragging, openDir, translateX]);
  const close = useCallback(() => runOnUI(closeOnUI)(), [closeOnUI]);
  const isOpen = useCallback(
    () => dragging.value || openDir.value !== 0 || Math.abs(translateX.value) > 1,
    [dragging, openDir, translateX],
  );

  useAnimatedReaction(
    () => ({ owner: owner.value, revision: revision.value }),
    (current, previous) => {
      const invalidated = current.owner !== rowId || (previous && current.revision !== previous.revision);
      if (invalidated && (dragging.value || openDir.value !== 0 || translateX.value !== 0)) {
        closeOnUI();
      }
    },
    [rowId, closeOnUI],
  );

  // Action availability/width changes invalidate an in-flight drag too.
  useEffect(() => {
    close();
  }, [hasLeft, hasRight, revealWidth, close]);
  useEffect(() => () => {
    runOnUI(() => {
      "worklet";
      if (owner.value === rowId) owner.value = null;
      cancelAnimation(translateX);
    })();
  }, [owner, rowId, translateX]);

  const lightHaptic = useCallback(() => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, []);

  const pan = useMemo(() => Gesture.Pan()
    .enabled(hasLeft || hasRight)
    .activeOffsetX([-ACTIVATE_X, ACTIVATE_X])
    .failOffsetY([-FAIL_Y, FAIL_Y])
    .maxPointers(1)
    .onTouchesDown((event, manager) => {
      if (event.numberOfTouches > 1) {
        closeOnUI();
        manager.fail();
      }
    })
    .onBegin(() => {
      owner.value = rowId;
      gestureRevision.value = revision.value;
    })
    .onStart(() => {
      if (owner.value !== rowId || gestureRevision.value !== revision.value) return;
      cancelAnimation(translateX);
      grabbedAt.value = translateX.value;
      dragging.value = true;
      actionLocked.value = false;
    })
    .onUpdate((e) => {
      if (!dragging.value || owner.value !== rowId || gestureRevision.value !== revision.value) return;
      translateX.value = Math.min(hasLeft ? revealWidth : 0,
        Math.max(hasRight ? -revealWidth : 0, grabbedAt.value + e.translationX));
    })
    .onEnd((e, success) => {
      if (!success || !dragging.value || owner.value !== rowId || gestureRevision.value !== revision.value) return;
      const target = resolveSwipeTarget({
        grabbedAt: grabbedAt.value,
        dx: e.translationX,
        vx: e.velocityX / 1000,
        openDir: openDir.value === 0 ? null : openDir.value > 0 ? "right" : "left",
        hasLeftAction: hasLeft,
        hasRightAction: hasRight,
        revealWidth,
      });
      if (target !== 0 && openDir.value === 0) runOnJS(lightHaptic)();
      openDir.value = target === 0 ? 0 : target > 0 ? 1 : -1;
      translateX.value = withSpring(target, SPRING);
    })
    .onFinalize((_e, success) => {
      if (!success && dragging.value) closeOnUI();
      dragging.value = false;
    }), [actionLocked, closeOnUI, dragging, gestureRevision, grabbedAt, hasLeft, hasRight,
      lightHaptic, openDir, owner, revealWidth, revision, rowId, translateX]);

  // Consume taps on open content before child buttons can navigate.
  const tap = useMemo(() => Gesture.Tap()
    .onTouchesDown((_event, manager) => {
      if (openDir.value === 0 && Math.abs(translateX.value) <= 1) manager.fail();
    })
    .onEnd((_e, success) => {
      if (success && (openDir.value !== 0 || Math.abs(translateX.value) > 1)) closeOnUI();
    }), [closeOnUI, openDir, translateX]);

  const contentStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
    pointerEvents: openDir.value !== 0 || dragging.value || Math.abs(translateX.value) > 1
      ? "box-only" : "auto",
  }));
  const leftBgStyle = useAnimatedStyle(() => ({
    opacity: interpolate(translateX.value, [0, 16, revealWidth], [0, 0.6, 1], Extrapolation.CLAMP),
  }));
  const rightBgStyle = useAnimatedStyle(() => ({
    opacity: interpolate(translateX.value, [-revealWidth, -16, 0], [1, 0.6, 0], Extrapolation.CLAMP),
  }));

  const latestActions = useRef({ leftAction, rightAction });
  latestActions.current = { leftAction, rightAction };
  function handleActionPress(direction: OpenDir) {
    if (actionLocked.value || dragging.value || owner.value !== rowId || openDir.value !== direction) return;
    const action = direction > 0 ? latestActions.current.leftAction : latestActions.current.rightAction;
    if (!action) return;
    actionLocked.value = true;
    close();
    runActionHaptic(action);
    // Business actions must not depend on an uninterrupted spring completion.
    action.onPress();
  }

  return (
    <GestureDetector gesture={pan} touchAction="pan-y">
      <View collapsable={false} style={[styles.container, { borderRadius }, style]}>
        {leftAction ? (
          <Animated.View
            style={[
              styles.leftActionBg,
              {
                width: revealWidth,
                backgroundColor: leftAction.backgroundColor ?? COLORS.pine + "30",
                borderTopRightRadius: borderRadius,
                borderBottomRightRadius: borderRadius,
              },
              leftBgStyle,
            ]}
          >
            <ActionButton action={leftAction} onPress={() => handleActionPress(1)} />
          </Animated.View>
        ) : null}

        {rightAction ? (
          <Animated.View
            style={[
              styles.rightActionBg,
              {
                width: revealWidth,
                backgroundColor: rightAction.backgroundColor ?? COLORS.danger + "28",
                borderTopLeftRadius: borderRadius,
                borderBottomLeftRadius: borderRadius,
              },
              rightBgStyle,
            ]}
          >
            <ActionButton action={rightAction} onPress={() => handleActionPress(-1)} />
          </Animated.View>
        ) : null}

        <GestureDetector gesture={tap} touchAction="pan-y">
          <Animated.View
            collapsable={false}
            style={[styles.contentContainer, contentStyle, contentContainerStyle]}
          >
            {typeof children === "function" ? children({ close, isOpen }) : children}
          </Animated.View>
        </GestureDetector>
      </View>
    </GestureDetector>
  );
}

function runActionHaptic(action: SwipeAction) {
  if (action.haptic === "warning") {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    return;
  }
  void Haptics.impactAsync(
    action.haptic === "medium" ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Light,
  );
}

function ActionButton({ action, onPress }: { action: SwipeAction; onPress: () => void }) {
  const Icon = action.icon;
  const color = action.color ?? COLORS.danger;
  return (
    <TouchableOpacity accessibilityRole="button" accessibilityLabel={action.label} style={styles.actionBtn} onPress={onPress} activeOpacity={0.8}>
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
