import { Archive, ArchiveRestore, Trash2, Clock } from "lucide-react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useRef, useState } from "react";
import {
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { format } from "date-fns";
import { es } from "date-fns/locale";

import { useWorkspace } from "../../lib/workspace-context";
import { useAuth } from "../../lib/auth-context";
import { useToast } from "../../hooks/useToast";
import { useHaptics } from "../../hooks/useHaptics";
import { humanizeError } from "../../lib/errors";
import { getAccountIcon, getAccountIconOption, ACCOUNT_ICON_OPTIONS } from "../../lib/account-icons";
import { parseDisplayDate } from "../../lib/date";
import {
  useCreateAccountMutation,
  useUpdateAccountMutation,
  useDeleteAccountMutation,
  useArchiveAccountMutation,
  type AccountFormInput,
} from "../../services/queries/workspace-data";
import type { AccountSummary } from "../../types/domain";
import { BottomSheet } from "../ui/BottomSheet";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { Button } from "../ui/Button";
import { CurrencyInput } from "../ui/CurrencyInput";
import { formatCurrency } from "../ui/AmountDisplay";
import { COLORS, FONT_FAMILY, FONT_SIZE, RADIUS, SPACING, SURFACE } from "../../constants/theme";
import { IconPicker } from "../../features/accounts/components/form/IconPicker";
import { ColorPicker, ACCOUNT_COLORS } from "../../features/accounts/components/form/ColorPicker";
import { AccountTypePicker, ACCOUNT_TYPES, TYPE_PRESETS } from "../../features/accounts/components/form/AccountTypePicker";
import { CurrencyPicker } from "../../features/accounts/components/form/CurrencyPicker";
import { InstitutionPicker } from "../../features/accounts/components/form/InstitutionPicker";

const DRAFT_TTL_MS = 10 * 60 * 1000; // 10 minutes

type Props = {
  visible: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  editAccount?: AccountSummary;
};

export function AccountForm({ visible, onClose, onSuccess, editAccount }: Props) {
  const { activeWorkspaceId, activeWorkspace } = useWorkspace();
  const { user } = useAuth();
  const { showToast } = useToast();
  const haptics = useHaptics();
  const createMutation = useCreateAccountMutation(activeWorkspaceId);
  const updateMutation = useUpdateAccountMutation(activeWorkspaceId);
  const deleteMutation = useDeleteAccountMutation(activeWorkspaceId);
  const archiveMutation = useArchiveAccountMutation(activeWorkspaceId);

  const defaultCurrency = activeWorkspace?.baseCurrencyCode ?? "PEN";

  const [name, setName] = useState("");
  const [type, setType] = useState("bank");
  const [currencyCode, setCurrencyCode] = useState(defaultCurrency);
  const [customCurrency, setCustomCurrency] = useState("");
  const [openingBalance, setOpeningBalance] = useState("0");
  const [includeInNetWorth, setIncludeInNetWorth] = useState(true);
  const [color, setColor] = useState(TYPE_PRESETS["bank"].color);
  const [icon, setIcon] = useState(TYPE_PRESETS["bank"].icon);
  const [institutionCode, setInstitutionCode] = useState<string | null>(null);

  // Track manual customization so type-change presets don't overwrite user's choice
  const colorCustomized = useRef(false);
  const iconCustomized = useRef(false);

  const [nameError, setNameError] = useState("");
  const [discardVisible, setDiscardVisible] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [archiveConfirm, setArchiveConfirm] = useState(false);

  // ── Draft key ────────────────────────────────────────────────────────────
  const draftKey = `account_form_draft_${activeWorkspaceId}_${user?.id ?? ""}`;

  // ── Dirty check ──────────────────────────────────────────────────────────
  function isDirty() {
    if (!editAccount) {
      return name.trim() !== "" || openingBalance !== "0";
    }
    return (
      name.trim() !== editAccount.name ||
      type !== editAccount.type ||
      color !== (editAccount.color ?? TYPE_PRESETS["bank"].color) ||
      icon !== (editAccount.icon ?? TYPE_PRESETS["bank"].icon) ||
      includeInNetWorth !== editAccount.includeInNetWorth ||
      openingBalance !== String(editAccount.openingBalance ?? 0) ||
      institutionCode !== (editAccount.institutionCode ?? null)
    );
  }

  // ── Draft persistence ─────────────────────────────────────────────────────
  const draftTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function saveDraft() {
    if (!visible || editAccount) return; // only for new accounts
    const draft = { name, type, color, icon, currencyCode, customCurrency, openingBalance, includeInNetWorth, institutionCode, ts: Date.now() };
    void AsyncStorage.setItem(draftKey, JSON.stringify(draft));
  }

  async function loadDraft() {
    if (editAccount) return;
    try {
      const raw = await AsyncStorage.getItem(draftKey);
      if (!raw) return;
      const draft = JSON.parse(raw);
      if (!draft || Date.now() - draft.ts > DRAFT_TTL_MS) {
        await AsyncStorage.removeItem(draftKey);
        return;
      }
      setName(draft.name ?? "");
      setType(draft.type ?? "bank");
      setColor(draft.color ?? TYPE_PRESETS["bank"].color);
      setIcon(draft.icon ?? TYPE_PRESETS["bank"].icon);
      setCurrencyCode(draft.currencyCode ?? defaultCurrency);
      setCustomCurrency(draft.customCurrency ?? "");
      setOpeningBalance(draft.openingBalance ?? "0");
      setIncludeInNetWorth(draft.includeInNetWorth ?? true);
      setInstitutionCode(draft.institutionCode ?? null);
      colorCustomized.current = true;
      iconCustomized.current = true;
    } catch { /* ignore */ }
  }

  async function clearDraft() {
    await AsyncStorage.removeItem(draftKey);
  }

  // ── Initialize form ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!visible) return;
    colorCustomized.current = false;
    iconCustomized.current = false;

    if (editAccount) {
      setName(editAccount.name);
      setType(editAccount.type);
      setCurrencyCode(editAccount.currencyCode);
      setOpeningBalance(String(editAccount.openingBalance ?? 0));
      setIncludeInNetWorth(editAccount.includeInNetWorth);
      setColor(editAccount.color ?? TYPE_PRESETS[editAccount.type]?.color ?? ACCOUNT_COLORS[0]);
      const iconVal = editAccount.icon ?? ACCOUNT_ICON_OPTIONS[0].value;
      setIcon(getAccountIconOption(iconVal)?.value ?? ACCOUNT_ICON_OPTIONS[0].value);
      setInstitutionCode(editAccount.institutionCode ?? null);
      colorCustomized.current = true;
      iconCustomized.current = true;
    } else {
      // Reset then try to load draft
      setName("");
      setType("bank");
      setCurrencyCode(defaultCurrency);
      setOpeningBalance("0");
      setIncludeInNetWorth(true);
      setColor(TYPE_PRESETS["bank"].color);
      setIcon(TYPE_PRESETS["bank"].icon);
      setCustomCurrency("");
      setInstitutionCode(null);
      void loadDraft();
    }
    setNameError("");
  }, [editAccount, visible]);

  // ── Debounced draft save ──────────────────────────────────────────────────
  useEffect(() => {
    if (!visible || editAccount) return;
    if (draftTimer.current) clearTimeout(draftTimer.current);
    draftTimer.current = setTimeout(saveDraft, 800);
    return () => { if (draftTimer.current) clearTimeout(draftTimer.current); };
  }, [name, type, color, icon, currencyCode, customCurrency, openingBalance, includeInNetWorth, institutionCode, visible]);

  // ── Type change with preset auto-apply ────────────────────────────────────
  function handleTypeChange(newType: string) {
    const prevPreset = TYPE_PRESETS[type] ?? TYPE_PRESETS["other"];
    const newPreset = TYPE_PRESETS[newType] ?? TYPE_PRESETS["other"];
    setType(newType);
    // Only auto-apply if user hasn't manually customized
    if (!iconCustomized.current || icon === prevPreset.icon) {
      setIcon(newPreset.icon);
      iconCustomized.current = false;
    }
    if (!colorCustomized.current || color === prevPreset.color) {
      setColor(newPreset.color);
      colorCustomized.current = false;
    }
  }

  function handleClose() {
    if (isDirty()) {
      setDiscardVisible(true);
    } else {
      onClose();
    }
  }

  async function handleSubmit() {
    setNameError("");
    if (!name.trim()) {
      haptics.error();
      setNameError("El nombre es obligatorio");
      return;
    }
    const resolvedCurrency = customCurrency.trim().toUpperCase() || currencyCode;
    const parsedBalance = parseFloat(openingBalance);
    const input: AccountFormInput = {
      name: name.trim(),
      type,
      currencyCode: resolvedCurrency,
      openingBalance: isNaN(parsedBalance) ? 0 : parsedBalance,
      includeInNetWorth,
      color,
      icon,
      institutionCode,
    };
    try {
      if (editAccount) {
        await updateMutation.mutateAsync({ id: editAccount.id, input });
        showToast("Cuenta actualizada ✓", "success");
      } else {
        await createMutation.mutateAsync(input);
        await clearDraft();
        showToast("Cuenta creada ✓", "success");
      }
      haptics.success();
      onSuccess?.();
      onClose();
    } catch (err: unknown) {
      haptics.error();
      showToast(humanizeError(err), "error");
    }
  }

  async function handleArchiveToggle() {
    if (!editAccount) return;
    try {
      await archiveMutation.mutateAsync({ id: editAccount.id, archived: !editAccount.isArchived });
      showToast(editAccount.isArchived ? "Cuenta restaurada ✓" : "Cuenta archivada ✓", "success");
      setArchiveConfirm(false);
      onClose();
    } catch (err: unknown) {
      showToast(humanizeError(err), "error");
    }
  }

  const SelectedIcon = getAccountIcon(icon, type);
  const resolvedCurrency = customCurrency.trim().toUpperCase() || currencyCode;

  return (
    <>
      <BottomSheet
        visible={visible}
        onClose={handleClose}
        title={editAccount ? "Editar cuenta" : "Nueva cuenta"}
        snapHeight={0.94}
      >
        {/* Live preview */}
        <View style={styles.previewRow}>
          <View style={[styles.previewIcon, { backgroundColor: color + "33" }]}>
            <SelectedIcon size={28} color={color} />
          </View>
          <View style={styles.previewInfo}>
            <Text style={styles.previewName} numberOfLines={1}>
              {name.trim() || "Nueva cuenta"}
            </Text>
            <Text style={styles.previewType}>
              {ACCOUNT_TYPES.find((t) => t.value === type)?.label ?? type} · {resolvedCurrency}
            </Text>
          </View>
          {editAccount ? (
            <View style={styles.balanceChip}>
              <Text style={styles.balanceChipLabel}>Saldo actual</Text>
              <Text style={[styles.balanceChipAmount, editAccount.currentBalance < 0 && { color: COLORS.expense }]}>
                {formatCurrency(editAccount.currentBalance, editAccount.currencyCode)}
              </Text>
            </View>
          ) : null}
        </View>

        {/* Last activity (edit only) */}
        {editAccount?.lastActivity ? (
          <View style={styles.infoRow}>
            <Clock size={12} color={COLORS.storm} />
            <Text style={styles.infoText}>
              Última actividad: {format(parseDisplayDate(editAccount.lastActivity), "d MMM yyyy", { locale: es })}
            </Text>
          </View>
        ) : null}

        {/* Icon */}
        <IconPicker
          value={icon}
          tint={color}
          onChange={(v) => {
            setIcon(v);
            iconCustomized.current = true;
          }}
        />

        {/* Color */}
        <ColorPicker
          value={color}
          onChange={(c) => {
            setColor(c);
            colorCustomized.current = true;
          }}
        />

        {/* Name */}
        <View>
          <Text style={styles.sectionLabel}>Nombre *</Text>
          <TextInput
            style={[styles.textInput, nameError ? styles.textInputError : null]}
            value={name}
            onChangeText={(t) => { setName(t); setNameError(""); }}
            placeholder="Ej. BCP Soles, Efectivo casa"
            placeholderTextColor={COLORS.storm}
            accessibilityLabel="Nombre de la cuenta"
            accessibilityHint="Campo obligatorio. Ejemplo: BCP Soles."
            returnKeyType="next"
          />
          {nameError ? (
            <Text
              style={styles.fieldError}
              accessibilityLiveRegion="polite"
              accessibilityRole="alert"
            >
              {nameError}
            </Text>
          ) : null}
        </View>

        {/* Type */}
        <AccountTypePicker value={type} onChange={handleTypeChange} />

        {/* Institution (optional) */}
        <InstitutionPicker value={institutionCode} onChange={setInstitutionCode} />

        {/* Currency */}
        <CurrencyPicker
          value={currencyCode}
          customValue={customCurrency}
          onChange={setCurrencyCode}
          onCustomChange={setCustomCurrency}
        />

        {/* Opening balance */}
        <CurrencyInput
          label={editAccount ? "Saldo inicial (base)" : "Saldo inicial"}
          value={openingBalance}
          onChangeText={setOpeningBalance}
          currencyCode={resolvedCurrency}
        />
        {editAccount ? (
          <Text style={styles.openingBalanceHint}>
            El saldo actual se calcula como saldo inicial + movimientos confirmados.
          </Text>
        ) : null}

        {/* Include in net worth */}
        <View style={styles.switchRow}>
          <View style={styles.switchInfo}>
            <Text style={styles.switchLabel}>Incluir en patrimonio neto</Text>
            <Text style={styles.switchDesc}>Afecta el balance total del dashboard</Text>
          </View>
          <Switch
            value={includeInNetWorth}
            onValueChange={setIncludeInNetWorth}
            trackColor={{ false: COLORS.storm + "44", true: COLORS.primary + "88" }}
            thumbColor="#FFFFFF"
          />
        </View>

        {/* Submit */}
        <Button
          label={editAccount ? "Guardar cambios" : "Crear cuenta"}
          onPress={handleSubmit}
          loading={createMutation.isPending || updateMutation.isPending}
          style={styles.submitBtn}
        />

        {/* Archive / restore (only in edit mode) */}
        {editAccount ? (
          <TouchableOpacity
            style={[styles.secondaryBtn, editAccount.isArchived && styles.secondaryBtnActive]}
            onPress={() => setArchiveConfirm(true)}
            activeOpacity={0.8}
          >
            {editAccount.isArchived
              ? <ArchiveRestore size={14} color={COLORS.pine} strokeWidth={2} />
              : <Archive size={14} color={COLORS.storm} strokeWidth={2} />}
            <Text style={[styles.secondaryBtnText, editAccount.isArchived && { color: COLORS.pine }]}>
              {editAccount.isArchived ? "Restaurar cuenta" : "Archivar cuenta"}
            </Text>
          </TouchableOpacity>
        ) : null}

        {/* Permanent delete — only when archived */}
        {editAccount?.isArchived ? (
          <TouchableOpacity
            style={styles.dangerBtn}
            onPress={() => setDeleteConfirm(true)}
            activeOpacity={0.8}
          >
            <Trash2 size={14} color={COLORS.danger} strokeWidth={2} />
            <Text style={styles.dangerBtnText}>Eliminar permanentemente</Text>
          </TouchableOpacity>
        ) : null}
      </BottomSheet>

      {/* Discard changes */}
      <ConfirmDialog
        visible={discardVisible}
        title="¿Descartar cambios?"
        body="Los cambios no guardados se perderán."
        confirmLabel="Descartar"
        cancelLabel="Continuar editando"
        onCancel={() => setDiscardVisible(false)}
        onConfirm={() => { setDiscardVisible(false); onClose(); }}
      />

      {/* Archive / restore confirmation */}
      <ConfirmDialog
        visible={archiveConfirm}
        title={editAccount?.isArchived ? "¿Restaurar cuenta?" : "¿Archivar cuenta?"}
        body={
          editAccount?.isArchived
            ? "La cuenta volverá a aparecer en tu lista activa y en el patrimonio neto."
            : "La cuenta quedará oculta. Sus movimientos históricos se conservarán intactos y podrás restaurarla después."
        }
        confirmLabel={editAccount?.isArchived ? "Sí, restaurar" : "Sí, archivar"}
        cancelLabel="Cancelar"
        onCancel={() => setArchiveConfirm(false)}
        onConfirm={handleArchiveToggle}
      />

      {/* Permanent delete */}
      <ConfirmDialog
        visible={deleteConfirm}
        title="Eliminar cuenta"
        body="Esta acción es irreversible. Si tiene movimientos vinculados, la eliminación fallará y los datos se conservarán."
        confirmLabel="Eliminar"
        cancelLabel="Cancelar"
        onCancel={() => setDeleteConfirm(false)}
        onConfirm={async () => {
          if (!editAccount) return;
          setDeleteConfirm(false);
          try {
            await deleteMutation.mutateAsync(editAccount.id);
            showToast("Cuenta eliminada", "success");
            onClose();
          } catch (err: unknown) {
            showToast(humanizeError(err), "error");
          }
        }}
      />
    </>
  );
}

const styles = StyleSheet.create({
  previewRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.md,
    backgroundColor: SURFACE.card,
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: SURFACE.cardBorder,
  },
  previewIcon: {
    width: 52,
    height: 52,
    borderRadius: RADIUS.lg,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  previewInfo: { flex: 1 },
  previewName: {
    fontFamily: FONT_FAMILY.bodySemibold,
    fontSize: FONT_SIZE.md,
    color: COLORS.ink,
  },
  previewType: {
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.xs,
    color: COLORS.storm,
    marginTop: 2,
  },
  balanceChip: {
    alignItems: "flex-end",
    gap: 2,
    flexShrink: 0,
  },
  balanceChipLabel: {
    fontFamily: FONT_FAMILY.body,
    fontSize: 10,
    color: COLORS.storm,
  },
  balanceChipAmount: {
    fontFamily: FONT_FAMILY.heading,
    fontSize: FONT_SIZE.sm,
    color: COLORS.income,
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 2,
  },
  infoText: {
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.xs,
    color: COLORS.storm,
  },
  openingBalanceHint: {
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.xs,
    color: COLORS.storm,
    fontStyle: "italic",
    paddingHorizontal: 2,
    marginTop: -SPACING.xs,
  },

  sectionLabel: {
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
    paddingVertical: SPACING.sm + 2,
    fontSize: FONT_SIZE.md,
    color: COLORS.ink,
    fontFamily: FONT_FAMILY.body,
  },
  textInputError: { borderColor: COLORS.danger },
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
  submitBtn: { marginTop: SPACING.sm },
  secondaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: SPACING.xs,
    marginTop: SPACING.xs,
    paddingVertical: SPACING.sm + 2,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: SURFACE.cardBorder,
    backgroundColor: SURFACE.separator,
  },
  secondaryBtnActive: {
    borderColor: COLORS.pine + "55",
    backgroundColor: COLORS.pine + "12",
  },
  secondaryBtnText: {
    fontFamily: FONT_FAMILY.bodyMedium,
    fontSize: FONT_SIZE.sm,
    color: COLORS.storm,
  },
  dangerBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: SPACING.xs,
    marginTop: SPACING.xs,
    paddingVertical: SPACING.sm + 2,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.danger + "44",
    backgroundColor: COLORS.danger + "10",
  },
  dangerBtnText: {
    fontFamily: FONT_FAMILY.bodyMedium,
    fontSize: FONT_SIZE.sm,
    color: COLORS.danger,
  },
});
