import { Pressable, StyleSheet, Text, View } from "react-native";
import { ChevronDown, ChevronUp, Plus, Trash2 } from "lucide-react-native";

import { FormDateRow } from "../../../components/ui/FormDateRow";
import { TextField } from "../../../components/ui/TextField";
import { COLORS, FONT_FAMILY, FONT_SIZE, RADIUS, SPACING, SURFACE } from "../../../constants/theme";
import type { ScheduledChangeDraft } from "../lib/scheduledChanges";

type Props = {
  open: boolean;
  onToggle: () => void;
  changes: ScheduledChangeDraft[];
  onChange: (next: ScheduledChangeDraft[]) => void;
};

let seed = 0;
const nextKey = () => `sc-new-${(seed += 1)}`;

/**
 * Cambios de monto con fecha: "desde enero me pagan 5.000".
 *
 * Cerrada por defecto, igual que el desglose: un alquiler que no sube no necesita ver la fila.
 * El monto es lo que LLEGA a la cuenta (neto), como el monto principal: la app no calcula
 * retenciones, así que quien conoce el nuevo neto lo escribe.
 */
export function ScheduledChangesSection({ open, onToggle, changes, onChange }: Props) {
  function update(key: string, patch: Partial<ScheduledChangeDraft>) {
    onChange(changes.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  }

  return (
    <View style={styles.wrapper}>
      <Pressable
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel="Cambios de monto programados"
        style={styles.toggleRow}
      >
        <Text style={styles.toggleLabel} maxFontSizeMultiplier={1.4}>
          Cambios de monto (por ejemplo, un aumento)
          {changes.length > 0 ? ` · ${changes.length}` : ""}
        </Text>
        {open ? (
          <ChevronUp size={16} color={COLORS.storm} strokeWidth={2} />
        ) : (
          <ChevronDown size={16} color={COLORS.storm} strokeWidth={2} />
        )}
      </Pressable>

      {open ? (
        <View style={styles.panel}>
          <Text style={styles.hint} maxFontSizeMultiplier={1.4}>
            Desde la fecha que pongas, la proyección usa el nuevo monto en lugar del de arriba. Escribe lo que
            te llegará a la cuenta.
          </Text>

          {changes.map((row) => (
            <View key={row.key} style={styles.card}>
              <FormDateRow fieldId={`change-date-${row.key}`}
                label="Desde"
                value={row.date}
                onChange={(value) => update(row.key, { date: value })}
                placeholder="Elegir fecha"
              />
              <View style={styles.amountRow}>
                <Text style={styles.rowLabel} maxFontSizeMultiplier={1.4}>
                  Llega
                </Text>
                <TextField fieldId={`change-amount-${row.key}`}
                  value={row.amount}
                  onChangeText={(value) => update(row.key, { amount: value })}
                  keyboardType="decimal-pad"
                  placeholder="0.00"
                  placeholderTextColor={COLORS.storm}
                  style={styles.amountInput}
                  accessibilityLabel="Monto que llega desde esa fecha"
                />
                <Pressable
                  onPress={() => onChange(changes.filter((c) => c.key !== row.key))}
                  accessibilityRole="button"
                  accessibilityLabel="Quitar este cambio"
                  hitSlop={10}
                >
                  <Trash2 size={15} color={COLORS.storm} strokeWidth={2} />
                </Pressable>
              </View>
            </View>
          ))}

          <Pressable
            onPress={() => onChange([...changes, { key: nextKey(), date: "", amount: "" }])}
            accessibilityRole="button"
            accessibilityLabel="Añadir cambio de monto"
            style={styles.addRow}
          >
            <Plus size={14} color={COLORS.fog} strokeWidth={2} />
            <Text style={styles.addLabel} maxFontSizeMultiplier={1.4}>
              Añadir cambio
            </Text>
          </Pressable>
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
    paddingVertical: SPACING.xs,
  },
  toggleLabel: { flex: 1, fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.sm, color: COLORS.storm },
  panel: { gap: SPACING.sm },
  hint: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.sm, color: COLORS.storm },
  card: {
    borderRadius: RADIUS.md,
    backgroundColor: SURFACE.input,
    borderWidth: 1,
    borderColor: SURFACE.inputBorder,
    padding: SPACING.sm,
    gap: SPACING.xs,
  },
  amountRow: { flexDirection: "row", alignItems: "center", gap: SPACING.sm },
  rowLabel: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.md, color: COLORS.ink, minWidth: 56 },
  amountInput: { flex: 1 },
  addRow: { flexDirection: "row", alignItems: "center", gap: SPACING.xs, paddingVertical: SPACING.xs },
  addLabel: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.sm, color: COLORS.fog },
});
