import { useCallback, useState } from "react";
import {
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAuth } from "../../lib/auth-context";
import { useWorkspace } from "../../lib/workspace-context";
import {
  useWorkspaceSnapshotQuery,
  useDeleteBudgetMutation,
} from "../../services/queries/workspace-data";
import type { BudgetOverview } from "../../types/domain";
import { BudgetCard } from "../../components/domain/BudgetCard";
import { SkeletonCard } from "../../components/ui/Skeleton";
import { EmptyState } from "../../components/ui/EmptyState";
import { ScreenHeader } from "../../components/layout/ScreenHeader";
import { BudgetForm } from "../../components/forms/BudgetForm";
import { useToast } from "../../hooks/useToast";
import { COLORS, FONT_SIZE, FONT_WEIGHT, RADIUS, SPACING } from "../../constants/theme";

export default function BudgetsScreen() {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const [formVisible, setFormVisible] = useState(false);
  const [editBudget, setEditBudget] = useState<BudgetOverview | null>(null);
  const { profile } = useAuth();
  const { activeWorkspaceId } = useWorkspace();
  const { showToast } = useToast();
  const deleteMutation = useDeleteBudgetMutation(activeWorkspaceId);

  const { data: snapshot, isLoading } = useWorkspaceSnapshotQuery(profile, activeWorkspaceId);

  const budgets = snapshot?.budgets ?? [];
  const alertBudgets = budgets.filter((b) => b.isOverLimit || b.isNearLimit);
  const okBudgets = budgets.filter((b) => !b.isOverLimit && !b.isNearLimit);

  const onRefresh = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ["workspace-snapshot"] });
  }, [queryClient]);

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <ScreenHeader title="Presupuestos" />

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={isLoading} onRefresh={onRefresh} tintColor={COLORS.primary} />
        }
      >
        {isLoading ? (
          <>
            <SkeletonCard />
            <SkeletonCard />
          </>
        ) : budgets.length === 0 ? (
          <EmptyState
            title="Sin presupuestos"
            description="Crea un presupuesto para controlar tus gastos."
            action={{ label: "Nuevo presupuesto", onPress: () => setFormVisible(true) }}
          />
        ) : (
          <>
            {alertBudgets.length > 0 ? (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>⚠ Requieren atención</Text>
                {alertBudgets.map((b) => (
                  <View key={b.id}>
                    <BudgetCard budget={b} />
                    <BudgetActions budget={b} onEdit={() => setEditBudget(b)} onDelete={handleDelete} />
                  </View>
                ))}
              </View>
            ) : null}

            {okBudgets.length > 0 ? (
              <View style={styles.section}>
                {alertBudgets.length > 0 ? (
                  <Text style={styles.sectionTitle}>✓ En buen estado</Text>
                ) : null}
                {okBudgets.map((b) => (
                  <View key={b.id}>
                    <BudgetCard budget={b} />
                    <BudgetActions budget={b} onEdit={() => setEditBudget(b)} onDelete={handleDelete} />
                  </View>
                ))}
              </View>
            ) : null}
          </>
        )}
      </ScrollView>

      <TouchableOpacity
        style={[styles.fab, { bottom: insets.bottom + 80 }]}
        activeOpacity={0.85}
        onPress={() => setFormVisible(true)}
      >
        <Text style={styles.fabIcon}>+</Text>
      </TouchableOpacity>

      <BudgetForm
        visible={formVisible}
        onClose={() => setFormVisible(false)}
        onSuccess={() => setFormVisible(false)}
      />
      <BudgetForm
        visible={Boolean(editBudget)}
        onClose={() => setEditBudget(null)}
        onSuccess={() => setEditBudget(null)}
        editBudget={editBudget ?? undefined}
      />
    </View>
  );

  function handleDelete(budget: BudgetOverview) {
    Alert.alert("Eliminar presupuesto", `¿Eliminar "${budget.name}"?`, [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Eliminar",
        style: "destructive",
        onPress: () => deleteMutation.mutate(budget.id, {
          onSuccess: () => showToast("Presupuesto eliminado", "success"),
          onError: (e) => showToast(e.message, "error"),
        }),
      },
    ]);
  }
}

function BudgetActions({
  budget,
  onEdit,
  onDelete,
}: {
  budget: BudgetOverview;
  onEdit: () => void;
  onDelete: (b: BudgetOverview) => void;
}) {
  return (
    <View style={actionStyles.row}>
      <TouchableOpacity style={[actionStyles.btn, actionStyles.editBtn]} onPress={onEdit}>
        <Text style={actionStyles.editText}>Editar</Text>
      </TouchableOpacity>
      <TouchableOpacity style={[actionStyles.btn, actionStyles.deleteBtn]} onPress={() => onDelete(budget)}>
        <Text style={actionStyles.deleteText}>Eliminar</Text>
      </TouchableOpacity>
    </View>
  );
}

const actionStyles = StyleSheet.create({
  row: { flexDirection: "row", gap: SPACING.sm, marginTop: -SPACING.sm, marginBottom: SPACING.sm },
  btn: {
    flex: 1,
    paddingVertical: SPACING.xs + 2,
    borderRadius: RADIUS.md,
    alignItems: "center",
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  editBtn: {},
  deleteBtn: { borderColor: COLORS.danger + "66" },
  editText: { fontSize: FONT_SIZE.xs, color: COLORS.textMuted, fontWeight: FONT_WEIGHT.medium },
  deleteText: { fontSize: FONT_SIZE.xs, color: COLORS.danger, fontWeight: FONT_WEIGHT.medium },
});

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.bg },
  content: { padding: SPACING.lg, gap: SPACING.md },
  section: { gap: SPACING.sm },
  sectionTitle: {
    fontSize: FONT_SIZE.sm,
    fontWeight: FONT_WEIGHT.semibold,
    color: COLORS.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  fab: {
    position: "absolute",
    right: SPACING.lg,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: COLORS.primary,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 8,
  },
  fabIcon: { color: "#FFFFFF", fontSize: 28, fontWeight: "300", lineHeight: 32 },
});
