import { useEffect, useRef } from "react";
import { Plus } from "lucide-react-native";
import { Animated, StyleSheet, TouchableOpacity, View } from "react-native";
import { COLORS, RADIUS, SHADOW, SPACING } from "../../constants/theme";

type Props = {
  onPress: () => void;
  bottom: number;
  /** Acción long-press opcional (quick-add menu, etc.). */
  onLongPress?: () => void;
  /** Override del accessibilityLabel para describir mejor el contexto. */
  accessibilityLabel?: string;
  accessibilityHint?: string;
};

export function FAB({ onPress, bottom, onLongPress, accessibilityLabel = "Agregar", accessibilityHint }: Props) {
  const scale = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.spring(scale, {
      toValue: 1,
      tension: 65,
      friction: 6,
      useNativeDriver: true,
    }).start();
  }, [scale]);

  return (
    <Animated.View style={[styles.glowWrap, { bottom, transform: [{ scale }] }]}>
      <TouchableOpacity
        style={styles.fab}
        onPress={onPress}
        onLongPress={onLongPress}
        delayLongPress={350}
        activeOpacity={0.82}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        accessibilityHint={accessibilityHint}
      >
        <Plus size={22} color={COLORS.actionText} strokeWidth={2.5} />
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  // Forma de TARJETA, no de circulo: rima con los radios cerrados del resto de la app. Un
  // circulo perfecto sobre esquinas de 14 se lee como una pieza prestada de otra interfaz.
  glowWrap: {
    position: "absolute",
    right: SPACING.xl,
    width: 58,
    height: 58,
    borderRadius: RADIUS.xl,
    borderWidth: 2.5,
    borderColor: COLORS.action + "26",
    backgroundColor: "transparent",
    ...SHADOW.floating,
  },
  fab: {
    width: "100%",
    height: "100%",
    borderRadius: RADIUS.xl,
    backgroundColor: COLORS.action,
    alignItems: "center",
    justifyContent: "center",
  },
});
