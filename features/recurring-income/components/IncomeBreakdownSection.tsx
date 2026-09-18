import { Fragment } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { ChevronDown, ChevronUp, Check, Plus, X } from "lucide-react-native";

import { CurrencyInput } from "../../../components/ui/CurrencyInput";
import { TextField } from "../../../components/ui/TextField";
import { COLORS, FONT_FAMILY, FONT_SIZE, RADIUS, SPACING, SURFACE } from "../../../constants/theme";
import {
  availableShortcuts,
  collectDeductions,
  describeVerdict,
  parseMoney,
  verifyBreakdown,
  type DeductionDraft,
} from "../lib/incomeBreakdown";

type Props = {
  open: boolean;
  onToggle: () => void;
  grossAmount: string;
  onChangeGross: (value: string) => void;
  deductions: DeductionDraft[];
  onChangeDeductions: (next: DeductionDraft[]) => void;
  /** El neto tecleado arriba, para la línea de verificación. */
  netAmount: string;
  currencyCode: string;
  formatAmount: (value: number) => string;
};

let seed = 0;
const nextKey = () => `d${(seed += 1)}`;

/**
 * El desglose del sueldo: bruto, descuentos y si cuadra con lo que llega.
 *
 * Vive detrás de una fila propia y **cerrada por defecto**, no dentro de "Opcionales" ni en una
 * pantalla aparte. Dentro de Opcionales se escondería justo lo que el usuario quiere ver; en una
 * pantalla aparte costaría un salto para un dato que se consulta seguido. Cerrada, un alquiler o
 * unas clases —que no tienen descuentos— no ven una fila que no necesitan pedir.
 *
 * Nada de aquí bloquea el guardado. La línea de verificación informa y ya: hay descuentos reales
 * que la boleta no detalla, y exigir el cuadre castigaría al usuario por algo que no controla.
 */
export function IncomeBreakdownSection({
  open,
  onToggle,
  grossAmount,
  onChangeGross,
  deductions,
  onChangeDeductions,
  netAmount,
  currencyCode,
  formatAmount,
}: Props) {
  const verdict = verifyBreakdown(parseMoney(grossAmount), collectDeductions(deductions), parseMoney(netAmount));
  const message = describeVerdict(verdict, formatAmount);
  const shortcuts = availableShortcuts(deductions);

  function addRow(name: string) {
    // "Otro" no nombra un concepto: abre una fila en blanco para escribir el suyo.
    onChangeDeductions([...deductions, { key: nextKey(), name: name === "Otro" ? "" : name, amount: "" }]);
  }

  function updateRow(key: string, patch: Partial<DeductionDraft>) {
    onChangeDeductions(deductions.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  }

  function removeRow(key: string) {
    onChangeDeductions(deductions.filter((row) => row.key !== key));
  }

  return (
    <View style={styles.wrapper}>
      <Pressable
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel="Ver desglose: bruto y descuentos"
        style={styles.toggleRow}
      >
        <Text style={styles.toggleLabel} maxFontSizeMultiplier={1.4}>
          Ver desglose (bruto y descuentos)
        </Text>
        {open ? (
          <ChevronUp size={16} color={COLORS.storm} strokeWidth={2} />
        ) : (
          <ChevronDown size={16} color={COLORS.storm} strokeWidth={2} />
        )}
      </Pressable>

      {open ? (
        <View style={styles.panel}>
          <Text style={styles.sectionLabel} maxFontSizeMultiplier={1.3}>
            Desglose
          </Text>

          <View style={styles.field}>
            <Text style={styles.rowLabel} maxFontSizeMultiplier={1.4}>
              Bruto
            </Text>
            <CurrencyInput value={grossAmount} onChangeText={onChangeGross} currencyCode={currencyCode} />
          </View>

          {deductions.map((row) => (
            <Fragment key={row.key}>
              <View style={styles.deductionRow}>
                <TextField
                  style={styles.nameInput}
                  value={row.name}
                  onChangeText={(value) => updateRow(row.key, { name: value })}
                  placeholder="Concepto"
                  placeholderTextColor={COLORS.storm}
                  accessibilityLabel="Nombre del descuento"
                />
                <View style={styles.amountCell}>
                  <CurrencyInput
                    value={row.amount}
                    onChangeText={(value) => updateRow(row.key, { amount: value })}
                    currencyCode={currencyCode}
                  />
                </View>
                {/* Una equis visible, no un swipe: un desglose se llena una vez al empezar el
                    sueldo y se toca poco después, así que descubrirlo importa más que la
                    velocidad del gesto. */}
                <Pressable
                  onPress={() => removeRow(row.key)}
                  accessibilityRole="button"
                  accessibilityLabel={`Quitar ${row.name || "el descuento"}`}
                  hitSlop={8}
                  style={styles.removeButton}
                >
                  <X size={15} color={COLORS.storm} strokeWidth={2} />
                </Pressable>
              </View>
            </Fragment>
          ))}

          <Pressable
            onPress={() => addRow("Otro")}
            accessibilityRole="button"
            accessibilityLabel="Añadir descuento"
            style={styles.addRow}
          >
            <Plus size={14} color={COLORS.fog} strokeWidth={2} />
            <Text style={styles.addLabel} maxFontSizeMultiplier={1.4}>
              Añadir descuento
            </Text>
          </Pressable>

          {shortcuts.length > 0 ? (
            <View style={styles.chips}>
              {shortcuts.map((label) => (
                <Pressable
                  key={label}
                  onPress={() => addRow(label)}
                  accessibilityRole="button"
                  accessibilityLabel={`Añadir ${label}`}
                  style={styles.chip}
                >
                  <Text style={styles.chipLabel} maxFontSizeMultiplier={1.3}>
                    {label}
                  </Text>
                </Pressable>
              ))}
            </View>
          ) : null}

          {message ? (
            <View style={styles.verdictRow}>
              {verdict.status === "matches" ? (
                <Check size={14} color={COLORS.pine} strokeWidth={2.5} />
              ) : (
                <View style={styles.verdictDot} />
              )}
              <Text
                style={[
                  styles.verdictText,
                  { color: verdict.status === "matches" ? COLORS.fog : COLORS.dangerSoft },
                ]}
                maxFontSizeMultiplier={1.4}
              >
                {verdict.status === "matches"
                  ? `Bruto − descuentos = ${formatAmount(verdict.net)} · ${message}`
                  : message}
              </Text>
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { gap: SPACING.xs },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: SPACING.sm,
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.xs,
  },
  toggleLabel: {
    flex: 1,
    fontFamily: FONT_FAMILY.bodyMedium,
    fontSize: FONT_SIZE.sm,
    color: COLORS.storm,
  },
  panel: {
    gap: SPACING.sm,
    padding: SPACING.md,
    borderRadius: RADIUS.xl,
    backgroundColor: SURFACE.card,
    borderWidth: 1,
    borderColor: SURFACE.cardBorder,
  },
  sectionLabel: {
    fontFamily: FONT_FAMILY.bodySemibold,
    fontSize: FONT_SIZE.xs,
    letterSpacing: 1,
    textTransform: "uppercase",
    color: COLORS.storm,
  },
  field: { gap: SPACING.xs },
  rowLabel: {
    fontFamily: FONT_FAMILY.bodyMedium,
    fontSize: FONT_SIZE.sm,
    color: COLORS.ink,
  },
  deductionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
  },
  nameInput: { flex: 1.1 },
  amountCell: { flex: 1 },
  removeButton: { padding: SPACING.xs },
  addRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.xs,
    paddingVertical: SPACING.xs,
  },
  addLabel: {
    fontFamily: FONT_FAMILY.bodyMedium,
    fontSize: FONT_SIZE.sm,
    color: COLORS.fog,
  },
  chips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: SPACING.xs,
  },
  chip: {
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.sm,
    borderRadius: RADIUS.full,
    backgroundColor: SURFACE.input,
    borderWidth: 1,
    borderColor: SURFACE.inputBorder,
  },
  chipLabel: {
    fontFamily: FONT_FAMILY.bodyMedium,
    fontSize: FONT_SIZE.xs,
    color: COLORS.fog,
  },
  verdictRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: SPACING.xs,
    paddingTop: SPACING.xs,
    borderTopWidth: 1,
    borderTopColor: SURFACE.cardBorder,
  },
  verdictDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: COLORS.dangerSoft,
    marginTop: 6,
  },
  verdictText: {
    flex: 1,
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.xs,
    lineHeight: 17,
  },
});
