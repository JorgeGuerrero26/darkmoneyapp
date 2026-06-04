import { useRouter } from "expo-router";
import { ErrorBoundary } from "../../components/ui/ErrorBoundary";
import * as Haptics from "expo-haptics";
import { FAB } from "../../components/ui/FAB";
import { UndoBanner } from "../../components/ui/UndoBanner";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Archive, CheckSquare, Download, Trash2, X } from "lucide-react-native";
import { useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { useAuth } from "../../lib/auth-context";
import { humanizeError } from "../../lib/errors";
import { parseDisplayDate } from "../../lib/date";
import { useWorkspace } from "../../lib/workspace-context";
import { buildShareByObligationId } from "../../lib/obligation-labels";
import { buildRateMap } from "../../lib/exchange-rate-map";
import { pendingAmountInBaseCurrency } from "../../lib/obligation-pending-base";
import { useWorkspaceSnapshotQuery } from "../../services/queries/workspace-data";
import {
  useDeleteObligationMutation,
  useArchiveObligationMutation,
  useObligationSharesQuery,
  useSharedObligationsQuery,
  usePendingPaymentRequestCountsQuery,
} from "../../services/queries/obligations";
import { PaymentRequestForm } from "../../components/forms/PaymentRequestForm";
import { useToast } from "../../hooks/useToast";
import { ConfirmDialog } from "../../components/ui/ConfirmDialog";
import { ObligationAnalyticsModal } from "../../components/domain/ObligationAnalyticsModal";
import { AttachmentPreviewModal } from "../../components/domain/AttachmentPreviewModal";
import { ObligationEventActionSheet } from "../../components/domain/ObligationEventActionSheet";
import { ObligationEventDeleteImpact } from "../../components/domain/ObligationEventDeleteImpact";
import type {
  ObligationEventSummary,
  ObligationSummary,
  SharedObligationSummary,
} from "../../types/domain";
import { ScreenHeader } from "../../components/layout/ScreenHeader";
import { ObligationForm } from "../../components/forms/ObligationForm";
import { PaymentForm } from "../../components/forms/PaymentForm";
import { PrincipalAdjustmentForm } from "../../components/forms/PrincipalAdjustmentForm";
import { formatCurrency } from "../../components/ui/AmountDisplay";
import { ActiveFilterBar, type ActiveFilterItem } from "../../components/ui/ActiveFilterBar";
import { BulkActionBar } from "../../components/ui/BulkActionBar";
import { ResourceContextNote } from "../../components/ui/ResourceContextNote";
import { HeaderActionGroup } from "../../components/ui/HeaderActionGroup";
import { ResourceModuleTemplate } from "../../components/ui/ResourceModuleTemplate";
import { COLORS } from "../../constants/theme";
import { shareCsvAsFile } from "../../lib/share-csv-file";
import { ObligationFilterBar } from "../../features/obligations/components/ObligationFilterBar";
import { ObligationList } from "../../features/obligations/components/ObligationList";
import { ObligationSummaryBar } from "../../features/obligations/components/ObligationSummaryBar";
import {
  ObligationSwipeRow,
  ObligationArchiveIcon,
  ObligationTrashIcon,
} from "../../features/obligations/components/ObligationSwipeRow";
import {
  buildObligationSections,
  type ObligationListSection,
} from "../../features/obligations/lib/buildObligationSections";
import {
  filterObligations,
  obligationFilterLabel,
  type ObligationFilterValue,
} from "../../features/obligations/lib/obligationFilters";
import { canDeleteObligation } from "../../features/obligations/lib/obligationPermissions";
import { useObligationAnalyticsActions } from "../../features/obligations/lib/useObligationAnalyticsActions";

import { buildObligationCSV } from "../../features/obligations/lib/obligationsCsv";
import { searchObligations } from "../../features/obligations/lib/obligationsSearch";
import { buildObligationsContextNote } from "../../features/obligations/lib/obligationsContextNote";
import {
  ANALYTICS_EDITABLE_TYPES,
  ANALYTICS_EVENT_LABELS,
} from "../../features/obligations/lib/obligationEventLabels";

const UNDO_DELETE_MS = 5000;

// ─── Screen ──────────────────────────────────────────────────────────────────

function ObligationsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { profile, session } = useAuth();
  const { activeWorkspaceId, activeWorkspace } = useWorkspace();
  const { showToast } = useToast();
  const deleteMutation = useDeleteObligationMutation(activeWorkspaceId);
  const archiveMutation = useArchiveObligationMutation(activeWorkspaceId);

  const { data: snapshot, isLoading, dataUpdatedAt } = useWorkspaceSnapshotQuery(profile, activeWorkspaceId);
  const { data: obligationShares = [] } = useObligationSharesQuery(activeWorkspaceId);
  const { data: sharedObligations = [], isLoading: sharedLoading, isFetching: sharedFetching } =
    useSharedObligationsQuery(session?.user?.id ?? null);
  const { data: pendingRequestCounts } = usePendingPaymentRequestCountsQuery(activeWorkspaceId);

  const lastUpdateLabel = useMemo(() => {
    if (!dataUpdatedAt) return "";
    const seconds = Math.floor((Date.now() - dataUpdatedAt) / 1000);
    if (seconds < 10) return "Ahora";
    if (seconds < 60) return `Actualizado hace ${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `Actualizado hace ${minutes}min`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `Actualizado hace ${hours}h`;
    return `Actualizado hace ${Math.floor(hours / 24)}d`;
  }, [dataUpdatedAt]);

  const shareByObligationId = useMemo(
    () => buildShareByObligationId(obligationShares),
    [obligationShares],
  );

  const [activeFilters, setActiveFilters] = useState<ObligationFilterValue[]>([]);
  const [showArchived, setShowArchived] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [createFormVisible, setCreateFormVisible] = useState(false);
  const [paymentObligation, setPaymentObligation] = useState<ObligationSummary | null>(null);
  const [paymentRequestObligation, setPaymentRequestObligation] = useState<SharedObligationSummary | null>(null);
  const [adjustObligation, setAdjustObligation] = useState<ObligationSummary | null>(null);
  const [adjustMode, setAdjustMode] = useState<"increase" | "decrease">("increase");
  const [archiveTarget, setArchiveTarget] = useState<ObligationSummary | null>(null);
  const [analyticsObligation, setAnalyticsObligation] = useState<
    ObligationSummary | SharedObligationSummary | null
  >(null);

  // Bulk selection
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkArchiveConfirm, setBulkArchiveConfirm] = useState(false);
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false);

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

  // Undo-delete: hidden list of ids pending actual deletion
  const [pendingDeleteIds, setPendingDeleteIds] = useState<Set<number>>(new Set());
  const [pendingDeleteDeadlines, setPendingDeleteDeadlines] = useState<Record<number, number>>({});
  const [undoNow, setUndoNow] = useState(() => Date.now());
  const deleteTimers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());
  const pendingDeleteItems = useRef<Map<number, ObligationSummary>>(new Map());

  async function handleArchiveObligation(ob: ObligationSummary) {
    if (ob.status === "cancelled") {
      showToast("La obligación ya está archivada", "success");
      return;
    }
    try {
      await archiveMutation.mutateAsync({ id: ob.id, archived: true });
      showToast("Obligación archivada. Para eliminarla, primero borra sus eventos.", "success");
    } catch (err: unknown) {
      showToast(humanizeError(err), "error");
    }
  }

  const finalizeDelete = useCallback((id: number) => {
    const pending = pendingDeleteItems.current.get(id);
    const timer = deleteTimers.current.get(id);
    if (timer) clearTimeout(timer);
    deleteTimers.current.delete(id);
    pendingDeleteItems.current.delete(id);
    setPendingDeleteDeadlines((prev) => {
      if (!(id in prev)) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
    setPendingDeleteIds((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    if (!pending) return;
    deleteMutation.mutate(pending.id, {
      onError: (e) => showToast(e.message, "error"),
    });
  }, [deleteMutation, showToast]);

  function startUndoDelete(ob: ObligationSummary) {
    const deadline = Date.now() + UNDO_DELETE_MS;
    setUndoNow(Date.now());
    pendingDeleteItems.current.set(ob.id, ob);
    setPendingDeleteIds((prev) => new Set(prev).add(ob.id));
    setPendingDeleteDeadlines((prev) => ({ ...prev, [ob.id]: deadline }));
    const timer = setTimeout(() => {
      finalizeDelete(ob.id);
    }, UNDO_DELETE_MS);
    deleteTimers.current.set(ob.id, timer);
  }

  function undoDelete(id: number) {
    const timer = deleteTimers.current.get(id);
    if (timer) clearTimeout(timer);
    deleteTimers.current.delete(id);
    pendingDeleteItems.current.delete(id);
    setPendingDeleteDeadlines((prev) => {
      if (!(id in prev)) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
    setPendingDeleteIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }

  // Clear timers on unmount
  useEffect(() => {
    return () => { deleteTimers.current.forEach(clearTimeout); };
  }, []);

  useEffect(() => {
    if (Object.keys(pendingDeleteDeadlines).length === 0) return;
    const interval = setInterval(() => setUndoNow(Date.now()), 100);
    return () => clearInterval(interval);
  }, [pendingDeleteDeadlines]);

  useEffect(() => {
    const expiredIds = Object.entries(pendingDeleteDeadlines)
      .filter(([, deadline]) => deadline <= undoNow)
      .map(([id]) => Number(id));
    expiredIds.forEach((id) => finalizeDelete(id));
  }, [finalizeDelete, pendingDeleteDeadlines, undoNow]);

  function handleObligationRemoveAction(ob: ObligationSummary) {
    if (canDeleteObligation(ob)) {
      startUndoDelete(ob);
      return;
    }
    setArchiveTarget(ob);
  }

  const obligations = snapshot?.obligations ?? [];
  const baseCurrency = (activeWorkspace?.baseCurrencyCode ?? profile?.baseCurrencyCode ?? "PEN").toUpperCase();
  const exchangeRateMap = useMemo(
    () => buildRateMap(snapshot?.exchangeRates ?? []),
    [snapshot?.exchangeRates],
  );

  const filtered = useMemo(
    () => searchObligations(filterObligations(obligations, activeFilters), searchText),
    [activeFilters, obligations, searchText],
  );
  const filteredShared = useMemo(
    () => searchObligations(filterObligations(sharedObligations, activeFilters), searchText),
    [activeFilters, sharedObligations, searchText],
  );
  const liveAnalyticsObligation = useMemo(() => {
    if (!analyticsObligation) return null;
    const isSharedAnalytics =
      "viewerMode" in analyticsObligation &&
      (analyticsObligation as SharedObligationSummary).viewerMode === "shared_viewer";
    if (isSharedAnalytics) {
      return (
        sharedObligations.find(
          (ob) =>
            ob.id === analyticsObligation.id &&
            ob.workspaceId === analyticsObligation.workspaceId,
        ) ?? analyticsObligation
      );
    }
    return obligations.find((ob) => ob.id === analyticsObligation.id) ?? analyticsObligation;
  }, [analyticsObligation, obligations, sharedObligations]);

  const {
    editEventObligation,
    editingEventForPayment,
    editingEventForAdjustment,
    adjustEventMode,
    resetEditEvent,
    selectedAnalyticsEvent,
    selectedAnalyticsEventObligation,
    analyticsEventMenuVisible,
    setAnalyticsEventMenuVisible,
    analyticsAttachmentPreviewVisible,
    setAnalyticsAttachmentPreviewVisible,
    deletingAnalyticsAttachmentPath,
    analyticsConfirmDeleteVisible,
    setAnalyticsConfirmDeleteVisible,
    selectedAnalyticsPreviewAttachments,
    selectedAnalyticsPreviewAttachmentsLoading,
    handleEventTap,
    handleAnalyticsEditEvent,
    handleAnalyticsDeleteEvent,
    handleDeleteAnalyticsAttachment,
  } = useObligationAnalyticsActions({
    liveAnalyticsObligation,
    ownerUserId: profile?.id,
    showToast,
  });

  const listRefreshing = isLoading || sharedFetching;

  const refreshTriggeredRef = useRef(false);
  const onRefreshOrig = useCallback(() => {
    refreshTriggeredRef.current = true;
    void queryClient.invalidateQueries({ queryKey: ["workspace-snapshot"] });
    void queryClient.invalidateQueries({ queryKey: ["shared-obligations"] });
    if (activeWorkspaceId) {
      void queryClient.invalidateQueries({ queryKey: ["obligation-shares", activeWorkspaceId] });
    }
  }, [queryClient, activeWorkspaceId]);


  useEffect(() => {
    if (!listRefreshing && refreshTriggeredRef.current) {
      refreshTriggeredRef.current = false;
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  }, [listRefreshing]);

  const workspaceData = useMemo(
    () => filtered.filter((ob) => !pendingDeleteIds.has(ob.id)),
    [filtered, pendingDeleteIds],
  );
  const activeSharedData = useMemo(
    () => filteredShared.filter((ob) => ob.status !== "cancelled"),
    [filteredShared],
  );

  const obligationSections = useMemo(
    () =>
      buildObligationSections({
        workspaceObligations: workspaceData,
        sharedObligations: filteredShared,
        showArchived,
      }),
    [filteredShared, showArchived, workspaceData],
  );

  const activeFilterItems = useMemo<ActiveFilterItem[]>(() => {
    const items = activeFilters.map((filter) => ({
      key: `filter-${filter}`,
      label: obligationFilterLabel(filter),
      onRemove: () => setActiveFilters((current) => current.filter((value) => value !== filter)),
    }));

    if (showArchived) {
      items.push({
        key: "archived",
        label: "Archivadas",
        onRemove: () => setShowArchived(false),
      });
    }

    if (searchText.trim()) {
      items.push({
        key: "search",
        label: `Busqueda: ${searchText.trim()}`,
        onRemove: () => setSearchText(""),
      });
    }

    return items;
  }, [activeFilters, searchText, showArchived]);

  function clearObligationFilters() {
    setActiveFilters([]);
    setShowArchived(false);
    setSearchText("");
  }

  const obligationSummary = useMemo(() => {
    const visibleItems = obligationSections.flatMap((section) =>
      section.key === "archived-divider" ? [] : section.data,
    );
    return visibleItems.reduce(
      (summary, obligation) => {
        const amount = pendingAmountInBaseCurrency(obligation, exchangeRateMap, baseCurrency);

        if (obligation.direction === "receivable") {
          summary.receivableTotal += amount;
        } else {
          summary.payableTotal += amount;
        }
        summary.netTotal = summary.receivableTotal - summary.payableTotal;
        return summary;
      },
      { receivableTotal: 0, payableTotal: 0, netTotal: 0 },
    );
  }, [baseCurrency, exchangeRateMap, obligationSections]);

  const exportableObligations = useMemo(
    () => obligationSections.flatMap((section) => section.key === "archived-divider" ? [] : section.data),
    [obligationSections],
  );

  const totalPendingRequests = useMemo(() => {
    if (!pendingRequestCounts) return 0;
    let total = 0;
    pendingRequestCounts.forEach((count) => {
      total += count;
    });
    return total;
  }, [pendingRequestCounts]);

  const contextNote = useMemo(
    () =>
      buildObligationsContextNote({
        sharedActiveCount: activeSharedData.length,
        pendingRequestCount: totalPendingRequests,
      }),
    [activeSharedData.length, totalPendingRequests],
  );

  async function exportCSV(obligationsToExport: Array<ObligationSummary | SharedObligationSummary>) {
    const csv = buildObligationCSV(obligationsToExport);
    const fileName = `creditos_deudas_${format(new Date(), "yyyyMMdd")}.csv`;
    try {
      await shareCsvAsFile(csv, fileName);
    } catch {
      showToast("No se pudo exportar", "error");
    }
  }

  // Solo obligaciones del workspace propio son seleccionables (no las compartidas contigo)
  const bulkSelectableObligations = useMemo(
    () => workspaceData,
    [workspaceData],
  );
  const selectedObligations = useMemo(
    () => bulkSelectableObligations.filter((ob) => selectedIds.has(ob.id)),
    [bulkSelectableObligations, selectedIds],
  );

  async function executeBulkArchive() {
    let archivedCount = 0;
    for (const ob of selectedObligations) {
      if (ob.status === "cancelled") continue;
      try {
        await archiveMutation.mutateAsync({ id: ob.id, archived: true });
        archivedCount += 1;
      } catch (err: unknown) {
        showToast(humanizeError(err), "error");
      }
    }
    exitSelectMode();
    setBulkArchiveConfirm(false);
    if (archivedCount > 0) {
      showToast(
        archivedCount === 1 ? "1 obligación archivada" : `${archivedCount} obligaciones archivadas`,
        "success",
      );
    }
  }

  async function executeBulkDelete() {
    const deletable = selectedObligations.filter((ob) => canDeleteObligation(ob));
    const skipped = selectedObligations.length - deletable.length;
    let deletedCount = 0;
    for (const ob of deletable) {
      try {
        await deleteMutation.mutateAsync(ob.id);
        deletedCount += 1;
      } catch (err: unknown) {
        showToast(humanizeError(err), "error");
      }
    }
    exitSelectMode();
    setBulkDeleteConfirm(false);
    if (deletedCount > 0) {
      const msg = deletedCount === 1 ? "1 obligación eliminada" : `${deletedCount} obligaciones eliminadas`;
      showToast(
        skipped > 0 ? `${msg}. ${skipped} con eventos no se eliminaron.` : msg,
        "success",
      );
    } else if (skipped > 0) {
      showToast(
        "Ninguna se eliminó: todas tienen eventos. Archívalas o borra sus eventos primero.",
        "error",
      );
    }
  }

  const renderObligationItem = useCallback(
    ({ item, section }: { item: ObligationSummary | SharedObligationSummary; section: ObligationListSection }) => {
      if (section.key === "shared" || section.key === "shared-archived") {
        const ob = item as SharedObligationSummary;
        return (
          <ObligationSwipeRow
            obligation={ob}
            obligationShare={ob.share}
            isSharedWithMe
            onOpenDetail={() => router.push(`/obligation/${ob.id}`)}
            onPayment={() => setPaymentRequestObligation(ob)}
            onDelete={() => {}}
            onAnalytics={() => setAnalyticsObligation(ob)}
          />
        );
      }
      const ob = item as ObligationSummary;
      const allowDelete = canDeleteObligation(ob);
      return (
        <ObligationSwipeRow
          obligation={ob}
          obligationShare={shareByObligationId.get(ob.id) ?? null}
          pendingRequestCount={pendingRequestCounts?.get(ob.id) ?? 0}
          selectMode={selectMode}
          selected={selectedIds.has(ob.id)}
          onOpenDetail={() => {
            if (selectMode) {
              toggleSelect(ob.id);
              return;
            }
            router.push(`/obligation/${ob.id}`);
          }}
          onLongPress={() => {
            if (!selectMode) {
              setSelectMode(true);
              toggleSelect(ob.id);
            }
          }}
          onPayment={() => setPaymentObligation(ob)}
          onDelete={() => handleObligationRemoveAction(ob)}
          onAnalytics={() => setAnalyticsObligation(ob)}
          deleteActionLabel={allowDelete ? "Eliminar" : ob.status === "cancelled" ? "Archivada" : "Archivar"}
          deleteActionColor={allowDelete ? COLORS.danger : COLORS.storm}
          deleteActionBg={allowDelete ? COLORS.danger + "28" : COLORS.storm + "22"}
          deleteActionIcon={allowDelete ? ObligationTrashIcon : ObligationArchiveIcon}
        />
      );
    },
    [router, shareByObligationId, pendingRequestCounts, handleObligationRemoveAction, selectMode, selectedIds, toggleSelect],
  );

  return (
    <ResourceModuleTemplate
      topInset={insets.top}
      header={
        <ScreenHeader
            title={selectMode ? `${selectedIds.size} seleccionadas` : "Créditos y Deudas"}
            subtitle={selectMode ? undefined : lastUpdateLabel || undefined}
            rightAction={
              <HeaderActionGroup
                actions={
                  selectMode
                    ? [{
                        key: "cancel",
                        icon: X,
                        onPress: exitSelectMode,
                        accessibilityLabel: "Cancelar selección",
                      }]
                    : [{
                        key: "export",
                        icon: Download,
                        onPress: () => exportCSV(exportableObligations),
                        accessibilityLabel: "Exportar CSV",
                      }]
                }
              />
            }
          />
        }
        toolbar={
          !selectMode ? (
            <ObligationFilterBar
              activeFilters={activeFilters}
              showArchived={showArchived}
              searchValue={searchText}
              onSearchChange={setSearchText}
              onFiltersChange={setActiveFilters}
              onToggleArchived={() => setShowArchived((value) => !value)}
            />
          ) : null
        }
        activeFilters={
          !selectMode ? (
            <ActiveFilterBar items={activeFilterItems} onClear={clearObligationFilters} />
          ) : null
        }
        context={!selectMode ? <ResourceContextNote>{contextNote}</ResourceContextNote> : null}
        summary={
          !selectMode && obligationSections.some((section) => section.data.length > 0) ? (
            <ObligationSummaryBar
              receivableTotal={obligationSummary.receivableTotal}
              payableTotal={obligationSummary.payableTotal}
              netTotal={obligationSummary.netTotal}
              currencyCode={baseCurrency}
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
                  label: `Sel. todas (${bulkSelectableObligations.length})`,
                  icon: CheckSquare,
                  onPress: () => setSelectedIds(new Set(bulkSelectableObligations.map((ob) => ob.id))),
                },
                {
                  key: "csv",
                  label: "CSV",
                  icon: Download,
                  tone: "primary",
                  onPress: () => exportCSV(selectedObligations),
                },
                {
                  key: "archive",
                  label: `Archivar (${selectedIds.size})`,
                  icon: Archive,
                  tone: "neutral",
                  onPress: () => setBulkArchiveConfirm(true),
                },
                {
                  key: "delete",
                  label: `Eliminar (${selectedIds.size})`,
                  icon: Trash2,
                  tone: "danger",
                  onPress: () => setBulkDeleteConfirm(true),
                },
              ]}
            />
          ) : null
        }
        list={
          <ObligationList
            sections={obligationSections}
            renderItem={renderObligationItem}
            activeFilters={activeFilters}
            loading={isLoading}
            sharedLoading={sharedLoading}
            hasActiveSharedItems={activeSharedData.length > 0}
            refreshing={listRefreshing}
            onRefresh={onRefreshOrig}
            onCreateFirst={() => setCreateFormVisible(true)}
          />
        }
        fab={!selectMode ? <FAB onPress={() => setCreateFormVisible(true)} bottom={insets.bottom + 16} /> : null}
        overlays={
          <>
            <ObligationForm
              visible={createFormVisible}
              onClose={() => setCreateFormVisible(false)}
              onSuccess={() => setCreateFormVisible(false)}
            />
            {paymentRequestObligation ? (
              <PaymentRequestForm
                visible={Boolean(paymentRequestObligation)}
                onClose={() => setPaymentRequestObligation(null)}
                onSuccess={() => setPaymentRequestObligation(null)}
                obligation={paymentRequestObligation}
              />
            ) : null}
            <PaymentForm
              visible={Boolean(paymentObligation) || Boolean(editingEventForPayment)}
              onClose={() => { setPaymentObligation(null); resetEditEvent(); }}
              onSuccess={() => { setPaymentObligation(null); resetEditEvent(); }}
              obligation={paymentObligation ?? editEventObligation}
              editEvent={editingEventForPayment}
            />
            <PrincipalAdjustmentForm
              visible={Boolean(adjustObligation) || Boolean(editingEventForAdjustment)}
              mode={editingEventForAdjustment ? adjustEventMode : adjustMode}
              obligation={adjustObligation ?? editEventObligation}
              onClose={() => { setAdjustObligation(null); resetEditEvent(); }}
              onSuccess={() => { setAdjustObligation(null); resetEditEvent(); }}
              editEvent={editingEventForAdjustment}
            />

            <UndoBanner
              visible={pendingDeleteIds.size > 0}
              message={pendingDeleteIds.size === 1 ? "Obligación eliminada" : `${pendingDeleteIds.size} obligaciones eliminadas`}
              onUndo={() => pendingDeleteIds.forEach((id) => undoDelete(id))}
              durationMs={5000}
              bottomOffset={90}
            />

            <ObligationAnalyticsModal
              visible={Boolean(analyticsObligation)}
              obligation={liveAnalyticsObligation}
              onClose={() => setAnalyticsObligation(null)}
              onEventTap={handleEventTap}
              userId={profile?.id}
            />
            <ObligationEventActionSheet
              visible={analyticsEventMenuVisible}
              onClose={() => setAnalyticsEventMenuVisible(false)}
              eventTitle={
                ANALYTICS_EVENT_LABELS[selectedAnalyticsEvent?.eventType ?? ""] ?? selectedAnalyticsEvent?.eventType
              }
              dateLabel={
                selectedAnalyticsEvent
                  ? format(parseDisplayDate(selectedAnalyticsEvent.eventDate), "d MMM yyyy", { locale: es })
                  : null
              }
              amountLabel={
                selectedAnalyticsEvent
                  ? formatCurrency(
                      selectedAnalyticsEvent.amount,
                      selectedAnalyticsEventObligation?.currencyCode ?? "",
                    )
                  : null
              }
              description={selectedAnalyticsEvent?.description ?? null}
              notes={selectedAnalyticsEvent?.notes ?? null}
              notices={
                selectedAnalyticsPreviewAttachmentsLoading
                  ? [
                      {
                        key: "checking-attachments",
                        text: "Comprobando si este evento tiene comprobantes...",
                        tone: "info" as const,
                      },
                    ]
                  : []
              }
              quickActions={
                selectedAnalyticsPreviewAttachments.length > 0
                  ? [
                      {
                        key: "attachments",
                        label:
                          selectedAnalyticsPreviewAttachments.length === 1
                            ? "Ver comprobante"
                            : `Ver ${selectedAnalyticsPreviewAttachments.length} comprobantes`,
                        onPress: () => {
                          setAnalyticsEventMenuVisible(false);
                          setAnalyticsAttachmentPreviewVisible(true);
                        },
                        variant: "secondary" as const,
                      },
                    ]
                  : []
              }
              actions={[
                ...(selectedAnalyticsEvent && ANALYTICS_EDITABLE_TYPES.has(selectedAnalyticsEvent.eventType)
                  ? [
                      {
                        key: "edit",
                        label: "Editar",
                        onPress: handleAnalyticsEditEvent,
                        variant: "primary" as const,
                      },
                    ]
                  : []),
                {
                  key: "delete",
                  label: "Eliminar",
                  variant: "ghost" as const,
                  onPress: () => {
                    setAnalyticsEventMenuVisible(false);
                    setAnalyticsConfirmDeleteVisible(true);
                  },
                },
              ]}
            />

            <AttachmentPreviewModal
              visible={analyticsAttachmentPreviewVisible}
              attachments={selectedAnalyticsPreviewAttachments}
              onClose={() => setAnalyticsAttachmentPreviewVisible(false)}
              onDeleteAttachment={handleDeleteAnalyticsAttachment}
              deletingAttachmentPath={deletingAnalyticsAttachmentPath}
              isLoading={selectedAnalyticsPreviewAttachmentsLoading}
              insets={insets}
              title="Comprobantes del evento"
            />

            <ConfirmDialog
              visible={Boolean(archiveTarget)}
              title={archiveTarget?.status === "cancelled" ? "Ya archivada" : "¿Archivar obligación?"}
              body={
                archiveTarget
                  ? archiveTarget.status === "cancelled"
                    ? `"${archiveTarget.title}" ya está archivada.`
                    : `Se archivará "${archiveTarget.title}". No se elimina; podrás verla activando el icono de archivadas.`
                  : ""
              }
              confirmLabel={archiveTarget?.status === "cancelled" ? "Entendido" : "Archivar"}
              cancelLabel="Cancelar"
              onCancel={() => setArchiveTarget(null)}
              onConfirm={() => {
                const target = archiveTarget;
                setArchiveTarget(null);
                if (target && target.status !== "cancelled") void handleArchiveObligation(target);
              }}
            />

            <ConfirmDialog
              visible={bulkArchiveConfirm}
              title={`Archivar ${selectedIds.size} obligaciones`}
              body="Las obligaciones seleccionadas pasarán a estado archivado. Podrás verlas activando el icono de archivadas."
              confirmLabel="Archivar"
              cancelLabel="Cancelar"
              onCancel={() => setBulkArchiveConfirm(false)}
              onConfirm={() => void executeBulkArchive()}
            />

            <ConfirmDialog
              visible={bulkDeleteConfirm}
              title={`¿Eliminar ${selectedIds.size} obligaciones?`}
              body="Solo se eliminarán las que no tengan eventos. Las demás permanecerán y podrás archivarlas."
              confirmLabel="Eliminar"
              cancelLabel="Cancelar"
              onCancel={() => setBulkDeleteConfirm(false)}
              onConfirm={() => void executeBulkDelete()}
            />

            <ConfirmDialog
              visible={analyticsConfirmDeleteVisible}
              title="¿Eliminar evento?"
              body={
                selectedAnalyticsEvent?.movementId
                  ? "Se eliminará el evento y el movimiento contable vinculado."
                  : "Este evento será eliminado permanentemente."
              }
              confirmLabel="Eliminar"
              cancelLabel="Cancelar"
              onCancel={() => setAnalyticsConfirmDeleteVisible(false)}
              onConfirm={handleAnalyticsDeleteEvent}
            >
              {selectedAnalyticsEvent && selectedAnalyticsEventObligation ? (
                <ObligationEventDeleteImpact
                  event={selectedAnalyticsEvent}
                  obligation={selectedAnalyticsEventObligation}
                  accounts={snapshot?.accounts ?? []}
                  actor="owner"
                />
              ) : null}
            </ConfirmDialog>
          </>
        }
      />
  );
}

export default function ObligationsScreenRoot() {
  return (
    <ErrorBoundary>
      <ObligationsScreen />
    </ErrorBoundary>
  );
}
