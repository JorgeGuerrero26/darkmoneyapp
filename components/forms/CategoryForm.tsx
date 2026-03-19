import { useEffect, useState } from "react";
import { Alert, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";

import { useWorkspace } from "../../lib/workspace-context";
import { useAuth } from "../../lib/auth-context";
import { humanizeError } from "../../lib/errors";
import { useToast } from "../../hooks/useToast";
import {
  useCreateCategoryMutation,
  useUpdateCategoryMutation,
  useWorkspaceSnapshotQuery,
  type CategoryFormInput,
} from "../../services/queries/workspace-data";
import type { CategoryOverview } from "../../types/domain";
import { BottomSheet } from "../ui/BottomSheet";
import { Button } from "../ui/Button";
import { COLORS, FONT_FAMILY, FONT_SIZE, GLASS, RADIUS, SPACING } from "../../constants/theme";

const KIND_OPTIONS = [
  { value: "expense", label: "Gasto" },
  { value: "income",  label: "Ingreso" },
  { value: "both",    label: "Ambos" },
];

const CATEGORY_COLORS = [
  "#6366F1", "#10B981", "#F59E0B", "#EF4444",
  "#3B82F6", "#8B5CF6", "#EC4899", "#14B8A6",
  "#F97316", "#84CC16",
];

const CATEGORY_ICONS = ["🏠", "🚗", "🍔", "💊", "📚", "✈️", "💰", "🎬", "👔", "🐶", "⚡", "📱"];

type Props = {
  visible: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  editCategory?: CategoryOverview;
};

export function CategoryForm({ visible, onClose, onSuccess, editCategory }: Props) {
  const { activeWorkspaceId } = useWorkspace();
  const { profile } = useAuth();
  const { showToast } = useToast();
  const createMutation = useCreateCategoryMutation(activeWorkspaceId);
  const updateMutation = useUpdateCategoryMutation(activeWorkspaceId);
  const { data: snapshot } = useWorkspaceSnapshotQuery(profile, activeWorkspaceId);

  const isEditing = Boolean(editCategory);

  const [name, setName] = useState("");
  const [kind, setKind] = useState<CategoryFormInput["kind"]>("expense");
  const [color, setColor] = useState(CATEGORY_COLORS[0]);
  const [icon, setIcon] = useState(CATEGORY_ICONS[0]);
  const [parentId, setParentId] = useState<number | null>(null);

  const [nameError, setNameError] = useState("");

  useEffect(() => {
    if (!visible) return;
    if (editCategory) {
      setName(editCategory.name);
      setKind(editCategory.kind);
      setColor(editCategory.color ?? CATEGORY_COLORS[0]);
      setIcon(editCategory.icon ?? CATEGORY_ICONS[0]);
      setParentId(editCategory.parentId ?? null);
    } else {
      setName("");
      setKind("expense");
      setColor(CATEGORY_COLORS[0]);
      setIcon(CATEGORY_ICONS[0]);
      setParentId(null);
    }
    setNameError("");
  }, [visible, editCategory]);

  function handleClose() {
    if (name.trim() && name !== (editCategory?.name ?? "")) {
      Alert.alert("¿Descartar cambios?", "", [
        { text: "Continuar", style: "cancel" },
        { text: "Descartar", style: "destructive", onPress: onClose },
      ]);
    } else {
      onClose();
    }
  }

  async function handleSubmit() {
    setNameError("");
    if (!name.trim()) { setNameError("El nombre es obligatorio"); return; }

    try {
      if (isEditing && editCategory) {
        await updateMutation.mutateAsync({
          id: editCategory.id,
          input: { name: name.trim(), kind, color, icon },
        });
        showToast("Categoría actualizada", "success");
      } else {
        await createMutation.mutateAsync({
          name: name.trim(),
          kind,
          color,
          icon,
          parentId,
        });
        showToast("Categoría creada", "success");
      }
      onSuccess?.();
      onClose();
    } catch (err: unknown) {
      showToast(humanizeError(err), "error");
    }
  }

  // Parent categories (top-level, same kind)
  const parentOptions = (snapshot?.categories ?? []).filter(
    (c) => !c.isSystem && c.id !== editCategory?.id
      && (c.kind === kind || c.kind === "both" || kind === "both"),
  );

  const isLoading = createMutation.isPending || updateMutation.isPending;

  return (
    <BottomSheet
      visible={visible}
      onClose={handleClose}
      title={isEditing ? "Editar categoría" : "Nueva categoría"}
      snapHeight={0.85}
    >
      {/* Icon row */}
      <View>
        <Text style={styles.label}>Ícono</Text>
        <View style={styles.iconGrid}>
          {CATEGORY_ICONS.map((ic) => (
            <TouchableOpacity
              key={ic}
              style={[styles.iconBtn, icon === ic && styles.iconBtnActive]}
              onPress={() => setIcon(ic)}
            >
              <Text style={styles.iconText}>{ic}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Color */}
      <View>
        <Text style={styles.label}>Color</Text>
        <View style={styles.colorRow}>
          {CATEGORY_COLORS.map((c) => (
            <TouchableOpacity
              key={c}
              style={[styles.colorDot, { backgroundColor: c }, color === c && styles.colorDotActive]}
              onPress={() => setColor(c)}
            />
          ))}
        </View>
      </View>

      {/* Name */}
      <View>
        <Text style={styles.label}>Nombre *</Text>
        <TextInput
          style={[styles.textInput, nameError ? styles.inputError : null]}
          value={name}
          onChangeText={(t) => { setName(t); setNameError(""); }}
          placeholder="Ej. Alimentación, Transporte"
          placeholderTextColor={COLORS.textDisabled}
        />
        {nameError ? <Text style={styles.fieldError}>{nameError}</Text> : null}
      </View>

      {/* Kind */}
      <View>
        <Text style={styles.label}>Tipo</Text>
        <View style={styles.pillRow}>
          {KIND_OPTIONS.map((k) => (
            <TouchableOpacity
              key={k.value}
              style={[styles.pill, kind === k.value && styles.pillActive]}
              onPress={() => setKind(k.value as CategoryFormInput["kind"])}
            >
              <Text style={[styles.pillText, kind === k.value && styles.pillTextActive]}>{k.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Parent category (optional, only on create) */}
      {!isEditing && parentOptions.length > 0 ? (
        <View>
          <Text style={styles.label}>Categoría padre (opcional)</Text>
          <View style={styles.pillWrap}>
            <TouchableOpacity
              style={[styles.pill, parentId === null && styles.pillActive]}
              onPress={() => setParentId(null)}
            >
              <Text style={[styles.pillText, parentId === null && styles.pillTextActive]}>Ninguna</Text>
            </TouchableOpacity>
            {parentOptions.map((p) => (
              <TouchableOpacity
                key={p.id}
                style={[styles.pill, parentId === p.id && styles.pillActive]}
                onPress={() => setParentId(p.id)}
              >
                <Text style={[styles.pillText, parentId === p.id && styles.pillTextActive]}>{p.name}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      ) : null}

      <Button
        label={isEditing ? "Guardar cambios" : "Crear categoría"}
        onPress={handleSubmit}
        loading={isLoading}
        style={styles.submitBtn}
      />
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  label: {
    fontSize: FONT_SIZE.xs,
    fontFamily: FONT_FAMILY.bodySemibold,
    color: COLORS.storm,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: SPACING.xs,
  },
  textInput: {
    backgroundColor: GLASS.card,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: GLASS.cardBorder,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    fontSize: FONT_SIZE.md,
    color: COLORS.ink,
  },
  inputError: { borderColor: COLORS.danger },
  fieldError: { fontSize: FONT_SIZE.xs, color: COLORS.danger, marginTop: 4 },
  iconGrid: { flexDirection: "row", flexWrap: "wrap", gap: SPACING.sm },
  iconBtn: {
    width: 44,
    height: 44,
    borderRadius: RADIUS.md,
    backgroundColor: GLASS.card,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "transparent",
  },
  iconBtnActive: { borderColor: COLORS.pine },
  iconText: { fontSize: 22 },
  colorRow: { flexDirection: "row", flexWrap: "wrap", gap: SPACING.sm },
  colorDot: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: "transparent",
  },
  colorDotActive: { borderColor: COLORS.ink, borderWidth: 3 },
  pillRow: { flexDirection: "row", gap: SPACING.sm },
  pillWrap: { flexDirection: "row", flexWrap: "wrap", gap: SPACING.sm },
  pill: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs + 2,
    borderRadius: RADIUS.full,
    backgroundColor: GLASS.card,
    borderWidth: 1,
    borderColor: GLASS.cardBorder,
  },
  pillActive: { backgroundColor: COLORS.pine, borderColor: COLORS.pine },
  pillText: { fontSize: FONT_SIZE.sm, color: COLORS.storm, fontFamily: FONT_FAMILY.bodyMedium },
  pillTextActive: { color: COLORS.canvas },
  submitBtn: { marginTop: SPACING.sm },
});
