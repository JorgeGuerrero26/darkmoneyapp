import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Plus } from "lucide-react-native";

import { Button } from "../../../../components/ui/Button";
import { CurrencyInput } from "../../../../components/ui/CurrencyInput";
import { InlineFormSheet } from "../../../../components/ui/InlineFormSheet";
import { SearchableSelectSheet } from "../../../../components/ui/SearchableSelectSheet";
import { formatCurrency } from "../../../../components/ui/AmountDisplay";
import { COLORS, FONT_FAMILY, FONT_SIZE, RADIUS, SPACING, SURFACE } from "../../../../constants/theme";
import { allocateSplit, splitBlockingReason, splitStatusLabel } from "../../lib/splitAllocation";
import type { SplitLine } from "../../lib/split-movement";
import type { CategorySummary } from "../../../../types/domain";

type Props = {
  visible: boolean;
  onClose: () => void;
  lines: SplitLine[];
  onChangeLines: (lines: SplitLine[] | null) => void;
  categories: CategorySummary[];
  totalAmount: number;
  currencyCode: string;
  /** Cómo se llama el movimiento que se está repartiendo: "Mercado", "Pago de Kevin". */
  movementLabel: string;
  /** Un ingreso también se reparte; lo único que cambia es de qué lado suma en los informes. */
  movementType: "expense" | "income";
};

/**
 * Repartir un movimiento entre varias categorías, en su propia pantalla.
 *
 * **Era un panel que crecía dentro del scroll de "Detalles"**, que ya es una hoja con su propio
 * desplazamiento y su barra al pie: dos superficies con scroll anidadas siempre pelean. Y traía
 * su propia **×** a ocho píxeles de la × de la hoja, con significados distintos —una cierra
 * Detalles, la otra descarta el reparto—. Ahora es una pantalla con vuelta atrás y botón propio,
 * la misma plantilla que "Llegó distinto" y que Opcionales.
 *
 * **Y dividir no es escribir N montos, es repartir uno que ya existe.** El total está decidido;
 * lo único que falta es cuánto va a cada lado, y eso el panel no lo decía nunca: había que
 * restar de cabeza. Ver [[allocateSplit]].
 */
export function SplitCategoriesSheet({
  visible,
  onClose,
  lines,
  onChangeLines,
  categories,
  totalAmount,
  currencyCode,
  movementLabel,
  movementType,
}: Props) {
  const [pickerIndex, setPickerIndex] = useState<number | null>(null);
  const [triedToSave, setTriedToSave] = useState(false);

  const money = (value: number) => formatCurrency(value, currencyCode);
  const allocation = allocateSplit(lines, totalAmount);
  const status = splitStatusLabel(allocation, money);
  const blocking = splitBlockingReason(lines, allocation);

  function patchLine(index: number, patch: Partial<SplitLine>) {
    onChangeLines(lines.map((line, i) => (i === index ? { ...line, ...patch } : line)));
  }

  function acceptProposal(index: number) {
    if (allocation.proposalIndex !== index) return;
    patchLine(index, { amount: allocation.proposalAmount });
  }

  return (
    <InlineFormSheet
      visible={visible}
      title="Dividir en categorías"
      onBack={onClose}
      footer={
        <View style={styles.footer}>
          {triedToSave && blocking ? <Text style={styles.blocking}>{blocking}</Text> : null}
          <Button
            label="Guardar división"
            size="lg"
            onPress={() => {
              /* El motivo se enseña al intentar guardar, no desde el primer pintado: un
                 formulario recién abierto no está mal, está vacío. */
              if (blocking) { setTriedToSave(true); return; }
              onClose();
            }}
          />
        </View>
      }
    >
      <View style={styles.content}>
        <View style={styles.totalRow}>
          <Text style={styles.movement} numberOfLines={1}>{movementLabel}</Text>
          <Text style={[styles.total, movementType === "income" && styles.totalIncome]}>
            {money(totalAmount)}
          </Text>
        </View>

        <View style={styles.track}>
          <View style={[styles.fill, { width: `${allocation.progress * 100}%` }]} />
        </View>

        <View style={styles.statusRow}>
          <Text style={styles.statusLabel}>{status.label}</Text>
          <Text style={[styles.statusValue, status.tone === "over" && styles.statusOver]}>
            {status.value}
          </Text>
        </View>

        <View style={styles.group}>
          {lines.map((line, index) => {
            const category = categories.find((item) => item.id === line.categoryId);
            const proposed = allocation.proposalIndex === index;
            return (
              <View key={index} style={[styles.line, index < lines.length - 1 && styles.lineDivided]}>
                {/* Cada renglón se llama por su categoría: "los 62.40 de Alimentación" es como
                    se piensa. "Parte 1" y "Parte 2" numeraban algo sin orden y obligaban a
                    renumerar al borrar una. */}
                <Pressable style={styles.lineCopy} onPress={() => setPickerIndex(index)}>
                  <Text style={[styles.lineName, !category && styles.lineNamePending]} numberOfLines={1}>
                    {category?.name ?? "Elegir categoría"}
                  </Text>
                  <Text style={styles.lineHint} numberOfLines={1}>
                    {proposed
                      ? `Toca y toma los ${money(allocation.remaining)} que faltan`
                      : category
                        ? "Toca para cambiar"
                        : "Toca para elegir"}
                  </Text>
                </Pressable>

                {proposed ? (
                  /* La propuesta va en gris hasta que se acepta: es de la app, no tuya. */
                  <Pressable onPress={() => acceptProposal(index)} hitSlop={8}>
                    <Text style={styles.proposal}>{allocation.proposalAmount}</Text>
                  </Pressable>
                ) : (
                  <View style={styles.amountWrap}>
                    <CurrencyInput
                      value={line.amount}
                      onChangeText={(value) => patchLine(index, { amount: value })}
                      currencyCode={currencyCode}
                    />
                  </View>
                )}
              </View>
            );
          })}
        </View>

        <Pressable
          style={styles.addRow}
          onPress={() => onChangeLines([...lines, { categoryId: null, amount: "" }])}
          accessibilityRole="button"
        >
          <Plus size={16} color={COLORS.fog} strokeWidth={2} />
          <Text style={styles.addLabel}>Agregar otra categoría</Text>
        </Pressable>

        {/* Al ver dos montos y dos categorías, lo razonable es preguntarse si la cuenta va a
            registrar dos cargos. La respuesta es la diferencia entre corregir un saldo y no. */}
        <Text style={styles.note}>
          Sigue siendo un solo movimiento de {money(totalAmount)} en tu cuenta. Se reparte solo
          para los presupuestos y los informes.
        </Text>

        <Pressable
          style={styles.removeRow}
          onPress={() => { onChangeLines(null); onClose(); }}
          accessibilityRole="button"
        >
          <Text style={styles.removeLabel}>Quitar la división</Text>
        </Pressable>
      </View>

      <SearchableSelectSheet
        inline
        visible={pickerIndex !== null}
        title="Categoría de esta parte"
        options={categories.map((category) => ({ value: category.id as number | null, label: category.name }))}
        value={pickerIndex !== null ? lines[pickerIndex]?.categoryId ?? null : null}
        onChange={(value) => {
          if (pickerIndex !== null) patchLine(pickerIndex, { categoryId: value });
        }}
        onClose={() => setPickerIndex(null)}
      />
    </InlineFormSheet>
  );
}

const styles = StyleSheet.create({
  content: { gap: SPACING.md },
  totalRow: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: SPACING.md },
  movement: { flex: 1, fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.md, color: COLORS.fog },
  total: { fontFamily: FONT_FAMILY.heading, fontSize: FONT_SIZE.xl, color: COLORS.ink },
  totalIncome: { color: COLORS.income },
  track: { height: 4, borderRadius: RADIUS.full, backgroundColor: COLORS.bgInput, overflow: "hidden" },
  fill: { height: "100%", borderRadius: RADIUS.full, backgroundColor: COLORS.fog },
  statusRow: { flexDirection: "row", justifyContent: "space-between", gap: SPACING.md },
  statusLabel: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.sm, color: COLORS.storm },
  statusValue: { fontFamily: FONT_FAMILY.heading, fontSize: FONT_SIZE.sm, color: COLORS.ink },
  statusOver: { color: COLORS.expense },
  group: {
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: SURFACE.cardBorder,
    backgroundColor: SURFACE.card,
    overflow: "hidden",
  },
  line: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.md,
    minHeight: 60,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  lineDivided: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: SURFACE.separator },
  lineCopy: { flex: 1, gap: 2 },
  lineName: { fontFamily: FONT_FAMILY.bodySemibold, fontSize: FONT_SIZE.md, color: COLORS.ink },
  lineNamePending: { fontFamily: FONT_FAMILY.body, color: COLORS.storm },
  lineHint: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.xs, color: COLORS.storm },
  amountWrap: { width: 132 },
  /* #57514A: la propuesta se ve, pero se ve que no es tuya todavía. */
  proposal: { fontFamily: FONT_FAMILY.heading, fontSize: FONT_SIZE.lg, color: "#57514A" },
  addRow: { flexDirection: "row", alignItems: "center", gap: SPACING.sm, paddingVertical: SPACING.sm },
  addLabel: { fontFamily: FONT_FAMILY.bodyMedium, fontSize: FONT_SIZE.md, color: COLORS.fog },
  note: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.xs, color: COLORS.storm, lineHeight: 18 },
  removeRow: { paddingVertical: SPACING.md, marginTop: SPACING.lg },
  removeLabel: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.sm, color: COLORS.storm },
  footer: { gap: SPACING.sm },
  blocking: {
    fontFamily: FONT_FAMILY.bodyMedium,
    fontSize: FONT_SIZE.xs,
    color: COLORS.expense,
    textAlign: "center",
  },
});
