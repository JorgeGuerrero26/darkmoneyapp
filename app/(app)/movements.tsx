import { ErrorBoundary } from "../../components/ui/ErrorBoundary";
import { Download, SlidersHorizontal, Trash2, X } from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  type SectionListRenderItem,
} from "react-native";
import { useRouter, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { startOfMonth, endOfMonth, subMonths, format } from "date-fns";

import { useAuth } from "../../lib/auth-context";
import { useWorkspace } from "../../lib/workspace-context";
import { useWorkspaceSnapshotQuery } from "../../services/queries/workspace-data";
import { usePaginatedMovements } from "../../services/queries/movements";
import { useMovementAttachmentCountsQuery } from "../../services/queries/attachments";
import { MovementDeleteImpact } from "../../components/domain/MovementDeleteImpact";
import { SwipeableMovementRow } from "../../components/domain/SwipeableMovementRow";
import { BulkActionBar } from "../../components/ui/BulkActionBar";
import { FilterToolbar } from "../../components/ui/FilterToolbar";
import { ActiveFilterBar, type ActiveFilterItem } from "../../components/ui/ActiveFilterBar";
import { HeaderActionGroup } from "../../components/ui/HeaderActionGroup";
import { ResourceContextNote } from "../../components/ui/ResourceContextNote";
import { ResourceModuleTemplate } from "../../components/ui/ResourceModuleTemplate";
import { ResourceSectionList, type ResourceSection } from "../../components/ui/ResourceSectionList";
import { SkeletonList, SkeletonMovementRow } from "../../components/ui/Skeleton";
import { ScreenHeader } from "../../components/layout/ScreenHeader";
import { MovementForm } from "../../components/forms/MovementForm";
import { ConfirmDialog } from "../../components/ui/ConfirmDialog";
import { FAB } from "../../components/ui/FAB";
import { useDeleteMovementMutation } from "../../services/queries/workspace-data";
import { useToast } from "../../hooks/useToast";
import { isoToDateStr } from "../../lib/date";
import { buildDateRangeNotice } from "../../lib/date-range-notice";
import { shareCsvAsFile } from "../../lib/share-csv-file";
import { sortByName } from "../../lib/sort-locale";
import { MovementFilterSheet } from "../../features/movements/components/MovementFilterSheet";
import { MovementSummaryBar } from "../../features/movements/components/MovementSummaryBar";
import type { MovementRecord, MovementType, MovementStatus } from "../../types/domain";

type FilterType = MovementType | "all";
type FilterStatus = MovementStatus | "all";
type MovementListSection = ResourceSection<MovementRecord, "movements">;

const TYPE_FILTERS: { label: string; value: FilterType }[] = [
  { label: "Todos", value: "all" },
  { label: "Ingresos", value: "income" },
  { label: "Gastos", value: "expense" },
  { label: "Transferencias", value: "transfer" },
  { label: "Obligaciones", value: "obligation_payment" },
  { label: "Suscripciones", value: "subscription_payment" },
];

const STATUS_FILTERS: { label: string; value: FilterStatus }[] = [
  { label: "Todos", value: "all" },
  { label: "Confirmado", value: "posted" },
  { label: "Pendiente", value: "pending" },
  { label: "Planificado", value: "planned" },
];

function buildDatePresets() {
  const now = new Date();
  return [
    { label: "Este mes", from: format(startOfMonth(now), "yyyy-MM-dd"), to: format(endOfMonth(now), "yyyy-MM-dd") },
    { label: "Mes anterior", from: format(startOfMonth(subMonths(now, 1)), "yyyy-MM-dd"), to: format(endOfMonth(subMonths(now, 1)), "yyyy-MM-dd") },
    { label: "Últimos 3 meses", from: format(startOfMonth(subMonths(now, 2)), "yyyy-MM-dd"), to: format(endOfMonth(now), "yyyy-MM-dd") },
    { label: "Últimos 6 meses", from: format(startOfMonth(subMonths(now, 5)), "yyyy-MM-dd"), to: format(endOfMonth(now), "yyyy-MM-dd") },
    { label: "Este año", from: `${now.getFullYear()}-01-01`, to: format(endOfMonth(now), "yyyy-MM-dd") },
  ];
}
const DATE_PRESETS = buildDatePresets();

// ── CSV helper ──────────────────────────────────────────────────────────────
function buildCSV(movements: MovementRecord[]): string {
  const BOM = "\uFEFF";
  const headers = [
    "Fecha", "Tipo", "Estado", "Descripción",
    "Cuenta origen", "Monto origen",
    "Cuenta destino", "Monto destino",
    "Categoría", "Contraparte", "Notas",
  ];
  const rows = movements.map((m) => [
    isoToDateStr(m.occurredAt),
    m.movementType,
    m.status,
    m.description ?? "",
    m.sourceAccountName ?? String(m.sourceAccountId ?? ""),
    m.sourceAmount != null ? String(m.sourceAmount) : "",
    m.destinationAccountName ?? String(m.destinationAccountId ?? ""),
    m.destinationAmount != null ? String(m.destinationAmount) : "",
    m.category ?? "",
    m.counterparty ?? "",
    m.notes ?? "",
  ].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","));
  return BOM + [headers.join(","), ...rows].join("\n");
}

function MovementsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{
    quickFilter?: string | string[];
    quickScope?: string | string[];
    quickToken?: string | string[];
    quickStatus?: string | string[];
    quickCategoryId?: string | string[];
    quickDateFrom?: string | string[];
    quickDateTo?: string | string[];
    quickType?: string | string[];
    quickSearch?: string | string[];
    quickMovementIds?: string | string[];
    quickLabel?: string | string[];
  }>();
  const queryClient = useQueryClient();
  const { profile } = useAuth();
  const { activeWorkspaceId, activeWorkspace } = useWorkspace();
  const { data: snapshot, dataUpdatedAt } = useWorkspaceSnapshotQuery(profile, activeWorkspaceId);

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

  // ── Filters ──────────────────────────────────────────────────────────────
  const [activeTypeFilters, setActiveTypeFilters] = useState<MovementType[]>([]);
  const [activeStatusFilter, setActiveStatusFilter] = useState<FilterStatus>("all");
  const [activeDatePreset, setActiveDatePreset] = useState<string | null>("Este mes");
  const [activeCategoryId, setActiveCategoryId] = useState<number | null>(null);
  const [activeCategoryScope, setActiveCategoryScope] = useState<"uncategorized" | null>(null);
  const [activeAccountId, setActiveAccountId] = useState<number | null>(null);
  const [activeMovementIds, setActiveMovementIds] = useState<number[] | null>(null);
  const [activeQuickLabel, setActiveQuickLabel] = useState<string | null>(null);
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const [customDateFrom, setCustomDateFrom] = useState("");
  const [customDateTo, setCustomDateTo] = useState("");

  // ── Delete / undo ─────────────────────────────────────────────────────────
  const { showToast, showRichToast } = useToast();
  const deleteMutation = useDeleteMovementMutation(activeWorkspaceId);
  const [pendingDeleteIds, setPendingDeleteIds] = useState<Set<number>>(new Set());
  const deleteTimers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  function startUndoDelete(item: MovementRecord) {
    setPendingDeleteIds((prev) => new Set(prev).add(item.id));
    const timer = setTimeout(() => {
      deleteMutation.mutate(item.id, {
        onError: (e) => showToast(e.message, "error"),
      });
      setPendingDeleteIds((prev) => {
        const next = new Set(prev);
        next.delete(item.id);
        return next;
      });
      deleteTimers.current.delete(item.id);
    }, 5000);
    deleteTimers.current.set(item.id, timer);
  }

  function undoDelete(id: number) {
    const timer = deleteTimers.current.get(id);
    if (timer) clearTimeout(timer);
    deleteTimers.current.delete(id);
    setPendingDeleteIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }

  useEffect(() => () => { deleteTimers.current.forEach(clearTimeout); }, []);

  // ── FAB / formulario (igual que en el dashboard) ───────────────────────────
  const [formVisible, setFormVisible] = useState(false);

  // ── Search ────────────────────────────────────────────────────────────────
  const [searchText, setSearchText] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => setDebouncedSearch(searchText.trim()), 400);
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current); };
  }, [searchText]);

  // ── Delete confirm with impact ────────────────────────────────────────────
  const [deleteTarget, setDeleteTarget] = useState<MovementRecord | null>(null);

  const confirmDelete = useCallback((item: MovementRecord) => { setDeleteTarget(item); }, []);
  function cancelDelete() { setDeleteTarget(null); }
  function executeDelete() {
    if (!deleteTarget) return;
    const item = deleteTarget;
    setDeleteTarget(null);
    startUndoDelete(item);
    showRichToast({
      type: 'delete',
      title: 'Movimiento eliminado',
      duration: 5000,
      onUndo: () => undoDelete(item.id),
    });
  }

  // ── Multi-select ──────────────────────────────────────────────────────────
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false);

  const toggleSelect = useCallback((id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  function exitSelectMode() {
    setSelectMode(false);
    setSelectedIds(new Set());
  }

  // Auto-exit select mode when all items are deselected
  useEffect(() => {
    if (selectMode && selectedIds.size === 0) {
      setSelectMode(false);
      setSelectedIds(new Set());
    }
  }, [selectMode, selectedIds.size]);

  // ── Query ─────────────────────────────────────────────────────────────────
  const selectedPreset = DATE_PRESETS.find((p) => p.label === activeDatePreset);
  const isCustomRange = activeDatePreset === "Rango…";

  const filters = useMemo(() => ({
    ...(activeTypeFilters.length > 0 ? { types: activeTypeFilters } : {}),
    ...(activeStatusFilter !== "all" ? { status: activeStatusFilter as MovementStatus } : {}),
    ...(isCustomRange && customDateFrom && customDateTo
      ? { dateFrom: customDateFrom, dateTo: customDateTo }
      : selectedPreset
        ? { dateFrom: selectedPreset.from, dateTo: selectedPreset.to }
        : {}),
    ...(activeCategoryScope === "uncategorized" ? { uncategorized: true } : {}),
    ...(activeCategoryId ? { categoryId: activeCategoryId } : {}),
    ...(activeAccountId ? { accountId: activeAccountId } : {}),
    ...(activeMovementIds?.length ? { movementIds: activeMovementIds } : {}),
    ...(debouncedSearch ? { search: debouncedSearch } : {}),
  }), [activeTypeFilters, activeStatusFilter, selectedPreset, isCustomRange, customDateFrom, customDateTo, activeCategoryId, activeCategoryScope, activeAccountId, activeMovementIds, debouncedSearch]);

  const {
    data,
    isLoading,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
  } = usePaginatedMovements(activeWorkspaceId, filters, profile?.id);

  const allMovements = useMemo(
    () => (data?.pages.flatMap((p) => p.data) ?? []).filter((m) => !pendingDeleteIds.has(m.id)),
    [data, pendingDeleteIds],
  );

  const allMovementIds = useMemo(() => allMovements.map((m) => m.id), [allMovements]);
  const { data: movementAttachmentCounts = {} } = useMovementAttachmentCountsQuery(activeWorkspaceId, allMovementIds);

  const baseCurrency = activeWorkspace?.baseCurrencyCode ?? profile?.baseCurrencyCode ?? "PEN";

  const filterSummary = useMemo(() => {
    let incomeTotal = 0;
    let expenseTotal = 0;
    let incomeCount = 0;
    let expenseCount = 0;
    for (const m of allMovements) {
      if (m.movementType === "income") {
        incomeTotal += m.destinationAmountInBaseCurrency ?? m.destinationAmount ?? 0;
        incomeCount++;
      } else if (
        m.movementType === "expense" ||
        m.movementType === "obligation_payment" ||
        m.movementType === "subscription_payment"
      ) {
        expenseTotal += m.sourceAmountInBaseCurrency ?? m.sourceAmount ?? 0;
        expenseCount++;
      }
    }
    return { incomeTotal, expenseTotal, incomeCount, expenseCount, net: incomeTotal - expenseTotal };
  }, [allMovements]);

  const extraFiltersCount = [
    activeDatePreset,
    activeCategoryId,
    activeCategoryScope,
    activeAccountId,
    activeMovementIds?.length ? activeMovementIds.length : null,
    activeStatusFilter !== "all" ? activeStatusFilter : null,
  ].filter(Boolean).length;

  const hasFilters = activeTypeFilters.length > 0 || activeStatusFilter !== "all" || extraFiltersCount > 0 || Boolean(debouncedSearch);
  const activeDateRangeNotice = useMemo(() => {
    if (activeQuickLabel) {
      return `Mostrando selección del dashboard: ${activeQuickLabel}.`;
    }
    const from = isCustomRange ? customDateFrom.trim() || null : selectedPreset?.from ?? null;
    const to = isCustomRange ? customDateTo.trim() || null : selectedPreset?.to ?? null;
    return buildDateRangeNotice({
      subject: "movimientos",
      from,
      to,
      allMessage: "Mostrando todos los movimientos disponibles.",
    });
  }, [activeQuickLabel, customDateFrom, customDateTo, isCustomRange, selectedPreset]);

  const accountsSorted = useMemo(
    () => sortByName(snapshot?.accounts.filter((a) => !a.isArchived) ?? []),
    [snapshot?.accounts],
  );
  const categoriesSorted = useMemo(
    () => sortByName(snapshot?.categories.filter((c) => c.isActive) ?? []),
    [snapshot?.categories],
  );

  const refreshTriggeredRef = useRef(false);
  const preserveScopedFiltersOnNextBlurRef = useRef(false);
  const lastQuickFilterKeyRef = useRef<string | null>(null);
  const scopedQuickFiltersRef = useRef<{
    categoryScope: "uncategorized" | null;
    categoryId: number | null;
    status: FilterStatus | null;
    type: FilterType | null;
    dateRange: boolean;
    search: boolean;
    movementIds: boolean;
    quickLabel: boolean;
  }>({
    categoryScope: null,
    categoryId: null,
    status: null,
    type: null,
    dateRange: false,
    search: false,
    movementIds: false,
    quickLabel: false,
  });

  const clearScopedQuickFilters = useCallback(() => {
    if (scopedQuickFiltersRef.current.categoryScope) {
      setActiveCategoryScope(null);
    }
    if (scopedQuickFiltersRef.current.categoryId) {
      setActiveCategoryId(null);
    }
    if (scopedQuickFiltersRef.current.status) {
      setActiveStatusFilter("all");
    }
    if (scopedQuickFiltersRef.current.type) {
      setActiveTypeFilters([]);
    }
    if (scopedQuickFiltersRef.current.dateRange) {
      setActiveDatePreset("Este mes");
      setCustomDateFrom("");
      setCustomDateTo("");
    }
    if (scopedQuickFiltersRef.current.search) {
      setSearchText("");
      setDebouncedSearch("");
    }
    if (scopedQuickFiltersRef.current.movementIds) {
      setActiveMovementIds(null);
    }
    if (scopedQuickFiltersRef.current.quickLabel) {
      setActiveQuickLabel(null);
    }
    scopedQuickFiltersRef.current = { categoryScope: null, categoryId: null, status: null, type: null, dateRange: false, search: false, movementIds: false, quickLabel: false };
  }, []);
  const onRefresh = useCallback(() => {
    refreshTriggeredRef.current = true;
    void queryClient.invalidateQueries({ queryKey: ["movements"] });
  }, [queryClient]);

  useFocusEffect(
    useCallback(() => {
      const quickFilter = Array.isArray(params.quickFilter) ? params.quickFilter[0] : params.quickFilter;
      const quickScope = Array.isArray(params.quickScope) ? params.quickScope[0] : params.quickScope;
      const quickToken = Array.isArray(params.quickToken) ? params.quickToken[0] : params.quickToken;
      const quickStatus = Array.isArray(params.quickStatus) ? params.quickStatus[0] : params.quickStatus;
      const quickCategoryId = Array.isArray(params.quickCategoryId) ? params.quickCategoryId[0] : params.quickCategoryId;
      const quickDateFrom = Array.isArray(params.quickDateFrom) ? params.quickDateFrom[0] : params.quickDateFrom;
      const quickDateTo = Array.isArray(params.quickDateTo) ? params.quickDateTo[0] : params.quickDateTo;
      const quickType = Array.isArray(params.quickType) ? params.quickType[0] : params.quickType;
      const quickSearch = Array.isArray(params.quickSearch) ? params.quickSearch[0] : params.quickSearch;
      const quickMovementIds = Array.isArray(params.quickMovementIds) ? params.quickMovementIds[0] : params.quickMovementIds;
      const quickLabel = Array.isArray(params.quickLabel) ? params.quickLabel[0] : params.quickLabel;
      const parsedQuickCategoryId = quickCategoryId ? Number(quickCategoryId) : null;
      const parsedQuickMovementIds = (quickMovementIds ?? "")
        .split(",")
        .map((value) => Number(value))
        .filter((value) => Number.isFinite(value) && value > 0);
      const scopedType =
        quickType === "income" ||
        quickType === "expense" ||
        quickType === "transfer" ||
        quickType === "obligation_payment" ||
        quickType === "subscription_payment" ||
        quickType === "refund" ||
        quickType === "adjustment" ||
        quickType === "obligation_opening"
          ? (quickType as FilterType)
          : null;
      const quickKey = [
        quickFilter ?? "",
        quickScope ?? "",
        quickStatus ?? "",
        quickCategoryId ?? "",
        quickDateFrom ?? "",
        quickDateTo ?? "",
        quickType ?? "",
        quickSearch ?? "",
        quickMovementIds ?? "",
        quickLabel ?? "",
        quickToken ?? "",
      ].join("|");

      if (quickScope && quickKey !== lastQuickFilterKeyRef.current) {
        lastQuickFilterKeyRef.current = quickKey;
        scopedQuickFiltersRef.current = {
          categoryScope: quickFilter === "uncategorized" ? "uncategorized" : null,
          categoryId: parsedQuickCategoryId && Number.isFinite(parsedQuickCategoryId) ? parsedQuickCategoryId : null,
          status:
            quickStatus === "pending" || quickStatus === "planned" || quickStatus === "posted"
              ? (quickStatus as FilterStatus)
              : null,
          type: scopedType,
          dateRange: Boolean((quickDateFrom && quickDateTo) || quickSearch || parsedQuickMovementIds.length > 0),
          search: Boolean(quickSearch),
          movementIds: parsedQuickMovementIds.length > 0,
          quickLabel: Boolean(quickLabel),
        };

        setActiveAccountId(null);
        if (!quickFilter && !(parsedQuickCategoryId && Number.isFinite(parsedQuickCategoryId))) {
          setActiveCategoryScope(null);
          setActiveCategoryId(null);
        }
        if (!(quickStatus === "pending" || quickStatus === "planned" || quickStatus === "posted")) {
          setActiveStatusFilter("all");
        }
        if (!scopedType) {
          setActiveTypeFilters([]);
        }
        if (!quickSearch) {
          setSearchText("");
          setDebouncedSearch("");
        }
        if (parsedQuickMovementIds.length === 0) {
          setActiveMovementIds(null);
        }
        setActiveQuickLabel(quickLabel?.trim() || null);

        if (quickFilter === "uncategorized") {
          setActiveCategoryId(null);
          setActiveCategoryScope("uncategorized");
        } else if (parsedQuickCategoryId && Number.isFinite(parsedQuickCategoryId)) {
          setActiveCategoryScope(null);
          setActiveCategoryId(parsedQuickCategoryId);
        }
        if (quickStatus === "pending" || quickStatus === "planned" || quickStatus === "posted") {
          setActiveStatusFilter(quickStatus as FilterStatus);
        }
        if (scopedType) {
          setActiveTypeFilters([scopedType as MovementType]);
        }
        if (quickDateFrom && quickDateTo) {
          setActiveDatePreset("Rango…");
          setCustomDateFrom(quickDateFrom);
          setCustomDateTo(quickDateTo);
        } else if (quickSearch || parsedQuickMovementIds.length > 0) {
          setActiveDatePreset(null);
          setCustomDateFrom("");
          setCustomDateTo("");
        }
        if (quickSearch) {
          setSearchText(quickSearch);
          setDebouncedSearch(quickSearch.trim());
        }
        if (parsedQuickMovementIds.length > 0) {
          setActiveMovementIds(parsedQuickMovementIds);
        }
      }

      return () => {
        if (preserveScopedFiltersOnNextBlurRef.current) {
          preserveScopedFiltersOnNextBlurRef.current = false;
          return;
        }
        clearScopedQuickFilters();
      };
    }, [
      clearScopedQuickFilters,
      params.quickCategoryId,
      params.quickDateFrom,
      params.quickDateTo,
      params.quickFilter,
      params.quickScope,
      params.quickSearch,
      params.quickStatus,
      params.quickToken,
      params.quickType,
      params.quickMovementIds,
      params.quickLabel,
      queryClient,
    ]),
  );

  useEffect(() => {
    if (!isLoading && refreshTriggeredRef.current) {
      refreshTriggeredRef.current = false;
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  }, [isLoading]);

  function clearAllFilters() {
    setActiveTypeFilters([]);
    setActiveStatusFilter("all");
    setActiveDatePreset(null);
    setActiveCategoryId(null);
    setActiveCategoryScope(null);
    setActiveAccountId(null);
    setActiveMovementIds(null);
    setActiveQuickLabel(null);
    setSearchText("");
    setDebouncedSearch("");
    setCustomDateFrom("");
    setCustomDateTo("");
    scopedQuickFiltersRef.current = { categoryScope: null, categoryId: null, status: null, type: null, dateRange: false, search: false, movementIds: false, quickLabel: false };
  }

  // ── CSV Export ────────────────────────────────────────────────────────────
  async function exportCSV(movements: MovementRecord[]) {
    const csv = buildCSV(movements);
    const fileName = `movimientos_${format(new Date(), "yyyyMMdd")}.csv`;
    try {
      await shareCsvAsFile(csv, fileName);
    } catch {
      showToast("No se pudo exportar", "error");
    }
  }

  // Bulk delete selected
  function executeBulkDelete() {
    const toDelete = selectedMovements.slice();
    exitSelectMode();
    setBulkDeleteConfirm(false);
    for (const movement of toDelete) {
      startUndoDelete(movement);
    }
    const ids = toDelete.map((m) => m.id);
    showRichToast({
      type: 'delete',
      title: `${toDelete.length} movimiento${toDelete.length === 1 ? '' : 's'} eliminado${toDelete.length === 1 ? '' : 's'}`,
      duration: 5000,
      onUndo: () => ids.forEach((id) => undoDelete(id)),
    });
  }

  const selectedMovements = useMemo(
    () => allMovements.filter((m) => selectedIds.has(m.id)),
    [allMovements, selectedIds],
  );

  const movementSections = useMemo<MovementListSection[]>(
    () => [{
      key: "movements",
      label: "Movimientos",
      data: allMovements,
      headerVariant: "hidden",
    }],
    [allMovements],
  );

  const activeFilterItems = useMemo<ActiveFilterItem[]>(() => {
    const items: ActiveFilterItem[] = [];

    if (activeQuickLabel) {
      items.push({
        key: "quick-label",
        label: activeQuickLabel,
        onRemove: () => {
          setActiveQuickLabel(null);
          setActiveMovementIds(null);
        },
      });
    } else if (activeMovementIds?.length) {
      items.push({
        key: "dashboard-selection",
        label: `Selección dashboard (${activeMovementIds.length})`,
        onRemove: () => setActiveMovementIds(null),
      });
    }

    for (const typeFilter of activeTypeFilters) {
      items.push({
        key: `type-${typeFilter}`,
        label: TYPE_FILTERS.find((filter) => filter.value === typeFilter)?.label ?? "Tipo",
        onRemove: () => setActiveTypeFilters((current) => current.filter((value) => value !== typeFilter)),
      });
    }

    if (activeStatusFilter !== "all") {
      items.push({
        key: "status",
        label: STATUS_FILTERS.find((filter) => filter.value === activeStatusFilter)?.label ?? "Estado",
        onRemove: () => setActiveStatusFilter("all"),
      });
    }

    if (activeDatePreset) {
      items.push({
        key: "date",
        label: activeDatePreset === "Rango…" && customDateFrom && customDateTo
          ? `${customDateFrom} - ${customDateTo}`
          : activeDatePreset,
        onRemove: () => setActiveDatePreset(null),
      });
    }

    if (activeCategoryScope === "uncategorized") {
      items.push({
        key: "uncategorized",
        label: "Sin categoría",
        onRemove: () => setActiveCategoryScope(null),
      });
    }

    if (activeCategoryId) {
      items.push({
        key: "category",
        label: categoriesSorted.find((category) => category.id === activeCategoryId)?.name ?? "Categoría",
        onRemove: () => setActiveCategoryId(null),
      });
    }

    if (activeAccountId) {
      items.push({
        key: "account",
        label: accountsSorted.find((account) => account.id === activeAccountId)?.name ?? "Cuenta",
        onRemove: () => setActiveAccountId(null),
      });
    }

    return items;
  }, [
    accountsSorted,
    activeAccountId,
    activeCategoryId,
    activeCategoryScope,
    activeDatePreset,
    activeMovementIds,
    activeQuickLabel,
    activeStatusFilter,
    activeTypeFilters,
    categoriesSorted,
    customDateFrom,
    customDateTo,
  ]);

  const renderItem: SectionListRenderItem<MovementRecord, MovementListSection> = useCallback(({ item }) => (
    <SwipeableMovementRow
      movement={item}
      baseCurrencyCode={baseCurrency}
      attachmentCount={movementAttachmentCounts[item.id] ?? 0}
      selected={selectedIds.has(item.id)}
      selectMode={selectMode}
      onPress={() => {
        if (selectMode) {
          toggleSelect(item.id);
        } else {
          preserveScopedFiltersOnNextBlurRef.current = true;
          router.push(`/movement/${item.id}?from=movements`);
        }
      }}
      onLongPress={() => {
        if (!selectMode) {
          setSelectMode(true);
          toggleSelect(item.id);
        }
      }}
      onDelete={() => confirmDelete(item)}
    />
  ), [baseCurrency, movementAttachmentCounts, selectedIds, selectMode, toggleSelect, confirmDelete, router]);

  return (
    <ResourceModuleTemplate
      topInset={insets.top}
      header={
        <ScreenHeader
            title={selectMode ? `${selectedIds.size} seleccionados` : "Movimientos"}
            subtitle={lastUpdateLabel || undefined}
            rightAction={
              selectMode ? (
                <HeaderActionGroup
                  actions={[{
                    key: "cancel",
                    icon: X,
                    label: "Cancelar",
                    onPress: exitSelectMode,
                    accessibilityLabel: "Cancelar seleccion",
                  }]}
                />
              ) : (
                <HeaderActionGroup
                  actions={[
                    {
                      key: "export",
                      icon: Download,
                      onPress: () => exportCSV(allMovements),
                      accessibilityLabel: "Exportar CSV",
                    },
                    {
                      key: "filters",
                      icon: SlidersHorizontal,
                      label: extraFiltersCount > 0 ? `Filtros (${extraFiltersCount})` : "Filtros",
                      active: extraFiltersCount > 0,
                      onPress: () => setFilterSheetOpen(true),
                      accessibilityLabel: "Abrir filtros avanzados",
                    },
                  ]}
                />
              )
            }
          />
        }
        toolbar={
          !selectMode ? (
            <FilterToolbar
              options={TYPE_FILTERS}
              selectedValues={activeTypeFilters}
              onSelectedValuesChange={(values) => {
                setActiveTypeFilters(values.filter((value): value is MovementType => value !== "all"));
              }}
              allValue="all"
              searchValue={searchText}
              onSearchChange={setSearchText}
              searchPlaceholder="Buscar movimientos..."
            />
          ) : null
        }
        activeFilters={
          !selectMode ? (
            <ActiveFilterBar items={activeFilterItems} onClear={clearAllFilters} />
          ) : null
        }
        context={
          !selectMode ? (
            <ResourceContextNote>{activeDateRangeNotice}</ResourceContextNote>
          ) : null
        }
        summary={
          !selectMode && allMovements.length > 0 ? (
            <MovementSummaryBar
              summary={filterSummary}
              baseCurrency={baseCurrency}
              partial={hasNextPage}
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
                  label: `Sel. todos (${allMovements.length})`,
                  onPress: () => setSelectedIds(new Set(allMovements.map((m) => m.id))),
                },
                {
                  key: "csv",
                  label: "CSV",
                  icon: Download,
                  tone: "primary",
                  onPress: () => exportCSV(selectedMovements),
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
          <ResourceSectionList
            sections={movementSections}
            keyExtractor={(item) => String(item.id)}
            renderItem={renderItem}
            refreshing={isLoading && !isFetchingNextPage}
            onRefresh={onRefresh}
            onEndReached={() => {
              if (hasNextPage && !isFetchingNextPage) void fetchNextPage();
            }}
            loading={{
              isLoading,
              fetchingMore: isFetchingNextPage,
              endReached: !hasNextPage,
              skeleton: (
                <SkeletonList>
                  {[...Array(6)].map((_, i) => <SkeletonMovementRow key={i} />)}
                </SkeletonList>
              ),
            }}
            empty={{
              variant: hasFilters ? "no-results" : "empty",
              title: hasFilters ? "Sin resultados" : "Sin movimientos",
              description: hasFilters
                ? "Prueba cambiando los filtros aplicados."
                : "Registra tu primer movimiento con el botón +",
              action: !hasFilters ? { label: "Nuevo movimiento", onPress: () => setFormVisible(true) } : undefined,
            }}
          />
        }
        fab={
          !selectMode ? (
            <FAB onPress={() => setFormVisible(true)} bottom={insets.bottom + 16} />
          ) : null
        }
        overlays={
          <>
            <MovementFilterSheet
              visible={filterSheetOpen}
              onClose={() => setFilterSheetOpen(false)}
              statusOptions={STATUS_FILTERS}
              statusFilter={activeStatusFilter}
              onStatusFilterChange={setActiveStatusFilter}
              datePresets={DATE_PRESETS}
              activeDatePreset={activeDatePreset}
              onDatePresetChange={setActiveDatePreset}
              customDateFrom={customDateFrom}
              customDateTo={customDateTo}
              onCustomDateFromChange={setCustomDateFrom}
              onCustomDateToChange={setCustomDateTo}
              categories={categoriesSorted}
              activeCategoryId={activeCategoryId}
              activeCategoryScope={activeCategoryScope}
              onCategoryIdChange={setActiveCategoryId}
              onCategoryScopeChange={setActiveCategoryScope}
              accounts={accountsSorted}
              activeAccountId={activeAccountId}
              onAccountIdChange={setActiveAccountId}
            />

            <MovementForm
              visible={formVisible}
              onClose={() => setFormVisible(false)}
            />

            <ConfirmDialog
              visible={bulkDeleteConfirm}
              title={`Eliminar ${selectedIds.size} movimientos`}
              body="Esta acción no se puede deshacer."
              confirmLabel="Eliminar"
              cancelLabel="Cancelar"
              onCancel={() => setBulkDeleteConfirm(false)}
              onConfirm={executeBulkDelete}
            />

            <ConfirmDialog
              visible={deleteTarget !== null}
              title="¿Eliminar movimiento?"
              body="Se eliminará permanentemente. Tienes 5 segundos para deshacer."
              confirmLabel="Eliminar"
              cancelLabel="Cancelar"
              onCancel={cancelDelete}
              onConfirm={executeDelete}
            >
              {deleteTarget ? (
                <MovementDeleteImpact movement={deleteTarget} snapshot={snapshot} />
              ) : null}
            </ConfirmDialog>
          </>
        }
      />
  );
}


export default function MovementsScreenRoot() {
  return (
    <ErrorBoundary>
      <MovementsScreen />
    </ErrorBoundary>
  );
}
