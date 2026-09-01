import { Clock, Wallet } from "lucide-react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  StyleSheet,
  Switch,
  Text,
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
  type AccountFormInput,
} from "../../services/queries/workspace-data";
import type { AccountSummary } from "../../types/domain";
import { FormOptionRow } from "../ui/FormOptionRow";
import { FormSheetScaffold } from "../ui/FormSheetScaffold";
import { SearchableSelectSheet } from "../ui/SearchableSelectSheet";
import { AppearancePickerOverlay, CATEGORY_COLOR_CHOICES } from "./AppearancePickerOverlay";
import { CurrencySelectOverlay, CustomCurrencyField } from "./CurrencySelectOverlay";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { CurrencyInput } from "../ui/CurrencyInput";
import { formatCurrency } from "../ui/AmountDisplay";
import { COLORS, FONT_FAMILY, FONT_SIZE, RADIUS, SPACING, SURFACE } from "../../constants/theme";
import { currencyPluralTitle } from "../../constants/currencies";
import { ACCOUNT_INSTITUTIONS, findInstitution } from "../../lib/account-institutions";
import { ACCOUNT_TYPES, TYPE_PRESETS, accountTypeLabel } from "../../features/accounts/lib/account-types";
import { TextField } from "../ui/TextField";

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

  const defaultCurrency = activeWorkspace?.baseCurrencyCode ?? "PEN";

  const [name, setName] = useState("");
  const [type, setType] = useState("bank");
  const [currencyCode, setCurrencyCode] = useState(defaultCurrency);
  const [customCurrency, setCustomCurrency] = useState("");
  const [openingBalance, setOpeningBalance] = useState("0.00");
  const [includeInNetWorth, setIncludeInNetWorth] = useState(true);
  const [color, setColor] = useState(TYPE_PRESETS["bank"].color);
  const [icon, setIcon] = useState(TYPE_PRESETS["bank"].icon);
  const [institutionCode, setInstitutionCode] = useState<string | null>(null);

  // Track manual customization so type-change presets don't overwrite user's choice
  const colorCustomized = useRef(false);
  const iconCustomized = useRef(false);

  const [nameError, setNameError] = useState("");
  const [discardVisible, setDiscardVisible] = useState(false);
  const [appearanceOpen, setAppearanceOpen] = useState(false);
  const [currencyOpen, setCurrencyOpen] = useState(false);
  const [typeOpen, setTypeOpen] = useState(false);
  const [institutionOpen, setInstitutionOpen] = useState(false);

  // ── Draft key ────────────────────────────────────────────────────────────
  const draftKey = `account_form_draft_${activeWorkspaceId}_${user?.id ?? ""}`;

  // ── Dirty check ──────────────────────────────────────────────────────────
  function isDirty() {
    if (!editAccount) {
      return name.trim() !== "" || openingBalance !== "0.00";
    }
    return (
      name.trim() !== editAccount.name ||
      type !== editAccount.type ||
      color !== (editAccount.color ?? TYPE_PRESETS["bank"].color) ||
      icon !== (editAccount.icon ?? TYPE_PRESETS["bank"].icon) ||
      includeInNetWorth !== editAccount.includeInNetWorth ||
      openingBalance !== (editAccount.openingBalance ?? 0).toFixed(2) ||
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
      setOpeningBalance(draft.openingBalance ?? "0.00");
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
      setOpeningBalance((editAccount.openingBalance ?? 0).toFixed(2));
      setIncludeInNetWorth(editAccount.includeInNetWorth);
      setColor(editAccount.color ?? TYPE_PRESETS[editAccount.type]?.color ?? CATEGORY_COLOR_CHOICES[0]);
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
      setOpeningBalance("0.00");
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

  const submittingRef = useRef(false);

  async function handleSubmit() {
    if (submittingRef.current) return; // guard anti-doble-tap: evita duplicados
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
    submittingRef.current = true;
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
    } finally {
      submittingRef.current = false;
    }
  }

  const SelectedIcon = getAccountIcon(icon, type);
  const accountIconOptions = useMemo(
    () => ACCOUNT_ICON_OPTIONS.map((option) => ({ key: option.value, Icon: option.Icon })),
    [],
  );
  const resolvedCurrency = customCurrency.trim().toUpperCase() || currencyCode;

  const institutionLabel = findInstitution(institutionCode)?.label ?? null;

  return (
    <FormSheetScaffold
      visible={visible}
      onClose={handleClose}
      title={editAccount ? "Editar cuenta" : "Nueva cuenta"}
      snapHeight={0.94}
      submitLabel={editAccount ? "Guardar cambios" : "Crear cuenta"}
      onSubmit={handleSubmit}
      submitLoading={createMutation.isPending || updateMutation.isPending}
      // Mientras falte el nombre el botón está apagado y dice qué falta. Reemplaza al asterisco
      // de "NOMBRE *", que no se explica en ninguna parte de la app.
      submitDisabled={!name.trim()}
      missingLabel={name.trim() ? null : "Falta el nombre"}
      // Dentro del sheet: iOS solo presenta un Modal a la vez y como hermanos no aparecían.
      // Conviven porque en modo inline el que no está visible no pinta nada.
      overlay={
        <>
          <ConfirmDialog
            inline
            visible={discardVisible}
            title="¿Descartar cambios?"
            body="Los cambios no guardados se perderán."
            confirmLabel="Descartar"
            cancelLabel="Continuar editando"
            onCancel={() => setDiscardVisible(false)}
            onConfirm={() => { setDiscardVisible(false); onClose(); }}
          />

          <SearchableSelectSheet
            inline
            visible={typeOpen}
            title="Tipo de cuenta"
            options={ACCOUNT_TYPES.map((t) => ({ value: t.value, label: t.label }))}
            value={type}
            onChange={handleTypeChange}
            onClose={() => setTypeOpen(false)}
          />

          {/* La búsqueda vive DENTRO de la hoja que elige, no al costado del formulario:
              antes había un campo "Buscar institución…" y debajo una fila de cápsulas con las
              mismas instituciones, dos controles para un dato. */}
          <SearchableSelectSheet
            inline
            visible={institutionOpen}
            title="Institución"
            options={[
              { value: null as string | null, label: "Ninguna" },
              ...ACCOUNT_INSTITUTIONS.map((i) => ({ value: i.code as string | null, label: i.label })),
            ]}
            value={institutionCode}
            onChange={setInstitutionCode}
            onClose={() => setInstitutionOpen(false)}
          />

          <CurrencySelectOverlay
            visible={currencyOpen}
            onClose={() => setCurrencyOpen(false)}
            value={resolvedCurrency}
            onChange={(code) => { setCurrencyCode(code); setCustomCurrency(""); }}
          />

          <AppearancePickerOverlay
            visible={appearanceOpen}
            onClose={() => setAppearanceOpen(false)}
            color={color}
            onColorChange={(c) => { setColor(c); colorCustomized.current = true; }}
            icon={icon}
            onIconChange={(v) => { setIcon(v); iconCustomized.current = true; }}
            iconOptions={accountIconOptions}
          />

        </>
      }
      /*
       * Archivar y eliminar NO viven aquí.
       *
       * En toda la app se archiva y se elimina de una sola manera: manteniendo pulsada la fila o
       * deslizándola. Tener además dos botones al pie de este formulario era una segunda puerta
       * a lo mismo —y la única del módulo—, de modo que la respuesta a "¿cómo borro esto?"
       * dependía de dónde estuvieras parado. Este formulario edita la cuenta; lo que le pasa a
       * la cuenta se decide en la lista.
       */
    >
      {/* Sin vista previa: repetía el título "Nueva cuenta" y los dos datos que estás por
          elegir, 120 px antes del primer campo. Al editar sí quedan los dos datos que el
          formulario NO enseña: el saldo de hoy y cuándo se movió por última vez. */}
      {editAccount ? (
        <View style={styles.infoRow}>
          <Wallet size={12} color={COLORS.storm} />
          <Text style={styles.infoText}>
            Saldo actual: {formatCurrency(editAccount.currentBalance, editAccount.currencyCode)}
          </Text>
        </View>
      ) : null}
      {editAccount?.lastActivity ? (
        <View style={styles.infoRow}>
          <Clock size={12} color={COLORS.storm} />
          <Text style={styles.infoText}>
            Última actividad: {format(parseDisplayDate(editAccount.lastActivity), "d MMM yyyy", { locale: es })}
          </Text>
        </View>
      ) : null}

      {/* Dos gramáticas de etiqueta en todo el formulario: mayúscula espaciada para lo que se
          escribe, fila con el valor a la derecha para lo que se elige. Había cuatro. */}
      <View style={styles.field}>
        <Text style={styles.sectionLabel}>Nombre</Text>
        <TextField
          style={[styles.textInput, nameError ? styles.textInputError : null]}
          value={name}
          onChangeText={(t) => { setName(t); setNameError(""); }}
          placeholder="BCP Soles, Efectivo casa…"
          placeholderTextColor={COLORS.storm}
          accessibilityLabel="Nombre de la cuenta"
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

      {/* Tipo e Institución eran dos scrollers de cápsulas que se cortaban por el borde
          ("Pr…", un círculo sin nombre). Pasan a filas, junto a Moneda y Apariencia. */}
      <View style={styles.group}>
        <FormOptionRow
          grouped
          label="Tipo"
          value={accountTypeLabel(type)}
          onPress={() => setTypeOpen(true)}
        />
        <FormOptionRow
          grouped
          label="Institución"
          value={institutionLabel}
          placeholder="Ninguna"
          onPress={() => setInstitutionOpen(true)}
        />
        <FormOptionRow
          grouped
          label="Moneda"
          value={currencyPluralTitle(resolvedCurrency)}
          onPress={() => setCurrencyOpen(true)}
        />
        {/* La apariencia se enseña, no se dice: la fila lleva el ícono elegido en vez de la
            palabra "Cambiar". El contorno va en el gris de las demás filas. */}
        <FormOptionRow
          grouped
          last
          label="Apariencia"
          onPress={() => setAppearanceOpen(true)}
          trailing={
            <View style={styles.appearanceSwatch}>
              <SelectedIcon size={15} color={color} strokeWidth={2} />
            </View>
          }
        />
      </View>
      {customCurrency.trim() ? (
        <CustomCurrencyField value={customCurrency} onChange={setCustomCurrency} />
      ) : null}

      <View style={styles.field}>
        <Text style={styles.sectionLabel}>{editAccount ? "Saldo inicial (base)" : "Saldo inicial"}</Text>
        <CurrencyInput
          value={openingBalance}
          onChangeText={setOpeningBalance}
          currencyCode={resolvedCurrency}
        />
        <Text style={styles.fieldHint}>
          {editAccount
            ? "El saldo actual se calcula como saldo inicial + movimientos confirmados."
            : "Lo que hay en la cuenta hoy. Se puede corregir después."}
        </Text>
      </View>

      {/* Estar activado no es un ingreso: el interruptor va en hueso, no en menta. */}
      <View style={styles.switchRow}>
        <View style={styles.switchInfo}>
          <Text style={styles.switchLabel}>Contar en el patrimonio</Text>
          <Text style={styles.switchDesc}>Suma al total del inicio</Text>
        </View>
        <Switch
          value={includeInNetWorth}
          onValueChange={setIncludeInNetWorth}
          trackColor={{ false: COLORS.border, true: COLORS.ink }}
          thumbColor={includeInNetWorth ? COLORS.bg : COLORS.fog}
          ios_backgroundColor={COLORS.border}
        />
      </View>
    </FormSheetScaffold>
  );
}

const styles = StyleSheet.create({
  appearanceSwatch: {
    width: 26,
    height: 26,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderColor: SURFACE.cardBorder,
    backgroundColor: COLORS.bgInput,
    alignItems: "center",
    justifyContent: "center",
  },
  group: {
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: SURFACE.cardBorder,
    backgroundColor: SURFACE.card,
    overflow: "hidden",
  },
  field: { gap: SPACING.sm },
  fieldHint: {
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.xs,
    color: COLORS.storm,
    lineHeight: 17,
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
  sectionLabel: {
    fontSize: FONT_SIZE.xs,
    fontFamily: FONT_FAMILY.bodySemibold,
    color: COLORS.storm,
    textTransform: "uppercase",
    letterSpacing: 0.8,
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
  switchLabel: { fontSize: FONT_SIZE.md, fontFamily: FONT_FAMILY.bodyMedium, color: COLORS.ink },
  switchDesc: { fontSize: FONT_SIZE.xs, color: COLORS.storm },
});
