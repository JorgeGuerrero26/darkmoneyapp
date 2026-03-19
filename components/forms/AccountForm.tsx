import {
  Wallet2, Landmark, PiggyBank, CreditCard, TrendingUp, Briefcase, Banknote,
  type LucideIcon,
} from "lucide-react-native";
import { useEffect, useState } from "react";
import {
  Modal,
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
import { COLORS, FONT_FAMILY, FONT_SIZE, GLASS, RADIUS, SPACING } from "../../constants/theme";

// ── Icon picker ────────────────────────────────────────────────────────────────
const ACCOUNT_ICONS: { value: string; Icon: LucideIcon }[] = [
  { value: "wallet",       Icon: Wallet2 },
  { value: "landmark",     Icon: Landmark },
  { value: "piggy-bank",   Icon: PiggyBank },
  { value: "credit-card",  Icon: CreditCard },
  { value: "trending-up",  Icon: TrendingUp },
  { value: "briefcase",    Icon: Briefcase },
  { value: "banknote",     Icon: Banknote },
];

// ── Color picker ───────────────────────────────────────────────────────────────
const ACCOUNT_COLORS = [
  "#1b6a58", "#2d9076", "#4566d6", "#6f82f1",
  "#b48b34", "#d39d3a", "#8f3e3e", "#c55f5f",
  "#8366f2", "#9c7dff", "#c46a31", "#6b7280",
];

const ACCOUNT_TYPES = [
  { label: "Efectivo",       value: "cash" },
  { label: "Banco",          value: "bank" },
  { label: "Ahorro",         value: "savings" },
  { label: "Tarjeta",        value: "credit_card" },
  { label: "Inversión",      value: "investment" },
  { label: "Préstamo",       value: "loan" },
  { label: "Otro",           value: "other" },
];

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
  const [icon, setIcon] = useState(ACCOUNT_ICONS[0].value);
  const [nameError, setNameError] = useState("");
  const [discardVisible, setDiscardVisible] = useState(false);

  const isDirty = name.trim() !== (editAccount?.name ?? "");

  useEffect(() => {
    if (!visible) return;
    if (editAccount) {
      setName(editAccount.name);
      setType(editAccount.type);
      setCurrencyCode(editAccount.currencyCode);
      setOpeningBalance("0");
      setIncludeInNetWorth(editAccount.includeInNetWorth);
      setColor(editAccount.color ?? ACCOUNT_COLORS[0]);
      const iconValue = editAccount.icon ?? ACCOUNT_ICONS[0].value;
      setIcon(ACCOUNT_ICONS.find((i) => i.value === iconValue) ? iconValue : ACCOUNT_ICONS[0].value);
    } else {
      setName("");
      setType("bank");
      setCurrencyCode(defaultCurrency);
      setOpeningBalance("0");
      setIncludeInNetWorth(true);
      setColor(ACCOUNT_COLORS[0]);
      setIcon(ACCOUNT_ICONS[0].value);
    }
    setNameError("");
    setCustomCurrency("");
  }, [editAccount, visible, defaultCurrency]);

  function handleClose() {
    if (isDirty) {
      setDiscardVisible(true);
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

  const selectedIcon = ACCOUNT_ICONS.find((i) => i.value === icon) ?? ACCOUNT_ICONS[0];

  return (
    <>
      <BottomSheet
        visible={visible}
        onClose={handleClose}
        title={editAccount ? "Editar cuenta" : "Nueva cuenta"}
        snapHeight={0.92}
      >
        {/* Preview + icon + color */}
        <View style={styles.previewRow}>
          <View style={[styles.previewIcon, { backgroundColor: color + "33" }]}>
            <selectedIcon.Icon size={28} color={color} />
          </View>
          <View style={styles.previewInfo}>
            <Text style={styles.previewName} numberOfLines={1}>
              {name.trim() || "Nueva cuenta"}
            </Text>
            <Text style={styles.previewType}>
              {ACCOUNT_TYPES.find((t) => t.value === type)?.label ?? type}
            </Text>
          </View>
        </View>

        {/* Icon picker */}
        <View>
          <Text style={styles.sectionLabel}>Ícono</Text>
          <View style={styles.iconGrid}>
            {ACCOUNT_ICONS.map((item) => (
              <TouchableOpacity
                key={item.value}
                style={[
                  styles.iconBtn,
                  icon === item.value && { borderColor: color, backgroundColor: color + "22" },
                ]}
                onPress={() => setIcon(item.value)}
              >
                <item.Icon size={22} color={icon === item.value ? color : COLORS.textMuted} />
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Color picker */}
        <View>
          <Text style={styles.sectionLabel}>Color</Text>
          <View style={styles.colorGrid}>
            {ACCOUNT_COLORS.map((c) => (
              <TouchableOpacity
                key={c}
                style={[
                  styles.colorDot,
                  { backgroundColor: c },
                  color === c && styles.colorDotActive,
                ]}
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

        <Button
          label={editAccount ? "Guardar cambios" : "Crear cuenta"}
          onPress={handleSubmit}
          loading={createMutation.isPending || updateMutation.isPending}
          style={styles.submitBtn}
        />
      </BottomSheet>

      {/* Discard dialog */}
      <Modal transparent visible={discardVisible} animationType="fade" onRequestClose={() => setDiscardVisible(false)}>
        <View style={styles.discardOverlay}>
          <View style={styles.discardCard}>
            <Text style={styles.discardTitle}>¿Descartar cambios?</Text>
            <Text style={styles.discardBody}>Los cambios no guardados se perderán.</Text>
            <View style={styles.discardActions}>
              <TouchableOpacity style={styles.discardCancel} onPress={() => setDiscardVisible(false)}>
                <Text style={styles.discardCancelText}>Continuar editando</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.discardConfirm} onPress={() => { setDiscardVisible(false); onClose(); }}>
                <Text style={styles.discardConfirmText}>Descartar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  // Preview
  previewRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.md,
    backgroundColor: GLASS.card,
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: GLASS.cardBorder,
  },
  previewIcon: {
    width: 52,
    height: 52,
    borderRadius: RADIUS.lg,
    alignItems: "center",
    justifyContent: "center",
  },
  previewInfo: { flex: 1 },
  previewName: { fontSize: FONT_SIZE.md, fontFamily: FONT_FAMILY.bodySemibold, color: COLORS.ink },
  previewType: { fontSize: FONT_SIZE.xs, color: COLORS.storm, marginTop: 2 },

  // Icon picker
  iconGrid: {
    flexDirection: "row",
    gap: SPACING.sm,
    flexWrap: "wrap",
  },
  iconBtn: {
    width: 48,
    height: 48,
    borderRadius: RADIUS.md,
    backgroundColor: GLASS.card,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "transparent",
  },

  // Color picker
  colorGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: SPACING.sm,
  },
  colorDot: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 2,
    borderColor: "transparent",
  },
  colorDotActive: {
    borderColor: COLORS.ink,
    borderWidth: 3,
  },

  // Form fields
  sectionLabel: {
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
  textInputError: { borderColor: COLORS.danger },
  fieldError: { fontSize: FONT_SIZE.xs, color: COLORS.danger, marginTop: 4 },
  pillRow: { flexDirection: "row", gap: SPACING.sm },
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

  // Discard dialog
  discardOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    alignItems: "center",
    justifyContent: "center",
    padding: SPACING.xl,
  },
  discardCard: {
    width: "100%",
    backgroundColor: GLASS.card,
    borderRadius: RADIUS.xl,
    padding: SPACING.xl,
    borderWidth: 1,
    borderColor: GLASS.cardBorder,
    gap: SPACING.sm,
  },
  discardTitle: {
    fontSize: FONT_SIZE.lg,
    fontFamily: FONT_FAMILY.heading,
    color: COLORS.ink,
    textAlign: "center",
  },
  discardBody: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.storm,
    textAlign: "center",
    marginBottom: SPACING.sm,
  },
  discardActions: { gap: SPACING.sm },
  discardConfirm: {
    backgroundColor: GLASS.dangerBg,
    borderWidth: 1,
    borderColor: GLASS.dangerBorder,
    borderRadius: RADIUS.md,
    paddingVertical: SPACING.md,
    alignItems: "center",
  },
  discardConfirmText: {
    fontSize: FONT_SIZE.md,
    fontFamily: FONT_FAMILY.bodySemibold,
    color: COLORS.danger,
  },
  discardCancel: {
    borderWidth: 1,
    borderColor: GLASS.cardBorder,
    borderRadius: RADIUS.md,
    paddingVertical: SPACING.md,
    alignItems: "center",
  },
  discardCancelText: {
    fontSize: FONT_SIZE.md,
    fontFamily: FONT_FAMILY.bodyMedium,
    color: COLORS.storm,
  },
});
