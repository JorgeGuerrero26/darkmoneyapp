import {
  Pressable,
  StyleSheet,
  View,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { ELEVATION, RADIUS, SPACING, SURFACE } from "../../constants/theme";

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
    backgroundColor: SURFACE.card,
    borderRadius: RADIUS.xl,
    padding: SPACING.lg,
    borderWidth: 1,
    borderColor: SURFACE.cardBorder,
    ...ELEVATION[2],
  },
  cardActive: {
    backgroundColor: SURFACE.cardActive,
    borderColor: SURFACE.cardActiveBorder,
  },
  pressed: {
    opacity: 0.80,
  },
});
