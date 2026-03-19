import { useEffect, useRef, useState } from "react";
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { format } from "date-fns";

import { useWorkspace } from "../../lib/workspace-context";
import { useAuth } from "../../lib/auth-context";
import { humanizeError } from "../../lib/errors";
import { useToast } from "../../hooks/useToast";
import {
  useCreateObligationMutation,
  useUpdateObligationMutation,
  useWorkspaceSnapshotQuery,
  type ObligationFormInput,
} from "../../services/queries/workspace-data";
import type { ObligationSummary } from "../../types/domain";
import { BottomSheet } from "../ui/BottomSheet";
import { Button } from "../ui/Button";
import { CurrencyInput } from "../ui/CurrencyInput";
import { DatePickerInput } from "../ui/DatePickerInput";
import { COLORS, FONT_FAMILY, FONT_SIZE, GLASS, RADIUS, SPACING } from "../../constants/theme";

const POPULAR_CURRENCIES = ["PEN", "USD", "EUR", "MXN", "COP", "ARS", "CLP", "BRL"];

const DIRECTION_OPTIONS = [
  { value: "receivable", label: "Por cobrar", emoji: "↑", color: COLORS.income },
  { value: "payable",    label: "Por pagar",  emoji: "↓", color: COLORS.expense },
];

const ORIGIN_OPTIONS = [
  { value: "cash_loan",          label: "Préstamo en efectivo" },
  { value: "sale_financed",      label: "Venta financiada" },
  { value: "purchase_financed",  label: "Compra financiada" },
  { value: "manual",             label: "Manual" },
];

type Props = {
  visible: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  editObligation?: ObligationSummary;
};

export function ObligationForm({ visible, onClose, onSuccess, editObligation }: Props) {
  const { activeWorkspaceId, activeWorkspace } = useWorkspace();
  const { profile } = useAuth();
  const { showToast } = useToast();
  const createMutation = useCreateObligationMutation(activeWorkspaceId);
  const updateMutation = useUpdateObligationMutation(activeWorkspaceId);
  const { data: snapshot } = useWorkspaceSnapshotQuery(profile, activeWorkspaceId);

  const defaultCurrency = activeWorkspace?.baseCurrencyCode ?? "PEN";
  const today = format(new Date(), "yyyy-MM-dd");

  const [title, setTitle] = useState("");
  const [direction, setDirection] = useState<"receivable" | "payable">("payable");
  const [originType, setOriginType] = useState<ObligationFormInput["originType"]>("manual");
  const [currencyCode, setCurrencyCode] = useState(defaultCurrency);
  const [principalAmount, setPrincipalAmount] = useState("");
  const [startDate, setStartDate] = useState(today);
  const [dueDate, setDueDate] = useState("");
  const [counterpartyId, setCounterpartyId] = useState<number | null>(null);
  const [settlementAccountId, setSettlementAccountId] = useState<number | null>(null);
  const [installmentAmount, setInstallmentAmount] = useState("");
  const [installmentCount, setInstallmentCount] = useState("");
  const [interestRate, setInterestRate] = useState("");
  const [description, setDescription] = useState("");
  const [notes, setNotes] = useState("");

  const [titleError, setTitleError] = useState("");
  const [amountError, setAmountError] = useState("");

  const isEditing = Boolean(editObligation);

  const titleRef = useRef<TextInput>(null);
  const descriptionRef = useRef<TextInput>(null);
  const notesRef = useRef<TextInput>(null);

  useEffect(() => {
    if (!visible) return;
    if (editObligation) {
      setTitle(editObligation.title);
      setDirection(editObligation.direction);
      setOriginType(editObligation.originType);
      setCurrencyCode(editObligation.currencyCode);
      setPrincipalAmount(String(editObligation.principalAmount));
      setStartDate(editObligation.startDate);
      setDueDate(editObligation.dueDate ?? "");
      setCounterpartyId(editObligation.counterpartyId ?? null);
      setSettlementAccountId(editObligation.settlementAccountId ?? null);
      setInstallmentAmount(editObligation.installmentAmount ? String(editObligation.installmentAmount) : "");
      setInstallmentCount(editObligation.installmentCount ? String(editObligation.installmentCount) : "");
      setInterestRate(editObligation.interestRate ? String(editObligation.interestRate) : "");
      setDescription(editObligation.description ?? "");
      setNotes(editObligation.notes ?? "");
    } else {
      setTitle("");
      setDirection("payable");
      setOriginType("manual");
      setCurrencyCode(defaultCurrency);
      setPrincipalAmount("");
      setStartDate(today);
      setDueDate("");
      setCounterpartyId(null);
      setSettlementAccountId(null);
      setInstallmentAmount("");
      setInstallmentCount("");
      setInterestRate("");
      setDescription("");
      setNotes("");
    }
    setTitleError("");
    setAmountError("");
  }, [visible, editObligation, defaultCurrency, today]);

  function handleClose() {
    if (title.trim() || principalAmount) {
      Alert.alert("¿Descartar cambios?", "Se perderán los datos ingresados.", [
        { text: "Continuar", style: "cancel" },
        { text: "Descartar", style: "destructive", onPress: onClose },
      ]);
    } else {
      onClose();
    }
  }

  async function handleSubmit() {
    setTitleError("");
    setAmountError("");
    let valid = true;
    if (!title.trim()) { setTitleError("El título es obligatorio"); valid = false; }
    const amount = parseFloat(principalAmount);
    if (!isEditing && (!principalAmount || isNaN(amount) || amount <= 0)) {
      setAmountError("Ingresa un monto válido"); valid = false;
    }
    if (!valid) {
      if (!title.trim()) titleRef.current?.focus();
      return;
    }

    try {
      if (isEditing && editObligation) {
        await updateMutation.mutateAsync({
          id: editObligation.id,
          input: {
            title: title.trim(),
            counterpartyId,
            settlementAccountId,
            dueDate: dueDate || null,
            installmentAmount: installmentAmount ? parseFloat(installmentAmount) : null,
            installmentCount: installmentCount ? parseInt(installmentCount) : null,
            interestRate: interestRate ? parseFloat(interestRate) : null,
            description: description.trim() || null,
            notes: notes.trim() || null,
          },
        });
        showToast("Obligación actualizada", "success");
      } else {
        await createMutation.mutateAsync({
          title: title.trim(),
          direction,
          originType,
          currencyCode,
          principalAmount: amount,
          startDate,
          dueDate: dueDate || null,
          counterpartyId,
          settlementAccountId,
          installmentAmount: installmentAmount ? parseFloat(installmentAmount) : null,
          installmentCount: installmentCount ? parseInt(installmentCount) : null,
          interestRate: interestRate ? parseFloat(interestRate) : null,
          description: description.trim() || null,
          notes: notes.trim() || null,
        });
        showToast("Obligación creada", "success");
      }
      onSuccess?.();
      onClose();
    } catch (err: unknown) {
      showToast(humanizeError(err), "error");
    }
  }

  const counterparties = snapshot?.counterparties ?? [];
  const activeAccounts = snapshot?.accounts.filter((a) => !a.isArchived) ?? [];
  const isLoading = createMutation.isPending || updateMutation.isPending;

  return (
    <BottomSheet
      visible={visible}
      onClose={handleClose}
      title={isEditing ? "Editar obligación" : "Nueva obligación"}
      snapHeight={0.95}
    >
      {/* Title */}
      <View>
        <Text style={styles.label}>Título *</Text>
        <TextInput
          ref={titleRef}
          style={[styles.textInput, titleError ? styles.inputError : null]}
          value={title}
          onChangeText={(t) => { setTitle(t); setTitleError(""); }}
          placeholder="Ej. Préstamo a Juan, Deuda tarjeta"
          placeholderTextColor={COLORS.textDisabled}
          returnKeyType="next"
          onSubmitEditing={() => descriptionRef.current?.focus()}
        />
        {titleError ? <Text style={styles.fieldError}>{titleError}</Text> : null}
      </View>

      {/* Direction — solo en creación */}
      {!isEditing ? (
        <View>
          <Text style={styles.label}>Dirección</Text>
          <View style={styles.directionRow}>
            {DIRECTION_OPTIONS.map((opt) => (
              <TouchableOpacity
                key={opt.value}
                style={[
                  styles.directionBtn,
                  direction === opt.value && { borderColor: opt.color, backgroundColor: opt.color + "22" },
                ]}
                onPress={() => setDirection(opt.value as "receivable" | "payable")}
              >
                <Text style={[styles.directionEmoji, { color: opt.color }]}>{opt.emoji}</Text>
                <Text style={[styles.directionLabel, direction === opt.value && { color: opt.color }]}>
                  {opt.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      ) : null}

      {/* Origin type — solo en creación */}
      {!isEditing ? (
        <View>
          <Text style={styles.label}>Tipo de origen</Text>
          <View style={styles.pillWrap}>
            {ORIGIN_OPTIONS.map((opt) => (
              <TouchableOpacity
                key={opt.value}
                style={[styles.pill, originType === opt.value && styles.pillActive]}
                onPress={() => setOriginType(opt.value as ObligationFormInput["originType"])}
              >
                <Text style={[styles.pillText, originType === opt.value && styles.pillTextActive]}>
                  {opt.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      ) : null}

      {/* Currency — solo en creación */}
      {!isEditing ? (
        <View>
          <Text style={styles.label}>Moneda</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.pillRow}>
              {POPULAR_CURRENCIES.map((c) => (
                <TouchableOpacity
                  key={c}
                  style={[styles.pill, currencyCode === c && styles.pillActive]}
                  onPress={() => setCurrencyCode(c)}
                >
                  <Text style={[styles.pillText, currencyCode === c && styles.pillTextActive]}>{c}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
        </View>
      ) : null}

      {/* Principal amount — solo en creación */}
      {!isEditing ? (
        <CurrencyInput
          label="Monto principal *"
          value={principalAmount}
          onChangeText={(t) => { setPrincipalAmount(t); setAmountError(""); }}
          currencyCode={currencyCode}
          error={amountError}
        />
      ) : null}

      {/* Counterparty */}
      {counterparties.length > 0 ? (
        <View>
          <Text style={styles.label}>Contacto</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.pillRow}>
              <TouchableOpacity
                style={[styles.pill, counterpartyId === null && styles.pillActive]}
                onPress={() => setCounterpartyId(null)}
              >
                <Text style={[styles.pillText, counterpartyId === null && styles.pillTextActive]}>Ninguno</Text>
              </TouchableOpacity>
              {counterparties.map((cp) => (
                <TouchableOpacity
                  key={cp.id}
                  style={[styles.pill, counterpartyId === cp.id && styles.pillActive]}
                  onPress={() => setCounterpartyId(cp.id)}
                >
                  <Text style={[styles.pillText, counterpartyId === cp.id && styles.pillTextActive]}>
                    {cp.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
        </View>
      ) : null}

      {/* Settlement account */}
      {activeAccounts.length > 0 ? (
        <View>
          <Text style={styles.label}>Cuenta de liquidación</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.pillRow}>
              <TouchableOpacity
                style={[styles.pill, settlementAccountId === null && styles.pillActive]}
                onPress={() => setSettlementAccountId(null)}
              >
                <Text style={[styles.pillText, settlementAccountId === null && styles.pillTextActive]}>Ninguna</Text>
              </TouchableOpacity>
              {activeAccounts.map((acc) => (
                <TouchableOpacity
                  key={acc.id}
                  style={[styles.pill, settlementAccountId === acc.id && styles.pillActive]}
                  onPress={() => setSettlementAccountId(acc.id)}
                >
                  <Text style={[styles.pillText, settlementAccountId === acc.id && styles.pillTextActive]}>
                    {acc.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
        </View>
      ) : null}

      {/* Dates */}
      {!isEditing ? (
        <DatePickerInput
          label="Fecha de inicio"
          value={startDate}
          onChange={setStartDate}
        />
      ) : null}

      <DatePickerInput
        label="Fecha de vencimiento (opcional)"
        value={dueDate}
        onChange={setDueDate}
        optional
      />

      {/* Installments */}
      <View style={styles.twoCol}>
        <View style={styles.colHalf}>
          <Text style={styles.label}>Cuota</Text>
          <TextInput
            style={styles.textInput}
            value={installmentAmount}
            onChangeText={setInstallmentAmount}
            placeholder="0.00"
            placeholderTextColor={COLORS.textDisabled}
            keyboardType="decimal-pad"
          />
        </View>
        <View style={styles.colHalf}>
          <Text style={styles.label}># Cuotas</Text>
          <TextInput
            style={styles.textInput}
            value={installmentCount}
            onChangeText={setInstallmentCount}
            placeholder="0"
            placeholderTextColor={COLORS.textDisabled}
            keyboardType="number-pad"
          />
        </View>
      </View>

      {/* Interest rate */}
      <View>
        <Text style={styles.label}>Tasa de interés % (opcional)</Text>
        <TextInput
          style={styles.textInput}
          value={interestRate}
          onChangeText={setInterestRate}
          placeholder="0.00"
          placeholderTextColor={COLORS.textDisabled}
          keyboardType="decimal-pad"
        />
      </View>

      {/* Description */}
      <View>
        <Text style={styles.label}>Descripción (opcional)</Text>
        <TextInput
          ref={descriptionRef}
          style={styles.textInput}
          value={description}
          onChangeText={setDescription}
          placeholder="Descripción breve"
          placeholderTextColor={COLORS.textDisabled}
          returnKeyType="next"
          onSubmitEditing={() => notesRef.current?.focus()}
        />
      </View>

      {/* Notes */}
      <View>
        <Text style={styles.label}>Notas (opcional)</Text>
        <TextInput
          ref={notesRef}
          style={[styles.textInput, styles.textArea]}
          value={notes}
          onChangeText={setNotes}
          placeholder="Observaciones adicionales"
          placeholderTextColor={COLORS.textDisabled}
          multiline
          numberOfLines={3}
          textAlignVertical="top"
          returnKeyType="done"
          blurOnSubmit
        />
      </View>

      <Button
        label={isEditing ? "Guardar cambios" : "Crear obligación"}
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
  textArea: { minHeight: 72 },
  inputError: { borderColor: COLORS.danger },
  fieldError: { fontSize: FONT_SIZE.xs, color: COLORS.danger, marginTop: 4 },
  directionRow: { flexDirection: "row", gap: SPACING.md },
  directionBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: SPACING.sm,
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.md,
    borderWidth: 2,
    borderColor: GLASS.cardBorder,
    backgroundColor: GLASS.card,
  },
  directionEmoji: { fontSize: FONT_SIZE.xl },
  directionLabel: { fontSize: FONT_SIZE.sm, fontFamily: FONT_FAMILY.bodySemibold, color: COLORS.storm },
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
  twoCol: { flexDirection: "row", gap: SPACING.md },
  colHalf: { flex: 1 },
  submitBtn: { marginTop: SPACING.sm },
});
