import { useCallback, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQueryClient } from "@tanstack/react-query";
import { Copy, Pencil, Pin, PinOff, Sliders, Trash2 } from "lucide-react-native";

import { ErrorBoundary } from "../../components/ui/ErrorBoundary";
import { Card } from "../../components/ui/Card";
import { SkeletonCard, SkeletonList } from "../../components/ui/Skeleton";
import { ScreenHeader } from "../../components/layout/ScreenHeader";
import { NotificationReasonBanner } from "../../components/ui/NotificationReasonBanner";
import { HeaderActionGroup } from "../../components/ui/HeaderActionGroup";
import { ConfirmDialog } from "../../components/ui/ConfirmDialog";
import { ResourceModuleTemplate } from "../../components/ui/ResourceModuleTemplate";
import { BudgetForm } from "../../components/forms/BudgetForm";
import { BudgetQuickEditSheet } from "../../features/budgets/components/BudgetQuickEditSheet";
import { BudgetDetailHeader } from "../../features/budgets/components/BudgetDetailHeader";
import { BudgetDetailQuickStats } from "../../features/budgets/components/BudgetDetailQuickStats";
import { BudgetDetailContributions } from "../../features/budgets/components/BudgetDetailContributions";
import { BudgetDetailHistory } from "../../features/budgets/components/BudgetDetailHistory";
import { useOriginBackNavigation } from "../../hooks/useOriginBackNavigation";
import { useNotificationReason } from "../../hooks/useNotificationReason";
import { useToast } from "../../hooks/useToast";
import { useAuth } from "../../lib/auth-context";
import { useWorkspace } from "../../lib/workspace-context";
import { useUiStore } from "../../store/ui-store";
import { useWorkspaceSnapshotQuery } from "../../services/queries/workspace-data";
import {
  useDeleteBudgetMutation,
  useDuplicateBudgetMutation,
  useTogglePinBudgetMutation,
} from "../../services/queries/budgets";
import { useBudgetScopeMovementsQuery } from "../../services/queries/budget-analytics";
import {
  applyBudgetComputedMetrics,
  buildBudgetMetricsMap,
} from "../../lib/budget-metrics";
import { COLORS, FONT_FAMILY, FONT_SIZE, FONT_WEIGHT, SPACING } from "../../constants/theme";
import type { BudgetOverview } from "../../types/domain";

function parseBudgetId(raw: string | undefined): number | null {
  if (!raw) return null;
  const parsed = parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function BudgetDetailScreen() {
  // Fuerza el re-render de la pantalla al alternar modo privacidad (la máscara
  // vive en formatCurrency, que lee el store imperativamente).
  useUiStore((state) => state.privacyMode);
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { handleBack } = useOriginBackNavigation({
    originRoutes: {
      dashboard: "/(app)/dashboard",
      budgets: "/(app)/budgets",
      notifications: "/notifications",
    },
  });
  const { reason: notificationReason, dismiss: dismissNotificationReason } = useNotificationReason();
  const { profile } = useAuth();
  const { activeWorkspaceId, activeWorkspace } = useWorkspace();
  const { showToast } = useToast();

  const [editVisible, setEditVisible] = useState(false);
  const [quickEditVisible, setQuickEditVisible] = useState(false);
  const [deleteConfirmVisible, setDeleteConfirmVisible] = useState(false);

  const budgetId = parseBudgetId(id);
  const { data: snapshot, isLoading, dataUpdatedAt } = useWorkspaceSnapshotQuery(profile, activeWorkspaceId);

  const allBudgets = snapshot?.budgets ?? [];
  const baseCurrencyCode = activeWorkspace?.baseCurrencyCode ?? profile?.baseCurrencyCode ?? "PEN";

  const rawBudget = useMemo(() => {
    if (budgetId == null) return null;
    return allBudgets.find((b) => b.id === budgetId) ?? null;
  }, [allBudgets, budgetId]);

  const budgetsForQuery = useMemo(() => (rawBudget ? [rawBudget] : []), [rawBudget]);
  const { data: scopedMovements = [] } = useBudgetScopeMovementsQuery(
    activeWorkspaceId,
    budgetsForQuery,
    dataUpdatedAt,
  );

  const metricsMap = useMemo(
    () =>
      buildBudgetMetricsMap(budgetsForQuery, scopedMovements, {
        workspaceBaseCurrencyCode: baseCurrencyCode,
        exchangeRates: snapshot?.exchangeRates ?? [],
      }),
    [baseCurrencyCode, budgetsForQuery, scopedMovements, snapshot?.exchangeRates],
  );

  const budget: BudgetOverview | null = useMemo(() => {
    if (!rawBudget) return null;
    const metrics = metricsMap.get(rawBudget.id);
    if (!metrics) return rawBudget;
    return applyBudgetComputedMetrics(rawBudget, metrics);
  }, [metricsMap, rawBudget]);

  const analytics = budget ? metricsMap.get(budget.id) ?? null : null;

  const deleteMutation = useDeleteBudgetMutation(activeWorkspaceId);
  const duplicateMutation = useDuplicateBudgetMutation(activeWorkspaceId);
  const togglePinMutation = useTogglePinBudgetMutation(activeWorkspaceId);

  const handleDuplicate = useCallback(async () => {
    if (!budget) return;
    try {
      await duplicateMutation.mutateAsync(budget);
      showToast("Presupuesto duplicado al próximo período", "success");
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : "No se pudo duplicar", "error");
    }
  }, [budget, duplicateMutation, showToast]);

  const handleTogglePin = useCallback(() => {
    if (!budget) return;
    togglePinMutation.mutate(
      { id: budget.id, isPinned: !budget.isPinned },
      { onError: (err) => showToast(err.message, "error") },
    );
  }, [budget, showToast, togglePinMutation]);

  const handleDelete = useCallback(async () => {
    if (!budget) return;
    setDeleteConfirmVisible(false);
    try {
      await deleteMutation.mutateAsync(budget.id);
      showToast("Presupuesto eliminado", "success");
      void queryClient.invalidateQueries({ queryKey: ["workspace-snapshot"] });
      handleBack();
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : "No se pudo eliminar", "error");
    }
  }, [budget, deleteMutation, handleBack, queryClient, showToast]);

  return (
    <ResourceModuleTemplate
      topInset={insets.top}
      header={
        <>
          <ScreenHeader
            title={budget?.name ?? "Presupuesto"}
            subtitle={activeWorkspace?.name}
            onBack={handleBack}
            rightAction={
              budget ? (
                <HeaderActionGroup
                  actions={[
                    {
                      key: "pin",
                      icon: budget.isPinned ? PinOff : Pin,
                      onPress: handleTogglePin,
                      accessibilityLabel: budget.isPinned ? "Desfijar" : "Fijar",
                    },
                    {
                      key: "duplicate",
                      icon: Copy,
                      onPress: () => void handleDuplicate(),
                      accessibilityLabel: "Duplicar al próximo período",
                    },
                    {
                      key: "edit",
                      icon: Pencil,
                      onPress: () => setEditVisible(true),
                      accessibilityLabel: "Editar presupuesto",
                    },
                    {
                      key: "delete",
                      icon: Trash2,
                      onPress: () => setDeleteConfirmVisible(true),
                      accessibilityLabel: "Eliminar presupuesto",
                    },
                  ]}
                />
              ) : null
            }
          />
          <NotificationReasonBanner reason={notificationReason} onDismiss={dismissNotificationReason} />
        </>
      }
      list={
        isLoading ? (
          <SkeletonList>
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </SkeletonList>
        ) : !budget ? (
          <View style={styles.center}>
            <Text style={styles.errorTitle}>Presupuesto no encontrado</Text>
            <Text style={styles.errorBody}>
              {budgetId == null
                ? "El identificador del presupuesto no es válido."
                : "Es posible que el presupuesto haya sido eliminado."}
            </Text>
          </View>
        ) : (
          <ScrollView contentContainerStyle={styles.content}>
            <BudgetDetailHeader budget={budget} />

            <Card style={styles.quickActions}>
              <Text style={styles.quickActionsHint}>Acciones rápidas</Text>
              <View style={styles.quickActionsRow}>
                <QuickActionButton
                  icon={Sliders}
                  label="Ajuste rápido"
                  onPress={() => setQuickEditVisible(true)}
                />
                <QuickActionButton
                  icon={Copy}
                  label="Duplicar"
                  onPress={() => void handleDuplicate()}
                />
                <QuickActionButton
                  icon={budget.isPinned ? PinOff : Pin}
                  label={budget.isPinned ? "Desfijar" : "Fijar"}
                  onPress={handleTogglePin}
                />
              </View>
            </Card>

            <BudgetDetailQuickStats budget={budget} />

            <BudgetDetailContributions
              contributions={analytics?.contributions ?? []}
              currencyCode={budget.currencyCode}
            />

            <BudgetDetailHistory current={budget} allBudgets={allBudgets} />

            {budget.notes ? (
              <Card>
                <Text style={styles.sectionTitle}>Notas</Text>
                <Text style={styles.notes}>{budget.notes}</Text>
              </Card>
            ) : null}
          </ScrollView>
        )
      }
      overlays={
        <>
          {budget ? (
            <BudgetForm
              visible={editVisible}
              onClose={() => setEditVisible(false)}
              onSuccess={() => setEditVisible(false)}
              editBudget={budget}
            />
          ) : null}
          <BudgetQuickEditSheet
            visible={quickEditVisible}
            budget={budget}
            onClose={() => setQuickEditVisible(false)}
          />
          <ConfirmDialog
            visible={deleteConfirmVisible}
            title="¿Eliminar presupuesto?"
            body={budget ? `Se eliminará "${budget.name}" permanentemente.` : undefined}
            confirmLabel="Sí, eliminar"
            cancelLabel="Cancelar"
            onCancel={() => setDeleteConfirmVisible(false)}
            onConfirm={() => void handleDelete()}
          />
        </>
      }
    />
  );
}

function QuickActionButton({
  icon: Icon,
  label,
  onPress,
}: {
  icon: typeof Pin;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.quickAction, pressed && styles.quickActionPressed]}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Icon size={16} color={COLORS.primary} strokeWidth={2} />
      <Text style={styles.quickActionLabel}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: SPACING.lg,
    gap: SPACING.md,
    paddingBottom: SPACING.xxxl,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: SPACING.lg,
    gap: SPACING.sm,
  },
  errorTitle: {
    color: COLORS.text,
    fontSize: FONT_SIZE.md,
    fontWeight: FONT_WEIGHT.semibold,
  },
  errorBody: {
    color: COLORS.textMuted,
    fontSize: FONT_SIZE.sm,
    textAlign: "center",
  },
  quickActions: {
    gap: SPACING.sm,
  },
  quickActionsHint: {
    fontFamily: FONT_FAMILY.bodySemibold,
    fontSize: FONT_SIZE.xs,
    color: COLORS.textMuted,
    textTransform: "uppercase",
  },
  quickActionsRow: {
    flexDirection: "row",
    gap: SPACING.sm,
  },
  quickAction: {
    flex: 1,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.xs,
    alignItems: "center",
    gap: SPACING.xs,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: SPACING.md,
    backgroundColor: COLORS.bgCard,
  },
  quickActionPressed: {
    opacity: 0.6,
  },
  quickActionLabel: {
    fontFamily: FONT_FAMILY.bodySemibold,
    fontSize: FONT_SIZE.xs,
    color: COLORS.primary,
  },
  sectionTitle: {
    fontSize: FONT_SIZE.xs,
    fontWeight: FONT_WEIGHT.semibold,
    color: COLORS.textMuted,
    textTransform: "uppercase",
    marginBottom: SPACING.xs,
  },
  notes: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.text,
    lineHeight: 20,
  },
});

export default function BudgetDetailScreenRoot() {
  return (
    <ErrorBoundary>
      <BudgetDetailScreen />
    </ErrorBoundary>
  );
}
