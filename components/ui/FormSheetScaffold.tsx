import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { AlertCircle } from "lucide-react-native";

import { COLORS, FONT_FAMILY, FONT_SIZE, RADIUS, SPACING } from "../../constants/theme";
import { BottomSheet } from "./BottomSheet";
import { Button } from "./Button";

type Props = {
  visible: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  submitLabel: string;
  onSubmit: () => void;
  submitLoading?: boolean;
  submitDisabled?: boolean;
  submitError?: string | null;
  snapHeight?: number;
  footer?: React.ReactNode;
  contentStyle?: StyleProp<ViewStyle>;
};

export function FormSheetScaffold({
  visible,
  onClose,
  title,
  children,
  submitLabel,
  onSubmit,
  submitLoading = false,
  submitDisabled = false,
  submitError,
  snapHeight = 0.9,
  footer,
  contentStyle,
}: Props) {
  return (
    <BottomSheet visible={visible} onClose={onClose} title={title} snapHeight={snapHeight}>
      <View style={[styles.root, contentStyle]}>
        {submitError ? (
          <View style={styles.errorBanner}>
            <AlertCircle size={16} color={COLORS.danger} strokeWidth={2} />
            <Text style={styles.errorText}>{submitError}</Text>
          </View>
        ) : null}
        {children}
        <Button
          label={submitLabel}
          onPress={onSubmit}
          loading={submitLoading}
          disabled={submitDisabled}
          style={styles.submit}
        />
        {footer}
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  root: {
    gap: SPACING.md,
  },
  errorBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: SPACING.sm,
    padding: SPACING.md,
    borderRadius: RADIUS.lg,
    backgroundColor: COLORS.danger + "18",
    borderWidth: 1,
    borderColor: COLORS.danger + "44",
  },
  errorText: {
    flex: 1,
    fontFamily: FONT_FAMILY.bodyMedium,
    fontSize: FONT_SIZE.sm,
    color: COLORS.danger,
    lineHeight: 20,
  },
  submit: {
    marginTop: SPACING.sm,
  },
});
