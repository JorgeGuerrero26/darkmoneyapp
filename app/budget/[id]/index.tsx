import { useCallback, useMemo, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQueryClient } from "@tanstack/react-query";
import { MoreVertical } from "lucide-react-native";

import { ErrorBoundary } from "../../../components/ui/ErrorBoundary";
import { SkeletonCard, SkeletonList } from "../../../components/ui/Skeleton";
import { ScreenHeader } from "../../../components/layout/ScreenHeader";
import { NotificationReasonBanner } from "../../../components/ui/NotificationReasonBanner";
import { EntityActionSheet } from "../../../components/ui/EntityActionSheet";
import { HeaderActionGroup } from "../../../components/ui/HeaderActionGroup";
import { DetailTabs } from "../../../components/ui/DetailTabs";
import { ConfirmDialog } from "../../../components/ui/ConfirmDialog";
import { ResourceModuleTemplate } from "../../../components/ui/ResourceModuleTemplate";
import { BudgetForm } from "../../../components/forms/BudgetForm";
import { BudgetQuickEditSheet } from "../../../features/budgets/components/BudgetQuickEditSheet";
import { BudgetDetailHeader } from "../../../features/budgets/components/BudgetDetailHeader";
import { BudgetDetailFields } from "../../../features/budgets/components/BudgetDetailFields";
import { BudgetDetailActions } from "../../../features/budgets/components/BudgetDetailActions";
import { BudgetDetailContributions } from "../../../features/budgets/components/BudgetDetailContributions";
import { BudgetDetailHistory } from "../../../features/budgets/components/BudgetDetailHistory";
import { useOriginBackNavigation } from "../../../hooks/useOriginBackNavigation";
import { useNotificationReason } from "../../../hooks/useNotificationReason";
import { useToast } from "../../../hooks/useToast";
import { useAuth } from "../../../lib/auth-context";
import { useWorkspace } from "../../../lib/workspace-context";
import { useUiStore } from "../../../store/ui-store";
import { useWorkspaceSnapshotQuery } from "../../../services/queries/workspace-data";
import {
  useDeleteBudgetMutation,
  useTogglePinBudgetMutation,
} from "../../../services/queries/budgets";
import { useBudgetScopeMovementsQuery } from "../../../services/queries/budget-analytics";
import {
  applyBudgetComputedMetrics,
  buildBudgetMetricsMap,
} from "../../../lib/budget-metrics";
import { COLORS, FONT_SIZE, FONT_WEIGHT, SPACING } from "../../../constants/theme";
import type { BudgetOverview } from "../../../types/domain";

function parseBudgetId(raw: string | undefined): number | null {
  if (!raw) return null;
  const parsed = parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

type BudgetDetailTab = "details" | "activity";

const DETAIL_TABS: Array<{ id: BudgetDetailTab; label: string }> = [
  { id: "details", label: "Detalles" },
  { id: "activity", label: "Actividad" },
];

function BudgetDetailScreen() {
  // Fuerza el re-render de la pantalla al alternar modo privacidad (la máscara
  // vive en formatCurrency, que lee el store imperativamente).
  useUiStore((state) => state.privacyMode);
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
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
  const { showToast, showErrorToast } = useToast();

  const [editVisible, setEditVisible] = useState(false);
  const [detailTab, setDetailTab] = useState<BudgetDetailTab>("details");
  const [menuOpen, setMenuOpen] = useState(false);
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
  const togglePinMutation = useTogglePinBudgetMutation(activeWorkspaceId);

  const handleTogglePin = useCallback(() => {
    if (!budget) return;
    togglePinMutation.mutate(
      { id: budget.id, isPinned: !budget.isPinned },
      { onError: (err) => showErrorToast(budget.isPinned ? "No se pudo desfijar el presupuesto" : "No se pudo fijar el presupuesto", err) },
    );
  }, [budget, showToast, togglePinMutation]);

  const handleDelete = useCallback(async () => {
    if (!budget) return;
    setDeleteConfirmVisible(false);
    try {
      await deleteMutation.mutateAsync(budget.id);
      showToast("Presupuesto eliminado", "success", budget.name);
      void queryClient.invalidateQueries({ queryKey: ["workspace-snapshot"] });
      handleBack();
    } catch (err: unknown) {
      showErrorToast("No se pudo eliminar el presupuesto", err);
    }
  }, [budget, deleteMutation, handleBack, queryClient, showToast]);

  return (
    <ResourceModuleTemplate
      topInset={insets.top}
      header={
        <>
          <ScreenHeader
            title="Presupuesto"
            subtitle={budget?.name}
            onBack={handleBack}
            rightAction={
              budget ? (
                <HeaderActionGroup
                  actions={[{
                    key: "menu",
                    icon: MoreVertical,
                    onPress: () => setMenuOpen(true),
                    accessibilityLabel: "Más acciones",
                  }]}
                />
              ) : null
            }
          />
          <NotificationReasonBanner reason={notificationReason} onDismiss={dismissNotificationReason} />
          {budget ? (
            <View style={styles.detailTabs}>
              <DetailTabs tabs={DETAIL_TABS} activeTab={detailTab} onChange={setDetailTab} />
            </View>
          ) : null}
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
          <ScrollView key={detailTab} style={styles.scroll} contentContainerStyle={styles.content}>
            {detailTab === "details" ? (
              <>
                <BudgetDetailHeader budget={budget} onReviewMovements={() => setDetailTab("activity")} />
                <BudgetDetailFields budget={budget} />
              </>
            ) : (
              <>
                <BudgetDetailContributions
                  contributions={analytics?.contributions ?? []}
                  currencyCode={budget.currencyCode}
                  onSeeAll={() => router.push({
                    pathname: "/budget/[id]/movements",
                    params: { id: String(budget.id), from: "budget" },
                  })}
                />
                <BudgetDetailHistory current={budget} allBudgets={allBudgets} />
              </>
            )}
          </ScrollView>
        )
      }
      fab={budget ? (
        <BudgetDetailActions
          bottomInset={insets.bottom}
          onEdit={() => setEditVisible(true)}
          onAdjustLimit={() => setQuickEditVisible(true)}
        />
      ) : null}
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
          {budget ? (
            <EntityActionSheet
              visible={menuOpen}
              onClose={() => setMenuOpen(false)}
              sheetTitle="Más acciones"
              summaryTitle={budget.name}
              actions={[
                {
                  key: "pin",
                  label: budget?.isPinned ? "Quitar de fijados" : "Fijar en la lista",
                  variant: "secondary" as const,
                  onPress: () => { setMenuOpen(false); handleTogglePin(); },
                },
                {
                  key: "delete",
                  label: "Eliminar presupuesto",
                  variant: "ghost" as const,
                  onPress: () => { setMenuOpen(false); setDeleteConfirmVisible(true); },
                },
              ]}
            />
          ) : null}

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


const styles = StyleSheet.create({
  detailTabs: { paddingHorizontal: SPACING.xl },
  scroll: { flex: 1 },
  content: {
    paddingHorizontal: SPACING.xl,
    paddingTop: SPACING.lg,
    gap: SPACING.xxl,
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
});

export default function BudgetDetailScreenRoot() {
  return (
    <ErrorBoundary>
      <BudgetDetailScreen />
    </ErrorBoundary>
  );
}
