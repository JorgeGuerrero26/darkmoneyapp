import { ErrorBoundary } from "../../components/ui/ErrorBoundary";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SectionListRenderItem } from "react-native";
import * as Haptics from "expo-haptics";
import { CheckSquare, Copy, Download, MoreVertical, Target, Trash2, X } from "lucide-react-native";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { BudgetAnalyticsModal } from "../../components/domain/BudgetAnalyticsModal";
import { BudgetForm } from "../../components/forms/BudgetForm";
import { ScreenHeader } from "../../components/layout/ScreenHeader";
import { ActiveFilterBar, type ActiveFilterItem } from "../../components/ui/ActiveFilterBar";
import { BulkActionBar } from "../../components/ui/BulkActionBar";
import { FAB } from "../../components/ui/FAB";
import { FilterToolbar } from "../../components/ui/FilterToolbar";
import { EntityActionSheet } from "../../components/ui/EntityActionSheet";
import { HeaderActionGroup } from "../../components/ui/HeaderActionGroup";
import { ResourceContextNote } from "../../components/ui/ResourceContextNote";
import { ResourceModuleTemplate } from "../../components/ui/ResourceModuleTemplate";
import { ResourceSectionList } from "../../components/ui/ResourceSectionList";
import { SkeletonCard, SkeletonList } from "../../components/ui/Skeleton";
import { UndoBanner } from "../../components/ui/UndoBanner";
import { BudgetQuickEditSheet } from "../../features/budgets/components/BudgetQuickEditSheet";
import { MetricSummaryBar } from "../../components/ui/MetricSummaryBar";
import { BudgetSwipeRow } from "../../features/budgets/components/BudgetSwipeRow";
import { useEnsureBudgetPeriodsMutation } from "../../services/queries/budgets";
import { buildBudgetsEmptyState } from "../../features/budgets/lib/budgetsEmptyState";
import { groupBudgetsIntoRules } from "../../features/budgets/lib/budgetRules";
import { formatCurrency } from "../../components/ui/AmountDisplay";
import { COLORS } from "../../constants/theme";
import { buildBudgetSections, type BudgetListItem, type BudgetListSection } from "../../features/budgets/lib/buildBudgetSections";
import { buildBudgetsHeadline, closedMonthsSummary } from "../../features/budgets/lib/budgetsHeadline";
import { ResourceCard } from "../../components/ui/ResourceCard";
import { isBudgetExpired } from "../../features/budgets/lib/budgetFilters";
import { buildBudgetCSV } from "../../features/budgets/lib/budgetsCsv";
import { nextPeriodFor } from "../../features/budgets/lib/duplicateBudgetToNextPeriod";
import { buildRateMap, convertAmount } from "../../features/budgets/lib/budgetCurrency";
import { buildBudgetsContextNote } from "../../features/budgets/lib/buildBudgetsContextNote";
import { useAuth } from "../../lib/auth-context";
import { todayPeru } from "../../lib/date";
import { formatSubscriptionYmd } from "../../lib/subscription-helpers";
import {
  applyBudgetComputedMetrics,
  buildBudgetMetricsMap,
} from "../../lib/budget-metrics";
import { shareCsvAsFile } from "../../lib/share-csv-file";
import { useWorkspace } from "../../lib/workspace-context";
import { useUiStore } from "../../store/ui-store";
import { useToast } from "../../hooks/useToast";
import { useNotificationReason } from "../../hooks/useNotificationReason";
import { useOriginBackNavigation } from "../../hooks/useOriginBackNavigation";
import { IOS_FLOATING_TAB_BAR_SPACE } from "../../constants/floating-tab-bar";
import { useBudgetScopeMovementsQuery } from "../../services/queries/budget-analytics";
import { useWorkspaceSnapshotQuery } from "../../services/queries/workspace-data";
import {
  useDeleteBudgetMutation,
  useDuplicateBudgetMutation,
  useTogglePinBudgetMutation,
} from "../../services/queries/budgets";
import type { BudgetOverview } from "../../types/domain";

/** A partir de cuántos presupuestos aparece el buscador. Con tres, buscar es más lento que mirar. */
const SEARCH_FROM = 8;

function BudgetsScreen() {
  // Fuerza el re-render de la pantalla al alternar modo privacidad (la máscara
  // vive en formatCurrency, que lee el store imperativamente).
  useUiStore((state) => state.privacyMode);
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
  const { reason: notificationReason } = useNotificationReason();

  const [formVisible, setFormVisible] = useState(false);
  const [editBudget, setEditBudget] = useState<BudgetOverview | null>(null);
  const [duplicateBudget, setDuplicateBudget] = useState<BudgetOverview | null>(null);
  const [analyticsBudgetId, setAnalyticsBudgetId] = useState<number | null>(null);
  const [quickEditBudget, setQuickEditBudget] = useState<BudgetOverview | null>(null);
  const [searchText, setSearchText] = useState("");
  const [selectMode, setSelectMode] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [pendingDeleteIds, setPendingDeleteIds] = useState<Set<number>>(new Set());
  const pendingDeleteLabels = useRef<Map<number, string>>(new Map());
  const deleteTimers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());
  const pendingDeleteRuns = useRef<Map<number, () => void>>(new Map());
  const refreshTriggeredRef = useRef(false);

  const deleteMutation = useDeleteBudgetMutation(activeWorkspaceId);
  const duplicateMutation = useDuplicateBudgetMutation(activeWorkspaceId);
  const togglePinMutation = useTogglePinBudgetMutation(activeWorkspaceId);
  const {
    data: snapshot,
    isLoading: coreLoading,
    // Los presupuestos llegan en la query diferida: sin esto la lista pintaría
    // "sin presupuestos" durante ese hueco en vez del skeleton.
    deferredLoading,
    isRefetching: snapshotRefetching,
    refetch: refetchSnapshot,
    dataUpdatedAt,
  } = useWorkspaceSnapshotQuery(profile, activeWorkspaceId);
  const snapshotLoading = coreLoading || deferredLoading;

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

  const todayYmd = todayPeru();
  /**
   * Solo la búsqueda filtra ya.
   *
   * `filterBudgets` escondía los vencidos salvo bajo su propio filtro, y esa regla ahora sería
   * al revés de lo que hace falta: los meses cerrados son la sección "Meses cerrados", así que
   * tienen que llegar hasta aquí para poder agruparse. Quien los separa es el constructor de
   * secciones, no un filtro.
   */
  const filteredBudgets = useMemo(() => {
    const query = searchText.trim().toLowerCase();
    if (!query) return correctedBudgets;
    return correctedBudgets.filter((budget) =>
      [budget.name, budget.categoryName ?? "", budget.accountName ?? "", budget.notes ?? ""]
        .join(" ")
        .toLowerCase()
        .includes(query),
    );
  }, [correctedBudgets, searchText]);

  /* Los vencidos se ocultan por una regla por defecto, no por un filtro que el usuario puso: sin
     esto, la lista vacía le ofrecía "Limpiar filtros" y no pasaba nada porque no había ninguno.
     Ver buildBudgetsEmptyState. */
  const expiredCount = useMemo(
    () => correctedBudgets.filter((budget) => isBudgetExpired(budget, todayYmd)).length,
    [correctedBudgets, todayYmd],
  );
  const lastPeriodEnd = useMemo(() => {
    const ends = correctedBudgets.map((budget) => budget.periodEnd).filter(Boolean).sort();
    const last = ends[ends.length - 1];
    return last ? formatSubscriptionYmd(last) : null;
  }, [correctedBudgets]);
  const emptyState = useMemo(
    () => buildBudgetsEmptyState({
      total: correctedBudgets.length,
      expired: expiredCount,
      hasFilters: searchText.trim().length > 0,
      lastPeriodEnd,
    }),
    [correctedBudgets.length, expiredCount, lastPeriodEnd, searchText],
  );

  // Tap en la notificación "presupuesto finalizado": abre el form de crear
  // prellenado con el siguiente período del presupuesto vencido.
  const { duplicateFrom } = useLocalSearchParams<{ duplicateFrom?: string }>();
  useEffect(() => {
    if (!duplicateFrom) return;
    // Cold start desde push: esperar a que el snapshot cargue antes de consumir el param.
    if (!snapshot) return;
    router.setParams({ duplicateFrom: undefined });
    const source = (snapshot.budgets ?? []).find((budget) => budget.id === Number(duplicateFrom));
    if (!source) return;
    setDuplicateBudget({ ...source, ...nextPeriodFor(source.periodStart, source.periodEnd) });
  }, [duplicateFrom, snapshot, router]);

  /** "septiembre" -> "Septiembre": el mes abre la frase del encabezado. */
  const capitalizeFirst = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

  /**
   * Abre el período que toca en los presupuestos que se renuevan, al entrar a la pantalla.
   *
   * Es lo que hace verdad la pregunta "cada cuánto se renueva": sin esto, el usuario volvería a
   * crearlo el día 1 y la lista volvería a llenarse de un presupuesto por mes. Corre una vez por
   * carga de datos y es idempotente — el índice único hace que el segundo intento choque.
   */
  const ensurePeriods = useEnsureBudgetPeriodsMutation(activeWorkspaceId);
  const ensuredRef = useRef("");
  useEffect(() => {
    if (!activeWorkspaceId || correctedBudgets.length === 0) return;
    const marca = `${activeWorkspaceId}:${todayYmd}:${correctedBudgets.length}`;
    if (ensuredRef.current === marca || ensurePeriods.isPending) return;
    ensuredRef.current = marca;
    ensurePeriods.mutate({ budgets: correctedBudgets, todayYmd });
  }, [activeWorkspaceId, correctedBudgets, ensurePeriods, todayYmd]);

  const budgetSections = useMemo(
    () => buildBudgetSections(filteredBudgets, todayYmd),
    [filteredBudgets, todayYmd],
  );
  const rateMap = useMemo(() => buildRateMap(snapshot?.exchangeRates ?? []), [snapshot?.exchangeRates]);

  /**
   * El encabezado suma SOLO los presupuestos que corren a la vez.
   *
   * Sumaba todo lo que hubiera en la lista, y la lista traía el mismo presupuesto una vez por
   * mes: salía "S/ 1,752.32 de S/ 1,200.00" — tres límites de 400 apilados, un presupuesto que
   * nunca existió. Alimentación y Transporte sí coexisten en septiembre, así que su suma
   * describe un mes real.
   */
  const activeNow = useMemo(
    () => groupBudgetsIntoRules(correctedBudgets, todayYmd)
      .map((rule) => rule.current)
      .filter((budget): budget is BudgetOverview => budget !== null)
      // A moneda base antes de sumar: dos presupuestos en monedas distintas no se suman crudos.
      .map((budget) => ({
        ...budget,
        spentAmount: convertAmount(budget.spentAmount, budget.currencyCode, baseCurrencyCode, rateMap),
        limitAmount: convertAmount(budget.limitAmount, budget.currencyCode, baseCurrencyCode, rateMap),
        currencyCode: baseCurrencyCode,
      })),
    [baseCurrencyCode, correctedBudgets, rateMap, todayYmd],
  );
  const headline = useMemo(
    () => buildBudgetsHeadline({
      active: activeNow,
      periodLabel: capitalizeFirst(format(new Date(), "LLLL", { locale: es })),
      formatAmount: (value) => formatCurrency(value, baseCurrencyCode),
    }),
    [activeNow, baseCurrencyCode],
  );

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
    const query = searchText.trim();
    if (!query) return [];
    return [{ key: "search", label: `Búsqueda: ${query}`, onRemove: () => setSearchText("") }];
  }, [searchText]);

  const onRefresh = useCallback(async () => {
    refreshTriggeredRef.current = true;
    // refetch() mantiene el spinner hasta resolver. El scope de movimientos de presupuestos
    // depende de dataUpdatedAt del snapshot, así que se re-encadena al refetchear el snapshot.
    await refetchSnapshot();
  }, [refetchSnapshot]);

  useEffect(() => {
    if (!snapshotLoading && !movementsLoading && refreshTriggeredRef.current) {
      refreshTriggeredRef.current = false;
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  }, [movementsLoading, snapshotLoading]);

  useEffect(() => () => {
    deleteTimers.current.forEach(clearTimeout);
    deleteTimers.current.clear();
    /* Salir de la pantalla CONFIRMA lo pendiente, no lo cancela: el usuario ya pidio
       borrar y el aviso solo ofrecia deshacerlo. Cancelarlo aqui hacia que la fila
       reapareciera sin que nadie dijera nada. */
    const pendingRuns = [...pendingDeleteRuns.current.values()];
    pendingDeleteRuns.current.clear();
    pendingRuns.forEach((run) => run());
    deleteTimers.current.clear();
    pendingDeleteLabels.current.clear();
  }, []);

  useFocusEffect(
    useCallback(() => {
      void queryClient.invalidateQueries({ queryKey: ["workspace-snapshot"] });
    }, [queryClient]),
  );

  const clearFilters = useCallback(() => {
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
    const run = () => {
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
    };
    const timer = setTimeout(() => {
      // Al disparar, la accion deja de estar pendiente: si no, salir de la pantalla
      // la ejecutaria por segunda vez.
      pendingDeleteRuns.current.delete(budget.id);
      run();
    }, 5000);
    deleteTimers.current.set(budget.id, timer);
    pendingDeleteRuns.current.set(budget.id, run);
  }, [deleteMutation, showToast]);

  const undoDelete = useCallback((id: number) => {
    const timer = deleteTimers.current.get(id);
    if (timer) clearTimeout(timer);
    deleteTimers.current.delete(id);
    pendingDeleteRuns.current.delete(id);
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

  const renderBudget: SectionListRenderItem<BudgetListItem, BudgetListSection> = useCallback(({ item }) => {
    /* Los meses cerrados son historial: una línea que resume el presupuesto entero y lo abre.
       Antes eran una fila por mes, y verlos apilados fue lo que llevó a sumarlos. */
    if (item.kind === "closed") {
      return (
        <ResourceCard
          variant="line"
          title={item.rule.name}
          subtitle={closedMonthsSummary(item.rule.closed)}
          onPress={() => router.push({
            pathname: "/budget/[id]",
            params: { id: String(item.rule.latest.id), from: "budgets" },
          })}
        />
      );
    }

    const budget = item.budget;
    return (
      <BudgetSwipeRow
        budget={budget}
        selected={selectedIds.has(budget.id)}
        onPress={() => {
          if (selectMode) {
            toggleSelect(budget.id);
            return;
          }
          router.push({ pathname: "/budget/[id]", params: { id: String(budget.id), from: "budgets" } });
        }}
        onLongPress={() => {
          if (!selectMode) setSelectMode(true);
          toggleSelect(budget.id);
        }}
        onDelete={() => handleDelete(budget)}
        onDuplicate={() => void handleDuplicate(budget)}
        onTogglePin={selectMode ? undefined : () => handleTogglePin(budget)}
      />
    );
  }, [handleDelete, handleDuplicate, handleTogglePin, router, selectMode, selectedIds, toggleSelect]);

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
                /* Exportar baja al menú con su nombre, y "seleccionar varios" deja de
                   depender de un mantener pulsado que nadie descubre. */
              <HeaderActionGroup
                actions={[{
                  key: "menu",
                  icon: MoreVertical,
                  onPress: () => setMenuOpen(true),
                  accessibilityLabel: "Más acciones",
                }]}
              />
            )
          }
        />
      }
      /* Buscador, desplegable, cápsula "Vencidos ×" y "Limpiar": ~180px de filtros antes del
         primer dato, para tres filas. Con una fila por presupuesto los meses cerrados ya no
         compiten —están en su sección— así que el filtro se queda sin trabajo. El buscador
         vuelve cuando de verdad haga falta buscar. */
      toolbar={
        !selectMode && correctedBudgets.length > SEARCH_FROM ? (
          <FilterToolbar
            options={[]}
            searchValue={searchText}
            onSearchChange={setSearchText}
            searchPlaceholder="Buscar presupuestos..."
          />
        ) : null
      }
      activeFilters={
        !selectMode && searchText.trim() ? (
          <ActiveFilterBar items={activeFilterItems} onClear={clearFilters} />
        ) : null
      }
      context={!selectMode ? <ResourceContextNote>{notificationReason ?? contextNote}</ResourceContextNote> : null}
      summary={
        !selectMode && activeNow.length > 0 ? (
          <MetricSummaryBar
            value={formatCurrency(headline.spent, baseCurrencyCode)}
            valueColor={headline.hasOverspend ? COLORS.expense : undefined}
            support={`de ${formatCurrency(headline.limit, baseCurrencyCode)}`}
            footnote={headline.support}
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
          keyExtractor={(item) => (item.kind === "closed" ? `closed-${item.rule.key}` : String(item.budget.id))}
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
          empty={{
            ...emptyState,
            ...(emptyState.action.kind === "create" ? { icon: Target } : {}),
            action: {
              label: emptyState.action.label,
              onPress:
                emptyState.action.kind === "create"
                  ? () => setFormVisible(true)
                  : clearFilters,
            },
          }}
          refreshing={snapshotRefetching || movementsLoading}
          onRefresh={onRefresh}
        />
      }
      fab={
        !selectMode ? (
          <FAB onPress={() => { setEditBudget(null); setFormVisible(true); }} bottom={insets.bottom + 16 + IOS_FLOATING_TAB_BAR_SPACE} />
        ) : null
      }
      overlays={
        <>
          <EntityActionSheet
            visible={menuOpen}
            onClose={() => setMenuOpen(false)}
            sheetTitle="Más acciones"
            summaryTitle="Presupuestos"
            actions={[
              {
                key: "export",
                label: "Exportar a CSV",
                variant: "secondary" as const,
                disabled: filteredBudgets.length === 0,
                onPress: () => { setMenuOpen(false); void exportCSV(filteredBudgets); },
              },
              {
                key: "select",
                label: "Seleccionar varios",
                variant: "ghost" as const,
                disabled: filteredBudgets.length === 0,
                onPress: () => { setMenuOpen(false); setSelectMode(true); },
              },
            ]}
          />
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
          <BudgetForm
            visible={Boolean(duplicateBudget)}
            onClose={() => setDuplicateBudget(null)}
            onSuccess={() => setDuplicateBudget(null)}
            duplicateBudget={duplicateBudget ?? undefined}
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
                return label ? `Se eliminó «${label}»` : "Presupuesto eliminado";
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
