import { useEffect, useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { BottomSheet } from "../../../components/ui/BottomSheet";
import { Button } from "../../../components/ui/Button";
import { CurrencyInput } from "../../../components/ui/CurrencyInput";
import { useToast } from "../../../hooks/useToast";
import { useWorkspace } from "../../../lib/workspace-context";
import { useUpdateBudgetMutation } from "../../../services/queries/workspace-data";
import { COLORS, FONT_FAMILY, FONT_SIZE, RADIUS, SPACING, SURFACE } from "../../../constants/theme";
import type { BudgetOverview } from "../../../types/domain";

const ALERT_PRESETS = [
  { label: "70%", value: 70 },
  { label: "80%", value: 80 },
  { label: "90%", value: 90 },
  { label: "100%", value: 100 },
];

type Props = {
  visible: boolean;
  budget: BudgetOverview | null;
  onClose: () => void;
  onSuccess?: () => void;
};

export function BudgetQuickEditSheet({ visible, budget, onClose, onSuccess }: Props) {
  const { activeWorkspaceId } = useWorkspace();
  const { showToast } = useToast();
  const updateMutation = useUpdateBudgetMutation(activeWorkspaceId);

  const [limitAmount, setLimitAmount] = useState("");
  const [alertPercent, setAlertPercent] = useState(80);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!visible || !budget) return;
    setLimitAmount(String(budget.limitAmount));
    setAlertPercent(budget.alertPercent);
    setError("");
  }, [visible, budget]);

  async function handleSave() {
    if (!budget) return;
    const parsed = Number(limitAmount.replace(/,/g, "."));
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setError("Ingresa un monto válido mayor a cero.");
      return;
    }
    try {
      await updateMutation.mutateAsync({
        id: budget.id,
        input: { limitAmount: parsed, alertPercent },
      });
      showToast("Presupuesto actualizado", "success");
      onSuccess?.();
      onClose();
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : "Error al guardar", "error");
    }
  }

  if (!budget) return null;

  return (
    <BottomSheet visible={visible} onClose={onClose} title="Ajuste rápido" snapHeight={0.5}>
      <View style={styles.body}>
        <Text style={styles.name} numberOfLines={1}>
          {budget.name}
        </Text>
        <Text style={styles.subtitle}>{budget.scopeLabel}</Text>

        <CurrencyInput
          label="Monto límite"
          value={limitAmount}
          onChangeText={(t) => {
            setLimitAmount(t);
            setError("");
          }}
          currencyCode={budget.currencyCode}
          error={error}
        />

        <View>
          <Text style={styles.label}>Alerta en</Text>
          <View style={styles.pillRow}>
            {ALERT_PRESETS.map((preset) => (
              <TouchableOpacity
                key={preset.value}
                style={[styles.pill, alertPercent === preset.value && styles.pillActive]}
                onPress={() => setAlertPercent(preset.value)}
                accessibilityRole="button"
                accessibilityState={{ selected: alertPercent === preset.value }}
              >
                <Text
                  style={[
                    styles.pillText,
                    alertPercent === preset.value && styles.pillTextActive,
                  ]}
                >
                  {preset.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <Button
          label="Guardar"
          onPress={handleSave}
          loading={updateMutation.isPending}
          disabled={updateMutation.isPending}
        />
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  body: {
    gap: SPACING.md,
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.xl,
  },
  name: {
    fontFamily: FONT_FAMILY.heading,
    fontSize: FONT_SIZE.lg,
    color: COLORS.text,
  },
  subtitle: {
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.xs,
    color: COLORS.textMuted,
    marginTop: -SPACING.sm,
  },
  label: {
    fontFamily: FONT_FAMILY.bodySemibold,
    fontSize: FONT_SIZE.sm,
    color: COLORS.text,
    marginBottom: SPACING.xs,
  },
  pillRow: {
    flexDirection: "row",
    gap: SPACING.sm,
  },
  pill: {
    flex: 1,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: SURFACE.cardBorder,
    alignItems: "center",
  },
  pillActive: {
    backgroundColor: COLORS.primary + "20",
    borderColor: COLORS.primary,
  },
  pillText: {
    fontFamily: FONT_FAMILY.bodyMedium,
    fontSize: FONT_SIZE.sm,
    color: COLORS.textMuted,
  },
  pillTextActive: {
    color: COLORS.primary,
  },
});
