import { Plus } from "lucide-react-native";
import { StyleSheet, TouchableOpacity } from "react-native";
import { COLORS, SPACING } from "../../constants/theme";

type Props = {
  onPress: () => void;
  bottom: number;
};

export function FAB({ onPress, bottom }: Props) {
  return (
    <TouchableOpacity
      style={[styles.fab, { bottom }]}
      onPress={onPress}
      activeOpacity={0.85}
      accessibilityLabel="Agregar"
    >
      <Plus size={22} color="#05070B" strokeWidth={2.5} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: "absolute",
    right: SPACING.lg,
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: COLORS.primary,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 6,
  },
});
