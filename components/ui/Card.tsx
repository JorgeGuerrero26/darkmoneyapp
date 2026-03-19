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
    borderWidth: 0.5,
    borderColor: GLASS.separator,
  },
  cardActive: {
    backgroundColor: GLASS.cardActive,
    borderColor: "rgba(107,228,197,0.15)",
  },
  pressed: {
    opacity: 0.82,
  },
});
