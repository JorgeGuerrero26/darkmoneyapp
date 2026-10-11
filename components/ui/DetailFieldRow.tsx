import { useRef, type ReactNode } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { ChevronRight } from "lucide-react-native";

import { FieldFeedbackMessage, useFormField, type FieldFeedback } from "./FormFeedback";
import { COLORS, FONT_FAMILY, FONT_SIZE, SPACING, SURFACE } from "../../constants/theme";

export type DetailFieldRowProps = {
  label: string;
  fieldId?: string;
  feedback?: FieldFeedback;
  value: string;
  muted?: boolean;
  action?: boolean;
  onPress?: () => void;
  last?: boolean;
  valueAdornment?: ReactNode;
  valueLines?: number;
};

/** Fila de lectura compartida por los detalles de movimientos y cuentas. */
export function DetailFieldRow({
  label,
  fieldId,
  feedback: providedFeedback,
  value,
  muted = false,
  action = false,
  onPress,
  last = false,
  valueAdornment,
  valueLines = 2,
}: DetailFieldRowProps) {
  const fieldRef = useRef<View>(null);
  const fieldFeedback = useFormField(fieldId, onPress, fieldRef, true);
  const feedback = providedFeedback ?? fieldFeedback;
  const missing = feedback?.kind === "missing";
  const invalid = feedback?.kind === "invalid";
  const body = <>
    <View style={styles.row}>
      <Text style={[styles.label, action && styles.labelAction, invalid && { color: COLORS.dangerStrong }]}>{label}</Text>
      {valueAdornment}
      {missing ? <Text style={{ color: COLORS.warning }}>•</Text> : null}
      <Text style={[styles.value, (muted || action) && styles.valueMuted, missing && { color: COLORS.warning }]} numberOfLines={valueLines}>
        {missing ? feedback.message : value}
      </Text>
      {onPress ? <ChevronRight size={16} color={missing ? COLORS.warning : COLORS.storm} /> : null}
    </View>
    {invalid ? <FieldFeedbackMessage feedback={feedback} /> : null}
  </>;
  const container = [!last && styles.rowDivided, invalid && { backgroundColor: COLORS.dangerStrong + "12" }];
  if (!onPress) return <View style={container}>{body}</View>;
  return <TouchableOpacity ref={fieldRef} style={container} onPress={onPress} activeOpacity={0.78}
    accessibilityRole="button" accessibilityLabel={`${label}: ${missing ? feedback.message : value}`}>{body}</TouchableOpacity>;
}

const styles = StyleSheet.create({
  row: {
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  rowDivided: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: SURFACE.separator,
  },
  label: {
    flex: 1,
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.md,
    color: COLORS.storm,
  },
  value: {
    flexShrink: 1,
    maxWidth: "55%",
    textAlign: "right",
    fontFamily: FONT_FAMILY.bodySemibold,
    fontSize: FONT_SIZE.md,
    color: COLORS.ink,
  },
  labelAction: { fontFamily: FONT_FAMILY.bodySemibold, color: COLORS.ink },
  valueMuted: { fontFamily: FONT_FAMILY.body, color: COLORS.storm },
});
