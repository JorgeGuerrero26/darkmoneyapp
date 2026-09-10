import { useEffect, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { BottomSheet } from "../ui/BottomSheet";
import { Button } from "../ui/Button";
import { TextField } from "../ui/TextField";
import { COLORS, FONT_FAMILY, FONT_SIZE, RADIUS, SPACING, SURFACE } from "../../constants/theme";
import { useAuth } from "../../lib/auth-context";
import { useWorkspace } from "../../lib/workspace-context";
import { useToast } from "../../hooks/useToast";
import {
  useCreateSpendTypeMutation,
  useUpdateSpendTypeMutation,
  type SpendType,
} from "../../services/queries/spend-types";

/** Los colores de la maestra. Los mismos tokens de la app: nada de hex sueltos. */
const COLOR_CHOICES = [COLORS.fog, COLORS.income, COLORS.gold, COLORS.expense, COLORS.secondary, COLORS.pro];

type Props = {
  visible: boolean;
  onClose: () => void;
  editSpendType?: SpendType | null;
};

/**
 * Crear o editar un tipo de gasto.
 *
 * Un tipo es un nombre y un color: no hay nada más que preguntar. Por eso el formulario es el
 * nombre arriba y los colores en una fila —no una lista de opciones que abrir— y el botón dice
 * qué falta mientras falte, como en el resto.
 */
export function SpendTypeForm({ visible, onClose, editSpendType }: Props) {
  const { profile } = useAuth();
  const { activeWorkspaceId } = useWorkspace();
  const { showToast } = useToast();
  const createMutation = useCreateSpendTypeMutation(activeWorkspaceId, profile?.id);
  const updateMutation = useUpdateSpendTypeMutation(activeWorkspaceId);

  const [name, setName] = useState("");
  const [color, setColor] = useState<string>(COLOR_CHOICES[0]);
  const isEditing = Boolean(editSpendType);
  const submittingRef = useRef(false);

  useEffect(() => {
    if (!visible) return;
    setName(editSpendType?.name ?? "");
    setColor(editSpendType?.color ?? COLOR_CHOICES[0]);
  }, [visible, editSpendType]);

  async function handleSubmit() {
    const trimmed = name.trim();
    if (!trimmed) return;
    /* Anti-doble-tap: el botón deshabilitado por `loading` no alcanza, porque el estado de React
       llega tarde para dos toques rápidos y se crean dos tipos con el mismo nombre — que además
       choca con el índice único y falla el segundo con un error que el usuario no provocó. */
    if (submittingRef.current) return;
    submittingRef.current = true;
    try {
      if (isEditing && editSpendType) {
        await updateMutation.mutateAsync({ id: editSpendType.id, input: { name: trimmed, color } });
        showToast("Tipo actualizado", "warning");
      } else {
        await createMutation.mutateAsync({ name: trimmed, color });
        showToast("Tipo creado", "success");
      }
      onClose();
    } catch (error) {
      showToast(error instanceof Error ? error.message : "No se pudo guardar", "error");
    } finally {
      submittingRef.current = false;
    }
  }

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title={isEditing ? "Editar tipo" : "Nuevo tipo de gasto"}
      snapHeight={0.5}
      footer={
        <View style={styles.footer}>
          {!name.trim() ? <Text style={styles.note}>Falta el nombre</Text> : null}
          <Button
            label={isEditing ? "Guardar cambios" : "Crear tipo"}
            size="lg"
            onPress={handleSubmit}
            loading={createMutation.isPending || updateMutation.isPending}
          />
        </View>
      }
    >
      <View style={styles.content}>
        <TextField
          style={styles.input}
          value={name}
          onChangeText={setName}
          placeholder="Necesidades, Deseos, Ahorros…"
          placeholderTextColor={COLORS.storm}
          autoFocus={!isEditing}
        />

        <Text style={styles.label}>Color</Text>
        <View style={styles.colors}>
          {COLOR_CHOICES.map((choice) => (
            <Text
              key={choice}
              style={[
                styles.swatch,
                { backgroundColor: choice },
                color === choice && styles.swatchActive,
              ]}
              onPress={() => setColor(choice)}
              accessibilityRole="button"
              accessibilityLabel={`Color ${choice}`}
              accessibilityState={{ selected: color === choice }}
            />
          ))}
        </View>

        <Text style={styles.hint}>
          El tipo dice si el gasto hacía falta. La categoría dice en qué se fue.
        </Text>
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  content: { gap: SPACING.md },
  input: {
    backgroundColor: SURFACE.card,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: SURFACE.cardBorder,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    color: COLORS.ink,
    fontFamily: FONT_FAMILY.bodyMedium,
    fontSize: FONT_SIZE.md,
  },
  label: {
    fontFamily: FONT_FAMILY.bodySemibold,
    fontSize: FONT_SIZE.xs,
    color: COLORS.storm,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  colors: { flexDirection: "row", gap: SPACING.sm, flexWrap: "wrap" },
  swatch: { width: 36, height: 36, borderRadius: RADIUS.full, borderWidth: 2, borderColor: "transparent" },
  swatchActive: { borderColor: COLORS.ink },
  hint: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.xs, color: COLORS.storm, lineHeight: 18 },
  footer: { gap: SPACING.sm },
  note: {
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.xs,
    color: COLORS.storm,
    textAlign: "center",
  },
});
