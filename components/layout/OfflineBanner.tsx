import { useEffect, useRef, useState } from "react";
import { Animated, StyleSheet, Text } from "react-native";
import { useIsFetching } from "@tanstack/react-query";
import { useNetworkStatus } from "../../hooks/useNetworkStatus";
import { COLORS, FONT_SIZE, SPACING, SURFACE } from "../../constants/theme";

const BANNER_HEIGHT = 32;
/** Segundos con peticiones en vuelo antes de admitir que la red va lenta. */
const SLOW_AFTER_MS = 6000;

export function OfflineBanner() {
  const { isConnected } = useNetworkStatus();

  // "Sin conexión" no cubre el caso real que sufre el usuario: hay red pero las peticiones
  // se arrastran (o los sockets murieron al cambiar de WiFi a datos). Si algo lleva
  // demasiado tiempo cargando, se avisa en vez de dejar spinners mudos.
  const fetching = useIsFetching();
  const isFetchingSomething = fetching > 0;
  const [isSlow, setIsSlow] = useState(false);

  useEffect(() => {
    if (!isFetchingSomething) {
      setIsSlow(false);
      return;
    }
    // Solo depende del booleano: así el temporizador no se reinicia cada vez que entra o
    // sale una query de la tanda.
    const timer = setTimeout(() => setIsSlow(true), SLOW_AFTER_MS);
    return () => clearTimeout(timer);
  }, [isFetchingSomething]);

  const visible = !isConnected || isSlow;
  const anim = useRef(new Animated.Value(visible ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(anim, {
      toValue: visible ? 1 : 0,
      duration: 280,
      useNativeDriver: false,
    }).start();
  }, [visible, anim]);

  const height = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, BANNER_HEIGHT],
  });

  const opacity = anim.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0, 0.7, 1],
  });

  return (
    <Animated.View
      style={[styles.banner, !isConnected ? styles.offline : styles.slow, { height, opacity }]}
    >
      <Text style={[styles.text, isConnected && styles.slowText]} numberOfLines={1}>
        {!isConnected
          ? "Sin conexión — algunos datos pueden estar desactualizados"
          : "Conexión lenta — seguimos intentando…"}
      </Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  banner: {
    paddingHorizontal: SPACING.lg,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  // Sin conexión es un problema; red lenta es solo información, por eso no usa el amarillo
  // de alerta (si no, cada arranque en 3G parecería un error).
  offline: { backgroundColor: COLORS.warning },
  slow: { backgroundColor: SURFACE.card },
  text: {
    color: "#000000",
    fontSize: FONT_SIZE.xs,
    fontWeight: "600",
  },
  slowText: { color: COLORS.storm },
});
