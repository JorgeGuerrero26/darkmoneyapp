import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Plus } from "lucide-react-native";

import { Button } from "../../../../components/ui/Button";
import { CurrencyInput } from "../../../../components/ui/CurrencyInput";
import { ConfirmDialog } from "../../../../components/ui/ConfirmDialog";
import { InlineFormSheet } from "../../../../components/ui/InlineFormSheet";
import { SearchableSelectSheet } from "../../../../components/ui/SearchableSelectSheet";
import { formatCurrency } from "../../../../components/ui/AmountDisplay";
import { COLORS, FONT_FAMILY, FONT_SIZE, RADIUS, SPACING, SURFACE } from "../../../../constants/theme";
import { allocateSplit, splitBlockingReason, splitStatusLabel } from "../../lib/splitAllocation";
import type { SplitLine } from "../../lib/split-movement";
import type { CategorySummary } from "../../../../types/domain";
import type { SpendType } from "../../../../services/queries/spend-types";

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
  /** Los tipos del espacio. Vacío = la maestra no se usa y la fila del tipo no aparece. */
  spendTypes: SpendType[];
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
  spendTypes,
}: Props) {
  const [pickerIndex, setPickerIndex] = useState<number | null>(null);
  const [typePickerIndex, setTypePickerIndex] = useState<number | null>(null);
  /* La fila que se está escribiendo ahora mismo.
     Sin esto, borrar dígito a dígito hasta dejarla vacía la convertía otra vez en "propuesta":
     el campo se desmontaba en mitad del borrado, el teclado se cerraba y volvía a aparecer el
     monto propuesto — justo cuando el usuario estaba vaciándola para escribir el suyo. */
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [triedToSave, setTriedToSave] = useState(false);

  const money = (value: number) => formatCurrency(value, currencyCode);
  const allocation = allocateSplit(lines, totalAmount);
  const status = splitStatusLabel(allocation, money);
  const blocking = splitBlockingReason(lines, allocation);
  /* "Algo que perder" es un monto escrito o una segunda categoría elegida.
     La primera categoría NO cuenta: viene puesta al abrir, heredada de la que ya habías elegido
     en el formulario, así que preguntar por ella sería preguntar por algo que no hiciste aquí. */
  const hasWork =
    lines.some((line) => line.amount.trim() !== "")
    || lines.filter((line) => line.categoryId != null).length > 1;

  /* El mismo criterio que en el formulario y en las métricas: manda el de la parte y, si no
     tiene, el que traiga su categoría. Solo gastos — un ingreso no es necesidad ni deseo. */
  const showTypes = movementType === "expense" && spendTypes.length > 0;

  function effectiveTypeOf(line: SplitLine): SpendType | null {
    if (line.spendTypeId != null) {
      return spendTypes.find((type) => type.id === line.spendTypeId) ?? null;
    }
    const category = categories.find((item) => item.id === line.categoryId);
    if (category?.defaultSpendTypeId == null) return null;
    return spendTypes.find((type) => type.id === category.defaultSpendTypeId) ?? null;
  }

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
      overlay={
        <>
        <ConfirmDialog
          inline
          visible={confirmRemove}
          title="¿Quitar la división?"
          body={`Se pierden las ${lines.length} partes que armaste. El gasto vuelve a ser uno solo, con la categoría que tenía.`}
          confirmLabel="Quitar"
          cancelLabel="Seguir editando"
          onCancel={() => setConfirmRemove(false)}
          onConfirm={() => {
            setConfirmRemove(false);
            onChangeLines(null);
            onClose();
          }}
        />

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

        <SearchableSelectSheet
          inline
          visible={typePickerIndex !== null}
          title="Tipo de esta parte"
          options={[
            {
              value: null as number | null,
              label: "Como su categoría",
              meta: "Cambia solo si esta parte fue distinta",
            },
            ...spendTypes.map((type) => ({ value: type.id as number | null, label: type.name })),
          ]}
          value={typePickerIndex !== null ? lines[typePickerIndex]?.spendTypeId ?? null : null}
          onChange={(value) => {
            if (typePickerIndex !== null) patchLine(typePickerIndex, { spendTypeId: value });
          }}
          onClose={() => setTypePickerIndex(null)}
        />
        </>
      }
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
            const proposed = allocation.proposalIndex === index && focusedIndex !== index;
            return (
              <View key={index} style={[styles.line, index < lines.length - 1 && styles.lineDivided]}>
                {/* Cada renglón se llama por su categoría: "los 62.40 de Alimentación" es como
                    se piensa. "Parte 1" y "Parte 2" numeraban algo sin orden y obligaban a
                    renumerar al borrar una. */}
                <View style={styles.lineCopy}>
                  <Pressable onPress={() => setPickerIndex(index)}>
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

                  {/* Cada parte tiene su categoría, así que también su tipo: repartir una compra
                      entre mercado y antojos es justo el caso en que una mitad hacía falta y la
                      otra no. Solo aparece con la categoría ya elegida — sin ella no hay nada de
                      donde heredar y sería una pregunta suelta. */}
                  {showTypes && category ? (
                    <Pressable
                      style={styles.typeRow}
                      onPress={() => setTypePickerIndex(index)}
                      accessibilityRole="button"
                      accessibilityLabel={`Tipo de gasto de ${category.name}`}
                      hitSlop={6}
                    >
                      <View
                        style={[
                          styles.typeDot,
                          { backgroundColor: effectiveTypeOf(line)?.color ?? COLORS.storm },
                        ]}
                      />
                      <Text style={styles.typeText} numberOfLines={1}>
                        {effectiveTypeOf(line)?.name ?? "Sin tipo"}
                      </Text>
                    </Pressable>
                  ) : null}
                </View>

                {proposed ? (
                  /* La propuesta va en gris hasta que se acepta: es de la app, no tuya. */
                  <Pressable onPress={() => acceptProposal(index)} hitSlop={8}>
                    <Text style={styles.proposal}>{allocation.proposalAmount}</Text>
                  </Pressable>
                ) : (
                  <View style={styles.amountWrap}>
                    <CurrencyInput
                      size="compact"
                      value={line.amount}
                      onChangeText={(value) => patchLine(index, { amount: value })}
                      currencyCode={currencyCode}
                      onFocus={() => setFocusedIndex(index)}
                      onBlur={() => setFocusedIndex((prev) => (prev === index ? null : prev))}
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

        {/* Se pregunta solo si hay algo que perder. Un toque aquí borraba las partes ya armadas
            sin avisar, y el enlace vive a un dedo del botón de guardar. Con las filas todavía
            vacías no hay nada que confirmar: preguntar ahí sería un trámite. */}
        <Pressable
          style={styles.removeRow}
          onPress={() => {
            if (hasWork) { setConfirmRemove(true); return; }
            onChangeLines(null);
            onClose();
          }}
          accessibilityRole="button"
        >
          <Text style={styles.removeLabel}>Quitar la división</Text>
        </Pressable>
      </View>

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
  typeRow: { flexDirection: "row", alignItems: "center", gap: SPACING.xs, paddingTop: 6 },
  typeDot: { width: 7, height: 7, borderRadius: RADIUS.full },
  typeText: { fontFamily: FONT_FAMILY.bodyMedium, fontSize: FONT_SIZE.xs, color: COLORS.fog },
  amountWrap: { width: 148 },
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
