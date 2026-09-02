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

  /** Cada fila se pinta solo si el taller tiene de dónde elegir. */
  showVendor: boolean;
  vendorLabel: string | null;
  onOpenVendor: () => void;

  /** Sube al formulario principal cuando el cobro se anota solo: deja de ser opcional. */
  showAccount: boolean;
  accountLabel: string | null;
  onOpenAccount: () => void;
  accountSuggestion?: ReactNode;

  showCategory: boolean;
  categoryLabel: string | null;
  onOpenCategory: () => void;
  categorySuggestion?: ReactNode;

  currencyLabel: string;
  onOpenCurrency: () => void;

  startDate: string;
  onChangeStartDate: (value: string) => void;
  endDate: string;
  onChangeEndDate: (value: string) => void;
  /** El fin no puede caer antes del inicio. */
  minimumEndDate?: Date;

  description: string;
  onChangeDescription: (value: string) => void;
  notes: string;
  onChangeNotes: (value: string) => void;
};

/**
 * Los ocho campos opcionales de una suscripción, en su propia hoja.
 *
 * Se desplegaban **dentro** del formulario: el botón de crear se iba fuera de vista y la hoja
 * pasaba de una pantalla a dos y media. Es la regla de la revisión 21 —fila con chevrón abre una
 * hoja, nada se despliega hacia abajo— y la misma pieza que ya usa "Más detalles" de obligaciones.
 *
 * Y se agrupan: sueltas eran ocho tarjetas flotando con tres estilos de etiqueta distintos entre
 * ellas —fila con valor a la derecha, rótulo en mayúsculas encima del campo, y placeholder
 * dentro—. Aquí son dos tarjetas y las notas.
 *
 * Las aclaraciones de las fechas ("solo referencia", "deja vacío si no tiene fin") viven **en su
 * fila**. Estaban en una tarjeta de tres párrafos al principio del formulario, explicando campos
 * que en ese momento no se veían.
 */
export function SubscriptionOptionalsSheet({
  visible,
  onClose,
  showVendor,
  vendorLabel,
  onOpenVendor,
  showAccount,
  accountLabel,
  onOpenAccount,
  accountSuggestion,
  showCategory,
  categoryLabel,
  onOpenCategory,
  categorySuggestion,
  currencyLabel,
  onOpenCurrency,
  startDate,
  onChangeStartDate,
  endDate,
  onChangeEndDate,
  minimumEndDate,
  description,
  onChangeDescription,
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
          {/* No crea la suscripción: vuelve al formulario, donde sigue estando "Crear". */}
          <Button label="Volver al formulario" size="lg" onPress={onClose} />
        </View>
      }
    >
      <View style={styles.group}>
        {showVendor ? (
          <FormOptionRow
            grouped
            label="Proveedor"
            value={vendorLabel}
            placeholder="Ninguno"
            onPress={onOpenVendor}
          />
        ) : null}
        {showAccount ? (
          <FormOptionRow
            grouped
            label="Se paga con"
            value={accountLabel}
            placeholder="Ninguna cuenta"
            onPress={onOpenAccount}
          />
        ) : null}
        {showCategory ? (
          <FormOptionRow
            grouped
            label="Categoría"
            value={categoryLabel}
            placeholder="Ninguna"
            onPress={onOpenCategory}
          />
        ) : null}
        <FormOptionRow grouped last label="Moneda" value={currencyLabel} onPress={onOpenCurrency} />
      </View>

      {accountSuggestion}
      {categorySuggestion}

      <Text style={styles.sectionLabel}>Vigencia</Text>
      <View style={styles.group}>
        <FormDateRow
          grouped
          label="Empezó"
          support="Solo referencia, no afecta los cobros"
          value={startDate}
          onChange={onChangeStartDate}
          placeholder="Sin fecha"
        />
        <FormDateRow
          grouped
          last
          label="Se da de baja"
          support="Deja vacío si no tiene fin"
          value={endDate}
          onChange={onChangeEndDate}
          placeholder="Sin fecha"
          optional
          minimumDate={minimumEndDate}
        />
      </View>

      <Text style={styles.sectionLabel}>Notas</Text>
      <TextField
        style={styles.input}
        value={description}
        onChangeText={onChangeDescription}
        placeholder="Una línea que resuma la suscripción"
        placeholderTextColor={COLORS.storm}
        accessibilityLabel="Resumen de la suscripción"
      />
      <TextField
        style={[styles.input, styles.notes]}
        value={notes}
        onChangeText={onChangeNotes}
        multiline
        textAlignVertical="top"
        placeholder="Lo que no cabe en la línea de arriba"
        placeholderTextColor={COLORS.storm}
        accessibilityLabel="Notas de la suscripción"
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
  notes: { minHeight: 88, paddingTop: SPACING.sm + 2 },
  footer: {
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.md,
    backgroundColor: SURFACE.sheet,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: SURFACE.separator,
  },
});
