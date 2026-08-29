import { useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, Switch, Text, TextInput, View } from "react-native";

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
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { FormOptionRow } from "../ui/FormOptionRow";
import { FormSheetScaffold } from "../ui/FormSheetScaffold";
import { SearchableSelectSheet, type SelectOption } from "../ui/SearchableSelectSheet";
import { SegmentedControl } from "../ui/SegmentedControl";
import { AppearancePickerOverlay, CATEGORY_COLOR_CHOICES } from "./AppearancePickerOverlay";
import { sortByName } from "../../lib/sort-locale";
import {
  CATEGORY_ICON_PICKER_KEYS,
  DEFAULT_CATEGORY_ICON_KEY,
  getLucideIconForCategory,
  iconKeyForFormState,
  normalizeIconLookupKey,
} from "../../lib/category-icons";
import { COLORS, FONT_FAMILY, FONT_SIZE, RADIUS, SPACING, SURFACE } from "../../constants/theme";

// Sin `sortByLabel`: en un segmentado el orden es parte del control, y de más común a menos
// común se lee mejor que alfabético.
const KIND_OPTIONS: { value: CategoryFormInput["kind"]; label: string }[] = [
  { value: "expense", label: "Gastos" },
  { value: "income", label: "Ingresos" },
  { value: "both", label: "Ambos" },
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


  const [name, setName] = useState("");
  const [kind, setKind] = useState<CategoryFormInput["kind"]>("expense");
  const [color, setColor] = useState(KIND_DEFAULT_COLORS.expense);
  const [icon, setIcon] = useState(DEFAULT_CATEGORY_ICON_KEY);
  const [parentId, setParentId] = useState<number | null>(null);
  const [isActive, setIsActive] = useState(true);

  const [nameError, setNameError] = useState("");
  const [showDiscard, setShowDiscard] = useState(false);
  const [appearanceOpen, setAppearanceOpen] = useState(false);
  const [parentOpen, setParentOpen] = useState(false);

  useEffect(() => {
    if (!visible) return;
    if (editCategory) {
      setName(editCategory.name);
      setKind(editCategory.kind);
      setColor(editCategory.color ?? KIND_DEFAULT_COLORS[editCategory.kind]);
      setIcon(iconKeyForFormState(editCategory.icon));
      setParentId(editCategory.parentId ?? null);
      setIsActive(editCategory.isActive);
    } else {
      setName("");
      setKind("expense");
      setColor(KIND_DEFAULT_COLORS.expense);
      setIcon(DEFAULT_CATEGORY_ICON_KEY);
      setParentId(null);
      setIsActive(true);
    }
    setNameError("");
  }, [visible, editCategory]);

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
      isActive !== ec.isActive
    );
  }

  function handleClose() {
    if (isDirty()) setShowDiscard(true);
    else onClose();
  }

  const submittingRef = useRef(false);

  async function handleSubmit() {
    if (submittingRef.current) return; // guard anti-doble-tap: evita duplicados
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


    if (isEditing && editCategory && parentId === editCategory.id) {
      haptics.error();
      showToast("La categoría no puede ser su propia padre", "error");
      return;
    }

    submittingRef.current = true;
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
            // El orden no se edita aquí: se conserva el que ya tenía.
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
          // Al crear lo resuelve el servidor con max(sort_order)+10; nadie elige 280 a conciencia.
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
    } finally {
      submittingRef.current = false;
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

  const iconOptions = useMemo(
    () => CATEGORY_ICON_PICKER_KEYS.map((key) => ({ key, Icon: getLucideIconForCategory(key) })),
    [],
  );

  const isLoading = createMutation.isPending || updateMutation.isPending;

  const parentName = parentOptions.find((option) => option.id === parentId)?.name ?? null;
  const SelectedIcon = getLucideIconForCategory(icon);

  const parentSelectOptions: SelectOption<number | null>[] = [
    { value: null, label: "Ninguna", meta: "Categoría de primer nivel" },
    ...parentOptions.map((option) => ({ value: option.id as number | null, label: option.name })),
  ];

  return (
    <FormSheetScaffold
      visible={visible}
      onClose={handleClose}
      title={isEditing ? "Editar categoría" : "Nueva categoría"}
      submitLabel={isEditing ? "Guardar cambios" : "Crear categoría"}
      onSubmit={handleSubmit}
      submitLoading={isLoading}
      missingLabel={name.trim() ? null : "Falta el nombre"}
      snapHeight={0.92}
      overlay={
        <>
          <AppearancePickerOverlay
            visible={appearanceOpen}
            onClose={() => setAppearanceOpen(false)}
            color={color}
            onColorChange={setColor}
            icon={icon}
            onIconChange={setIcon}
            iconOptions={iconOptions}
            isIconSelected={(optionKey, current) =>
              normalizeIconLookupKey(current) === normalizeIconLookupKey(optionKey)
            }
          />
          <SearchableSelectSheet
            inline
            visible={parentOpen}
            title="Dentro de"
            options={parentSelectOptions}
            value={parentId}
            onChange={setParentId}
            onClose={() => setParentOpen(false)}
          />
          {/* Dentro del sheet: iOS solo presenta un Modal a la vez. */}
          <ConfirmDialog
            inline
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
      }
    >
      {/* Lo obligatorio primero: antes esto vivía tras 400 px de íconos y colores. */}
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

      <SegmentedControl
        label="Se usa para"
        options={KIND_OPTIONS}
        value={kind}
        onChange={changeKind}
      />

      <FormOptionRow
        label="Apariencia"
        value={null}
        placeholder="Cambiar"
        leading={
          <View style={[styles.appearanceSwatch, { borderColor: color }]}>
            <SelectedIcon size={20} color={color} strokeWidth={2} />
          </View>
        }
        onPress={() => setAppearanceOpen(true)}
      />

      {parentOptions.length > 0 ? (
        <FormOptionRow
          label="Dentro de"
          support="Agrupa esta categoría bajo otra"
          value={parentName}
          placeholder="Ninguna"
          onPress={() => setParentOpen(true)}
        />
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
            thumbColor={COLORS.ink}
          />
        </View>
      ) : null}
    </FormSheetScaffold>
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
    backgroundColor: SURFACE.card,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: SURFACE.cardBorder,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    fontSize: FONT_SIZE.md,
    color: COLORS.ink,
  },
  appearanceSwatch: {
    width: 36,
    height: 36,
    borderRadius: RADIUS.md,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  inputError: { borderColor: COLORS.danger },
  fieldError: { fontSize: FONT_SIZE.xs, color: COLORS.danger, marginTop: 4 },
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: SURFACE.card,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: SURFACE.cardBorder,
  },
  switchInfo: { flex: 1, gap: 2, marginRight: SPACING.md },
  switchLabel: { fontSize: FONT_SIZE.sm, fontFamily: FONT_FAMILY.bodyMedium, color: COLORS.ink },
  switchDesc: { fontSize: FONT_SIZE.xs, color: COLORS.storm },
});
