import { useEffect, useRef } from "react";
import { Plus } from "lucide-react-native";
import { Animated, StyleSheet, TouchableOpacity, View } from "react-native";
import { COLORS, SPACING } from "../../constants/theme";

type Props = {
  onPress: () => void;
  bottom: number;
};

export function FAB({ onPress, bottom }: Props) {
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
        activeOpacity={0.82}
        accessibilityLabel="Agregar"
      >
        <Plus size={22} color="#05070B" strokeWidth={2.5} />
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  glowWrap: {
    position: "absolute",
    right: SPACING.lg,
    width: 52,
    height: 52,
    borderRadius: 26,
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.55,
    shadowRadius: 18,
    borderWidth: 2.5,
    borderColor: COLORS.primary + "40",
    backgroundColor: "transparent",
  },
  fab: {
    width: "100%",
    height: "100%",
    borderRadius: 26,
    backgroundColor: COLORS.primary,
    alignItems: "center",
    justifyContent: "center",
    elevation: 10,
  },
});
