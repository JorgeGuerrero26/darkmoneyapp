import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Animated, StyleSheet, Text, View } from "react-native";
import { useIsFetching, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CloudOff } from "lucide-react-native";
import { useNetworkStatus } from "../../hooks/useNetworkStatus";
import { logWarn } from "../../lib/error-logger";
import { COLORS, FONT_FAMILY, FONT_SIZE, RADIUS, SPACING } from "../../constants/theme";
import {
  MIN_BLOCKED_FOR_NETWORK_WARNING,
  SLOW_AFTER_MS,
  SLOW_CHECK_INTERVAL_MS,
  isBlockingQuery,
} from "../../lib/slow-network-signal";
import { isStartupComplete } from "../../lib/startup-timing";
import { SafeBlurView } from "../ui/SafeBlurView";

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
   *
   * Y hacen falta al menos MIN_BLOCKED_FOR_NETWORK_WARNING: ver por qué ahí.
   */
  const blockingFetches = useIsFetching({ predicate: isBlockingQuery });
  const isBlocked = blockingFetches >= MIN_BLOCKED_FOR_NETWORK_WARNING;
  const [isSlow, setIsSlow] = useState(false);

  const queryClient = useQueryClient();

  useEffect(() => {
    if (!isBlocked) {
      setIsSlow(false);
      return;
    }
    // Solo depende del booleano: así el reloj no se reinicia cada vez que entra o sale una
    // query de la tanda.
    const blockedSince = Date.now();
    // Se reevalúa en vez de decidir una sola vez: durante el arranque en frío no se avisa, y
    // con un setTimeout único un episodio que empieza durante el arranque no volvería a
    // avisar nunca aunque siguiera atascado después.
    const timer = setInterval(() => {
      // Durante el arranque hay muchas queries sin datos por definición y la app ya muestra su
      // propia pantalla de carga. Medido en el iPhone del usuario: arranques de hasta 8034 ms
      // contra un umbral de 8000 — lo cruzaba por 34 milésimas con la red perfecta. Ese era el
      // falso positivo que quedaba.
      if (!isStartupComplete()) return;
      if (Date.now() - blockedSince < SLOW_AFTER_MS) return;

      clearInterval(timer);
      setIsSlow(true);
      // Deja constancia de QUÉ lo disparó. Sin esto el aviso solo se puede depurar
      // adivinando, y adivinar ya costó dos rondas: el usuario lo veía con 143 Mbps de fibra
      // mientras las hipótesis se probaban a ciegas. Mismo patrón que el log de la válvula
      // de bootstrap.
      const culprits = queryClient
        .getQueryCache()
        .findAll()
        .filter((query) => query.state.fetchStatus === "fetching" && isBlockingQuery(query))
        .map((query) => {
          const root = Array.isArray(query.queryKey) ? String(query.queryKey[0]) : String(query.queryKey);
          return `${root}=${query.state.status}/${query.state.fetchStatus}`;
        });
      logWarn("slow-network-notice", `aviso mostrado con ${culprits.length} queries bloqueadas`, {
        blocked: culprits.length,
        queries: culprits.join(" "),
      });
    }, SLOW_CHECK_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [isBlocked, queryClient]);

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
          {isConnected ? "Esto está tardando más de lo normal…" : "Sin conexión"}
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
