import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SectionListRenderItem } from "react-native";
import { CheckSquare, RefreshCw, SlidersHorizontal, Trash2 } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ErrorBoundary } from "../components/ui/ErrorBoundary";
import { UndoBanner } from "../components/ui/UndoBanner";
import { ScreenHeader } from "../components/layout/ScreenHeader";
import { HeaderActionGroup } from "../components/ui/HeaderActionGroup";
import { FilterToolbar } from "../components/ui/FilterToolbar";
import { ActiveFilterBar, type ActiveFilterItem } from "../components/ui/ActiveFilterBar";
import { ResourceContextNote } from "../components/ui/ResourceContextNote";
import { ResourceModuleTemplate } from "../components/ui/ResourceModuleTemplate";
import { ResourceSectionList } from "../components/ui/ResourceSectionList";
import { BottomSheet } from "../components/ui/BottomSheet";
import { FAB } from "../components/ui/FAB";
import { SkeletonCard, SkeletonList } from "../components/ui/Skeleton";
import { ExchangeRateFilterSheet } from "../features/exchange-rates/components/ExchangeRateFilterSheet";
import { ExchangeRateSwipeRow } from "../features/exchange-rates/components/ExchangeRateSwipeRow";
import { ExchangeRatesSummaryBar } from "../features/exchange-rates/components/ExchangeRatesSummaryBar";
import {
  buildExchangeRateSections,
  exchangeRateAdvancedFilterLabel,
  filterExchangeRates,
  getExchangeRatePairCount,
  isExchangeRateSameLocalDay,
  type ExchangeRateAdvancedFilter,
  type ExchangeRateListSection,
} from "../features/exchange-rates/lib/exchangeRateFilters";
import { buildExchangeRatesContextNote } from "../features/exchange-rates/lib/buildExchangeRatesContextNote";
import {
  useCreateExchangeRateMutation,
  useDeleteExchangeRateMutation,
  useExchangeRatesQuery,
  useSyncExchangeRatePairMutation,
  useToggleExchangeRatePinMutation,
  useUpdateExchangeRateMutation,
  type ExchangeRateRecord,
} from "../services/queries/exchange-rates";
import { BulkActionBar } from "../components/ui/BulkActionBar";
import { ExchangeRateForm } from "../components/forms/ExchangeRateForm";
import { SUPPORTED_CURRENCY_CODES } from "../constants/currencies";
import { useToast } from "../hooks/useToast";
import { useOriginBackNavigation } from "../hooks/useOriginBackNavigation";

type CurrencyFilter = string;

function ExchangeRatesScreen() {
  const insets = useSafeAreaInsets();
  const { handleBack } = useOriginBackNavigation();
  const { showToast } = useToast();

  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState<ExchangeRateRecord | null>(null);
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [currencyFilter, setCurrencyFilter] = useState<CurrencyFilter>("all");
  const [advancedFilter, setAdvancedFilter] = useState<ExchangeRateAdvancedFilter>("all");
  const [pendingDeleteIds, setPendingDeleteIds] = useState<Set<number>>(new Set());
  const pendingDeleteLabels = useRef<Map<number, string>>(new Map());
  const deleteTimers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  // Bulk selection
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  const { data: rates = [], isLoading, refetch } = useExchangeRatesQuery();
  const createRate = useCreateExchangeRateMutation();
  const updateRate = useUpdateExchangeRateMutation();
  const deleteRate = useDeleteExchangeRateMutation();
  const syncRatePair = useSyncExchangeRatePairMutation();
  const togglePin = useToggleExchangeRatePinMutation();

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

  const activeRates = useMemo(
    () => rates.filter((rate) => !pendingDeleteIds.has(rate.id)),
    [pendingDeleteIds, rates],
  );
  const currencyOptions = useMemo(() => {
    const set = new Set<string>(SUPPORTED_CURRENCY_CODES);
    for (const rate of rates) {
      set.add(rate.fromCurrencyCode.toUpperCase());
      set.add(rate.toCurrencyCode.toUpperCase());
    }
    return Array.from(set).sort();
  }, [rates]);
  const filterOptions = useMemo(
    () => [{ label: "Todas", value: "all" }, ...currencyOptions.map((currency) => ({ label: currency, value: currency }))],
    [currencyOptions],
  );
  const filteredRates = useMemo(
    () => filterExchangeRates(activeRates, currencyFilter, searchText, advancedFilter),
    [activeRates, advancedFilter, currencyFilter, searchText],
  );
  const sections = useMemo(() => buildExchangeRateSections(filteredRates), [filteredRates]);
  const pairCount = useMemo(() => getExchangeRatePairCount(activeRates), [activeRates]);

  const activeFilterItems = useMemo<ActiveFilterItem[]>(() => {
    const items: ActiveFilterItem[] = [];
    if (currencyFilter !== "all") {
      items.push({
        key: "currency",
        label: `Moneda: ${currencyFilter}`,
        onRemove: () => setCurrencyFilter("all"),
      });
    }
    if (advancedFilter !== "all") {
      items.push({
        key: "advanced",
        label: exchangeRateAdvancedFilterLabel(advancedFilter),
        onRemove: () => setAdvancedFilter("all"),
      });
    }
    if (searchText.trim()) {
      items.push({
        key: "search",
        label: `Búsqueda: ${searchText.trim()}`,
        onRemove: () => setSearchText(""),
      });
    }
    return items;
  }, [advancedFilter, currencyFilter, searchText]);

  const extraFiltersCount = advancedFilter !== "all" ? 1 : 0;
  const hasFilters = currencyFilter !== "all" || advancedFilter !== "all" || Boolean(searchText.trim());
  const contextNote = buildExchangeRatesContextNote({
    visibleCount: filteredRates.length,
    totalCount: activeRates.length,
    hasFilters,
  });

  useEffect(() => () => {
    deleteTimers.current.forEach(clearTimeout);
    deleteTimers.current.clear();
    pendingDeleteLabels.current.clear();
  }, []);

  function openNew() {
    setEditItem(null);
    setShowForm(true);
  }

  function openEdit(item: ExchangeRateRecord) {
    setEditItem(item);
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setEditItem(null);
  }

  const clearFilters = useCallback(() => {
    setCurrencyFilter("all");
    setAdvancedFilter("all");
    setSearchText("");
  }, []);

  const startUndoDelete = useCallback((item: ExchangeRateRecord) => {
    const label = `${item.fromCurrencyCode} → ${item.toCurrencyCode}`;
    setPendingDeleteIds((prev) => new Set(prev).add(item.id));
    pendingDeleteLabels.current.set(item.id, label);
    const timer = setTimeout(() => {
      deleteRate.mutate(item.id, {
        onError: (error: Error) => showToast(error.message, "error"),
      });
      setPendingDeleteIds((prev) => {
        const next = new Set(prev);
        next.delete(item.id);
        return next;
      });
      pendingDeleteLabels.current.delete(item.id);
      deleteTimers.current.delete(item.id);
    }, 5000);
    deleteTimers.current.set(item.id, timer);
  }, [deleteRate, showToast]);

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

  const handleTogglePin = useCallback((item: ExchangeRateRecord) => {
    togglePin.mutate(
      { id: item.id, isPinned: !item.isPinned },
      { onError: (err: Error) => showToast(err.message, "error") },
    );
  }, [showToast, togglePin]);

  const selectedRates = useMemo(
    () => filteredRates.filter((item) => selectedIds.has(item.id)),
    [filteredRates, selectedIds],
  );

  const handleBulkResync = useCallback(async () => {
    let count = 0;
    for (const item of selectedRates) {
      try {
        await syncRatePair.mutateAsync({
          fromCurrencyCode: item.fromCurrencyCode,
          toCurrencyCode: item.toCurrencyCode,
        });
        count += 1;
      } catch (err: unknown) {
        showToast(err instanceof Error ? err.message : "No se pudo sincronizar uno", "error");
      }
    }
    exitSelectMode();
    if (count > 0) {
      showToast(
        count === 1 ? "1 par resincronizado" : `${count} pares resincronizados`,
        "success",
      );
    }
  }, [exitSelectMode, selectedRates, showToast, syncRatePair]);

  const handleBulkDelete = useCallback(() => {
    selectedRates.forEach(startUndoDelete);
    exitSelectMode();
  }, [exitSelectMode, selectedRates, startUndoDelete]);

  const handleSave = useCallback(async (from: string, to: string, rate: number, notes: string) => {
    try {
      if (editItem) {
        await updateRate.mutateAsync({ id: editItem.id, fromCurrencyCode: from, toCurrencyCode: to, rate, notes });
        showToast("Tipo de cambio actualizado", "success");
      } else {
        await createRate.mutateAsync({ fromCurrencyCode: from, toCurrencyCode: to, rate, notes });
        showToast("Tipo de cambio creado", "success");
      }
      closeForm();
    } catch (error: unknown) {
      showToast(error instanceof Error ? error.message : "No se pudo guardar el tipo de cambio", "error");
    }
  }, [createRate, editItem, showToast, updateRate]);

  const handleRefreshRates = useCallback(async (silent = false) => {
    if (activeRates.length === 0) {
      await refetch();
      return;
    }

    const pairs = new Map<string, string>();
    for (const rate of activeRates) {
      const from = rate.fromCurrencyCode.toUpperCase();
      const to = rate.toCurrencyCode.toUpperCase();
      const canonical = [from, to].sort().join(":");
      if (!pairs.has(canonical)) pairs.set(canonical, `${from}:${to}`);
    }

    try {
      await Promise.all(Array.from(pairs.values()).map((pair) => {
        const [fromCurrencyCode, toCurrencyCode] = pair.split(":");
        return syncRatePair.mutateAsync({ fromCurrencyCode, toCurrencyCode });
      }));
      if (!silent) showToast("Tipos de cambio actualizados", "success");
    } catch (error: unknown) {
      if (!silent) showToast(error instanceof Error ? error.message : "No se pudo actualizar tipos de cambio", "error");
    }
  }, [activeRates, refetch, showToast, syncRatePair]);

  const dailySyncStartedRef = useRef(false);
  useEffect(() => {
    if (dailySyncStartedRef.current || isLoading || activeRates.length === 0) return;
    const today = new Date();
    const needsSync = activeRates.some((rate) => !isExchangeRateSameLocalDay(rate.effectiveAt, today));
    if (!needsSync) return;
    dailySyncStartedRef.current = true;
    void handleRefreshRates(true);
  }, [activeRates, handleRefreshRates, isLoading]);

  const renderRate: SectionListRenderItem<ExchangeRateRecord, ExchangeRateListSection> = useCallback(({ item }) => (
    <ExchangeRateSwipeRow
      rate={item}
      onPress={() => {
        if (selectMode) {
          toggleSelect(item.id);
          return;
        }
        openEdit(item);
      }}
      onLongPress={() => {
        if (!selectMode) setSelectMode(true);
        toggleSelect(item.id);
      }}
      onDelete={() => startUndoDelete(item)}
      onTogglePin={selectMode ? undefined : () => handleTogglePin(item)}
      selected={selectedIds.has(item.id)}
      selectMode={selectMode}
    />
  ), [handleTogglePin, selectMode, selectedIds, startUndoDelete, toggleSelect]);

  return (
    <ResourceModuleTemplate
      topInset={insets.top}
      header={
        <ScreenHeader
          title={selectMode ? `${selectedIds.size} seleccionado${selectedIds.size === 1 ? "" : "s"}` : "Tipos de cambio"}
          onBack={selectMode ? exitSelectMode : handleBack}
          rightAction={
            selectMode ? null : (
              <HeaderActionGroup
                actions={[{
                  key: "refresh",
                  icon: RefreshCw,
                  onPress: () => void handleRefreshRates(),
                  disabled: syncRatePair.isPending,
                  accessibilityLabel: "Actualizar tipos de cambio",
                }, {
                  key: "filters",
                  icon: SlidersHorizontal,
                  label: extraFiltersCount > 0 ? `Filtros (${extraFiltersCount})` : "Filtros",
                  active: extraFiltersCount > 0,
                  onPress: () => setFilterSheetOpen(true),
                  accessibilityLabel: "Abrir filtros avanzados de tipos de cambio",
                }]}
              />
            )
          }
        />
      }
      toolbar={selectMode ? null : (
        <FilterToolbar
          options={filterOptions}
          value={currencyFilter}
          onChange={setCurrencyFilter}
          searchValue={searchText}
          onSearchChange={setSearchText}
          searchPlaceholder="Buscar moneda, tasa o nota..."
        />
      )}
      activeFilters={selectMode ? null : <ActiveFilterBar items={activeFilterItems} onClear={clearFilters} />}
      context={!selectMode && activeRates.length > 0 ? <ResourceContextNote>{contextNote}</ResourceContextNote> : null}
      summary={
        !selectMode && activeRates.length > 0 ? (
          <ExchangeRatesSummaryBar pairCount={pairCount} currencyCount={currencyOptions.length} />
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
                label: `Sel. todos (${filteredRates.length})`,
                icon: CheckSquare,
                onPress: () => setSelectedIds(new Set(filteredRates.map((item) => item.id))),
              },
              {
                key: "resync",
                label: `Resincronizar (${selectedIds.size})`,
                icon: RefreshCw,
                tone: "primary",
                onPress: () => void handleBulkResync(),
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
          sections={sections}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderRate}
          loading={{
            isLoading,
            secondaryLoading: syncRatePair.isPending && sections.length === 0,
            secondaryMessage: "Sincronizando tipos de cambio...",
            skeleton: (
              <SkeletonList>
                <SkeletonCard />
                <SkeletonCard />
                <SkeletonCard />
              </SkeletonList>
            ),
          }}
          empty={{
            title: hasFilters ? "Sin resultados" : "Sin tipos de cambio",
            description: hasFilters
              ? "Prueba otra moneda o limpia la búsqueda."
              : "Agrega el primer par para convertir saldos entre monedas.",
            action: !hasFilters ? { label: "Nuevo tipo de cambio", onPress: openNew } : undefined,
          }}
          refreshing={isLoading || syncRatePair.isPending}
          onRefresh={() => void handleRefreshRates()}
        />
      }
      fab={!selectMode ? <FAB onPress={openNew} bottom={insets.bottom + 16} /> : null}
      overlays={
        <>
          <ExchangeRateFilterSheet
            visible={filterSheetOpen}
            onClose={() => setFilterSheetOpen(false)}
            advancedFilter={advancedFilter}
            onAdvancedFilterChange={setAdvancedFilter}
          />
          <BottomSheet
            visible={showForm}
            onClose={closeForm}
            title={editItem ? `Editar ${editItem.fromCurrencyCode} → ${editItem.toCurrencyCode}` : "Nuevo tipo de cambio"}
            snapHeight={0.75}
          >
            <ExchangeRateForm
              key={editItem?.id ?? "new"}
              initialFrom={editItem?.fromCurrencyCode ?? ""}
              initialTo={editItem?.toCurrencyCode ?? ""}
              initialRate={editItem ? String(editItem.rate) : ""}
              initialNotes={editItem?.notes ?? ""}
              currencyOptions={currencyOptions}
              onSave={(from, to, rate, notes) => void handleSave(from, to, rate, notes)}
              onCancel={closeForm}
              loading={createRate.isPending || updateRate.isPending}
            />
          </BottomSheet>
          <UndoBanner
            visible={pendingDeleteIds.size > 0}
            message={(() => {
              if (pendingDeleteIds.size === 0) return "";
              if (pendingDeleteIds.size === 1) {
                const [onlyId] = pendingDeleteIds;
                const label = pendingDeleteLabels.current.get(onlyId) ?? "";
                return label ? `Tipo de cambio "${label}" eliminado` : "Tipo de cambio eliminado";
              }
              return `${pendingDeleteIds.size} tipos de cambio eliminados`;
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

export default function ExchangeRatesScreenRoot() {
  return (
    <ErrorBoundary>
      <ExchangeRatesScreen />
    </ErrorBoundary>
  );
}
