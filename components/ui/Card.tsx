import {
  Pressable,
  StyleSheet,
  View,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { GLASS, RADIUS, SPACING } from "../../constants/theme";

type Props = {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  onPress?: PressableProps["onPress"];
  active?: boolean;
};

export function Card({ children, style, onPress, active = false }: Props) {
  const cardStyle = [
    styles.card,
    active && styles.cardActive,
    style,
  ];

  if (onPress) {
    return (
      <Pressable
        style={({ pressed }) => [...cardStyle, pressed && styles.pressed]}
        onPress={onPress}
      >
        {children}
      </Pressable>
    );
  }

  return <View style={cardStyle}>{children}</View>;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: GLASS.card,
    borderRadius: RADIUS.xl,
    padding: SPACING.lg,
    // Non-uniform borders — top edge brighter (specular reflection of light from above)
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderTopColor: "rgba(255,255,255,0.20)",    // brightest — light hits top
    borderLeftColor: "rgba(255,255,255,0.12)",   // medium — side light
    borderRightColor: "rgba(255,255,255,0.09)",  // slightly dimmer
    borderBottomColor: "rgba(255,255,255,0.05)", // dimmest — opposite to light source
    // Deep diffuse shadow for floating depth
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.48,
    shadowRadius: 20,
    elevation: 10,
  },
  cardActive: {
    backgroundColor: GLASS.cardActive,
    borderTopColor: "rgba(107,228,197,0.38)",
    borderLeftColor: "rgba(107,228,197,0.25)",
    borderRightColor: "rgba(107,228,197,0.20)",
    borderBottomColor: "rgba(107,228,197,0.14)",
  },
  pressed: {
    opacity: 0.80,
  },
});
