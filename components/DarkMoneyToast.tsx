import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { AccessibilityInfo, Animated, PanResponder, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AlertTriangle, Check } from "lucide-react-native";

import { COLORS, FONT_FAMILY, FONT_SIZE, SPACING } from "../constants/theme";
import { useUiStore } from "../store/ui-store";
import { SafeBlurView } from "./ui/SafeBlurView";

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
 *
 * **Baja desde arriba** (revisión 40). Antes aparecía abajo, sobre la barra de pestañas, y
 * empujaba el botón + hacia arriba: el snackbar de Material Design, que es un patrón de Android.
 * iOS no tiene aviso propio abajo; confirma con un banner arriba, y ningún control se desplaza.
 * Ahora nada se mueve: el + se queda quieto justo cuando uno va a tocarlo para registrar el
 * siguiente. Se descarta deslizándolo hacia arriba.
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

/** Los cuatro casos. Idénticos salvo quién lleva botón e ícono. */
type ToastKind = "notice" | "undo" | "detail" | "failed";

/** Revisión 41: una sola forma, píldora de 60 de alto, sea cual sea el caso. */
const PILL_HEIGHT = 60;

function kindOf(config: ToastConfig): ToastKind {
  if (config.type === "error") return "failed";
  if (config.onUndo) return "undo";
  if (config.subtitle || config.amount) return "detail";
  return "notice";
}

/**
 * Revisión 41: un gris más claro que el lienzo, casi opaco, sobre desenfoque. Así se lee como capa
 * flotante —un banner del sistema— y no como una tarjeta más de la app. Deshacer va un paso más
 * claro que la píldora: el tono anterior era idéntico a esta superficie y el botón desaparecía.
 */
const SURFACE_BG = "rgba(58,55,51,0.92)";
const UNDO_BG = "rgba(244,241,236,0.10)";

export function DarkMoneyToast({
  config,
  onHide,
}: {
  config: ToastConfig | null;
  onHide: () => void;
}) {
  const insets = useSafeAreaInsets();
  const opacity = useRef(new Animated.Value(0)).current;
  /** Entra y sale por arriba: el valor negativo es "fuera de la pantalla, hacia arriba". */
  const translateY = useRef(new Animated.Value(-20)).current;
  const networkBannerHeight = useUiStore((state) => state.networkBannerHeight);
  const dragY = useRef(new Animated.Value(0)).current;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dismissingRef = useRef(false);

  const runHide = useCallback(() => {
    if (dismissingRef.current) return;
    dismissingRef.current = true;
    if (timerRef.current) clearTimeout(timerRef.current);
    Animated.parallel([
      Animated.timing(opacity, { toValue: 0, duration: 180, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: -24, duration: 180, useNativeDriver: true }),
      Animated.timing(dragY, { toValue: 0, duration: 180, useNativeDriver: true }),
    ]).start(() => {
      dismissingRef.current = false;
      onHide();
    });
  }, [opacity, translateY, dragY, onHide]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        // Hacia arriba, por donde vino. Hacia abajo no se mueve: no hay nada que descubrir ahí.
        onMoveShouldSetPanResponder: (_e, gs) => gs.dy < -6 && Math.abs(gs.dy) > Math.abs(gs.dx),
        onPanResponderMove: (_e, gs) => dragY.setValue(Math.min(0, gs.dy)),
        onPanResponderRelease: (_e, gs) => {
          if (gs.dy < -30 || gs.vy < -0.5) runHide();
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
    translateY.setValue(-20);
    dragY.setValue(0);

    const duration = config.duration ?? (config.onUndo ? 5000 : 3500);

    Animated.parallel([
      Animated.spring(opacity, { toValue: 1, useNativeDriver: true, tension: 120, friction: 10 }),
      Animated.spring(translateY, { toValue: 0, useNativeDriver: true, tension: 120, friction: 10 }),
    ]).start();

    // Sin barra de progreso (revisión 41). Deshacer conserva sus 5 s: sin la barra ya no hay
    // señal de cuánto queda, así que acortarlo iría en contra.

    // Un banner que aparece arriba y se va solo no existe para quien usa lector de pantalla si
    // no se anuncia. El botón de deshacer sigue siendo alcanzable mientras dura.
    AccessibilityInfo.announceForAccessibility(
      [config.title, config.subtitle ?? config.amount].filter(Boolean).join(". "),
    );

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

  // Check en todo lo que salió bien; alerta en el fallo; nada en los avisos informativos, que no
  // confirman ninguna acción.
  const badge = failed ? "alert" : config.type === "info" ? null : "check";

  return (
    <Animated.View
      {...panResponder.panHandlers}
      accessibilityLiveRegion="polite"
      style={[
        styles.shell,
        {
          /* Bajo la barra de estado (la Dynamic Island en iPhone). Si la píldora de red está a
             la vista, debajo de ella: la conexión es el contexto de todo lo demás, y las dos
             comparten franja. */
          top:
            insets.top +
            SPACING.xs +
            (networkBannerHeight > 0 ? networkBannerHeight + SPACING.xs : 0),
          opacity,
          transform: [{ translateY: Animated.add(translateY, dragY) }],
        },
      ]}
    >
      {/* Dos capas: esta recorta el desenfoque a la píldora; la de fuera lleva la sombra, que en
          iOS desaparece bajo overflow: hidden. */}
      <View style={[styles.pill, failed && styles.pillFailed]}>
        <SafeBlurView blur intensity={20} tint="dark" fallbackColor={SURFACE_BG} style={StyleSheet.absoluteFill} />
        <View style={[StyleSheet.absoluteFill, { backgroundColor: SURFACE_BG }]} />
        {badge ? (
          <View style={[styles.badge, badge === "alert" && styles.badgeFailed]}>
            {badge === "alert" ? (
              <AlertTriangle size={16} color={COLORS.rosewood} strokeWidth={2.2} />
            ) : (
              <Check size={16} color={COLORS.pine} strokeWidth={2.6} />
            )}
          </View>
        ) : null}
        <View style={styles.body}>
          {/* El ícono de la izquierda dice si salió bien, no qué se hizo: una papelera al lado
              de "se eliminó" repetiría la palabra en dibujo. */}
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
      </View>
    </Animated.View>
  );
}

interface ToastContextValue {
  show: (config: ToastConfig) => void;
}

const ToastContext = createContext<ToastContextValue>({ show: () => {} });

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [config, setConfig] = useState<ToastConfig | null>(null);

  const show = useCallback((cfg: ToastConfig) => {
    setConfig(null);
    requestAnimationFrame(() => setConfig(cfg));
  }, []);

  const hide = useCallback(() => setConfig(null), []);

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
  /** Posición y sombra. Sin overflow: en iOS lo recortado no proyecta sombra. */
  shell: {
    position: "absolute",
    left: SPACING.md,
    right: SPACING.md,
    borderRadius: PILL_HEIGHT / 2,
    zIndex: 9999,
    elevation: 20,
    // Revisión 41: 0 14px 36px rgba(0,0,0,.6). En RN el radio de sombra es la mitad del blur CSS.
    shadowColor: "#000",
    shadowOpacity: 0.6,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 14 },
  },
  /** La píldora en sí: recorta el desenfoque y lleva el contenido. */
  pill: {
    minHeight: PILL_HEIGHT,
    borderRadius: PILL_HEIGHT / 2,
    borderWidth: 1,
    borderColor: "rgba(244,241,236,0.10)",
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.md,
    paddingLeft: SPACING.sm,
    paddingRight: SPACING.sm,
    paddingVertical: SPACING.sm,
    overflow: "hidden",
  },
  /** El único caso con color: hay algo que el usuario tiene que hacer. */
  pillFailed: { borderColor: "rgba(226,160,126,0.35)" },
  /* 36 y un tinte más leve (12 %, antes 40 al 15 %): a 40 el círculo pesaba más que el texto en
     una píldora de 60 y se leía como un botón oscuro. El check conserva su verde entero. */
  badge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.pine + "1F",
  },
  badgeFailed: { backgroundColor: COLORS.rosewood + "1F" },
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
    minHeight: 44,
    paddingHorizontal: SPACING.lg,
    justifyContent: "center",
    borderRadius: 22,
    backgroundColor: UNDO_BG,
  },
  actionPressed: { opacity: 0.7 },
  actionText: {
    fontFamily: FONT_FAMILY.bodySemibold,
    fontSize: FONT_SIZE.sm,
    color: COLORS.ink,
  },
});
