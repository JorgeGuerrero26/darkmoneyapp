import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SectionListRenderItem } from "react-native";
import { CheckSquare, Download, Pause, SlidersHorizontal, Trash2 } from "lucide-react-native";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ErrorBoundary } from "../components/ui/ErrorBoundary";
import { UndoBanner } from "../components/ui/UndoBanner";
import { ScreenHeader } from "../components/layout/ScreenHeader";
import { HeaderActionGroup } from "../components/ui/HeaderActionGroup";
import { FilterToolbar } from "../components/ui/FilterToolbar";
import { ActiveFilterBar, type ActiveFilterItem } from "../components/ui/ActiveFilterBar";
import { ResourceContextNote } from "../components/ui/ResourceContextNote";
import { ResourceModuleTemplate } from "../components/ui/ResourceModuleTemplate";
import { BulkActionBar } from "../components/ui/BulkActionBar";
import { ResourceSectionList } from "../components/ui/ResourceSectionList";
import { SkeletonCard } from "../components/ui/Skeleton";
import { FAB } from "../components/ui/FAB";
import { SubscriptionAnalyticsModal } from "../components/domain/SubscriptionAnalyticsModal";
import { SubscriptionForm } from "../components/forms/SubscriptionForm";
import { SubscriptionFilterSheet } from "../features/subscriptions/components/SubscriptionFilterSheet";
import { SubscriptionSummaryBar } from "../features/subscriptions/components/SubscriptionSummaryBar";
import { SubscriptionSwipeRow } from "../features/subscriptions/components/SubscriptionSwipeRow";
import { MarkSubscriptionPaidSheet } from "../features/subscriptions/components/MarkSubscriptionPaidSheet";
import {
  buildSubscriptionSections,
  type SubscriptionListSection,
} from "../features/subscriptions/lib/buildSubscriptionSections";
import {
  filterSubscriptionsByDueDate,
  getSubscriptionDueDateRange,
  type SubscriptionDueDateFilter,
} from "../features/subscriptions/lib/subscriptionDueDateFilters";
import {
  filterSubscriptions,
  getMonthlySubscriptionAmount,
  SUBSCRIPTION_FILTERS,
  subscriptionFilterLabel,
  type ActiveSubscriptionFilter,
} from "../features/subscriptions/lib/subscriptionFilters";
import { buildSubscriptionsContextNote } from "../features/subscriptions/lib/buildSubscriptionsContextNote";
import { useAuth } from "../lib/auth-context";
import { useWorkspace } from "../lib/workspace-context";
import { useUiStore } from "../store/ui-store";
import { buildSubscriptionsCsv } from "../lib/subscriptions-csv";
import { shareCsvAsFile } from "../lib/share-csv-file";
import {
  useWorkspaceSnapshotQuery,
} from "../services/queries/workspace-data";
import {
  useDeleteSubscriptionMutation,
  useMarkSubscriptionPaidMutation,
  useToggleSubscriptionPinMutation,
  useUpdateSubscriptionMutation,
} from "../services/queries/subscriptions-recurring-income";
import { useToast } from "../hooks/useToast";
import { useNotificationReason } from "../hooks/useNotificationReason";
import { useOriginBackNavigation } from "../hooks/useOriginBackNavigation";
import type { SubscriptionSummary } from "../types/domain";

function SubscriptionsScreen() {
  // Fuerza el re-render de la pantalla al alternar modo privacidad (la máscara
  // vive en formatCurrency, que lee el store imperativamente).
  useUiStore((state) => state.privacyMode);
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const router = useRouter();
  const { handleBack } = useOriginBackNavigation();
  const { profile } = useAuth();
  const { activeWorkspaceId, activeWorkspace } = useWorkspace();
  const { showToast } = useToast();
  const { reason: notificationReason } = useNotificationReason();

  const { data: snapshot, isLoading, isRefetching, refetch } = useWorkspaceSnapshotQuery(profile, activeWorkspaceId);
  const updateMutation = useUpdateSubscriptionMutation(activeWorkspaceId);
  const deleteMutation = useDeleteSubscriptionMutation(activeWorkspaceId);
  const togglePinMutation = useToggleSubscriptionPinMutation(activeWorkspaceId);
  const markPaidMutation = useMarkSubscriptionPaidMutation(activeWorkspaceId);

  const [createFormVisible, setCreateFormVisible] = useState(false);
  const [analyticsTarget, setAnalyticsTarget] = useState<SubscriptionSummary | null>(null);
  const [markPaidTarget, setMarkPaidTarget] = useState<SubscriptionSummary | null>(null);
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [activeFilters, setActiveFilters] = useState<ActiveSubscriptionFilter[]>([]);
  const [dueDateFilter, setDueDateFilter] = useState<SubscriptionDueDateFilter>("all");
  const [customDueDateFrom, setCustomDueDateFrom] = useState("");
  const [customDueDateTo, setCustomDueDateTo] = useState("");
  const [pendingDeleteIds, setPendingDeleteIds] = useState<Set<number>>(new Set());
  const pendingDeleteLabels = useRef<Map<number, string>>(new Map());
  const deleteTimers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

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

  const subscriptions = useMemo(
    () => (snapshot?.subscriptions ?? []).filter((subscription) => !pendingDeleteIds.has(subscription.id)),
    [pendingDeleteIds, snapshot?.subscriptions],
  );
  const postedMovements = snapshot?.subscriptionPostedMovements ?? [];
  const baseCurrencyCode = activeWorkspace?.baseCurrencyCode ?? profile?.baseCurrencyCode ?? "PEN";

  const dueDateRange = useMemo(
    () => getSubscriptionDueDateRange(dueDateFilter, customDueDateFrom, customDueDateTo),
    [customDueDateFrom, customDueDateTo, dueDateFilter],
  );

  const filteredSubscriptions = useMemo(
    () => filterSubscriptionsByDueDate(
      filterSubscriptions(subscriptions, activeFilters, searchText),
      dueDateRange,
    ),
    [activeFilters, dueDateRange, searchText, subscriptions],
  );
  const subscriptionSections = useMemo(
    () => buildSubscriptionSections(filteredSubscriptions),
    [filteredSubscriptions],
  );

  const activeFilterItems = useMemo<ActiveFilterItem[]>(() => {
    const items = activeFilters.map((filter) => ({
      key: `filter-${filter}`,
      label: subscriptionFilterLabel(filter),
      onRemove: () => setActiveFilters((current) => current.filter((value) => value !== filter)),
    }));

    if (searchText.trim()) {
      items.push({
        key: "search",
        label: `Búsqueda: ${searchText.trim()}`,
        onRemove: () => setSearchText(""),
      });
    }

    if (dueDateRange) {
      items.push({
        key: "due-date",
        label: `Próximo pago: ${dueDateRange.label}`,
        onRemove: () => setDueDateFilter("all"),
      });
    }

    return items;
  }, [activeFilters, dueDateRange, searchText]);

  const summary = useMemo(() => {
    return filteredSubscriptions.reduce(
      (acc, subscription) => {
        if (subscription.status === "active") {
          acc.activeCount += 1;
          acc.monthlyTotal += getMonthlySubscriptionAmount(subscription, true);
        }
        if (subscription.status === "paused") acc.pausedCount += 1;
        return acc;
      },
      { monthlyTotal: 0, activeCount: 0, pausedCount: 0 },
    );
  }, [filteredSubscriptions]);

  useEffect(() => () => {
    deleteTimers.current.forEach(clearTimeout);
    deleteTimers.current.clear();
    pendingDeleteLabels.current.clear();
  }, []);

  const onRefresh = useCallback(async () => {
    await refetch();
  }, [refetch]);

  const clearFilters = useCallback(() => {
    setActiveFilters([]);
    setSearchText("");
    setDueDateFilter("all");
  }, []);

  const startUndoDelete = useCallback((subscription: SubscriptionSummary) => {
    setPendingDeleteIds((prev) => new Set(prev).add(subscription.id));
    pendingDeleteLabels.current.set(subscription.id, subscription.name);
    const timer = setTimeout(() => {
      deleteMutation.mutate(subscription.id, {
        onError: (error) => showToast(error.message, "error"),
      });
      setPendingDeleteIds((prev) => {
        const next = new Set(prev);
        next.delete(subscription.id);
        return next;
      });
      pendingDeleteLabels.current.delete(subscription.id);
      deleteTimers.current.delete(subscription.id);
    }, 5000);
    deleteTimers.current.set(subscription.id, timer);
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

  const handleTogglePin = useCallback((subscription: SubscriptionSummary) => {
    togglePinMutation.mutate(
      { id: subscription.id, isPinned: !subscription.isPinned },
      { onError: (err) => showToast(err.message, "error") },
    );
  }, [showToast, togglePinMutation]);

  const handleTogglePause = useCallback((subscription: SubscriptionSummary) => {
    const newStatus = subscription.status === "active" ? "paused" : "active";
    updateMutation.mutate(
      { id: subscription.id, input: { status: newStatus } },
      {
        onSuccess: () => showToast(
          newStatus === "paused" ? "Suscripción pausada" : "Suscripción reactivada",
          "success",
        ),
        onError: (error) => showToast(error.message, "error"),
      },
    );
  }, [showToast, updateMutation]);

  const handleMarkPaid = useCallback(
    async (args: { paidDate: string; amount: number; accountId: number }) => {
      if (!markPaidTarget) return;
      try {
        const { nextDueDate } = await markPaidMutation.mutateAsync({
          subscription: markPaidTarget,
          paidDate: args.paidDate,
          amount: args.amount,
          accountId: args.accountId,
        });
        setMarkPaidTarget(null);
        showToast(`Pago registrado · Próximo cobro: ${nextDueDate}`, "success");
      } catch (error: unknown) {
        showToast(error instanceof Error ? error.message : "No se pudo registrar el pago", "error");
      }
    },
    [markPaidMutation, markPaidTarget, showToast],
  );

  const selectedSubscriptions = useMemo(
    () => filteredSubscriptions.filter((s) => selectedIds.has(s.id)),
    [filteredSubscriptions, selectedIds],
  );

  const handleBulkPause = useCallback(async () => {
    let pausedCount = 0;
    for (const sub of selectedSubscriptions) {
      if (sub.status !== "active") continue;
      try {
        await updateMutation.mutateAsync({ id: sub.id, input: { status: "paused" } });
        pausedCount += 1;
      } catch (err: unknown) {
        showToast(err instanceof Error ? err.message : "Error al pausar", "error");
      }
    }
    exitSelectMode();
    if (pausedCount > 0) {
      showToast(
        pausedCount === 1 ? "1 suscripción pausada" : `${pausedCount} suscripciones pausadas`,
        "success",
      );
    }
  }, [exitSelectMode, selectedSubscriptions, showToast, updateMutation]);

  const handleBulkDelete = useCallback(() => {
    selectedSubscriptions.forEach(startUndoDelete);
    exitSelectMode();
  }, [exitSelectMode, selectedSubscriptions, startUndoDelete]);

  const exportCSV = useCallback(async (subscriptionsToExport: SubscriptionSummary[]) => {
    if (subscriptionsToExport.length === 0) {
      showToast("No hay filas para exportar", "warning");
      return;
    }
    try {
      const csv = buildSubscriptionsCsv(subscriptionsToExport);
      await shareCsvAsFile(csv, `suscripciones-${activeWorkspace?.name?.replace(/\s+/g, "_") ?? "workspace"}.csv`);
    } catch (error: unknown) {
      showToast(error instanceof Error ? error.message : "Error al exportar", "error");
    }
  }, [activeWorkspace?.name, showToast]);

  const renderSubscription: SectionListRenderItem<SubscriptionSummary, SubscriptionListSection> = useCallback(({ item }) => (
    <SubscriptionSwipeRow
      subscription={item}
      monthlyAmount={getMonthlySubscriptionAmount(item)}
      onPress={() => {
        if (selectMode) {
          toggleSelect(item.id);
          return;
        }
        router.push(`/subscription/${item.id}?from=subscriptions`);
      }}
      onLongPress={() => {
        if (!selectMode) setSelectMode(true);
        toggleSelect(item.id);
      }}
      onDelete={() => startUndoDelete(item)}
      onTogglePause={() => handleTogglePause(item)}
      onPay={() => setMarkPaidTarget(item)}
      onAnalytics={() => setAnalyticsTarget(item)}
      onTogglePin={selectMode ? undefined : () => handleTogglePin(item)}
      selected={selectedIds.has(item.id)}
      selectMode={selectMode}
    />
  ), [handleTogglePause, handleTogglePin, router, selectMode, selectedIds, startUndoDelete, toggleSelect]);

  const extraFiltersCount = dueDateRange ? 1 : 0;
  const hasFilters = activeFilters.length > 0 || Boolean(searchText.trim()) || extraFiltersCount > 0;
  const contextNote = buildSubscriptionsContextNote({
    visibleCount: filteredSubscriptions.length,
    totalCount: subscriptions.length,
    dueDateRangeLabel: dueDateRange?.label ?? null,
  });

  return (
    <ResourceModuleTemplate
      topInset={insets.top}
      header={
        <ScreenHeader
          title={selectMode ? `${selectedIds.size} seleccionada${selectedIds.size === 1 ? "" : "s"}` : "Suscripciones"}
          onBack={selectMode ? exitSelectMode : handleBack}
          rightAction={
            selectMode ? null : (
              <HeaderActionGroup
                actions={[
                  {
                    key: "export",
                    icon: Download,
                    onPress: () => exportCSV(filteredSubscriptions),
                    disabled: filteredSubscriptions.length === 0,
                    accessibilityLabel: "Exportar suscripciones en CSV",
                  },
                  {
                    key: "filters",
                    icon: SlidersHorizontal,
                    label: extraFiltersCount > 0 ? `Filtros (${extraFiltersCount})` : "Filtros",
                    active: extraFiltersCount > 0,
                    onPress: () => setFilterSheetOpen(true),
                    accessibilityLabel: "Abrir filtros avanzados de suscripciones",
                  },
                ]}
              />
            )
          }
        />
      }
      toolbar={selectMode ? null : (
        <FilterToolbar
          options={SUBSCRIPTION_FILTERS}
          selectedValues={activeFilters}
          onSelectedValuesChange={(values) =>
            setActiveFilters(values.filter((value): value is ActiveSubscriptionFilter => value !== "all"))
          }
          allValue="all"
          searchValue={searchText}
          onSearchChange={setSearchText}
          searchPlaceholder="Buscar suscripciones..."
        />
      )}
      activeFilters={selectMode ? null : <ActiveFilterBar items={activeFilterItems} onClear={clearFilters} />}
      context={
        !selectMode && (notificationReason || subscriptions.length > 0) ? (
          <ResourceContextNote>{notificationReason ?? contextNote}</ResourceContextNote>
        ) : null
      }
      summary={
        !selectMode && filteredSubscriptions.length > 0 ? (
          <SubscriptionSummaryBar
            monthlyTotal={summary.monthlyTotal}
            activeCount={summary.activeCount}
            pausedCount={summary.pausedCount}
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
                label: `Sel. todas (${filteredSubscriptions.length})`,
                icon: CheckSquare,
                onPress: () => setSelectedIds(new Set(filteredSubscriptions.map((s) => s.id))),
              },
              {
                key: "csv",
                label: "CSV",
                icon: Download,
                tone: "primary",
                onPress: () => exportCSV(selectedSubscriptions),
              },
              {
                key: "pause",
                label: `Pausar (${selectedIds.size})`,
                icon: Pause,
                tone: "neutral",
                onPress: () => void handleBulkPause(),
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
          sections={subscriptionSections}
          keyExtractor={(subscription) => String(subscription.id)}
          renderItem={renderSubscription}
          loading={{
            isLoading,
            skeleton: (
              <>
                <SkeletonCard />
                <SkeletonCard />
                <SkeletonCard />
              </>
            ),
          }}
          empty={{
            title: hasFilters ? "Sin resultados" : "Sin suscripciones",
            description: hasFilters
              ? "Prueba quitando filtros o ajustando la búsqueda."
              : "Lleva el control de Netflix, Spotify y todo lo que pagas cada mes.",
            action: !hasFilters ? { label: "Agregar suscripción", onPress: () => setCreateFormVisible(true) } : undefined,
          }}
          refreshing={isRefetching}
          onRefresh={onRefresh}
        />
      }
      fab={!selectMode ? <FAB onPress={() => setCreateFormVisible(true)} bottom={insets.bottom + 16} /> : null}
      overlays={
        <>
          <SubscriptionFilterSheet
            visible={filterSheetOpen}
            onClose={() => setFilterSheetOpen(false)}
            dueDateFilter={dueDateFilter}
            onDueDateFilterChange={setDueDateFilter}
            customDueDateFrom={customDueDateFrom}
            customDueDateTo={customDueDateTo}
            onCustomDueDateFromChange={setCustomDueDateFrom}
            onCustomDueDateToChange={setCustomDueDateTo}
          />
          <SubscriptionForm
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
                return label ? `Suscripción "${label}" eliminada` : "Suscripción eliminada";
              }
              return `${pendingDeleteIds.size} suscripciones eliminadas`;
            })()}
            onUndo={() => pendingDeleteIds.forEach((id) => undoDelete(id))}
            durationMs={5000}
            bottomOffset={insets.bottom + 80}
          />
          <SubscriptionAnalyticsModal
            visible={Boolean(analyticsTarget)}
            onClose={() => setAnalyticsTarget(null)}
            subscription={analyticsTarget}
            movements={postedMovements}
            baseCurrencyCode={baseCurrencyCode}
          />
          <MarkSubscriptionPaidSheet
            visible={Boolean(markPaidTarget)}
            subscription={markPaidTarget}
            accounts={snapshot?.accounts ?? []}
            isPending={markPaidMutation.isPending}
            onClose={() => setMarkPaidTarget(null)}
            onConfirm={(args) => void handleMarkPaid(args)}
          />
        </>
      }
    />
  );
}

export default function SubscriptionsScreenRoot() {
  return (
    <ErrorBoundary>
      <SubscriptionsScreen />
    </ErrorBoundary>
  );
}
