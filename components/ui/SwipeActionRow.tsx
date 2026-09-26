import { useCallback, useEffect, useMemo, type ComponentType, type ReactNode } from "react";
import { StyleSheet, Text, TouchableOpacity, View, type StyleProp, type ViewStyle } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  cancelAnimation,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  Extrapolation,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";

import { COLORS, FONT_FAMILY, FONT_SIZE, RADIUS } from "../../constants/theme";
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

/**
 * Cuánto se mueve el dedo en horizontal antes de que el gesto sea de la fila, y cuánto en
 * vertical antes de ceder el toque a la lista. Mismo criterio que `useSwipeTab`.
 */
const ACTIVATE_X = 12;
const FAIL_Y = 10;

/** Resorte del snap: firme, sin rebote que haga dudar si quedó abierta. */
const SPRING = { damping: 24, stiffness: 260, mass: 0.9 } as const;

/** Cuánto deja estirar más allá de la acción, como tope elástico. */
const OVERSHOOT = 1.4;

/** 0 = cerrada, 1 = abierta a la derecha (acción izquierda), -1 = abierta a la izquierda. */
type OpenDir = 0 | 1 | -1;

/**
 * Fila deslizable con una acción a cada lado.
 *
 * **El gesto corre en el hilo nativo** (react-native-gesture-handler + Reanimated). La versión
 * anterior usaba `PanResponder`: cada movimiento del dedo cruzaba al hilo de JavaScript, y con JS
 * ocupado —cargando la lista, por ejemplo— se saltaban fotogramas. De ahí lo entrecortado.
 *
 * **Y ya no puede quedarse a medias.** Con `PanResponder`, si el dedo se desviaba en vertical la
 * lista reclamaba el toque para hacer scroll; el componente no se lo negaba ni manejaba la
 * interrupción, así que la fila se congelaba donde estaba el dedo — medio abierta, con el monto
 * cortado. Aquí un gesto interrumpido también se resuelve: vuelve a cerrada o a abierta, nunca a
 * mitad.
 *
 * La regla de dónde queda al soltar sigue siendo `resolveSwipeTarget`, sin cambios y con sus
 * tests; solo que ahora corre como worklet.
 */
export function SwipeActionRow({
  leftAction,
  rightAction,
  revealWidth = 90,
  borderRadius = RADIUS.xl,
  style,
  contentContainerStyle,
  children,
}: Props) {
  const translateX = useSharedValue(0);
  const grabbedAt = useSharedValue(0);
  const openDir = useSharedValue<OpenDir>(0);
  // Las acciones de ESTE render: una fila que gana o pierde una acción (una cuenta que se archiva
  // y estrena "Eliminar") debe calcular sus topes con las de ahora, no con las del primer render.
  const hasLeft = useSharedValue(Boolean(leftAction));
  const hasRight = useSharedValue(Boolean(rightAction));
  useEffect(() => {
    hasLeft.value = Boolean(leftAction);
    hasRight.value = Boolean(rightAction);
  }, [leftAction, rightAction, hasLeft, hasRight]);

  const lightHaptic = useCallback(() => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, []);

  const snapTo = useCallback(
    (toValue: number, onDone?: () => void) => {
      openDir.value = toValue === 0 ? 0 : toValue > 0 ? 1 : -1;
      translateX.value = withSpring(toValue, SPRING, (finished) => {
        if (finished && onDone) runOnJS(onDone)();
      });
    },
    [openDir, translateX],
  );

  const close = useCallback(() => snapTo(0), [snapTo]);
  const isOpen = useCallback(() => openDir.value !== 0, [openDir]);

  const pan = useMemo(() => Gesture.Pan()
    .activeOffsetX([-ACTIVATE_X, ACTIVATE_X])
    .failOffsetY([-FAIL_Y, FAIL_Y])
    .onStart(() => {
      // Si estaba animando, el dedo la agarra donde está de verdad, no en su destino.
      cancelAnimation(translateX);
      grabbedAt.value = translateX.value;
    })
    .onUpdate((e) => {
      const minX = hasRight.value ? -revealWidth * OVERSHOOT : Math.min(0, grabbedAt.value);
      const maxX = hasLeft.value ? revealWidth * OVERSHOOT : Math.max(0, grabbedAt.value);
      translateX.value = Math.min(maxX, Math.max(minX, grabbedAt.value + e.translationX));
    })
    .onEnd((e, success) => {
      const target = resolveSwipeTarget({
        grabbedAt: grabbedAt.value,
        dx: e.translationX,
        // Gesture Handler da px/s; la regla está calibrada en px/ms. Un gesto interrumpido (la
        // lista reclamó el toque) no tiene impulso válido: se decide solo por la posición.
        vx: success ? e.velocityX / 1000 : 0,
        openDir: openDir.value === 0 ? null : openDir.value > 0 ? "right" : "left",
        hasLeftAction: hasLeft.value,
        hasRightAction: hasRight.value,
        revealWidth,
      });
      if (target !== 0 && openDir.value === 0) runOnJS(lightHaptic)();
      openDir.value = target === 0 ? 0 : target > 0 ? 1 : -1;
      translateX.value = withSpring(target, SPRING);
    }), [grabbedAt, hasLeft, hasRight, lightHaptic, openDir, revealWidth, translateX]);

  const contentStyle = useAnimatedStyle(() => ({ transform: [{ translateX: translateX.value }] }));
  const leftBgStyle = useAnimatedStyle(() => ({
    opacity: interpolate(translateX.value, [0, 16, revealWidth], [0, 0.6, 1], Extrapolation.CLAMP),
  }));
  const rightBgStyle = useAnimatedStyle(() => ({
    opacity: interpolate(translateX.value, [-revealWidth, -16, 0], [1, 0.6, 0], Extrapolation.CLAMP),
  }));

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
              width: revealWidth,
              backgroundColor: leftAction.backgroundColor ?? COLORS.pine + "30",
              borderTopRightRadius: borderRadius,
              borderBottomRightRadius: borderRadius,
            },
            leftBgStyle,
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
              width: revealWidth,
              backgroundColor: rightAction.backgroundColor ?? COLORS.danger + "28",
              borderTopLeftRadius: borderRadius,
              borderBottomLeftRadius: borderRadius,
            },
            rightBgStyle,
          ]}
        >
          <ActionButton action={rightAction} onPress={() => handleActionPress(rightAction)} />
        </Animated.View>
      ) : null}

      <GestureDetector gesture={pan}>
        <Animated.View style={[styles.contentContainer, contentStyle, contentContainerStyle]}>
          {typeof children === "function" ? children({ close, isOpen }) : children}
        </Animated.View>
      </GestureDetector>
    </View>
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
