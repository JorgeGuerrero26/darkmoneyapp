import { memo } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { Card } from "../../../../components/ui/Card";
import {
  COLORS,
  FONT_FAMILY,
  FONT_SIZE,
  RADIUS,
  SPACING,
} from "../../../../constants/theme";

type Props = {
  obligationId: number | null | undefined;
  obligationTitle: string | null;
  subscriptionId: number | null | undefined;
  subscriptionName: string | null;
  canLink: boolean;
  linking: boolean;
  onOpenObligation: (obligationId: number) => void;
  onOpenSubscription: (subscriptionId: number) => void;
  onRequestLink: () => void;
};

export const MovementLinkedOriginCard = memo(function MovementLinkedOriginCard({
  obligationId,
  obligationTitle,
  subscriptionId,
  subscriptionName,
  canLink,
  linking,
  onOpenObligation,
  onOpenSubscription,
  onRequestLink,
}: Props) {
  if (!obligationId && !subscriptionId && !canLink) return null;

  return (
    <Card>
      <Text style={styles.sectionTitle}>Origen</Text>
      {obligationId ? (
        <TouchableOpacity
          style={styles.row}
          onPress={() => onOpenObligation(obligationId)}
          accessibilityRole="link"
          accessibilityLabel={`Abrir crédito o deuda: ${obligationTitle ?? `#${obligationId}`}`}
        >
          <Text style={styles.label}>Credito / Deuda</Text>
          <View style={styles.right}>
            <Text style={styles.value} numberOfLines={1}>
              {obligationTitle ?? `#${obligationId}`}
            </Text>
            <Text style={styles.chevron}>{">"}</Text>
          </View>
        </TouchableOpacity>
      ) : null}
      {subscriptionId ? (
        <TouchableOpacity
          style={styles.row}
          onPress={() => onOpenSubscription(subscriptionId)}
          accessibilityRole="link"
          accessibilityLabel={`Abrir suscripción: ${subscriptionName ?? `#${subscriptionId}`}`}
        >
          <Text style={styles.label}>Suscripcion</Text>
          <View style={styles.right}>
            <Text style={styles.value} numberOfLines={1}>
              {subscriptionName ?? `#${subscriptionId}`}
            </Text>
            <Text style={styles.chevron}>{">"}</Text>
          </View>
        </TouchableOpacity>
      ) : null}
      {canLink ? (
        <TouchableOpacity
          style={styles.linkBtn}
          onPress={onRequestLink}
          accessibilityRole="button"
          accessibilityLabel="Asociar a crédito o deuda"
        >
          <Text style={styles.linkBtnText}>
            {linking ? "Vinculando..." : "+ Asociar a credito / deuda"}
          </Text>
        </TouchableOpacity>
      ) : null}
    </Card>
  );
});

const styles = StyleSheet.create({
  sectionTitle: {
    fontSize: FONT_SIZE.xs,
    fontFamily: FONT_FAMILY.bodySemibold,
    color: COLORS.storm,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: SPACING.sm,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: SPACING.xs,
    gap: SPACING.md,
  },
  label: { fontSize: FONT_SIZE.sm, color: COLORS.storm, flex: 1 },
  right: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.xs,
    flex: 2,
    justifyContent: "flex-end",
  },
  value: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.primary,
    fontFamily: FONT_FAMILY.bodyMedium,
    flexShrink: 1,
  },
  chevron: { fontSize: FONT_SIZE.lg, color: COLORS.primary },
  linkBtn: {
    marginTop: SPACING.sm,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.primary + "55",
    borderStyle: "dashed",
    alignItems: "center",
  },
  linkBtnText: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.primary,
    fontFamily: FONT_FAMILY.bodyMedium,
  },
});
