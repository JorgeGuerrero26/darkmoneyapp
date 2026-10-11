import { FormFeedbackProvider, FormSubmitBar } from "../../../components/ui/FormFeedback";
import { requiredField } from "../../../lib/form-field-rules";
import { useEffect, useState } from "react";
import { StyleSheet } from "react-native";

import { BottomSheet } from "../../../components/ui/BottomSheet";
import { COLORS, FONT_FAMILY, FONT_SIZE, RADIUS, SPACING, SURFACE } from "../../../constants/theme";
import { normalizeTemplateName } from "../lib/template-name";
import type { MovementTemplate } from "../../../services/queries/movement-templates";
import { TextField } from "../../../components/ui/TextField";

type Props = {
  template: MovementTemplate | null;
  isPending: boolean;
  onClose: () => void;
  onConfirm: (name: string) => void;
};

/** Renombrar plantilla desde el quick-add (long-press → Renombrar). */
export function RenameTemplateSheet({ template, isPending, onClose, onConfirm }: Props) {
  const [name, setName] = useState("");
  useEffect(() => {
    if (template) setName(template.name);
  }, [template]);

  const normalized = normalizeTemplateName(name);
  return (
    <FormFeedbackProvider visible={Boolean(template)} busy={isPending} fields={{ name: requiredField(name, "Escribe el nombre") }} onSubmit={() => onConfirm(normalized!)}>

    <BottomSheet visible={Boolean(template)} onClose={onClose} title="Renombrar plantilla" snapHeight={0.32} footer={<FormSubmitBar onSubmit={() => onConfirm(normalized!)} loading={isPending} />}>
      <TextField fieldId="name"
        style={styles.input}
        value={name}
        onChangeText={setName}
        placeholder="Nombre de la plantilla"
        placeholderTextColor={COLORS.textMuted}
        autoFocus
        maxLength={80}
      />

    </BottomSheet>
    </FormFeedbackProvider>
  );
}

const styles = StyleSheet.create({
  input: {
    borderWidth: 1,
    borderColor: SURFACE.subtleBorder,
    backgroundColor: SURFACE.card,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    color: COLORS.text,
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.md,
    marginTop: SPACING.xs,
  },
  saveButton: {
    marginTop: SPACING.md,
    borderRadius: RADIUS.lg,
    backgroundColor: COLORS.gold,
    paddingVertical: SPACING.md,
    alignItems: "center",
  },
  saveButtonDisabled: { opacity: 0.5 },
  saveLabel: {
    color: COLORS.textInverse,
    fontFamily: FONT_FAMILY.bodySemibold,
    fontSize: FONT_SIZE.md,
  },
});
