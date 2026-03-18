import { StyleSheet, Text, View } from "react-native";
import { useNetworkStatus } from "../../hooks/useNetworkStatus";
import { COLORS, FONT_SIZE, SPACING } from "../../constants/theme";

export function OfflineBanner() {
  const { isConnected } = useNetworkStatus();

  if (isConnected) return null;

  return (
    <View style={styles.banner}>
      <Text style={styles.text}>Sin conexión — algunos datos pueden estar desactualizados</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    backgroundColor: COLORS.warning,
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.lg,
    alignItems: "center",
  },
  text: {
    color: "#000000",
    fontSize: FONT_SIZE.xs,
    fontWeight: "600",
  },
});
