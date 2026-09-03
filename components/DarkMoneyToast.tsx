import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Animated, PanResponder, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { COLORS, FONT_FAMILY, FONT_SIZE, SPACING } from "../constants/theme";
import { TAB_BAR_CONTENT_HEIGHT } from "../constants/floating-tab-bar";
import { useUiStore } from "../store/ui-store";

/**
 * El aviso de confirmación: el componente más repetido de la app.
 *
 * **Borrar un movimiento no es un error, y guardarlo no es un ingreso.** El aviso salía en rojo
 * después de que el usuario deslizara y confirmara —hizo exactamente lo que quería— y en verde
 * al guardar un gasto, diciendo con el color "entró plata". Ninguno de los dos tonos era su
 * significado.
 *
 * Y el color no estaba en un sitio: estaba en **cinco** —borde, fondo tintado, recuadro del
 * ícono, título y texto del botón— para comunicar un solo bit. Es la misma acumulación que se
 * quitó del botón principal y de las cápsulas de estado.
 *
 * Un aviso tiene dos trabajos: decir qué pasó y ofrecer deshacerlo. **Los dos son texto.** El
 * color se reserva para el único caso en que el usuario tiene que reaccionar: que la operación
 * falle. Así, ver color en un aviso significa una sola cosa.
 */

export type ToastType = "success" | "update" | "transfer" | "delete" | "info" | "error";

export interface ToastConfig {
  type: ToastType;
  title: string;
  /** La consecuencia: "S/ 1.50 · devuelto a Cuenta Principal". */
  subtitle?: string;
  amount?: string;
  duration?: number;
  onUndo?: () => void;
  /** Solo para el caso que falló. */
  onRetry?: () => void;
}

/** Los cuatro casos. Idénticos salvo el alto y quién lleva botón. */
type ToastKind = "notice" | "undo" | "detail" | "failed";

const HEIGHT: Record<ToastKind, number> = {
  notice: 46,
  undo: 56,
  detail: 60,
  failed: 60,
};

function kindOf(config: ToastConfig): ToastKind {
  if (config.type === "error") return "failed";
  if (config.onUndo) return "undo";
  if (config.subtitle || config.amount) return "detail";
  return "notice";
}

const SURFACE_BG = "#2A2825";
const UNDO_BG = "#3A3733";

export function DarkMoneyToast({
  config,
  onHide,
}: {
  config: ToastConfig | null;
  onHide: () => void;
}) {
  const insets = useSafeAreaInsets();
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(20)).current;
  const dragY = useRef(new Animated.Value(0)).current;
  const progress = useRef(new Animated.Value(1)).current;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dismissingRef = useRef(false);

  const runHide = useCallback(() => {
    if (dismissingRef.current) return;
    dismissingRef.current = true;
    if (timerRef.current) clearTimeout(timerRef.current);
    Animated.parallel([
      Animated.timing(opacity, { toValue: 0, duration: 180, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: 24, duration: 180, useNativeDriver: true }),
      Animated.timing(dragY, { toValue: 0, duration: 180, useNativeDriver: true }),
    ]).start(() => {
      dismissingRef.current = false;
      onHide();
    });
  }, [opacity, translateY, dragY, onHide]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_e, gs) => gs.dy > 6 && Math.abs(gs.dy) > Math.abs(gs.dx),
        onPanResponderMove: (_e, gs) => dragY.setValue(Math.max(0, gs.dy)),
        onPanResponderRelease: (_e, gs) => {
          if (gs.dy > 40 || gs.vy > 0.6) runHide();
          else Animated.spring(dragY, { toValue: 0, useNativeDriver: true, tension: 80, friction: 10 }).start();
        },
        onPanResponderTerminate: () =>
          Animated.spring(dragY, { toValue: 0, useNativeDriver: true, tension: 80, friction: 10 }).start(),
      }),
    [dragY, runHide],
  );

  useEffect(() => {
    if (!config) return;

    dismissingRef.current = false;
    opacity.setValue(0);
    translateY.setValue(20);
    dragY.setValue(0);
    progress.setValue(1);

    const duration = config.duration ?? (config.onUndo ? 5000 : 3500);

    Animated.parallel([
      Animated.spring(opacity, { toValue: 1, useNativeDriver: true, tension: 120, friction: 10 }),
      Animated.spring(translateY, { toValue: 0, useNativeDriver: true, tension: 120, friction: 10 }),
    ]).start();

    // El plazo de deshacer se agota a la vista: sin esto, el aviso y la posibilidad de
    // deshacer desaparecen a la vez y sin previo aviso.
    if (config.onUndo) {
      Animated.timing(progress, { toValue: 0, duration, useNativeDriver: false }).start();
    }

    timerRef.current = setTimeout(runHide, duration);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [config]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!config) return null;

  const kind = kindOf(config);
  const failed = kind === "failed";
  const detail = config.subtitle ?? config.amount ?? null;

  const handleUndo = () => {
    config.onUndo?.();
    runHide();
  };
  const handleRetry = () => {
    config.onRetry?.();
    runHide();
  };

  return (
    <Animated.View
      {...panResponder.panHandlers}
      accessibilityLiveRegion="polite"
      style={[
        styles.toast,
        {
          minHeight: HEIGHT[kind],
          /* Sobre la barra: antes tapaba dos íconos de navegación y, por arriba, la fila que
             acababa de cambiar — justo la que uno quiere mirar. */
          bottom: insets.bottom + TAB_BAR_CONTENT_HEIGHT + SPACING.sm,
          opacity,
          transform: [{ translateY: Animated.add(translateY, dragY) }],
        },
        failed && styles.toastFailed,
      ]}
    >
      <View style={styles.body}>
        {/* Sin ícono: una papelera al lado de "se eliminó" repite la palabra en dibujo, y el
            espacio que ocupaba lo gana el texto. */}
        <Text style={[styles.title, failed && styles.titleFailed]} numberOfLines={2}>
          {config.title}
        </Text>
        {detail ? (
          <Text style={styles.detail} numberOfLines={2}>
            {detail}
          </Text>
        ) : null}
      </View>

      {config.onUndo ? (
        <Pressable
          onPress={handleUndo}
          style={({ pressed }) => [styles.action, pressed && styles.actionPressed]}
          accessibilityRole="button"
        >
          <Text style={styles.actionText}>Deshacer</Text>
        </Pressable>
      ) : failed && config.onRetry ? (
        <Pressable
          onPress={handleRetry}
          style={({ pressed }) => [styles.action, pressed && styles.actionPressed]}
          accessibilityRole="button"
        >
          <Text style={styles.actionText}>Reintentar</Text>
        </Pressable>
      ) : null}

      {config.onUndo ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.progress,
            {
              width: progress.interpolate({
                inputRange: [0, 1],
                outputRange: ["0%", "100%"],
              }),
            },
          ]}
        />
      ) : null}
    </Animated.View>
  );
}

interface ToastContextValue {
  show: (config: ToastConfig) => void;
}

const ToastContext = createContext<ToastContextValue>({ show: () => {} });

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [config, setConfig] = useState<ToastConfig | null>(null);
  const setToastVisible = useUiStore((state) => state.setToastVisible);

  const show = useCallback((cfg: ToastConfig) => {
    setConfig(null);
    requestAnimationFrame(() => setConfig(cfg));
  }, []);

  const hide = useCallback(() => setConfig(null), []);

  // El botón flotante sube mientras el aviso está en pantalla, en vez de quedar solapado.
  useEffect(() => {
    setToastVisible(config != null);
  }, [config, setToastVisible]);

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      <DarkMoneyToast config={config} onHide={hide} />
    </ToastContext.Provider>
  );
}

export function useDarkMoneyToast() {
  return useContext(ToastContext);
}

const styles = StyleSheet.create({
  toast: {
    position: "absolute",
    left: 14,
    right: 14,
    borderRadius: 13,
    backgroundColor: SURFACE_BG,
    borderWidth: 1,
    borderColor: "rgba(244,241,236,0.10)",
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    overflow: "hidden",
    zIndex: 9999,
    elevation: 20,
    shadowColor: "#000",
    shadowOpacity: 0.5,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 10 },
  },
  /** El único caso con color: hay algo que el usuario tiene que hacer. */
  toastFailed: { borderColor: "rgba(226,160,126,0.35)" },
  body: { flex: 1, minWidth: 0 },
  title: {
    fontFamily: FONT_FAMILY.bodySemibold,
    fontSize: FONT_SIZE.sm,
    color: COLORS.ink,
  },
  titleFailed: { color: COLORS.rosewood },
  detail: {
    marginTop: 2,
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.xs,
    color: COLORS.storm,
  },
  action: {
    flexShrink: 0,
    minHeight: 34,
    paddingHorizontal: SPACING.md,
    justifyContent: "center",
    borderRadius: 8,
    backgroundColor: UNDO_BG,
  },
  actionPressed: { opacity: 0.7 },
  actionText: {
    fontFamily: FONT_FAMILY.bodySemibold,
    fontSize: FONT_SIZE.sm,
    color: COLORS.ink,
  },
  progress: {
    position: "absolute",
    left: 0,
    bottom: 0,
    height: 2,
    backgroundColor: "rgba(244,241,236,0.35)",
  },
});
