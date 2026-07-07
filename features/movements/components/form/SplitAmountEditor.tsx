import { StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { Plus, Split, Trash2, X } from "lucide-react-native";

import { COLORS, FONT_FAMILY, FONT_SIZE, RADIUS, SPACING, SURFACE } from "../../../../constants/theme";
import type { CategorySummary } from "../../../../types/domain";
import { CategoryPicker } from "./MovementChipPickers";
import { validateSplit, type SplitLine } from "../../lib/split-movement";

type Props = {
  lines: SplitLine[] | null;
  onChangeLines: (lines: SplitLine[] | null) => void;
  categories: CategorySummary[];
  totalAmount: number;
  currencyCode: string;
};

/**
 * Editor de división de un gasto en varias categorías. `lines === null` = split
 * apagado (solo muestra el toggle). Cada línea = categoría + monto; la suma debe
 * igualar el monto total del paso 2.
 */
export function SplitAmountEditor({ lines, onChangeLines, categories, totalAmount, currencyCode }: Props) {
  if (lines === null) {
    return (
      <TouchableOpacity
        style={styles.toggle}
        onPress={() => onChangeLines([
          { categoryId: null, amount: "" },
          { categoryId: null, amount: "" },
        ])}
        accessibilityRole="button"
        accessibilityLabel="Dividir el gasto en varias categorías"
      >
        <Split size={14} color={COLORS.primary} />
        <Text style={styles.toggleText}>Dividir en varias categorías</Text>
      </TouchableOpacity>
    );
  }

  const validation = validateSplit(lines, totalAmount);

  function patchLine(index: number, patch: Partial<SplitLine>) {
    onChangeLines(lines!.map((line, i) => (i === index ? { ...line, ...patch } : line)));
  }

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>{`División del gasto (${totalAmount.toLocaleString("es-PE", { maximumFractionDigits: 2 })} ${currencyCode})`}</Text>
        <TouchableOpacity
          onPress={() => onChangeLines(null)}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Cancelar la división"
        >
          <X size={16} color={COLORS.textMuted} />
        </TouchableOpacity>
      </View>

      {lines.map((line, index) => (
        <View key={index} style={styles.lineCard}>
          <View style={styles.lineHeader}>
            <Text style={styles.lineLabel}>{`Parte ${index + 1}`}</Text>
            {lines.length > 2 ? (
              <TouchableOpacity
                onPress={() => onChangeLines(lines.filter((_, i) => i !== index))}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel={`Quitar la parte ${index + 1}`}
              >
                <Trash2 size={14} color={COLORS.danger} />
              </TouchableOpacity>
            ) : null}
          </View>
          <TextInput
            value={line.amount}
            onChangeText={(value) => patchLine(index, { amount: value })}
            keyboardType="decimal-pad"
            placeholder={`Monto (${currencyCode})`}
            placeholderTextColor={COLORS.textMuted}
            style={styles.amountInput}
            accessibilityLabel={`Monto de la parte ${index + 1}`}
          />
          <CategoryPicker
            label={`Categoría de la parte ${index + 1}`}
            categories={categories}
            selectedId={line.categoryId}
            onSelect={(id) => patchLine(index, { categoryId: id })}
          />
        </View>
      ))}

      <TouchableOpacity
        style={styles.addLine}
        onPress={() => onChangeLines([...lines, { categoryId: null, amount: "" }])}
        accessibilityRole="button"
        accessibilityLabel="Agregar otra parte a la división"
      >
        <Plus size={14} color={COLORS.primary} />
        <Text style={styles.addLineText}>Agregar parte</Text>
      </TouchableOpacity>

      <Text style={[styles.status, validation.valid ? styles.statusOk : styles.statusPending]}>
        {validation.valid
          ? `Listo: se crearán ${lines.length} movimientos enlazados.`
          : validation.error ?? ""}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  toggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.xs,
    alignSelf: "flex-start",
    paddingVertical: SPACING.xs,
  },
  toggleText: {
    color: COLORS.primary,
    fontFamily: FONT_FAMILY.bodySemibold,
    fontSize: FONT_SIZE.xs,
  },
  container: {
    gap: SPACING.sm,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: SURFACE.card,
    padding: SPACING.md,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  title: {
    flex: 1,
    color: COLORS.text,
    fontFamily: FONT_FAMILY.bodySemibold,
    fontSize: FONT_SIZE.sm,
  },
  lineCard: {
    gap: SPACING.sm,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderColor: SURFACE.subtleBorder,
    padding: SPACING.sm,
  },
  lineHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  lineLabel: {
    color: COLORS.textMuted,
    fontFamily: FONT_FAMILY.bodyMedium,
    fontSize: FONT_SIZE.xs,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  amountInput: {
    borderRadius: RADIUS.sm,
    backgroundColor: SURFACE.input,
    borderWidth: 1,
    borderColor: COLORS.border,
    color: COLORS.text,
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.sm,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  addLine: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.xs,
    alignSelf: "flex-start",
  },
  addLineText: {
    color: COLORS.primary,
    fontFamily: FONT_FAMILY.bodySemibold,
    fontSize: FONT_SIZE.xs,
  },
  status: {
    fontFamily: FONT_FAMILY.bodyMedium,
    fontSize: FONT_SIZE.xs,
  },
  statusOk: { color: COLORS.income },
  statusPending: { color: COLORS.warning },
});
