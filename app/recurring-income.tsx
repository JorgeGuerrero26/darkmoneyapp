import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SectionListRenderItem } from "react-native";
import { CheckSquare, Download, MoreVertical, Pause, Trash2, TrendingUp } from "lucide-react-native";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ErrorBoundary } from "../components/ui/ErrorBoundary";
import { UndoBanner } from "../components/ui/UndoBanner";
import { ScreenHeader } from "../components/layout/ScreenHeader";
import { EntityActionSheet } from "../components/ui/EntityActionSheet";
import { HeaderActionGroup } from "../components/ui/HeaderActionGroup";
import { FilterToolbar, type FilterToolbarOption } from "../components/ui/FilterToolbar";
import { ActiveFilterBar, type ActiveFilterItem } from "../components/ui/ActiveFilterBar";
import { ResourceContextNote } from "../components/ui/ResourceContextNote";
import { ResourceModuleTemplate } from "../components/ui/ResourceModuleTemplate";
import { BulkActionBar } from "../components/ui/BulkActionBar";
import { ResourceSectionList } from "../components/ui/ResourceSectionList";
import { SkeletonCard } from "../components/ui/Skeleton";
import { FAB } from "../components/ui/FAB";
import { RecurringIncomeForm } from "../components/forms/RecurringIncomeForm";
import { RecurringIncomeArrivalSheet } from "../features/recurring-income/components/RecurringIncomeArrivalSheet";
import { RecurringIncomeFilterSheet } from "../features/recurring-income/components/RecurringIncomeFilterSheet";
import { RecurringIncomeSummaryBar } from "../features/recurring-income/components/RecurringIncomeSummaryBar";
import { summarizeRecurringIncome } from "../features/recurring-income/lib/summarizeRecurringIncome";
import { formatCurrency } from "../components/ui/AmountDisplay";
import { todayPeru } from "../lib/date";
import { RecurringIncomeSwipeRow } from "../features/recurring-income/components/RecurringIncomeSwipeRow";
import {
  buildRecurringIncomeSections,
  type RecurringIncomeListSection,
} from "../features/recurring-income/lib/buildRecurringIncomeSections";
import {
  filterRecurringIncome,
  recurringIncomeFilterLabel,
  type ActiveRecurringIncomeFilter,
  type RecurringIncomeAdvancedFilters,
  type RecurringIncomeFilter,
} from "../features/recurring-income/lib/recurringIncomeFilters";
import { buildRecurringIncomeContextNote } from "../features/recurring-income/lib/buildRecurringIncomeContextNote";
import { useArrivalSheetController } from "../features/recurring-income/lib/useArrivalSheetController";
import { useAuth } from "../lib/auth-context";
import { useWorkspace } from "../lib/workspace-context";
import { useUiStore } from "../store/ui-store";
import { buildRecurringIncomeCsv } from "../lib/recurring-income-csv";
import { shareCsvAsFile } from "../lib/share-csv-file";
import { useWorkspaceSnapshotQuery } from "../services/queries/workspace-data";
import {
  useDeleteRecurringIncomeMutation,
  useUpdateRecurringIncomeMutation,
} from "../services/queries/subscriptions-recurring-income";
import { useToast } from "../hooks/useToast";
import { useNotificationReason } from "../hooks/useNotificationReason";
import { useFormFirstRunHelp } from "../components/forms/FormFirstRunHelp";
import { useOriginBackNavigation } from "../hooks/useOriginBackNavigation";
import type { RecurringIncomeFrequency, RecurringIncomeSummary } from "../types/domain";

const QUICK_FILTERS: Array<FilterToolbarOption<RecurringIncomeFilter>> = [
  { label: "Todos", value: "all" },
  { label: "Activos", value: "active" },
  { label: "Pausados", value: "paused" },
  { label: "Cancelados", value: "cancelled" },
];

function RecurringIncomeScreen() {
  // Fuerza el re-render de la pantalla al alternar modo privacidad (la máscara
  // vive en formatCurrency, que lee el store imperativamente).
  useUiStore((state) => state.privacyMode);
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const router = useRouter();
  const { handleBack } = useOriginBackNavigation();
  const { profile } = useAuth();
  const { activeWorkspaceId, activeWorkspace } = useWorkspace();
  const { showToast, showErrorToast } = useToast();
  const { reason: notificationReason } = useNotificationReason();

  const { data: snapshot, isLoading, isError, refetch } = useWorkspaceSnapshotQuery(profile, activeWorkspaceId);
  const updateMutation = useUpdateRecurringIncomeMutation(activeWorkspaceId);
  const deleteMutation = useDeleteRecurringIncomeMutation(activeWorkspaceId);
  const arrival = useArrivalSheetController(activeWorkspaceId);

  const [createFormVisible, setCreateFormVisible] = useState(false);
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  // Los cancelados son historial: llegan plegados para no competir con lo que pide acción.
  const [cancelledExpanded, setCancelledExpanded] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [activeFilters, setActiveFilters] = useState<ActiveRecurringIncomeFilter[]>([]);
  const [frequencyFilter, setFrequencyFilter] = useState<"all" | RecurringIncomeFrequency>("all");
  const [payerFilter, setPayerFilter] = useState<number | null>(null);
  const [accountFilter, setAccountFilter] = useState<number | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<number | null>(null);
  const [upcomingOnly, setUpcomingOnly] = useState(false);
  const [pendingDeleteIds, setPendingDeleteIds] = useState<Set<number>>(new Set());
  const pendingDeleteLabels = useRef<Map<number, string>>(new Map());
  const deleteTimers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());
  const pendingDeleteRuns = useRef<Map<number, () => void>>(new Map());

  // Bulk selection
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

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

  useEffect(() => {
    if (selectMode && selectedIds.size === 0) {
      setSelectMode(false);
    }
  }, [selectMode, selectedIds.size]);

  const recurringIncome = useMemo(
    () => (snapshot?.recurringIncome ?? []).filter((item) => !pendingDeleteIds.has(item.id)),
    [pendingDeleteIds, snapshot?.recurringIncome],
  );
  const activeAccounts = useMemo(() => snapshot?.accounts.filter((account) => !account.isArchived) ?? [], [snapshot?.accounts]);
  const categories = useMemo(
    () => snapshot?.categories.filter((category) => category.isActive && (category.kind === "income" || category.kind === "both")) ?? [],
    [snapshot?.categories],
  );
  const counterparties = useMemo(
    () => snapshot?.counterparties.filter((counterparty) => !counterparty.isArchived) ?? [],
    [snapshot?.counterparties],
  );
  const baseCurrencyCode = activeWorkspace?.baseCurrencyCode ?? profile?.baseCurrencyCode ?? "PEN";

  const advancedFilters = useMemo<RecurringIncomeAdvancedFilters>(() => ({
    payerId: payerFilter,
    accountId: accountFilter,
    categoryId: categoryFilter,
    upcomingOnly,
  }), [accountFilter, categoryFilter, payerFilter, upcomingOnly]);

  const effectiveFilters = useMemo<ActiveRecurringIncomeFilter[]>(() => {
    if (frequencyFilter === "all") return activeFilters;
    return [...activeFilters, frequencyFilter];
  }, [activeFilters, frequencyFilter]);

  const filteredRecurringIncome = useMemo(
    () => filterRecurringIncome(recurringIncome, effectiveFilters, searchText, advancedFilters),
    [advancedFilters, effectiveFilters, recurringIncome, searchText],
  );
  const summary = useMemo(
    () => summarizeRecurringIncome(filteredRecurringIncome, baseCurrencyCode, todayPeru()),
    [baseCurrencyCode, filteredRecurringIncome],
  );

  const sections = useMemo(
    () => buildRecurringIncomeSections({
      items: filteredRecurringIncome,
      today: todayPeru(),
      cancelledExpanded,
      onToggleCancelled: () => setCancelledExpanded((open: boolean) => !open),
      unconfirmedTotalLabel: summary.unconfirmedTotal > 0 && summary.excludedUnconfirmedCount === 0
        ? formatCurrency(summary.unconfirmedTotal, baseCurrencyCode)
        : null,
    }),
    [baseCurrencyCode, cancelledExpanded, filteredRecurringIncome, summary],
  );

  const activeFilterItems = useMemo<ActiveFilterItem[]>(() => {
    const items = activeFilters.map((filter) => ({
      key: `filter-${filter}`,
      label: recurringIncomeFilterLabel(filter),
      onRemove: () => setActiveFilters((current) => current.filter((value) => value !== filter)),
    }));

    if (frequencyFilter !== "all") {
      items.push({
        key: "frequency",
        label: `Frecuencia: ${recurringIncomeFilterLabel(frequencyFilter)}`,
        onRemove: () => setFrequencyFilter("all"),
      });
    }
    if (searchText.trim()) {
      items.push({
        key: "search",
        label: `Búsqueda: ${searchText.trim()}`,
        onRemove: () => setSearchText(""),
      });
    }
    if (payerFilter != null) {
      items.push({
        key: "payer",
        label: `Pagador: ${counterparties.find((item) => item.id === payerFilter)?.name ?? payerFilter}`,
        onRemove: () => setPayerFilter(null),
      });
    }
    if (accountFilter != null) {
      items.push({
        key: "account",
        label: `Cuenta: ${activeAccounts.find((item) => item.id === accountFilter)?.name ?? accountFilter}`,
        onRemove: () => setAccountFilter(null),
      });
    }
    if (categoryFilter != null) {
      items.push({
        key: "category",
        label: `Categoría: ${categories.find((item) => item.id === categoryFilter)?.name ?? categoryFilter}`,
        onRemove: () => setCategoryFilter(null),
      });
    }
    if (upcomingOnly) {
      items.push({
        key: "upcoming",
        label: "Próximos 30 días",
        onRemove: () => setUpcomingOnly(false),
      });
    }

    return items;
  }, [activeAccounts, activeFilters, categories, categoryFilter, counterparties, frequencyFilter, payerFilter, searchText, accountFilter, upcomingOnly]);

  const extraFiltersCount = [
    frequencyFilter !== "all",
    payerFilter != null,
    accountFilter != null,
    categoryFilter != null,
    upcomingOnly,
  ].filter(Boolean).length;

  /* El manual de gestos se muestra UNA vez: fijo en pantalla era una instrucción permanente
     para algo que se aprende a la primera. */
  const { open: gestureHintOpen, dismiss: dismissGestureHint } = useFormFirstRunHelp(
    "dm_help_recurring_income_gestures",
    true,
  );
  const dismissHintRef = useRef(dismissGestureHint);
  dismissHintRef.current = dismissGestureHint;
  useEffect(() => () => dismissHintRef.current(), []);

  const filterEntranceLabel = (() => {
    const applied = activeFilters.length + extraFiltersCount;
    if (applied === 0) return "Filtros";
    if (applied === 1 && activeFilters.length === 1) return recurringIncomeFilterLabel(activeFilters[0]);
    return `${applied} filtros`;
  })();
  const hasFilters = activeFilterItems.length > 0;
  const contextNote = buildRecurringIncomeContextNote({
    visibleCount: filteredRecurringIncome.length,
    totalCount: recurringIncome.length,
  });

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

  const onRefresh = useCallback(() => {
    return queryClient.invalidateQueries({ queryKey: ["workspace-snapshot"] });
  }, [queryClient]);

  const clearFilters = useCallback(() => {
    setActiveFilters([]);
    setSearchText("");
    setFrequencyFilter("all");
    setPayerFilter(null);
    setAccountFilter(null);
    setCategoryFilter(null);
    setUpcomingOnly(false);
  }, []);

  const startUndoDelete = useCallback((item: RecurringIncomeSummary) => {
    setPendingDeleteIds((prev) => new Set(prev).add(item.id));
    pendingDeleteLabels.current.set(item.id, item.name);
    const run = () => {
      deleteMutation.mutate(item.id, {
        onError: (error) => showErrorToast(`No se pudo eliminar «${item.name}»`, error),
      });
      setPendingDeleteIds((prev) => {
        const next = new Set(prev);
        next.delete(item.id);
        return next;
      });
      pendingDeleteLabels.current.delete(item.id);
      deleteTimers.current.delete(item.id);
    };
    const timer = setTimeout(() => {
      // Al disparar, la accion deja de estar pendiente: si no, salir de la pantalla
      // la ejecutaria por segunda vez.
      pendingDeleteRuns.current.delete(item.id);
      run();
    }, 5000);
    deleteTimers.current.set(item.id, timer);
    pendingDeleteRuns.current.set(item.id, run);
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

  const selectedItems = useMemo(
    () => filteredRecurringIncome.filter((item) => selectedIds.has(item.id)),
    [filteredRecurringIncome, selectedIds],
  );
  const selectedActiveCount = selectedItems.filter((item) => item.status === "active").length;

  const handleBulkPause = useCallback(async () => {
    let pausedCount = 0;
    for (const item of selectedItems) {
      if (item.status !== "active") continue;
      try {
        await updateMutation.mutateAsync({ id: item.id, input: { status: "paused" } });
        pausedCount += 1;
      } catch (err: unknown) {
        showErrorToast(`No se pudo pausar «${item.name}»`, err);
      }
    }
    exitSelectMode();
    if (pausedCount > 0) {
      showToast(
        pausedCount === 1 ? "1 ingreso fijo pausado" : `${pausedCount} ingresos fijos pausados`,
        "success",
      );
    }
  }, [exitSelectMode, selectedItems, showToast, updateMutation]);

  const handleBulkDelete = useCallback(() => {
    selectedItems.forEach(startUndoDelete);
    exitSelectMode();
  }, [exitSelectMode, selectedItems, startUndoDelete]);

  const exportCSV = useCallback(async (rows: RecurringIncomeSummary[]) => {
    if (rows.length === 0) {
      showToast("No hay filas para exportar", "warning");
      return;
    }
    try {
      const csv = buildRecurringIncomeCsv(rows);
      await shareCsvAsFile(csv, `ingresos-fijos-${activeWorkspace?.name?.replace(/\s+/g, "_") ?? "workspace"}.csv`);
    } catch (error: unknown) {
      showErrorToast("No se pudo exportar el CSV", error);
    }
  }, [activeWorkspace?.name, showToast]);

  const renderItem: SectionListRenderItem<RecurringIncomeSummary, RecurringIncomeListSection> = useCallback(({ item }) => (
    <RecurringIncomeSwipeRow
      item={item}
      onPress={() => {
        if (selectMode) {
          toggleSelect(item.id);
          return;
        }
        router.push({ pathname: "/recurring-income/[id]", params: { id: String(item.id), from: "recurring-income" } });
      }}
      onLongPress={() => {
        if (!selectMode) setSelectMode(true);
        toggleSelect(item.id);
      }}
      onDelete={() => startUndoDelete(item)}
      onConfirmArrival={() => arrival.open(item)}
      selected={selectedIds.has(item.id)}
      selectMode={selectMode}
    />
  ), [arrival.open, router, selectMode, selectedIds, startUndoDelete, toggleSelect]);

  return (
    <ResourceModuleTemplate
      topInset={insets.top}
      header={
        <ScreenHeader
          title={selectMode ? `${selectedIds.size} seleccionado${selectedIds.size === 1 ? "" : "s"}` : "Ingresos fijos"}
          onBack={selectMode ? exitSelectMode : handleBack}
          rightAction={
            selectMode ? null : (
              <HeaderActionGroup
                actions={[
                  {
                    key: "menu",
                    icon: MoreVertical,
                    onPress: () => setMenuOpen(true),
                    accessibilityLabel: "Más acciones",
                  },
                ]}
              />
            )
          }
        />
      }
      toolbar={selectMode ? null : (
        <FilterToolbar
          options={[]}
          searchValue={searchText}
          onSearchChange={setSearchText}
          searchPlaceholder="Buscar ingresos fijos..."
          /* Las cuatro pestañas de estado se fueron: ocupaban una fila entera y contradecían la
             agrupación —si filtran por estado, las secciones no se ven nunca—. */
          extraAction={{
            label: filterEntranceLabel,
            active: activeFilters.length > 0 || extraFiltersCount > 0,
            onPress: () => setFilterSheetOpen(true),
          }}
        />
      )}
      activeFilters={selectMode ? null : <ActiveFilterBar items={activeFilterItems} onClear={clearFilters} />}
      context={
        !selectMode && (notificationReason || recurringIncome.length > 0) ? (
          <ResourceContextNote>
            {notificationReason ??
              (filteredRecurringIncome.length === recurringIncome.length && !gestureHintOpen
                ? null
                : contextNote)}
          </ResourceContextNote>
        ) : null
      }
      summary={
        !selectMode && filteredRecurringIncome.length > 0 ? (
          <RecurringIncomeSummaryBar
            monthlyTotal={summary.comparableActiveCount > 0 ? summary.monthlyTotal : null}
            activeCount={summary.activeCount}
            unconfirmedCount={summary.unconfirmedCount}
            excludedCount={summary.excludedActiveCount}
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
                label: `Sel. todos (${filteredRecurringIncome.length})`,
                icon: CheckSquare,
                onPress: () => setSelectedIds(new Set(filteredRecurringIncome.map((item) => item.id))),
              },
              {
                key: "csv",
                label: "CSV",
                icon: Download,
                tone: "primary",
                onPress: () => exportCSV(selectedItems),
              },
              ...(selectedActiveCount > 0 ? [{
                key: "pause",
                label: `Pausar (${selectedActiveCount})`,
                icon: Pause,
                tone: "neutral" as const,
                onPress: () => void handleBulkPause(),
              }] : []),
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
          sections={sections}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderItem}
          loading={{
            isLoading: isLoading && !snapshot,
            skeleton: (
              <>
                <SkeletonCard />
                <SkeletonCard />
                <SkeletonCard />
              </>
            ),
          }}
          empty={isError && !snapshot ? {
            title: "No se pudieron cargar los ingresos",
            description: "Comprueba tu conexión e inténtalo de nuevo.",
            action: { label: "Reintentar", onPress: () => { void refetch(); } },
          } : {
            icon: hasFilters ? undefined : TrendingUp,
            variant: hasFilters ? "no-results" : "empty",
            title: hasFilters ? "Sin resultados" : "Sin ingresos fijos",
            description: hasFilters
              ? "Prueba quitando filtros o ajustando la búsqueda."
              : "Registra tu sueldo, renta u otros ingresos recurrentes para seguir lo que entra cada mes.",
            action: !hasFilters ? { label: "Agregar ingreso fijo", onPress: () => setCreateFormVisible(true) } : undefined,
          }}
          onRefresh={onRefresh}
        />
      }
      fab={!selectMode ? <FAB onPress={() => setCreateFormVisible(true)} bottom={insets.bottom + 16} /> : null}
      overlays={
        <>
          <EntityActionSheet
            visible={menuOpen}
            onClose={() => setMenuOpen(false)}
            sheetTitle="Más acciones"
            summaryTitle="Ingresos fijos"
            actions={[
              {
                key: "export",
                label: "Exportar a CSV",
                variant: "secondary",
                disabled: filteredRecurringIncome.length === 0,
                onPress: () => { setMenuOpen(false); void exportCSV(filteredRecurringIncome); },
              },
              {
                key: "select",
                label: "Seleccionar varios",
                variant: "ghost",
                disabled: filteredRecurringIncome.length === 0,
                onPress: () => { setMenuOpen(false); setSelectMode(true); },
              },
            ]}
          />
          <RecurringIncomeFilterSheet
            visible={filterSheetOpen}
            statusOptions={QUICK_FILTERS.filter((option) => option.value !== "all")}
            activeStatusFilters={activeFilters}
            onToggleStatusFilter={(value: string) =>
              setActiveFilters((current) =>
                current.includes(value as ActiveRecurringIncomeFilter)
                  ? current.filter((filter) => filter !== value)
                  : [...current, value as ActiveRecurringIncomeFilter],
              )
            }
            onClose={() => setFilterSheetOpen(false)}
            frequencyFilter={frequencyFilter}
            onFrequencyFilterChange={setFrequencyFilter}
            payerFilter={payerFilter}
            onPayerFilterChange={setPayerFilter}
            accountFilter={accountFilter}
            onAccountFilterChange={setAccountFilter}
            categoryFilter={categoryFilter}
            onCategoryFilterChange={setCategoryFilter}
            upcomingOnly={upcomingOnly}
            onUpcomingOnlyChange={setUpcomingOnly}
            accounts={activeAccounts}
            categories={categories}
            counterparties={counterparties}
          />
          <RecurringIncomeArrivalSheet
            {...arrival.sheetProps}
            accounts={activeAccounts}
          />
          <RecurringIncomeForm
            visible={createFormVisible}
            onClose={() => setCreateFormVisible(false)}
            onSuccess={() => setCreateFormVisible(false)}
          />
          <UndoBanner
            visible={pendingDeleteIds.size > 0}
            message={(() => {
              if (pendingDeleteIds.size === 0) return "";
              if (pendingDeleteIds.size === 1) {
                const [onlyId] = pendingDeleteIds;
                const label = pendingDeleteLabels.current.get(onlyId) ?? "";
                return label ? `Se eliminó «${label}»` : "Ingreso fijo eliminado";
              }
              return `${pendingDeleteIds.size} ingresos fijos eliminados`;
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

export default function RecurringIncomeScreenRoot() {
  return (
    <ErrorBoundary>
      <RecurringIncomeScreen />
    </ErrorBoundary>
  );
}
