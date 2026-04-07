import { useEffect, useRef } from "react";
import { Animated, StyleSheet, Text } from "react-native";
import { useNetworkStatus } from "../../hooks/useNetworkStatus";
import { COLORS, FONT_SIZE, SPACING } from "../../constants/theme";

const BANNER_HEIGHT = 32;

export function OfflineBanner() {
  const { isConnected } = useNetworkStatus();
  const anim = useRef(new Animated.Value(isConnected ? 0 : 1)).current;

  useEffect(() => {
    Animated.timing(anim, {
      toValue: isConnected ? 0 : 1,
      duration: 280,
      useNativeDriver: false,
    }).start();
  }, [isConnected, anim]);

  const height = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, BANNER_HEIGHT],
  });

  const opacity = anim.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0, 0.7, 1],
  });

  return (
    <Animated.View style={[styles.banner, { height, opacity }]}>
      <Text style={styles.text} numberOfLines={1}>
        Sin conexión — algunos datos pueden estar desactualizados
      </Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  banner: {
    backgroundColor: COLORS.warning,
    paddingHorizontal: SPACING.lg,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  text: {
    color: "#000000",
    fontSize: FONT_SIZE.xs,
    fontWeight: "600",
  },
});
