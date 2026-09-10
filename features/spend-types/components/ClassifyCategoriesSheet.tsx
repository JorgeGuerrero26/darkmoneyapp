import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { ChevronRight } from "lucide-react-native";

import { BottomSheet } from "../../../components/ui/BottomSheet";
import { SearchableSelectSheet, type SelectOption } from "../../../components/ui/SearchableSelectSheet";
import { useToast } from "../../../hooks/useToast";
import { useSetCategoryDefaultSpendTypeMutation } from "../../../services/queries/spend-types";
import type { SpendType } from "../../../services/queries/spend-types";
import type { CategorySummary } from "../../../types/domain";
import { COLORS, FONT_FAMILY, FONT_SIZE, RADIUS, SPACING, SURFACE } from "../../../constants/theme";

type Props = {
  visible: boolean;
  onClose: () => void;
  categories: CategorySummary[];
  spendTypes: SpendType[];
  workspaceId: number | null;
};

/**
 * Ponerle su tipo a cada categoría, de corrido.
 *
 * **Por qué existe teniendo la fila en el formulario de categoría.** El tipo por defecto se pone
 * una vez y para todas: son 21 categorías de gasto y ninguna tiene tipo todavía. Hacerlo por el
 * formulario es entrar y salir 21 veces de un sheet que además pide nombre, color, ícono y
 * padre —cuatro campos que nadie viene a tocar—. Aquí es una lista y un toque por fila.
 *
 * **Se guarda al elegir, sin botón.** Cada fila es un solo campo y no hay nada que confirmar:
 * un "Guardar" al pie obligaría a recordar 21 decisiones para escribirlas al final, y a decidir
 * qué pasa si te sales a mitad.
 */
export function ClassifyCategoriesSheet({ visible, onClose, categories, spendTypes, workspaceId }: Props) {
  const { showToast } = useToast();
  const setDefault = useSetCategoryDefaultSpendTypeMutation(workspaceId);
  const [pickerFor, setPickerFor] = useState<CategorySummary | null>(null);
  /* Lo elegido en esta pasada manda sobre lo que trae la copia local: el snapshot se refresca en
     segundo plano y la fila no puede seguir diciendo "Sin tipo" después de que el usuario ya
     eligió. Si la escritura falla se quita, y la fila vuelve a la verdad. */
  const [elegido, setElegido] = useState<Record<number, number | null>>({});

  const options: SelectOption<number | null>[] = [
    { value: null, label: "Sin tipo", meta: "Se pregunta en cada movimiento" },
    ...spendTypes.map((type) => ({ value: type.id as number | null, label: type.name })),
  ];

  const spendTypeIdOf = (category: CategorySummary) =>
    category.id in elegido ? elegido[category.id] : category.defaultSpendTypeId ?? null;

  const typeOf = (category: CategorySummary) =>
    spendTypes.find((type) => type.id === spendTypeIdOf(category)) ?? null;

  async function choose(category: CategorySummary, spendTypeId: number | null) {
    setElegido((prev) => ({ ...prev, [category.id]: spendTypeId }));
    try {
      await setDefault.mutateAsync({ categoryId: category.id, spendTypeId });
    } catch (error) {
      setElegido((prev) => {
        const next = { ...prev };
        delete next[category.id];
        return next;
      });
      showToast(error instanceof Error ? error.message : "No se pudo guardar", "error");
    }
  }

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title="Clasificar categorías"
      snapHeight={0.92}
      overlay={
        <SearchableSelectSheet
          inline
          visible={pickerFor !== null}
          title={pickerFor ? `${pickerFor.name} es…` : "Tipo"}
          options={options}
          value={pickerFor ? spendTypeIdOf(pickerFor) : null}
          onChange={(value) => {
            if (pickerFor) void choose(pickerFor, value);
          }}
          onClose={() => setPickerFor(null)}
        />
      }
    >
      <Text style={styles.intro}>
        Lo que elijas aquí se rellena solo al usar la categoría, y en cada movimiento se puede
        cambiar: el mercado es necesidad, esa cena del viernes no.
      </Text>

      <View style={styles.group}>
        {categories.map((category, index) => {
          const type = typeOf(category);
          return (
            <Pressable
              key={category.id}
              style={[styles.row, index < categories.length - 1 && styles.rowDivided]}
              onPress={() => setPickerFor(category)}
              accessibilityRole="button"
              accessibilityLabel={`${category.name}: ${type?.name ?? "sin tipo"}`}
            >
              <Text style={styles.name} numberOfLines={1}>{category.name}</Text>
              <View style={styles.value}>
                {type ? (
                  <View style={[styles.dot, { backgroundColor: type.color ?? COLORS.fog }]} />
                ) : null}
                <Text style={[styles.typeName, !type && styles.typePending]} numberOfLines={1}>
                  {type?.name ?? "Sin tipo"}
                </Text>
                <ChevronRight size={16} color={COLORS.storm} strokeWidth={2} />
              </View>
            </Pressable>
          );
        })}
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  intro: {
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.sm,
    color: COLORS.storm,
    lineHeight: 20,
    marginBottom: SPACING.md,
  },
  group: {
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: SURFACE.cardBorder,
    backgroundColor: SURFACE.card,
    overflow: "hidden",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: SPACING.md,
    minHeight: 56,
    paddingHorizontal: SPACING.md,
  },
  rowDivided: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: SURFACE.separator },
  name: { flex: 1, fontFamily: FONT_FAMILY.bodyMedium, fontSize: FONT_SIZE.md, color: COLORS.ink },
  value: { flexDirection: "row", alignItems: "center", gap: SPACING.xs },
  dot: { width: 8, height: 8, borderRadius: RADIUS.full },
  typeName: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.sm, color: COLORS.fog },
  typePending: { color: COLORS.storm },
});
