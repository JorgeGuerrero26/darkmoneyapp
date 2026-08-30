import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { Button } from "../../../components/ui/Button";
import { DatePickerInput } from "../../../components/ui/DatePickerInput";
import { FormOptionRow } from "../../../components/ui/FormOptionRow";
import { InlineFormSheet } from "../../../components/ui/InlineFormSheet";
import { TextField } from "../../../components/ui/TextField";
import { COLORS, FONT_FAMILY, FONT_SIZE, RADIUS, SPACING, SURFACE } from "../../../constants/theme";

type Props = {
  visible: boolean;
  /** Resumen del plan vigente: "6 cuotas iguales de S/ 166.67". */
  planLabel: string | null;
  /** La operación que hay detrás del plan, para que la cifra no salga de la nada. */
  planHint: string | null;
  onOpenPlan: () => void;

  dueDate: string;
  onChangeDueDate: (value: string) => void;

  interestRate: string;
  onChangeInterestRate: (value: string) => void;

  settlementAccountLabel: string | null;
  onOpenSettlementAccount: () => void;

  description: string;
  onChangeDescription: (value: string) => void;
  notes: string;
  onChangeNotes: (value: string) => void;

  onClose: () => void;
  onDone: () => void;
};

/**
 * Los catorce campos opcionales de una obligación, agrupados.
 *
 * Estaban listados uno debajo del otro en el formulario, con el mismo peso visual que los cuatro
 * obligatorios y seis de ellos diciendo "(opcional)" en su propia etiqueta: registrar que un
 * amigo te debe S/ 200 exigía atravesar tres pantallas de scroll. Es la regla 4 de la plantilla.
 *
 * **"(opcional)" no aparece aquí ni una vez**: lo dice el subtítulo de la fila que abre esta
 * hoja. Y cada valor por defecto se dice **con palabras** —"Sin interés", "Sin fecha",
 * "Ninguna"— porque un campo vacío no aclara si es cero o si el sistema no lo sabe.
 */
export function ObligationDetailsSheet({
  visible,
  planLabel,
  planHint,
  onOpenPlan,
  dueDate,
  onChangeDueDate,
  interestRate,
  onChangeInterestRate,
  settlementAccountLabel,
  onOpenSettlementAccount,
  description,
  onChangeDescription,
  notes,
  onChangeNotes,
  onClose,
  onDone,
}: Props) {
  const [dueOpen, setDueOpen] = useState(false);
  const [rateOpen, setRateOpen] = useState(false);

  const rateValue = interestRate.trim();
  const rateLabel = rateValue && Number(rateValue) > 0 ? `${rateValue} %` : "Sin interés";

  return (
    <InlineFormSheet
      visible={visible}
      title="Más detalles"
      onBack={onClose}
      doneLabel="Listo"
      onDone={onDone}
      footer={
        <View style={styles.footer}>
          {/* No crea la obligación: guarda lo de esta hoja y vuelve al formulario, donde sigue
              estando "Crear obligación". */}
          <Button label="Guardar detalles" size="lg" onPress={onDone} />
        </View>
      }
    >
      <Text style={styles.sectionLabel}>Cómo se paga</Text>
      <View style={styles.group}>
        <FormOptionRow
          grouped
          label="Plan de pagos"
          support={planLabel ?? undefined}
          value={planLabel ? "" : "Sin plan"}
          placeholder="Sin plan"
          onPress={onOpenPlan}
        />
        {planHint ? <Text style={styles.planHint}>{planHint}</Text> : null}
        <FormOptionRow
          grouped
          label="Vence"
          value={dueDate ? dueDate : null}
          placeholder="Sin fecha"
          onPress={() => setDueOpen((open) => !open)}
        />
        <FormOptionRow
          grouped
          label="Tasa de interés"
          value={rateLabel}
          onPress={() => setRateOpen((open) => !open)}
        />
        <FormOptionRow
          grouped
          last
          label="Cuenta de liquidación"
          value={settlementAccountLabel}
          placeholder="Ninguna"
          onPress={onOpenSettlementAccount}
        />
      </View>

      {dueOpen ? (
        <DatePickerInput label="Vence" value={dueDate} onChange={onChangeDueDate} />
      ) : null}
      {rateOpen ? (
        <View style={styles.field}>
          <Text style={styles.fieldLabel}>Tasa de interés</Text>
          <TextField
            style={styles.input}
            value={interestRate}
            onChangeText={onChangeInterestRate}
            keyboardType="decimal-pad"
            placeholder="0.00"
            placeholderTextColor={COLORS.storm}
            accessibilityLabel="Tasa de interés en porcentaje"
          />
        </View>
      ) : null}

      <View style={styles.field}>
        <Text style={styles.fieldLabel}>Descripción</Text>
        <TextField
          style={styles.input}
          value={description}
          onChangeText={onChangeDescription}
          placeholder="Una línea"
          placeholderTextColor={COLORS.storm}
          accessibilityLabel="Descripción de la obligación"
        />
      </View>

      <View style={styles.field}>
        <Text style={styles.fieldLabel}>Notas</Text>
        <TextField
          style={[styles.input, styles.notes]}
          value={notes}
          onChangeText={onChangeNotes}
          multiline
          placeholder="Para lo que no cabe arriba"
          placeholderTextColor={COLORS.storm}
          accessibilityLabel="Notas de la obligación"
        />
      </View>
    </InlineFormSheet>
  );
}

const styles = StyleSheet.create({
  sectionLabel: {
    fontFamily: FONT_FAMILY.bodySemibold,
    fontSize: FONT_SIZE.xs,
    color: COLORS.storm,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  group: {
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: SURFACE.cardBorder,
    backgroundColor: SURFACE.card,
    overflow: "hidden",
  },
  planHint: {
    paddingHorizontal: SPACING.md,
    paddingBottom: SPACING.md,
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.xs,
    color: COLORS.storm,
    lineHeight: 17,
  },
  field: { gap: SPACING.sm },
  fieldLabel: {
    fontFamily: FONT_FAMILY.bodySemibold,
    fontSize: FONT_SIZE.xs,
    color: COLORS.storm,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  input: {
    backgroundColor: SURFACE.card,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: SURFACE.cardBorder,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm + 2,
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.md,
    color: COLORS.ink,
  },
  notes: { minHeight: 88, paddingTop: SPACING.sm + 2, textAlignVertical: "top" },
  footer: {
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.md,
    backgroundColor: SURFACE.sheet,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: SURFACE.separator,
  },
});
