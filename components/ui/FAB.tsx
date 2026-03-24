import { Plus } from "lucide-react-native";
import { StyleSheet, TouchableOpacity, View } from "react-native";
import { COLORS, SPACING } from "../../constants/theme";

type Props = {
  onPress: () => void;
  bottom: number;
};

export function FAB({ onPress, bottom }: Props) {
  return (
    <View style={[styles.glowWrap, { bottom }]}>
      <TouchableOpacity
        style={styles.fab}
        onPress={onPress}
        activeOpacity={0.82}
        accessibilityLabel="Agregar"
      >
        <Plus size={22} color="#05070B" strokeWidth={2.5} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  // Wrapper carries the colored glow (iOS shadow + Android halo ring)
  glowWrap: {
    position: "absolute",
    right: SPACING.lg,
    width: 52,
    height: 52,
    borderRadius: 26,
    // iOS: mint glow halo
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.55,
    shadowRadius: 18,
    // Android: outer colored ring
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
