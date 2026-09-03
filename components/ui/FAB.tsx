import { useEffect, useRef } from "react";
import { Plus } from "lucide-react-native";
import { Animated, StyleSheet, TouchableOpacity, View } from "react-native";
import { COLORS, RADIUS, SHADOW, SPACING } from "../../constants/theme";
import { useUiStore } from "../../store/ui-store";

/** Lo que sube el botón cuando hay un aviso debajo: su alto máximo más el aire. */
const TOAST_CLEARANCE = 72;

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
  /* El aviso de confirmación se pinta justo encima de la barra y el botón le quedaba solapado.
     Se aparta mientras dure, en vez de competir por el mismo sitio. */
  const toastVisible = useUiStore((state) => state.toastVisible);
  const lift = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.spring(scale, {
      toValue: 1,
      tension: 65,
      friction: 6,
      useNativeDriver: true,
    }).start();
  }, [scale]);

  useEffect(() => {
    Animated.spring(lift, {
      toValue: toastVisible ? -TOAST_CLEARANCE : 0,
      tension: 90,
      friction: 12,
      useNativeDriver: true,
    }).start();
  }, [lift, toastVisible]);

  return (
    <Animated.View style={[styles.glowWrap, { bottom, transform: [{ translateY: lift }, { scale }] }]}>
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
