import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Animated, StyleSheet, Text, View } from "react-native";
import { useIsFetching } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CloudOff } from "lucide-react-native";
import { useNetworkStatus } from "../../hooks/useNetworkStatus";
import { COLORS, FONT_FAMILY, FONT_SIZE, RADIUS, SPACING } from "../../constants/theme";
import { SafeBlurView } from "../ui/SafeBlurView";

/**
 * Tiempo esperando algo que el usuario SÍ está mirando antes de admitir que la red va lenta.
 */
const SLOW_AFTER_MS = 8000;

/**
 * Una query "bloquea" al usuario solo si aún no tiene datos que mostrar. Una refetch en
 * segundo plano de algo ya visible no bloquea nada y no debe disparar el aviso.
 */
export function isBlockingQuery(query: { state: { data: unknown } }): boolean {
  return query.state.data === undefined;
}

export function OfflineBanner() {
  const { isConnected } = useNetworkStatus();
  const insets = useSafeAreaInsets();

  /**
   * Solo cuentan las queries que están cargando y **todavía no tienen datos**: son las que le
   * dejan un esqueleto en pantalla.
   *
   * Con `useIsFetching()` a secas el aviso era un falso positivo constante: cuenta también las
   * refetch en segundo plano de datos ya visibles, así que bastaba una query de fondo para que
   * a los 8 s saliera "conexión lenta" con el dashboard entero ya cargado y 143 Mbps de fibra.
   * El ancho de banda nunca fue el problema: la señal medía lo que no debía.
   */
  const blockingFetches = useIsFetching({ predicate: isBlockingQuery });
  const isBlocked = blockingFetches > 0;
  const [isSlow, setIsSlow] = useState(false);

  useEffect(() => {
    if (!isBlocked) {
      setIsSlow(false);
      return;
    }
    // Solo depende del booleano: así el temporizador no se reinicia cada vez que entra o sale
    // una query de la tanda.
    const timer = setTimeout(() => setIsSlow(true), SLOW_AFTER_MS);
    return () => clearTimeout(timer);
  }, [isBlocked]);

  const visible = !isConnected || isSlow;
  const anim = useRef(new Animated.Value(visible ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(anim, {
      toValue: visible ? 1 : 0,
      duration: 260,
      useNativeDriver: true,
    }).start();
  }, [visible, anim]);

  // Flota sobre el contenido en vez de empujarlo: antes vivía en el flujo y su aparición
  // desplazaba toda la pantalla hacia abajo, que es lo que lo hacía ver pegado con cinta.
  const translateY = anim.interpolate({ inputRange: [0, 1], outputRange: [-16, 0] });

  return (
    <View
      pointerEvents="none"
      style={[styles.overlay, { top: insets.top + SPACING.sm }]}
    >
      <Animated.View style={[styles.pill, { opacity: anim, transform: [{ translateY }] }]}>
        <SafeBlurView
          intensity={26}
          tint="dark"
          fallbackColor="rgba(7,11,20,0.92)"
          style={StyleSheet.absoluteFillObject}
        />
        <View style={styles.pillTint} />
        {isConnected ? (
          <ActivityIndicator size="small" color={COLORS.storm} />
        ) : (
          <CloudOff size={14} color={COLORS.warning} />
        )}
        <Text style={styles.text} numberOfLines={1}>
          {isConnected ? "La red va lenta…" : "Sin conexión"}
        </Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "center",
    zIndex: 130,
  },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.full,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: "rgba(7,11,20,0.92)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.26,
    shadowRadius: 18,
    elevation: 12,
  },
  pillTint: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(5,7,11,0.26)",
  },
  text: {
    color: COLORS.ink,
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.xs,
  },
});
