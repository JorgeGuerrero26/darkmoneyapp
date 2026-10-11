import type { ReactNode, RefObject } from "react";
import { ScrollView, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";


import { SPACING } from "../../constants/theme";
import { BottomSheet } from "./BottomSheet";
import { FormSubmitBar } from "./FormFeedback";

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
        <FormSubmitBar label={submitLabel} onSubmit={onSubmit} loading={submitLoading} disabled={submitDisabled} error={submitError} />
      }
    >
      <View style={[styles.root, contentStyle]}>
        {headerAction}
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
});
