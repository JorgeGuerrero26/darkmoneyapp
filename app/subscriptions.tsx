import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SectionListRenderItem } from "react-native";
import { Download, SlidersHorizontal } from "lucide-react-native";
import { useQueryClient } from "@tanstack/react-query";
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
import { SkeletonCard } from "../components/ui/Skeleton";
import { FAB } from "../components/ui/FAB";
import { SubscriptionAnalyticsModal } from "../components/domain/SubscriptionAnalyticsModal";
import { SubscriptionForm } from "../components/forms/SubscriptionForm";
import { SubscriptionFilterSheet } from "../features/subscriptions/components/SubscriptionFilterSheet";
import { SubscriptionSummaryBar } from "../features/subscriptions/components/SubscriptionSummaryBar";
import { SubscriptionSwipeRow } from "../features/subscriptions/components/SubscriptionSwipeRow";
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
import { buildSubscriptionsCsv } from "../lib/subscriptions-csv";
import { shareCsvAsFile } from "../lib/share-csv-file";
import {
  useDeleteSubscriptionMutation,
  useUpdateSubscriptionMutation,
  useWorkspaceSnapshotQuery,
} from "../services/queries/workspace-data";
import { useToast } from "../hooks/useToast";
import { useOriginBackNavigation } from "../hooks/useOriginBackNavigation";
import type { SubscriptionSummary } from "../types/domain";

function SubscriptionsScreen() {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { handleBack } = useOriginBackNavigation();
  const { profile } = useAuth();
  const { activeWorkspaceId, activeWorkspace } = useWorkspace();
  const { showToast } = useToast();

  const { data: snapshot, isLoading } = useWorkspaceSnapshotQuery(profile, activeWorkspaceId);
  const updateMutation = useUpdateSubscriptionMutation(activeWorkspaceId);
  const deleteMutation = useDeleteSubscriptionMutation(activeWorkspaceId);

  const [createFormVisible, setCreateFormVisible] = useState(false);
  const [editSubscription, setEditSubscription] = useState<SubscriptionSummary | null>(null);
  const [analyticsTarget, setAnalyticsTarget] = useState<SubscriptionSummary | null>(null);
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [activeFilters, setActiveFilters] = useState<ActiveSubscriptionFilter[]>([]);
  const [dueDateFilter, setDueDateFilter] = useState<SubscriptionDueDateFilter>("all");
  const [customDueDateFrom, setCustomDueDateFrom] = useState("");
  const [customDueDateTo, setCustomDueDateTo] = useState("");
  const [pendingDeleteIds, setPendingDeleteIds] = useState<Set<number>>(new Set());
  const [pendingDeleteLabels, setPendingDeleteLabels] = useState<Record<number, string>>({});
  const deleteTimers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

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
  }, []);

  const onRefresh = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ["workspace-snapshot"] });
  }, [queryClient]);

  const clearFilters = useCallback(() => {
    setActiveFilters([]);
    setSearchText("");
    setDueDateFilter("all");
  }, []);

  const startUndoDelete = useCallback((subscription: SubscriptionSummary) => {
    setPendingDeleteIds((prev) => new Set(prev).add(subscription.id));
    setPendingDeleteLabels((prev) => ({ ...prev, [subscription.id]: subscription.name }));
    const timer = setTimeout(() => {
      deleteMutation.mutate(subscription.id, {
        onError: (error) => showToast(error.message, "error"),
      });
      setPendingDeleteIds((prev) => {
        const next = new Set(prev);
        next.delete(subscription.id);
        return next;
      });
      deleteTimers.current.delete(subscription.id);
    }, 5000);
    deleteTimers.current.set(subscription.id, timer);
  }, [deleteMutation, showToast]);

  const undoDelete = useCallback((id: number) => {
    const timer = deleteTimers.current.get(id);
    if (timer) clearTimeout(timer);
    deleteTimers.current.delete(id);
    setPendingDeleteIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }, []);

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
      onEdit={() => setEditSubscription(item)}
      onDelete={() => startUndoDelete(item)}
      onTogglePause={() => handleTogglePause(item)}
      onAnalytics={() => setAnalyticsTarget(item)}
    />
  ), [handleTogglePause, startUndoDelete]);

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
          title="Suscripciones"
          onBack={handleBack}
          rightAction={
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
          }
        />
      }
      toolbar={
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
      }
      activeFilters={<ActiveFilterBar items={activeFilterItems} onClear={clearFilters} />}
      context={subscriptions.length > 0 ? <ResourceContextNote>{contextNote}</ResourceContextNote> : null}
      summary={
        filteredSubscriptions.length > 0 ? (
          <SubscriptionSummaryBar
            monthlyTotal={summary.monthlyTotal}
            activeCount={summary.activeCount}
            pausedCount={summary.pausedCount}
            currencyCode={baseCurrencyCode}
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
          refreshing={isLoading}
          onRefresh={onRefresh}
        />
      }
      fab={<FAB onPress={() => setCreateFormVisible(true)} bottom={insets.bottom + 16} />}
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
          <SubscriptionForm
            visible={Boolean(editSubscription)}
            onClose={() => setEditSubscription(null)}
            onSuccess={() => setEditSubscription(null)}
            editSubscription={editSubscription ?? undefined}
          />
          <UndoBanner
            visible={pendingDeleteIds.size > 0}
            message={pendingDeleteIds.size === 1
              ? `Suscripción "${Object.values(pendingDeleteLabels).at(-1) ?? ""}" eliminada`
              : `${pendingDeleteIds.size} suscripciones eliminadas`}
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
