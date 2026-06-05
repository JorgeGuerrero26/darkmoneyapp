import { ErrorBoundary } from "../../components/ui/ErrorBoundary";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SectionListRenderItem } from "react-native";
import * as Haptics from "expo-haptics";
import { CheckSquare, Copy, Download, Target, Trash2, X } from "lucide-react-native";
import { format } from "date-fns";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { BudgetAnalyticsModal } from "../../components/domain/BudgetAnalyticsModal";
import { BudgetForm } from "../../components/forms/BudgetForm";
import { ScreenHeader } from "../../components/layout/ScreenHeader";
import { ActiveFilterBar, type ActiveFilterItem } from "../../components/ui/ActiveFilterBar";
import { BulkActionBar } from "../../components/ui/BulkActionBar";
import { FAB } from "../../components/ui/FAB";
import { FilterToolbar } from "../../components/ui/FilterToolbar";
import { HeaderActionGroup } from "../../components/ui/HeaderActionGroup";
import { ResourceContextNote } from "../../components/ui/ResourceContextNote";
import { ResourceModuleTemplate } from "../../components/ui/ResourceModuleTemplate";
import { ResourceSectionList } from "../../components/ui/ResourceSectionList";
import { SkeletonCard, SkeletonList } from "../../components/ui/Skeleton";
import { UndoBanner } from "../../components/ui/UndoBanner";
import { BudgetQuickEditSheet } from "../../features/budgets/components/BudgetQuickEditSheet";
import { BudgetSummaryBar } from "../../features/budgets/components/BudgetSummaryBar";
import { BudgetSwipeRow } from "../../features/budgets/components/BudgetSwipeRow";
import { buildBudgetSections, type BudgetListSection } from "../../features/budgets/lib/buildBudgetSections";
import {
  BUDGET_FILTERS,
  budgetFilterLabel,
  filterBudgets,
  type ActiveBudgetFilter,
} from "../../features/budgets/lib/budgetFilters";
import { buildBudgetCSV } from "../../features/budgets/lib/budgetsCsv";
import { buildRateMap, convertAmount } from "../../features/budgets/lib/budgetCurrency";
import { buildBudgetsContextNote } from "../../features/budgets/lib/buildBudgetsContextNote";
import { useAuth } from "../../lib/auth-context";
import {
  applyBudgetComputedMetrics,
  buildBudgetMetricsMap,
} from "../../lib/budget-metrics";
import { shareCsvAsFile } from "../../lib/share-csv-file";
import { useWorkspace } from "../../lib/workspace-context";
import { useToast } from "../../hooks/useToast";
import { useOriginBackNavigation } from "../../hooks/useOriginBackNavigation";
import { useBudgetScopeMovementsQuery } from "../../services/queries/budget-analytics";
import { useWorkspaceSnapshotQuery } from "../../services/queries/workspace-data";
import {
  useDeleteBudgetMutation,
  useDuplicateBudgetMutation,
  useTogglePinBudgetMutation,
} from "../../services/queries/budgets";
import type { BudgetOverview } from "../../types/domain";

function BudgetsScreen() {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const router = useRouter();
  const { handleBack } = useOriginBackNavigation({
    originRoutes: {
      dashboard: "/(app)/dashboard",
      notifications: "/notifications",
    },
  });
  const { profile } = useAuth();
  const { activeWorkspaceId, activeWorkspace } = useWorkspace();
  const { showToast } = useToast();

  const [formVisible, setFormVisible] = useState(false);
  const [editBudget, setEditBudget] = useState<BudgetOverview | null>(null);
  const [analyticsBudgetId, setAnalyticsBudgetId] = useState<number | null>(null);
  const [quickEditBudget, setQuickEditBudget] = useState<BudgetOverview | null>(null);
  const [searchText, setSearchText] = useState("");
  const [activeFilters, setActiveFilters] = useState<ActiveBudgetFilter[]>([]);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [pendingDeleteIds, setPendingDeleteIds] = useState<Set<number>>(new Set());
  const pendingDeleteLabels = useRef<Map<number, string>>(new Map());
  const deleteTimers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());
  const refreshTriggeredRef = useRef(false);

  const deleteMutation = useDeleteBudgetMutation(activeWorkspaceId);
  const duplicateMutation = useDuplicateBudgetMutation(activeWorkspaceId);
  const togglePinMutation = useTogglePinBudgetMutation(activeWorkspaceId);
  const {
    data: snapshot,
    isLoading: snapshotLoading,
    dataUpdatedAt,
  } = useWorkspaceSnapshotQuery(profile, activeWorkspaceId);

  const budgets = snapshot?.budgets ?? [];
  const baseCurrencyCode = activeWorkspace?.baseCurrencyCode ?? profile?.baseCurrencyCode ?? "PEN";
  const activeBudgets = useMemo(
    () => budgets.filter((budget) => !pendingDeleteIds.has(budget.id)),
    [budgets, pendingDeleteIds],
  );

  const {
    data: scopedMovements = [],
    isLoading: movementsLoading,
    error: budgetMovementsError,
  } = useBudgetScopeMovementsQuery(activeWorkspaceId, activeBudgets, dataUpdatedAt);

  const metricsMap = useMemo(
    () =>
      buildBudgetMetricsMap(activeBudgets, scopedMovements, {
        workspaceBaseCurrencyCode: baseCurrencyCode,
        exchangeRates: snapshot?.exchangeRates ?? [],
      }),
    [activeBudgets, baseCurrencyCode, scopedMovements, snapshot?.exchangeRates],
  );

  const correctedBudgets = useMemo(() => {
    if (budgetMovementsError) return activeBudgets;
    return activeBudgets.map((budget) =>
      applyBudgetComputedMetrics(
        budget,
        metricsMap.get(budget.id) ?? {
          spentAmount: 0,
          remainingAmount: budget.limitAmount,
          usedPercent: 0,
          movementCount: 0,
          contributions: [],
          averageMovementAmount: 0,
          maxMovementAmount: 0,
        },
      ),
    );
  }, [activeBudgets, budgetMovementsError, metricsMap]);

  const filteredBudgets = useMemo(
    () => filterBudgets(correctedBudgets, activeFilters, searchText),
    [activeFilters, correctedBudgets, searchText],
  );

  const budgetSections = useMemo(() => buildBudgetSections(filteredBudgets), [filteredBudgets]);
  const rateMap = useMemo(() => buildRateMap(snapshot?.exchangeRates ?? []), [snapshot?.exchangeRates]);
  const summary = useMemo(() => {
    return filteredBudgets.reduce(
      (acc, budget) => {
        acc.limitTotal += convertAmount(budget.limitAmount, budget.currencyCode, baseCurrencyCode, rateMap);
        acc.spentTotal += convertAmount(budget.spentAmount, budget.currencyCode, baseCurrencyCode, rateMap);
        acc.remainingTotal += convertAmount(budget.remainingAmount, budget.currencyCode, baseCurrencyCode, rateMap);
        if (budget.isNearLimit || budget.isOverLimit) acc.attentionCount += 1;
        return acc;
      },
      { limitTotal: 0, spentTotal: 0, remainingTotal: 0, attentionCount: 0 },
    );
  }, [baseCurrencyCode, filteredBudgets, rateMap]);

  const isMetricsLoading =
    activeBudgets.length > 0 &&
    !budgetMovementsError &&
    movementsLoading &&
    scopedMovements.length === 0;

  const analyticsBudget = useMemo(
    () => correctedBudgets.find((budget) => budget.id === analyticsBudgetId) ?? null,
    [analyticsBudgetId, correctedBudgets],
  );
  const analyticsMetrics = analyticsBudgetId != null ? metricsMap.get(analyticsBudgetId) ?? null : null;
  const selectedBudgets = useMemo(
    () => filteredBudgets.filter((budget) => selectedIds.has(budget.id)),
    [filteredBudgets, selectedIds],
  );

  const activeFilterItems = useMemo<ActiveFilterItem[]>(() => {
    const items = activeFilters.map((filter) => ({
      key: `filter-${filter}`,
      label: budgetFilterLabel(filter),
      onRemove: () => setActiveFilters((current) => current.filter((item) => item !== filter)),
    }));

    if (searchText.trim()) {
      items.push({
        key: "search",
        label: `Búsqueda: ${searchText.trim()}`,
        onRemove: () => setSearchText(""),
      });
    }

    return items;
  }, [activeFilters, searchText]);

  const onRefresh = useCallback(() => {
    refreshTriggeredRef.current = true;
    void queryClient.invalidateQueries({ queryKey: ["workspace-snapshot"] });
  }, [queryClient]);

  useEffect(() => {
    if (!snapshotLoading && !movementsLoading && refreshTriggeredRef.current) {
      refreshTriggeredRef.current = false;
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  }, [movementsLoading, snapshotLoading]);

  useEffect(() => () => {
    deleteTimers.current.forEach(clearTimeout);
    deleteTimers.current.clear();
    pendingDeleteLabels.current.clear();
  }, []);

  useFocusEffect(
    useCallback(() => {
      void queryClient.invalidateQueries({ queryKey: ["workspace-snapshot"] });
    }, [queryClient]),
  );

  const clearFilters = useCallback(() => {
    setActiveFilters([]);
    setSearchText("");
  }, []);

  const toggleSelect = useCallback((id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const exitSelectMode = useCallback(() => {
    setSelectMode(false);
    setSelectedIds(new Set());
  }, []);

  const startUndoDelete = useCallback((budget: BudgetOverview) => {
    setPendingDeleteIds((prev) => new Set(prev).add(budget.id));
    pendingDeleteLabels.current.set(budget.id, budget.name);
    const timer = setTimeout(() => {
      deleteMutation.mutate(budget.id, {
        onError: (error) => showToast(error.message, "error"),
      });
      setPendingDeleteIds((prev) => {
        const next = new Set(prev);
        next.delete(budget.id);
        return next;
      });
      pendingDeleteLabels.current.delete(budget.id);
      deleteTimers.current.delete(budget.id);
    }, 5000);
    deleteTimers.current.set(budget.id, timer);
  }, [deleteMutation, showToast]);

  const undoDelete = useCallback((id: number) => {
    const timer = deleteTimers.current.get(id);
    if (timer) clearTimeout(timer);
    deleteTimers.current.delete(id);
    pendingDeleteLabels.current.delete(id);
    setPendingDeleteIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }, []);

  const handleDelete = useCallback((budget: BudgetOverview) => {
    startUndoDelete(budget);
  }, [startUndoDelete]);

  const handleBulkDelete = useCallback(() => {
    selectedBudgets.forEach(startUndoDelete);
    exitSelectMode();
  }, [exitSelectMode, selectedBudgets, startUndoDelete]);

  const handleTogglePin = useCallback((budget: BudgetOverview) => {
    togglePinMutation.mutate(
      { id: budget.id, isPinned: !budget.isPinned },
      {
        onError: (err) => showToast(err.message, "error"),
      },
    );
  }, [showToast, togglePinMutation]);

  const handleDuplicate = useCallback(async (budget: BudgetOverview) => {
    try {
      await duplicateMutation.mutateAsync(budget);
      showToast(`"${budget.name}" duplicado al próximo período`, "success");
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : "No se pudo duplicar", "error");
    }
  }, [duplicateMutation, showToast]);

  const handleBulkDuplicate = useCallback(async () => {
    let count = 0;
    for (const budget of selectedBudgets) {
      try {
        await duplicateMutation.mutateAsync(budget);
        count += 1;
      } catch (err: unknown) {
        showToast(err instanceof Error ? err.message : "No se pudo duplicar uno", "error");
      }
    }
    exitSelectMode();
    if (count > 0) {
      showToast(
        count === 1
          ? "1 presupuesto duplicado al próximo período"
          : `${count} presupuestos duplicados al próximo período`,
        "success",
      );
    }
  }, [duplicateMutation, exitSelectMode, selectedBudgets, showToast]);

  const exportCSV = useCallback(async (budgetsToExport: BudgetOverview[]) => {
    const csv = buildBudgetCSV(budgetsToExport);
    const fileName = `presupuestos_${format(new Date(), "yyyyMMdd")}.csv`;
    try {
      await shareCsvAsFile(csv, fileName);
    } catch {
      showToast("No se pudo exportar", "error");
    }
  }, [showToast]);

  const renderBudget: SectionListRenderItem<BudgetOverview, BudgetListSection> = useCallback(({ item: budget }) => (
    <BudgetSwipeRow
      budget={budget}
      selected={selectedIds.has(budget.id)}
      onPress={() => {
        if (selectMode) {
          toggleSelect(budget.id);
          return;
        }
        setEditBudget(budget);
      }}
      onLongPress={() => {
        if (!selectMode) setSelectMode(true);
        toggleSelect(budget.id);
      }}
      onDelete={() => handleDelete(budget)}
      onDuplicate={() => void handleDuplicate(budget)}
      onAnalytics={() => setAnalyticsBudgetId(budget.id)}
      onQuickEdit={selectMode ? undefined : () => setQuickEditBudget(budget)}
      onTogglePin={selectMode ? undefined : () => handleTogglePin(budget)}
    />
  ), [handleDelete, handleDuplicate, handleTogglePin, selectMode, selectedIds, toggleSelect]);

  const contextNote = buildBudgetsContextNote({
    visibleCount: filteredBudgets.length,
    totalCount: correctedBudgets.length,
  });

  return (
    <ResourceModuleTemplate
      topInset={insets.top}
      header={
        <ScreenHeader
          title={selectMode ? `${selectedIds.size} seleccionados` : "Presupuestos"}
          onBack={handleBack}
          rightAction={
            selectMode ? (
              <HeaderActionGroup
                actions={[{
                  key: "cancel",
                  icon: X,
                  label: "Cancelar",
                  onPress: exitSelectMode,
                  accessibilityLabel: "Cancelar selección",
                }]}
              />
            ) : (
              <HeaderActionGroup
                actions={[{
                  key: "export",
                  icon: Download,
                  onPress: () => exportCSV(filteredBudgets),
                  disabled: filteredBudgets.length === 0,
                  accessibilityLabel: "Exportar presupuestos en CSV",
                }]}
              />
            )
          }
        />
      }
      toolbar={
        !selectMode ? (
          <FilterToolbar
            options={BUDGET_FILTERS}
            selectedValues={activeFilters}
            onSelectedValuesChange={(values) =>
              setActiveFilters(values.filter((value): value is ActiveBudgetFilter => value !== "all"))
            }
            allValue="all"
            searchValue={searchText}
            onSearchChange={setSearchText}
            searchPlaceholder="Buscar presupuestos..."
          />
        ) : null
      }
      activeFilters={
        !selectMode ? (
          <ActiveFilterBar items={activeFilterItems} onClear={clearFilters} />
        ) : null
      }
      context={!selectMode ? <ResourceContextNote>{contextNote}</ResourceContextNote> : null}
      summary={
        !selectMode && filteredBudgets.length > 0 ? (
          <BudgetSummaryBar
            limitTotal={summary.limitTotal}
            spentTotal={summary.spentTotal}
            remainingTotal={summary.remainingTotal}
            attentionCount={summary.attentionCount}
            currencyCode={baseCurrencyCode}
          />
        ) : null
      }
      bulkActions={
        selectMode && selectedIds.size > 0 ? (
          <BulkActionBar
            selectedCount={selectedIds.size}
            onClear={exitSelectMode}
            actions={[
              {
                key: "select-all",
                label: `Sel. todos (${filteredBudgets.length})`,
                icon: CheckSquare,
                onPress: () => setSelectedIds(new Set(filteredBudgets.map((budget) => budget.id))),
              },
              {
                key: "csv",
                label: "CSV",
                icon: Download,
                tone: "primary",
                onPress: () => exportCSV(selectedBudgets),
              },
              {
                key: "duplicate",
                label: `Duplicar (${selectedIds.size})`,
                icon: Copy,
                tone: "neutral",
                onPress: () => void handleBulkDuplicate(),
              },
              {
                key: "delete",
                label: `Eliminar (${selectedIds.size})`,
                icon: Trash2,
                tone: "danger",
                onPress: handleBulkDelete,
              },
            ]}
          />
        ) : null
      }
      list={
        <ResourceSectionList
          sections={budgetSections}
          keyExtractor={(budget) => String(budget.id)}
          renderItem={renderBudget}
          loading={{
            isLoading: snapshotLoading || isMetricsLoading,
            skeleton: (
              <SkeletonList>
                <SkeletonCard />
                <SkeletonCard />
                <SkeletonCard />
              </SkeletonList>
            ),
          }}
          empty={
            correctedBudgets.length === 0 ? {
              icon: Target,
              title: "Sin presupuestos activos",
              description: "Pon un límite de gasto por categoría y recibe una alerta cuando estés cerca de alcanzarlo.",
              action: { label: "Crear primer presupuesto", onPress: () => setFormVisible(true) },
            } : {
              variant: "no-results",
              title: "Sin resultados",
              description: "Ningún presupuesto coincide con tu búsqueda o filtros.",
              action: { label: "Limpiar filtros", onPress: clearFilters },
            }
          }
          refreshing={snapshotLoading || movementsLoading}
          onRefresh={onRefresh}
        />
      }
      fab={
        !selectMode ? (
          <FAB onPress={() => { setEditBudget(null); setFormVisible(true); }} bottom={insets.bottom + 16} />
        ) : null
      }
      overlays={
        <>
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
          <BudgetAnalyticsModal
            visible={Boolean(analyticsBudget)}
            budget={analyticsBudget}
            analytics={analyticsMetrics}
            onClose={() => setAnalyticsBudgetId(null)}
          />
          <BudgetQuickEditSheet
            visible={Boolean(quickEditBudget)}
            budget={quickEditBudget}
            onClose={() => setQuickEditBudget(null)}
          />
          <UndoBanner
            visible={pendingDeleteIds.size > 0}
            message={(() => {
              if (pendingDeleteIds.size === 0) return "";
              if (pendingDeleteIds.size === 1) {
                const [onlyId] = pendingDeleteIds;
                const label = pendingDeleteLabels.current.get(onlyId) ?? "";
                return label ? `Presupuesto "${label}" eliminado` : "Presupuesto eliminado";
              }
              return `${pendingDeleteIds.size} presupuestos eliminados`;
            })()}
            onUndo={() => pendingDeleteIds.forEach((id) => undoDelete(id))}
            durationMs={5000}
            bottomOffset={insets.bottom + 80}
          />
        </>
      }
    />
  );
}

export default function BudgetsScreenRoot() {
  return (
    <ErrorBoundary>
      <BudgetsScreen />
    </ErrorBoundary>
  );
}
