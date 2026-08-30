import type { ReactNode, RefObject } from "react";
import { ScrollView, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { AlertCircle } from "lucide-react-native";

import { COLORS, FONT_FAMILY, FONT_SIZE, RADIUS, SPACING, SURFACE } from "../../constants/theme";
import { BottomSheet } from "./BottomSheet";
import { Button } from "./Button";

type Props = {
  visible: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  submitLabel: string;
  onSubmit: () => void;
  submitLoading?: boolean;
  submitDisabled?: boolean;
  submitError?: string | null;
  snapHeight?: number;
  footer?: ReactNode;
  contentStyle?: StyleProp<ViewStyle>;
  scrollRef?: RefObject<ScrollView | null>;
  /**
   * Qué falta para poder guardar, en palabras. `null` = no falta nada.
   *
   * "Crear suscripción" vivía al final de 2.400 px, así que para saber si ya podías guardar
   * había que volver a subir a repasar los campos. La barra queda fija abajo y **nombra** lo que
   * falta —"Falta el monto"— en vez de limitarse a apagar el botón, que no dice por qué.
   */
  missingLabel?: string | null;
  /** Capa dentro del mismo Modal: diálogos y selectores. iOS presenta un Modal a la vez. */
  overlay?: ReactNode;
  /** Acción a la izquierda del botón, p. ej. el "?" que abre la explicación. */
  headerAction?: ReactNode;
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
  scrollRef,
  missingLabel,
  overlay,
  headerAction,
}: Props) {
  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title={title}
      snapHeight={snapHeight}
      scrollRef={scrollRef}
      overlay={overlay}
      // Fuera del ScrollView: es lo único que no debe desplazarse.
      footer={
        <View style={styles.submitBar}>
          <Button
            label={submitLabel}
            onPress={onSubmit}
            loading={submitLoading}
            disabled={submitDisabled}
            size="lg"
          />
          {missingLabel ? <Text style={styles.missing}>{missingLabel}</Text> : null}
        </View>
      }
    >
      <View style={[styles.root, contentStyle]}>
        {headerAction}
        {submitError ? (
          <View style={styles.errorBanner}>
            <AlertCircle size={16} color={COLORS.danger} strokeWidth={2} />
            <Text style={styles.errorText}>{submitError}</Text>
          </View>
        ) : null}
        {children}
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
  submitBar: {
    paddingHorizontal: SPACING.xl,
    paddingTop: SPACING.md,
    gap: SPACING.xs,
    backgroundColor: SURFACE.sheet,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: SURFACE.separator,
  },
  missing: {
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.xs,
    color: COLORS.storm,
    textAlign: "center",
  },
});
