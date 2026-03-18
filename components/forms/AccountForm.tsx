import { useEffect, useState } from "react";
import {
  Alert,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useWorkspace } from "../../lib/workspace-context";
import { useToast } from "../../hooks/useToast";
import {
  useCreateAccountMutation,
  useUpdateAccountMutation,
  type AccountFormInput,
} from "../../services/queries/workspace-data";
import type { AccountSummary } from "../../types/domain";
import { BottomSheet } from "../ui/BottomSheet";
import { Button } from "../ui/Button";
import { CurrencyInput } from "../ui/CurrencyInput";
import { COLORS, FONT_SIZE, FONT_WEIGHT, RADIUS, SPACING } from "../../constants/theme";

const ACCOUNT_TYPES = [
  { label: "Efectivo", value: "cash" },
  { label: "Banco", value: "bank" },
  { label: "Ahorro", value: "savings" },
  { label: "Tarjeta de crédito", value: "credit_card" },
  { label: "Inversión", value: "investment" },
  { label: "Préstamo", value: "loan" },
  { label: "Otro", value: "other" },
];

const ACCOUNT_COLORS = [
  "#6366F1", "#10B981", "#F59E0B", "#EF4444",
  "#3B82F6", "#8B5CF6", "#EC4899", "#14B8A6",
];

const ACCOUNT_ICONS = ["💳", "🏦", "💰", "📈", "🏠", "🚗", "💼", "🌐"];

const POPULAR_CURRENCIES = ["PEN", "USD", "EUR", "MXN", "COP", "ARS", "CLP", "BRL"];

type Props = {
  visible: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  editAccount?: AccountSummary;
};

export function AccountForm({ visible, onClose, onSuccess, editAccount }: Props) {
  const { activeWorkspaceId, activeWorkspace } = useWorkspace();
  const { showToast } = useToast();
  const createMutation = useCreateAccountMutation(activeWorkspaceId);
  const updateMutation = useUpdateAccountMutation(activeWorkspaceId);

  const defaultCurrency = activeWorkspace?.baseCurrencyCode ?? "PEN";

  const [name, setName] = useState("");
  const [type, setType] = useState("bank");
  const [currencyCode, setCurrencyCode] = useState(defaultCurrency);
  const [customCurrency, setCustomCurrency] = useState("");
  const [openingBalance, setOpeningBalance] = useState("0");
  const [includeInNetWorth, setIncludeInNetWorth] = useState(true);
  const [color, setColor] = useState(ACCOUNT_COLORS[0]);
  const [icon, setIcon] = useState(ACCOUNT_ICONS[0]);

  const [nameError, setNameError] = useState("");
  const isDirty = name.trim() !== (editAccount?.name ?? "");

  // Populate form when editing
  useEffect(() => {
    if (editAccount) {
      setName(editAccount.name);
      setType(editAccount.type);
      setCurrencyCode(editAccount.currencyCode);
      setOpeningBalance("0"); // opening balance not editable on edit
      setIncludeInNetWorth(editAccount.includeInNetWorth);
      setColor(editAccount.color ?? ACCOUNT_COLORS[0]);
      setIcon(editAccount.icon ?? ACCOUNT_ICONS[0]);
    } else {
      setName("");
      setType("bank");
      setCurrencyCode(defaultCurrency);
      setOpeningBalance("0");
      setIncludeInNetWorth(true);
      setColor(ACCOUNT_COLORS[0]);
      setIcon(ACCOUNT_ICONS[0]);
    }
    setNameError("");
  }, [editAccount, visible, defaultCurrency]);

  function handleClose() {
    if (isDirty) {
      Alert.alert("¿Descartar cambios?", "Los cambios no guardados se perderán.", [
        { text: "Continuar editando", style: "cancel" },
        { text: "Descartar", style: "destructive", onPress: onClose },
      ]);
    } else {
      onClose();
    }
  }

  async function handleSubmit() {
    setNameError("");
    if (!name.trim()) {
      setNameError("El nombre es obligatorio");
      return;
    }

    const resolvedCurrency = customCurrency.trim().toUpperCase() || currencyCode;

    const input: AccountFormInput = {
      name: name.trim(),
      type,
      currencyCode: resolvedCurrency,
      openingBalance: parseFloat(openingBalance) || 0,
      includeInNetWorth,
      color,
      icon,
    };

    try {
      if (editAccount) {
        await updateMutation.mutateAsync({ id: editAccount.id, input });
        showToast("Cuenta actualizada", "success");
      } else {
        await createMutation.mutateAsync(input);
        showToast("Cuenta creada", "success");
      }
      onSuccess?.();
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error desconocido";
      showToast(msg, "error");
    }
  }

  const isLoading = createMutation.isPending || updateMutation.isPending;

  return (
    <BottomSheet
      visible={visible}
      onClose={handleClose}
      title={editAccount ? "Editar cuenta" : "Nueva cuenta"}
      snapHeight={0.9}
    >
      {/* Icon + Color row */}
      <View style={styles.sectionRow}>
        <View style={styles.sectionHalf}>
          <Text style={styles.sectionLabel}>Ícono</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.iconRow}>
              {ACCOUNT_ICONS.map((ic) => (
                <TouchableOpacity
                  key={ic}
                  style={[styles.iconBtn, icon === ic && styles.iconBtnActive]}
                  onPress={() => setIcon(ic)}
                >
                  <Text style={styles.iconText}>{ic}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
        </View>
      </View>

      {/* Color */}
      <View>
        <Text style={styles.sectionLabel}>Color</Text>
        <View style={styles.colorRow}>
          {ACCOUNT_COLORS.map((c) => (
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
        <Text style={styles.sectionLabel}>Nombre *</Text>
        <TextInput
          style={[styles.textInput, nameError ? styles.textInputError : null]}
          value={name}
          onChangeText={(t) => { setName(t); setNameError(""); }}
          placeholder="Ej. BCP Soles, Efectivo casa"
          placeholderTextColor={COLORS.textDisabled}
        />
        {nameError ? <Text style={styles.fieldError}>{nameError}</Text> : null}
      </View>

      {/* Type */}
      <View>
        <Text style={styles.sectionLabel}>Tipo</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={styles.pillRow}>
            {ACCOUNT_TYPES.map((t) => (
              <TouchableOpacity
                key={t.value}
                style={[styles.pill, type === t.value && styles.pillActive]}
                onPress={() => setType(t.value)}
              >
                <Text style={[styles.pillText, type === t.value && styles.pillTextActive]}>
                  {t.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
      </View>

      {/* Currency */}
      <View>
        <Text style={styles.sectionLabel}>Moneda</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={styles.pillRow}>
            {POPULAR_CURRENCIES.map((c) => (
              <TouchableOpacity
                key={c}
                style={[styles.pill, currencyCode === c && !customCurrency && styles.pillActive]}
                onPress={() => { setCurrencyCode(c); setCustomCurrency(""); }}
              >
                <Text style={[styles.pillText, currencyCode === c && !customCurrency && styles.pillTextActive]}>
                  {c}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
        <TextInput
          style={[styles.textInput, { marginTop: SPACING.sm }]}
          value={customCurrency}
          onChangeText={(t) => setCustomCurrency(t.toUpperCase())}
          placeholder="Otra moneda (ej. JPY)"
          placeholderTextColor={COLORS.textDisabled}
          maxLength={5}
          autoCapitalize="characters"
        />
      </View>

      {/* Opening balance — only on create */}
      {!editAccount ? (
        <CurrencyInput
          label="Saldo inicial"
          value={openingBalance}
          onChangeText={setOpeningBalance}
          currencyCode={customCurrency.trim().toUpperCase() || currencyCode}
        />
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
          trackColor={{ false: COLORS.border, true: COLORS.primary }}
          thumbColor="#FFFFFF"
        />
      </View>

      {/* Submit */}
      <Button
        label={editAccount ? "Guardar cambios" : "Crear cuenta"}
        onPress={handleSubmit}
        loading={isLoading}
        style={styles.submitBtn}
      />
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  sectionRow: { flexDirection: "row", gap: SPACING.md },
  sectionHalf: { flex: 1 },
  sectionLabel: {
    fontSize: FONT_SIZE.xs,
    fontWeight: FONT_WEIGHT.semibold,
    color: COLORS.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: SPACING.xs,
  },
  iconRow: { flexDirection: "row", gap: SPACING.sm },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.bgInput,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "transparent",
  },
  iconBtnActive: { borderColor: COLORS.primary },
  iconText: { fontSize: 20 },
  colorRow: { flexDirection: "row", flexWrap: "wrap", gap: SPACING.sm },
  colorDot: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: "transparent",
  },
  colorDotActive: { borderColor: COLORS.text, borderWidth: 3 },
  textInput: {
    backgroundColor: COLORS.bgInput,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    fontSize: FONT_SIZE.md,
    color: COLORS.text,
  },
  textInputError: { borderColor: COLORS.danger },
  fieldError: { fontSize: FONT_SIZE.xs, color: COLORS.danger, marginTop: 4 },
  pillRow: { flexDirection: "row", gap: SPACING.sm },
  pill: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs + 2,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.bgCard,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  pillActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  pillText: { fontSize: FONT_SIZE.sm, color: COLORS.textMuted, fontWeight: FONT_WEIGHT.medium },
  pillTextActive: { color: "#FFFFFF" },
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: COLORS.bgCard,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  switchInfo: { flex: 1, gap: 2, marginRight: SPACING.md },
  switchLabel: { fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.medium, color: COLORS.text },
  switchDesc: { fontSize: FONT_SIZE.xs, color: COLORS.textMuted },
  submitBtn: { marginTop: SPACING.sm },
});
