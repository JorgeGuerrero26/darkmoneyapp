import { StyleSheet, Text, View } from "react-native";
import { AlertCircle } from "lucide-react-native";

import { COLORS, FONT_FAMILY, FONT_SIZE, RADIUS, SPACING } from "../../constants/theme";
import type { AiFeatureUsageToday } from "../../services/queries/notification-detection";

type Props = {
  usage: AiFeatureUsageToday[] | undefined;
  threshold?: number;
};

const FEATURE_LABEL: Record<string, string> = {
  "movement-category-ai-suggestion": "categorias",
  "movement-counterparty-ai-suggestion": "contrapartes",
  "movement-description-ai-cleanup": "limpieza de descripcion",
  "movement-risk-ai-explanation": "riesgo",
};

export function AiQuotaWarningBanner({ usage, threshold = 0.85 }: Props) {
  if (!usage?.length) return null;
  const saturated = usage.filter((row) => row.ratio >= threshold);
  if (saturated.length === 0) return null;

  const message = saturated
    .map((row) => {
      const label = FEATURE_LABEL[row.featureKey] ?? row.featureKey;
      return `${label} ${row.used}/${row.limit}`;
    })
    .join(" · ");

  return (
    <View style={styles.root}>
      <AlertCircle size={16} color={COLORS.warning} />
      <View style={styles.body}>
        <Text style={styles.title}>Te quedan pocas sugerencias IA hoy</Text>
        <Text style={styles.detail}>{message}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    marginHorizontal: SPACING.lg,
    marginBottom: SPACING.sm,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    borderRadius: RADIUS.md,
    backgroundColor: "rgba(215, 190, 123, 0.12)",
    borderWidth: 1,
    borderColor: "rgba(215, 190, 123, 0.35)",
    flexDirection: "row",
    alignItems: "flex-start",
    gap: SPACING.sm,
  },
  body: {
    flex: 1,
  },
  title: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.warning,
    fontFamily: FONT_FAMILY.bodySemibold,
    marginBottom: 2,
  },
  detail: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.textDisabled,
    fontFamily: FONT_FAMILY.body,
    lineHeight: 16,
  },
});
