import { useEffect, useMemo, useState } from "react";
import { StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from "react-native";

import { useWorkspace } from "../../lib/workspace-context";
import { useAuth } from "../../lib/auth-context";
import { humanizeError } from "../../lib/errors";
import { useToast } from "../../hooks/useToast";
import { useHaptics } from "../../hooks/useHaptics";
import {
  useCreateCategoryMutation,
  useUpdateCategoryMutation,
  useWorkspaceSnapshotQuery,
  type CategoryFormInput,
} from "../../services/queries/workspace-data";
import type { CategoryOverview } from "../../types/domain";
import { BottomSheet } from "../ui/BottomSheet";
import { Button } from "../ui/Button";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { sortByLabel, sortByName } from "../../lib/sort-locale";
import {
  CATEGORY_ICON_PICKER_KEYS,
  DEFAULT_CATEGORY_ICON_KEY,
  getLucideIconForCategory,
  iconKeyForFormState,
  normalizeIconLookupKey,
} from "../../lib/category-icons";
import { COLORS, FONT_FAMILY, FONT_SIZE, GLASS, RADIUS, SPACING } from "../../constants/theme";

const KIND_OPTIONS = sortByLabel([
  { value: "expense", label: "Gasto" },
  { value: "income", label: "Ingreso" },
  { value: "both", label: "Ambos" },
]);

const CATEGORY_COLORS = [
  "#6366F1", "#10B981", "#F59E0B", "#EF4444",
  "#3B82F6", "#8B5CF6", "#EC4899", "#14B8A6",
  "#F97316", "#84CC16",
];

const KIND_DEFAULT_COLORS: Record<CategoryFormInput["kind"], string> = {
  expense: COLORS.expense,
  income: COLORS.income,
  both: COLORS.primary,
};

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
  const haptics = useHaptics();
  const createMutation = useCreateCategoryMutation(activeWorkspaceId);
  const updateMutation = useUpdateCategoryMutation(activeWorkspaceId);
  const { data: snapshot } = useWorkspaceSnapshotQuery(profile, activeWorkspaceId);

  const isEditing = Boolean(editCategory);

  const defaultSortOrderStr = useMemo(() => {
    const nums = (snapshot?.categories ?? []).map((c) => c.sortOrder ?? 0);
    const m = nums.length ? Math.max(...nums) : 0;
    return String(m + 10);
  }, [snapshot?.categories]);

  const [name, setName] = useState("");
  const [kind, setKind] = useState<CategoryFormInput["kind"]>("expense");
  const [color, setColor] = useState(KIND_DEFAULT_COLORS.expense);
  const [icon, setIcon] = useState(DEFAULT_CATEGORY_ICON_KEY);
  const [parentId, setParentId] = useState<number | null>(null);
  const [sortOrder, setSortOrder] = useState(defaultSortOrderStr);
  const [isActive, setIsActive] = useState(true);

  const [nameError, setNameError] = useState("");
  const [showDiscard, setShowDiscard] = useState(false);

  useEffect(() => {
    if (!visible) return;
    if (editCategory) {
      setName(editCategory.name);
      setKind(editCategory.kind);
      setColor(editCategory.color ?? KIND_DEFAULT_COLORS[editCategory.kind]);
      setIcon(iconKeyForFormState(editCategory.icon));
      setParentId(editCategory.parentId ?? null);
      setSortOrder(String(editCategory.sortOrder ?? 0));
      setIsActive(editCategory.isActive);
    } else {
      setName("");
      setKind("expense");
      setColor(KIND_DEFAULT_COLORS.expense);
      setIcon(DEFAULT_CATEGORY_ICON_KEY);
      setParentId(null);
      setSortOrder(defaultSortOrderStr);
      setIsActive(true);
    }
    setNameError("");
  }, [visible, editCategory, defaultSortOrderStr]);

  function changeKind(next: CategoryFormInput["kind"]) {
    const prevDef = KIND_DEFAULT_COLORS[kind];
    if (!color.trim() || color === prevDef) {
      setColor(KIND_DEFAULT_COLORS[next]);
    }
    setKind(next);
  }

  function isDirty(): boolean {
    if (!isEditing) return Boolean(name.trim());
    const ec = editCategory;
    if (!ec) return false;
    return (
      name.trim() !== ec.name.trim() ||
      kind !== ec.kind ||
      color !== (ec.color ?? KIND_DEFAULT_COLORS[ec.kind]) ||
      normalizeIconLookupKey(icon) !== normalizeIconLookupKey(ec.icon ?? DEFAULT_CATEGORY_ICON_KEY) ||
      parentId !== (ec.parentId ?? null) ||
      sortOrder !== String(ec.sortOrder ?? 0) ||
      isActive !== ec.isActive
    );
  }

  function handleClose() {
    if (isDirty()) setShowDiscard(true);
    else onClose();
  }

  async function handleSubmit() {
    setNameError("");
    const trimmed = name.trim();
    if (!trimmed) {
      haptics.error();
      setNameError("El nombre es obligatorio");
      return;
    }
    if (trimmed.length > 80) {
      haptics.error();
      showToast("El nombre no puede superar 80 caracteres", "error");
      return;
    }

    let resolvedSort: number | undefined;
    if (sortOrder.trim() === "") {
      resolvedSort = isEditing && editCategory ? editCategory.sortOrder : undefined;
    } else {
      const so = parseInt(sortOrder, 10);
      if (!Number.isFinite(so) || so < 0) {
        haptics.error();
        showToast("El orden debe ser un número ≥ 0", "error");
        return;
      }
      resolvedSort = so;
    }

    if (isEditing && editCategory && parentId === editCategory.id) {
      haptics.error();
      showToast("La categoría no puede ser su propia padre", "error");
      return;
    }

    try {
      if (isEditing && editCategory) {
        await updateMutation.mutateAsync({
          id: editCategory.id,
          input: {
            name: trimmed,
            kind,
            color: color.trim() || null,
            icon: icon.trim() || null,
            parentId,
            sortOrder: resolvedSort ?? editCategory.sortOrder,
            isActive,
          },
        });
        showToast("Categoría actualizada", "success");
      } else {
        await createMutation.mutateAsync({
          name: trimmed,
          kind,
          color: color.trim() || null,
          icon: icon.trim() || null,
          parentId,
          sortOrder: resolvedSort,
          isActive: true,
        });
        showToast("Categoría creada", "success");
      }
      haptics.success();
      onSuccess?.();
      onClose();
    } catch (err: unknown) {
      haptics.error();
      showToast(humanizeError(err), "error");
    }
  }

  const parentOptions = useMemo(() => {
    const raw = (snapshot?.categories ?? []).filter(
      (c) =>
        !c.isSystem &&
        c.id !== editCategory?.id &&
        (c.kind === kind || c.kind === "both" || kind === "both"),
    );
    return sortByName(raw);
  }, [snapshot?.categories, kind, editCategory?.id]);

  const isLoading = createMutation.isPending || updateMutation.isPending;

  return (
    <>
      <BottomSheet
        visible={visible}
        onClose={handleClose}
        title={isEditing ? "Editar categoría" : "Nueva categoría"}
        snapHeight={0.92}
      >
        <View>
          <Text style={styles.label}>Ícono (Lucide, como en la web)</Text>
          <Text style={styles.iconHint}>
            Mismo tipo de iconos que la versión web; se guarda el nombre (ej. home, car, utensils-crossed).
          </Text>
          <View style={styles.iconGrid}>
            {CATEGORY_ICON_PICKER_KEYS.map((key) => {
              const Icon = getLucideIconForCategory(key);
              const selected = normalizeIconLookupKey(icon) === normalizeIconLookupKey(key);
              return (
                <TouchableOpacity
                  key={key}
                  style={[styles.iconBtn, selected && styles.iconBtnActive]}
                  onPress={() => setIcon(key)}
                  accessibilityLabel={`Icono ${key}`}
                >
                  <Icon size={22} color={selected ? COLORS.pine : COLORS.ink} strokeWidth={2} />
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

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

        <View>
          <Text style={styles.label}>Nombre *</Text>
          <TextInput
            style={[styles.textInput, nameError ? styles.inputError : null]}
            value={name}
            onChangeText={(t) => { setName(t); setNameError(""); }}
            placeholder="Ej. Alimentación, Transporte"
            placeholderTextColor={COLORS.textDisabled}
            maxLength={80}
          />
          {nameError ? <Text style={styles.fieldError}>{nameError}</Text> : null}
        </View>

        <View>
          <Text style={styles.label}>Tipo</Text>
          <View style={styles.pillRow}>
            {KIND_OPTIONS.map((k) => (
              <TouchableOpacity
                key={k.value}
                style={[styles.pill, kind === k.value && styles.pillActive]}
                onPress={() => changeKind(k.value as CategoryFormInput["kind"])}
              >
                <Text style={[styles.pillText, kind === k.value && styles.pillTextActive]}>{k.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View>
          <Text style={styles.label}>Orden (sort_order)</Text>
          <TextInput
            style={styles.textInput}
            value={sortOrder}
            onChangeText={setSortOrder}
            placeholder={defaultSortOrderStr}
            placeholderTextColor={COLORS.textDisabled}
            keyboardType="number-pad"
          />
          <Text style={styles.hint}>
            Crear: vacío o 0 → el servidor usa max(sort_order)+10. Editar: vacío mantiene el orden actual.
          </Text>
        </View>

        {parentOptions.length > 0 ? (
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

        {isEditing ? (
          <View style={styles.switchRow}>
            <View style={styles.switchInfo}>
              <Text style={styles.switchLabel}>Categoría activa</Text>
              <Text style={styles.switchDesc}>Las inactivas no aparecen en la mayoría de selectores</Text>
            </View>
            <Switch
              value={isActive}
              onValueChange={setIsActive}
              trackColor={{ false: COLORS.border, true: COLORS.primary }}
              thumbColor="#FFFFFF"
            />
          </View>
        ) : null}

        <Button
          label={isEditing ? "Guardar cambios" : "Crear categoría"}
          onPress={handleSubmit}
          loading={isLoading}
          style={styles.submitBtn}
        />
      </BottomSheet>

      <ConfirmDialog
        visible={showDiscard}
        title="¿Descartar cambios?"
        body="Se perderán los datos ingresados."
        confirmLabel="Descartar"
        cancelLabel="Continuar"
        onCancel={() => setShowDiscard(false)}
        onConfirm={() => {
          setShowDiscard(false);
          onClose();
        }}
      />
    </>
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
  hint: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.storm,
    marginTop: 4,
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
  iconHint: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.storm,
    marginBottom: SPACING.sm,
    lineHeight: 18,
  },
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
  iconBtnActive: { borderColor: COLORS.pine, backgroundColor: COLORS.pine + "18" },
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
  pillTextActive: { color: COLORS.textInverse },
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: GLASS.card,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: GLASS.cardBorder,
  },
  switchInfo: { flex: 1, gap: 2, marginRight: SPACING.md },
  switchLabel: { fontSize: FONT_SIZE.sm, fontFamily: FONT_FAMILY.bodyMedium, color: COLORS.ink },
  switchDesc: { fontSize: FONT_SIZE.xs, color: COLORS.storm },
  submitBtn: { marginTop: SPACING.sm },
});
