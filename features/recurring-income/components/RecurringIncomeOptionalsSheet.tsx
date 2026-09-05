import type { ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";

import { Button } from "../../../components/ui/Button";
import { FormDateRow } from "../../../components/ui/FormDateRow";
import { FormOptionRow } from "../../../components/ui/FormOptionRow";
import { InlineFormSheet } from "../../../components/ui/InlineFormSheet";
import { TextField } from "../../../components/ui/TextField";
import { COLORS, FONT_FAMILY, FONT_SIZE, RADIUS, SPACING, SURFACE } from "../../../constants/theme";

type Props = {
  visible: boolean;
  onClose: () => void;

  showPayer: boolean;
  payerLabel: string | null;
  onOpenPayer: () => void;

  showCategory: boolean;
  categoryLabel: string | null;
  onOpenCategory: () => void;
  categorySuggestion?: ReactNode;

  /** Solo si el espacio de trabajo maneja más de una moneda; si no, no hay nada que elegir. */
  showCurrency: boolean;
  currencyLabel: string;
  onOpenCurrency: () => void;

  startDate: string;
  onChangeStartDate: (value: string) => void;
  endDate: string;
  onChangeEndDate: (value: string) => void;
  minimumEndDate?: Date;

  notes: string;
  onChangeNotes: (value: string) => void;
};

/**
 * Lo opcional de un ingreso fijo, en su propia hoja.
 *
 * **Las tres tarjetas de fecha se acaban aquí.** Eran ~570px con acento verde, azul y ámbar —una
 * por dato—, cada una con recuadro de ícono, un párrafo explicativo y **dentro** otra caja con
 * la fecha y su propio calendario: dos niveles de anidación para tres datos, dos de ellos
 * opcionales. Y el ámbar marcaba justo el campo que se puede dejar vacío, cuando ese color se
 * reservó para vencimientos.
 *
 * La que gobierna de verdad —la próxima llegada— se queda arriba con lo obligatorio. Estas dos
 * son la vigencia: desde cuándo existe el ingreso y cuándo deja de esperarse.
 */
export function RecurringIncomeOptionalsSheet({
  visible,
  onClose,
  showPayer,
  payerLabel,
  onOpenPayer,
  showCategory,
  categoryLabel,
  onOpenCategory,
  categorySuggestion,
  showCurrency,
  currencyLabel,
  onOpenCurrency,
  startDate,
  onChangeStartDate,
  endDate,
  onChangeEndDate,
  minimumEndDate,
  notes,
  onChangeNotes,
}: Props) {
  return (
    <InlineFormSheet
      visible={visible}
      title="Opcionales"
      onBack={onClose}
      footer={
        <View style={styles.footer}>
          <Button label="Listo" size="lg" onPress={onClose} />
        </View>
      }
    >
      <View style={styles.group}>
        {showPayer ? (
          <FormOptionRow
            grouped
            /* "Pagador" es palabra de contrato. */
            label="Quién paga"
            value={payerLabel}
            placeholder="Nadie elegido"
            onPress={onOpenPayer}
            last={!showCategory && !showCurrency}
          />
        ) : null}
        {showCategory ? (
          <FormOptionRow
            grouped
            label="Categoría"
            value={categoryLabel}
            placeholder="Sin categoría"
            onPress={onOpenCategory}
            last={!showCurrency}
          />
        ) : null}
        {showCurrency ? (
          <FormOptionRow grouped last label="Moneda" value={currencyLabel} onPress={onOpenCurrency} />
        ) : null}
      </View>

      {categorySuggestion}

      <Text style={styles.sectionLabel}>Vigencia</Text>
      <View style={styles.group}>
        <FormDateRow
          grouped
          label="Desde"
          value={startDate}
          onChange={onChangeStartDate}
          placeholder="La primera llegada"
          optional
        />
        <FormDateRow
          grouped
          last
          label="Hasta"
          value={endDate}
          onChange={onChangeEndDate}
          placeholder="Sin fecha de cierre"
          optional
          minimumDate={minimumEndDate}
        />
      </View>
      <Text style={styles.hint}>Solo si este ingreso empezó antes o termina en una fecha conocida.</Text>

      <Text style={styles.sectionLabel}>Notas</Text>
      <TextField
        style={[styles.input, styles.notes]}
        value={notes}
        onChangeText={onChangeNotes}
        multiline
        textAlignVertical="top"
        placeholder="Para lo que no cabe en el nombre"
        placeholderTextColor={COLORS.storm}
        accessibilityLabel="Notas del ingreso fijo"
      />
    </InlineFormSheet>
  );
}

const styles = StyleSheet.create({
  group: {
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: SURFACE.cardBorder,
    backgroundColor: SURFACE.card,
    overflow: "hidden",
  },
  sectionLabel: {
    fontFamily: FONT_FAMILY.bodySemibold,
    fontSize: FONT_SIZE.xs,
    color: COLORS.storm,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  hint: {
    marginTop: -SPACING.xs,
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.xs,
    color: COLORS.storm,
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
  notes: { minHeight: 96, paddingTop: SPACING.sm + 2 },
  footer: {
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.md,
    backgroundColor: SURFACE.sheet,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: SURFACE.separator,
  },
});
