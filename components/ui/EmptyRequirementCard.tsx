import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";

import { COLORS, FONT_FAMILY, FONT_SIZE, RADIUS, SPACING } from "../../constants/theme";
import { Button } from "./Button";

type Props = {
  title: string;
  description: string;
  action?: {
    label: string;
    onPress: () => void;
  };
  style?: StyleProp<ViewStyle>;
};

export function EmptyRequirementCard({ title, description, action, style }: Props) {
  return (
    <View style={[styles.card, style]}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.description}>{description}</Text>
      {action ? (
        <Button
          label={action.label}
          variant="secondary"
          size="sm"
          style={styles.button}
          onPress={action.onPress}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: SPACING.sm,
    padding: SPACING.md,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.warning + "14",
    borderWidth: 1,
    borderColor: COLORS.warning + "44",
  },
  title: {
    fontSize: FONT_SIZE.sm,
    fontFamily: FONT_FAMILY.bodySemibold,
    color: COLORS.ink,
  },
  description: {
    fontSize: FONT_SIZE.sm,
    fontFamily: FONT_FAMILY.body,
    color: COLORS.storm,
    lineHeight: 20,
  },
  button: {
    alignSelf: "flex-start",
  },
});
