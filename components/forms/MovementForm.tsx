import { useEffect, useMemo, useRef, useState } from "react";
import type { TextInput } from "react-native";
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import { useUiStore } from "../../store/ui-store";
import { useWorkspace } from "../../lib/workspace-context";
import { humanizeError } from "../../lib/errors";
import {
  useWorkspaceSnapshotQuery,
  useCreateMovementMutation,
  useUpdateMovementMutation,
} from "../../services/queries/workspace-data";
import { useAuth } from "../../lib/auth-context";
import { useToast } from "../../hooks/useToast";
import { BottomSheet } from "../ui/BottomSheet";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";
import { CurrencyInput } from "../ui/CurrencyInput";
import { BalanceImpactPreview } from "../domain/BalanceImpactPreview";
import { AttachmentPicker, type Attachment } from "../domain/AttachmentPicker";
import { DatePickerInput } from "../ui/DatePickerInput";
import { COLORS, FONT_SIZE, FONT_WEIGHT, RADIUS, SPACING } from "../../constants/theme";
import type { MovementType, MovementStatus, MovementRecord, AccountSummary, CategorySummary } from "../../types/domain";

type Props = {
  visible: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  defaultType?: MovementType;
  initialAccountId?: number;
  editMovement?: MovementRecord;
};

type Step = 1 | 2 | 3;

type FormState = {
  movementType: MovementType;
  status: MovementStatus;
  sourceAccountId: number | null;
  destinationAccountId: number | null;
  sourceAmount: string;
  destinationAmount: string;
  description: string;
  categoryId: number | null;
  occurredAt: string;
  notes: string;
};

const TYPE_OPTIONS: { type: MovementType; label: string; emoji: string; color: string }[] = [
  { type: "expense",  label: "Gasto",       emoji: "↓", color: COLORS.expense  },
  { type: "income",   label: "Ingreso",      emoji: "↑", color: COLORS.income   },
  { type: "transfer", label: "Transferencia", emoji: "⇄", color: COLORS.transfer },
];

const STATUS_OPTIONS: { status: MovementStatus; label: string }[] = [
  { status: "posted",  label: "Confirmado" },
  { status: "pending", label: "Pendiente"  },
  { status: "planned", label: "Planificado" },
];

function getInitialForm(defaultType: MovementType): FormState {
  return {
    movementType: defaultType,
    status: "posted",
    sourceAccountId: null,
    destinationAccountId: null,
    sourceAmount: "",
    destinationAmount: "",
    description: "",
    categoryId: null,
    occurredAt: new Date().toISOString().split("T")[0],
    notes: "",
  };
}

export function MovementForm({ visible, onClose, onSuccess, defaultType = "expense", initialAccountId, editMovement }: Props) {
  const { profile } = useAuth();
  const { activeWorkspaceId, activeWorkspace } = useWorkspace();
  const { showToast } = useToast();

  const { lastMovementAccountId, lastMovementCategoryId, setLastMovementDefaults } = useUiStore();

  const { data: snapshot } = useWorkspaceSnapshotQuery(profile, activeWorkspaceId);
  const createMovement = useCreateMovementMutation(activeWorkspaceId);
  const updateMovement = useUpdateMovementMutation(activeWorkspaceId);

  const isEditing = Boolean(editMovement);

  const notesRef = useRef<TextInput>(null);
  const descriptionRef = useRef<TextInput>(null);

  const [step, setStep] = useState<Step>(1);
  const [form, setForm] = useState<FormState>(() => getInitialForm(defaultType));
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [savedMovementId, setSavedMovementId] = useState<number | undefined>(editMovement?.id);

  const baseCurrency = activeWorkspace?.baseCurrencyCode ?? "PEN";
  const accounts = snapshot?.accounts ?? [];
  const categories = snapshot?.categories ?? [];

  // Reset on open / populate when editing
  useEffect(() => {
    if (!visible) return;
    if (editMovement) {
      const occurredDate = editMovement.occurredAt
        ? new Date(editMovement.occurredAt).toISOString().split("T")[0]
        : new Date().toISOString().split("T")[0];
      setForm({
        movementType: editMovement.movementType,
        status: editMovement.status,
        sourceAccountId: editMovement.sourceAccountId ?? null,
        destinationAccountId: editMovement.destinationAccountId ?? null,
        sourceAmount: editMovement.sourceAmount ? String(editMovement.sourceAmount) : "",
        destinationAmount: editMovement.destinationAmount ? String(editMovement.destinationAmount) : "",
        description: editMovement.description ?? "",
        categoryId: editMovement.categoryId ?? null,
        occurredAt: occurredDate,
        notes: editMovement.notes ?? "",
      });
      setStep(3); // Edit jumps straight to details step
    } else {
      setStep(1);
      const initial = getInitialForm(defaultType);
      if (initialAccountId) {
        initial.sourceAccountId = initialAccountId;
      } else if (lastMovementAccountId) {
        initial.sourceAccountId = lastMovementAccountId;
      }
      if (lastMovementCategoryId) {
        initial.categoryId = lastMovementCategoryId;
      }
      setForm(initial);
    }
    setErrors({});
    setAttachments([]);
    setSavedMovementId(editMovement?.id);
  }, [visible, editMovement, defaultType, initialAccountId]);

  function patch(partial: Partial<FormState>) {
    setForm((prev) => ({ ...prev, ...partial }));
  }

  // --- Balance impact preview ---
  const sourceAccount = accounts.find((a) => a.id === form.sourceAccountId) ?? null;
  const destinationAccount = accounts.find((a) => a.id === form.destinationAccountId) ?? null;
  const sourceAmountNum = parseFloat(form.sourceAmount) || 0;
  const destinationAmountNum = parseFloat(form.destinationAmount) || 0;

  const projectedSourceBalance = useMemo(() => {
    if (!sourceAccount || sourceAmountNum <= 0) return null;
    return form.movementType === "income"
      ? sourceAccount.currentBalance + sourceAmountNum
      : sourceAccount.currentBalance - sourceAmountNum;
  }, [sourceAccount, sourceAmountNum, form.movementType]);

  const projectedDestBalance = useMemo(() => {
    if (!destinationAccount || destinationAmountNum <= 0) return null;
    return destinationAccount.currentBalance + destinationAmountNum;
  }, [destinationAccount, destinationAmountNum]);

  // --- Validation per step ---
  function validateStep1(): boolean {
    return true; // type is always selected
  }

  function validateStep2(): boolean {
    const newErrors: typeof errors = {};
    if (!form.sourceAccountId && form.movementType !== "income") {
      newErrors.sourceAccountId = "Selecciona una cuenta";
    }
    if (form.movementType === "income" && !form.destinationAccountId) {
      newErrors.destinationAccountId = "Selecciona una cuenta de destino";
    }
    if (form.movementType === "transfer") {
      if (!form.destinationAccountId) newErrors.destinationAccountId = "Selecciona cuenta destino";
      if (form.sourceAccountId === form.destinationAccountId) {
        newErrors.destinationAccountId = "Debe ser una cuenta diferente";
      }
    }
    if (!form.sourceAmount && form.movementType !== "income") {
      newErrors.sourceAmount = "Ingresa un monto";
    }
    if (form.movementType === "income" && !form.destinationAmount) {
      newErrors.destinationAmount = "Ingresa un monto";
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }

  function validateStep3(): boolean {
    const newErrors: typeof errors = {};
    if (!form.description.trim()) newErrors.description = "La descripción es requerida";
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }

  function goNext() {
    if (step === 1 && validateStep1()) setStep(2);
    else if (step === 2 && validateStep2()) setStep(3);
  }

  function goBack() {
    if (step === 2) setStep(1);
    else if (step === 3) setStep(2);
  }

  async function handleSubmit() {
    if (!validateStep3()) {
      // focus first error
      descriptionRef.current?.focus();
      return;
    }

    try {
      if (isEditing && editMovement) {
        await updateMovement.mutateAsync({
          id: editMovement.id,
          input: {
            status: form.status,
            description: form.description.trim(),
            notes: form.notes.trim() || null,
            categoryId: form.categoryId,
            occurredAt: new Date(form.occurredAt).toISOString(),
            sourceAmount: form.sourceAmount ? parseFloat(form.sourceAmount) : undefined,
            destinationAmount: form.destinationAmount ? parseFloat(form.destinationAmount) : undefined,
          },
        });
        showToast("Movimiento actualizado ✓", "success");
      } else {
        const isIncome = form.movementType === "income";
        const isTransfer = form.movementType === "transfer";
        const payload = {
          movementType: form.movementType,
          status: form.status,
          occurredAt: new Date(form.occurredAt).toISOString(),
          description: form.description.trim(),
          notes: form.notes.trim() || null,
          sourceAccountId: isIncome ? null : form.sourceAccountId,
          sourceAmount: isIncome ? null : sourceAmountNum,
          destinationAccountId: isIncome || isTransfer ? form.destinationAccountId : null,
          destinationAmount: isIncome ? destinationAmountNum : isTransfer ? destinationAmountNum : null,
          fxRate: isTransfer && sourceAmountNum > 0 ? destinationAmountNum / sourceAmountNum : null,
          categoryId: form.categoryId,
        };
        const created = await createMovement.mutateAsync(payload);
        setSavedMovementId(created.id);
        showToast("Movimiento guardado ✓", "success");
        setLastMovementDefaults(form.sourceAccountId, form.categoryId);
      }
      onSuccess?.();
      onClose();
    } catch (err: unknown) {
      showToast(humanizeError(err), "error");
    }
  }

  function handleClose() {
    if (form.description || form.sourceAmount || form.destinationAmount) {
      Alert.alert("¿Descartar cambios?", "Se perderán los datos ingresados.", [
        { text: "Cancelar", style: "cancel" },
        { text: "Descartar", style: "destructive", onPress: onClose },
      ]);
    } else {
      onClose();
    }
  }

  const stepTitle = isEditing
    ? "Editar movimiento"
    : step === 1 ? "Tipo de movimiento"
    : step === 2 ? "Monto y cuenta"
    : "Descripción y categoría";

  return (
    <BottomSheet
      visible={visible}
      onClose={handleClose}
      title={stepTitle}
      snapHeight={0.85}
    >
      {/* Step indicator — hidden when editing */}
      {!isEditing ? (
        <View style={styles.stepRow}>
          {([1, 2, 3] as Step[]).map((s) => (
            <View key={s} style={[styles.stepDot, step >= s && styles.stepDotActive]} />
          ))}
        </View>
      ) : null}

      {/* ── STEP 1: type + status ── */}
      {step === 1 && (
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Tipo</Text>
          <View style={styles.typeGrid}>
            {TYPE_OPTIONS.map((opt) => (
              <TouchableOpacity
                key={opt.type}
                style={[
                  styles.typeButton,
                  form.movementType === opt.type && { borderColor: opt.color, backgroundColor: opt.color + "22" },
                ]}
                onPress={() => patch({ movementType: opt.type })}
              >
                <Text style={[styles.typeEmoji, { color: opt.color }]}>{opt.emoji}</Text>
                <Text style={[styles.typeLabel, form.movementType === opt.type && { color: opt.color }]}>
                  {opt.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={[styles.sectionLabel, { marginTop: SPACING.md }]}>Estado</Text>
          <View style={styles.statusRow}>
            {STATUS_OPTIONS.map((opt) => (
              <TouchableOpacity
                key={opt.status}
                style={[styles.statusPill, form.status === opt.status && styles.statusPillActive]}
                onPress={() => patch({ status: opt.status })}
              >
                <Text style={[styles.statusText, form.status === opt.status && styles.statusTextActive]}>
                  {opt.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Button label="Siguiente →" onPress={goNext} style={styles.btn} />
        </View>
      )}

      {/* ── STEP 2: amount + accounts ── */}
      {step === 2 && (
        <View style={styles.section}>
          {/* Source amount / account (for expense and transfer) */}
          {form.movementType !== "income" && (
            <>
              <CurrencyInput
                label={form.movementType === "transfer" ? "Monto origen" : "Monto"}
                value={form.sourceAmount}
                onChangeText={(v) => patch({ sourceAmount: v })}
                currencyCode={sourceAccount?.currencyCode ?? baseCurrency}
                error={errors.sourceAmount}
              />
              <AccountPicker
                label="Cuenta origen"
                accounts={accounts.filter((a) => !a.isArchived)}
                selectedId={form.sourceAccountId}
                onSelect={(id) => patch({ sourceAccountId: id })}
                error={errors.sourceAccountId as string | undefined}
              />
            </>
          )}

          {/* Destination amount / account (for income and transfer) */}
          {(form.movementType === "income" || form.movementType === "transfer") && (
            <>
              {form.movementType === "transfer" && (
                <CurrencyInput
                  label="Monto destino"
                  value={form.destinationAmount}
                  onChangeText={(v) => patch({ destinationAmount: v })}
                  currencyCode={destinationAccount?.currencyCode ?? baseCurrency}
                  error={errors.destinationAmount}
                />
              )}
              {form.movementType === "income" && (
                <CurrencyInput
                  label="Monto"
                  value={form.destinationAmount}
                  onChangeText={(v) => patch({ destinationAmount: v })}
                  currencyCode={destinationAccount?.currencyCode ?? baseCurrency}
                  error={errors.destinationAmount}
                />
              )}
              <AccountPicker
                label="Cuenta destino"
                accounts={accounts.filter(
                  (a) => !a.isArchived && a.id !== form.sourceAccountId,
                )}
                selectedId={form.destinationAccountId}
                onSelect={(id) => patch({ destinationAccountId: id })}
                error={errors.destinationAccountId as string | undefined}
              />
            </>
          )}

          {/* Balance impact preview */}
          {sourceAccount && projectedSourceBalance !== null && (
            <BalanceImpactPreview
              label={sourceAccount.name}
              currentBalance={sourceAccount.currentBalance}
              projectedBalance={projectedSourceBalance}
              currencyCode={sourceAccount.currencyCode}
            />
          )}
          {destinationAccount && projectedDestBalance !== null && (
            <BalanceImpactPreview
              label={destinationAccount.name}
              currentBalance={destinationAccount.currentBalance}
              projectedBalance={projectedDestBalance}
              currencyCode={destinationAccount.currencyCode}
            />
          )}

          <View style={styles.navRow}>
            <Button label="← Atrás" variant="ghost" onPress={goBack} style={styles.btnHalf} />
            <Button label="Siguiente →" onPress={goNext} style={styles.btnHalf} />
          </View>
        </View>
      )}

      {/* ── STEP 3: description + category + date ── */}
      {step === 3 && (
        <View style={styles.section}>
          <Input
            label="Descripción"
            placeholder="¿En qué gastaste?"
            value={form.description}
            onChangeText={(v) => patch({ description: v })}
            error={errors.description}
            autoFocus
            ref={descriptionRef}
            returnKeyType="next"
            onSubmitEditing={() => notesRef.current?.focus()}
          />

          <CategoryPicker
            label="Categoría (opcional)"
            categories={categories.filter(
              (c) =>
                c.isActive &&
                (c.kind === "both" ||
                  (form.movementType === "income" && c.kind === "income") ||
                  (form.movementType !== "income" && c.kind === "expense")),
            )}
            selectedId={form.categoryId}
            onSelect={(id) => patch({ categoryId: id })}
          />

          <DatePickerInput
            label="Fecha"
            value={form.occurredAt}
            onChange={(v) => patch({ occurredAt: v })}
          />

          <Input
            label="Notas (opcional)"
            placeholder="Notas adicionales…"
            value={form.notes}
            onChangeText={(v) => patch({ notes: v })}
            multiline
            numberOfLines={3}
            style={styles.notesInput}
            ref={notesRef}
            returnKeyType="done"
            blurOnSubmit
          />

          <AttachmentPicker
            movementId={savedMovementId}
            attachments={attachments}
            onChange={setAttachments}
          />

          <View style={styles.navRow}>
            <Button label="← Atrás" variant="ghost" onPress={goBack} style={styles.btnHalf} />
            <Button
              label={isEditing ? "Actualizar" : "Guardar"}
              onPress={handleSubmit}
              loading={createMovement.isPending || updateMovement.isPending}
              style={styles.btnHalf}
            />
          </View>
        </View>
      )}
    </BottomSheet>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function AccountPicker({
  label,
  accounts,
  selectedId,
  onSelect,
  error,
}: {
  label: string;
  accounts: AccountSummary[];
  selectedId: number | null;
  onSelect: (id: number) => void;
  error?: string;
}) {
  return (
    <View style={styles.pickerWrap}>
      <Text style={styles.sectionLabel}>{label}</Text>
      {error ? <Text style={styles.fieldError}>{error}</Text> : null}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.accountRow}>
        {accounts.map((acc) => (
          <TouchableOpacity
            key={acc.id}
            style={[
              styles.accountChip,
              selectedId === acc.id && { borderColor: acc.color, backgroundColor: acc.color + "22" },
            ]}
            onPress={() => onSelect(acc.id)}
          >
            <Text style={[styles.accountChipName, selectedId === acc.id && { color: acc.color }]}>
              {acc.name}
            </Text>
            <Text style={styles.accountChipBalance}>
              {acc.currencyCode}
            </Text>
          </TouchableOpacity>
        ))}
        {accounts.length === 0 && (
          <Text style={styles.emptyPicker}>Sin cuentas activas</Text>
        )}
      </ScrollView>
    </View>
  );
}

function CategoryPicker({
  label,
  categories,
  selectedId,
  onSelect,
}: {
  label: string;
  categories: CategorySummary[];
  selectedId: number | null;
  onSelect: (id: number | null) => void;
}) {
  return (
    <View style={styles.pickerWrap}>
      <Text style={styles.sectionLabel}>{label}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.accountRow}>
        <TouchableOpacity
          style={[styles.categoryChip, selectedId === null && styles.categoryChipActive]}
          onPress={() => onSelect(null)}
        >
          <Text style={[styles.categoryChipText, selectedId === null && styles.categoryChipTextActive]}>
            Sin categoría
          </Text>
        </TouchableOpacity>
        {categories.map((cat) => (
          <TouchableOpacity
            key={cat.id}
            style={[styles.categoryChip, selectedId === cat.id && styles.categoryChipActive]}
            onPress={() => onSelect(cat.id)}
          >
            <Text style={[styles.categoryChipText, selectedId === cat.id && styles.categoryChipTextActive]}>
              {cat.name}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  stepRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: SPACING.sm,
    marginBottom: SPACING.md,
  },
  stepDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.border,
  },
  stepDotActive: { backgroundColor: COLORS.primary },
  section: { gap: SPACING.md },
  sectionLabel: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.textMuted,
    fontWeight: "500",
  },
  typeGrid: {
    flexDirection: "row",
    gap: SPACING.sm,
  },
  typeButton: {
    flex: 1,
    alignItems: "center",
    paddingVertical: SPACING.lg,
    borderRadius: RADIUS.lg,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    backgroundColor: COLORS.bgCard,
    gap: SPACING.xs,
  },
  typeEmoji: { fontSize: 24 },
  typeLabel: {
    fontSize: FONT_SIZE.sm,
    fontWeight: FONT_WEIGHT.semibold,
    color: COLORS.textMuted,
  },
  statusRow: {
    flexDirection: "row",
    gap: SPACING.sm,
  },
  statusPill: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs + 2,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.bgCard,
  },
  statusPillActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  statusText: { fontSize: FONT_SIZE.sm, color: COLORS.textMuted, fontWeight: "500" },
  statusTextActive: { color: "#FFF" },
  btn: { marginTop: SPACING.sm },
  navRow: {
    flexDirection: "row",
    gap: SPACING.sm,
    marginTop: SPACING.sm,
  },
  btnHalf: { flex: 1 },
  pickerWrap: { gap: SPACING.sm },
  accountRow: {
    gap: SPACING.sm,
    paddingVertical: SPACING.xs,
  },
  accountChip: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.md,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    backgroundColor: COLORS.bgCard,
    gap: 2,
    minWidth: 100,
  },
  accountChipName: {
    fontSize: FONT_SIZE.sm,
    fontWeight: FONT_WEIGHT.semibold,
    color: COLORS.text,
  },
  accountChipBalance: { fontSize: FONT_SIZE.xs, color: COLORS.textMuted },
  emptyPicker: { fontSize: FONT_SIZE.sm, color: COLORS.textMuted },
  categoryChip: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs + 2,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.bgCard,
  },
  categoryChipActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  categoryChipText: { fontSize: FONT_SIZE.sm, color: COLORS.textMuted },
  categoryChipTextActive: { color: "#FFF" },
  notesInput: { height: 72, textAlignVertical: "top" },
  fieldError: { fontSize: FONT_SIZE.xs, color: COLORS.danger },
});
