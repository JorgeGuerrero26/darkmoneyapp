import { GestureDetector } from "react-native-gesture-handler";
import { Download, Search, SlidersHorizontal, Trash2, X } from "lucide-react-native";
import { DatePickerInput } from "../../components/ui/DatePickerInput";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

const SCREEN_HEIGHT = Dimensions.get("window").height;
import { useRouter } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { startOfMonth, endOfMonth, subMonths, format } from "date-fns";
import { es } from "date-fns/locale";

import { useAuth } from "../../lib/auth-context";
import { useWorkspace } from "../../lib/workspace-context";
import { useWorkspaceSnapshotQuery } from "../../services/queries/workspace-data";
import { usePaginatedMovements } from "../../services/queries/movements";
import { SwipeableMovementRow } from "../../components/domain/SwipeableMovementRow";
import { EmptyState } from "../../components/ui/EmptyState";
import { Skeleton } from "../../components/ui/Skeleton";
import { ScreenHeader } from "../../components/layout/ScreenHeader";
import { MovementForm } from "../../components/forms/MovementForm";
import { ConfirmDialog } from "../../components/ui/ConfirmDialog";
import { FAB } from "../../components/ui/FAB";
import { useDeleteMovementMutation } from "../../services/queries/workspace-data";
import { useToast } from "../../hooks/useToast";
import { isoToDateStr } from "../../lib/date";
import { shareCsvAsFile } from "../../lib/share-csv-file";
import { sortByName } from "../../lib/sort-locale";
import { COLORS, FONT_FAMILY, FONT_SIZE, GLASS, RADIUS, SPACING } from "../../constants/theme";
import { useSwipeTab } from "../../hooks/useSwipeTab";
import type { MovementRecord, MovementType, MovementStatus } from "../../types/domain";

type FilterType = MovementType | "all";
type FilterStatus = MovementStatus | "all";

const TYPE_FILTERS: { label: string; value: FilterType }[] = [
  { label: "Todos", value: "all" },
  { label: "Ingresos", value: "income" },
  { label: "Gastos", value: "expense" },
  { label: "Transferencias", value: "transfer" },
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

export default function MovementsScreen() {
  const swipeGesture = useSwipeTab();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { profile } = useAuth();
  const { activeWorkspaceId, activeWorkspace } = useWorkspace();
  const { data: snapshot } = useWorkspaceSnapshotQuery(profile, activeWorkspaceId);

  // ── Filters ──────────────────────────────────────────────────────────────
  const [activeTypeFilter, setActiveTypeFilter] = useState<FilterType>("all");
  const [activeStatusFilter, setActiveStatusFilter] = useState<FilterStatus>("all");
  const [activeDatePreset, setActiveDatePreset] = useState<string | null>("Este mes");
  const [activeCategoryId, setActiveCategoryId] = useState<number | null>(null);
  const [activeAccountId, setActiveAccountId] = useState<number | null>(null);
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const [customDateFrom, setCustomDateFrom] = useState("");
  const [customDateTo, setCustomDateTo] = useState("");
  const filterOverlayOpacity = useRef(new Animated.Value(0)).current;
  const filterSheetY = useRef(new Animated.Value(SCREEN_HEIGHT)).current;

  useEffect(() => {
    if (filterSheetOpen) {
      Animated.parallel([
        Animated.timing(filterOverlayOpacity, { toValue: 1, duration: 200, useNativeDriver: true }),
        Animated.spring(filterSheetY, { toValue: 0, tension: 65, friction: 11, useNativeDriver: true }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(filterOverlayOpacity, { toValue: 0, duration: 200, useNativeDriver: true }),
        Animated.timing(filterSheetY, { toValue: SCREEN_HEIGHT, duration: 250, useNativeDriver: true }),
      ]).start();
    }
  }, [filterSheetOpen, filterOverlayOpacity, filterSheetY]);

  // ── Delete / undo ─────────────────────────────────────────────────────────
  const { showToast } = useToast();
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

  // ── Multi-select ──────────────────────────────────────────────────────────
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false);

  function toggleSelect(id: number) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function exitSelectMode() {
    setSelectMode(false);
    setSelectedIds(new Set());
  }

  // ── Query ─────────────────────────────────────────────────────────────────
  const selectedPreset = DATE_PRESETS.find((p) => p.label === activeDatePreset);
  const isCustomRange = activeDatePreset === "Rango…";

  const filters = useMemo(() => ({
    ...(activeTypeFilter !== "all" ? { type: activeTypeFilter as MovementType } : {}),
    ...(activeStatusFilter !== "all" ? { status: activeStatusFilter as MovementStatus } : {}),
    ...(isCustomRange && customDateFrom && customDateTo
      ? { dateFrom: customDateFrom, dateTo: customDateTo }
      : selectedPreset
        ? { dateFrom: selectedPreset.from, dateTo: selectedPreset.to }
        : {}),
    ...(activeCategoryId ? { categoryId: activeCategoryId } : {}),
    ...(activeAccountId ? { accountId: activeAccountId } : {}),
    ...(debouncedSearch ? { search: debouncedSearch } : {}),
  }), [activeTypeFilter, activeStatusFilter, selectedPreset, isCustomRange, customDateFrom, customDateTo, activeCategoryId, activeAccountId, debouncedSearch]);

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

  const baseCurrency = activeWorkspace?.baseCurrencyCode ?? profile?.baseCurrencyCode ?? "PEN";

  const extraFiltersCount = [
    activeDatePreset,
    activeCategoryId,
    activeAccountId,
    activeStatusFilter !== "all" ? activeStatusFilter : null,
  ].filter(Boolean).length;

  const hasFilters = activeTypeFilter !== "all" || activeStatusFilter !== "all" || extraFiltersCount > 0 || Boolean(debouncedSearch);

  const accountsSorted = useMemo(
    () => sortByName(snapshot?.accounts.filter((a) => !a.isArchived) ?? []),
    [snapshot?.accounts],
  );
  const categoriesSorted = useMemo(
    () => sortByName(snapshot?.categories.filter((c) => c.isActive) ?? []),
    [snapshot?.categories],
  );

  const onRefresh = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ["movements"] });
  }, [queryClient]);

  function clearAllFilters() {
    setActiveTypeFilter("all");
    setActiveStatusFilter("all");
    setActiveDatePreset(null);
    setActiveCategoryId(null);
    setActiveAccountId(null);
    setCustomDateFrom("");
    setCustomDateTo("");
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
  async function executeBulkDelete() {
    const ids = Array.from(selectedIds);
    for (const id of ids) {
      deleteMutation.mutate(id);
    }
    exitSelectMode();
    setBulkDeleteConfirm(false);
    showToast(`${ids.length} movimientos eliminados`, "success");
  }

  const selectedMovements = useMemo(
    () => allMovements.filter((m) => selectedIds.has(m.id)),
    [allMovements, selectedIds],
  );

  return (
    <GestureDetector gesture={swipeGesture}>
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      {/* Header */}
      <ScreenHeader
        title={selectMode ? `${selectedIds.size} seleccionados` : "Movimientos"}
        rightAction={
          selectMode ? (
            <TouchableOpacity onPress={exitSelectMode} style={styles.filterBtn}>
              <X size={14} color={COLORS.storm} />
              <Text style={styles.filterBtnText}>Cancelar</Text>
            </TouchableOpacity>
          ) : (
            <View style={{ flexDirection: "row", gap: SPACING.xs }}>
              <TouchableOpacity
                style={styles.filterBtn}
                onPress={() => exportCSV(allMovements)}
                accessibilityLabel="Exportar CSV"
              >
                <Download size={14} color={COLORS.storm} />
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.filterBtn, extraFiltersCount > 0 && styles.filterBtnActive]}
                onPress={() => setFilterSheetOpen(true)}
              >
                <SlidersHorizontal size={14} color={extraFiltersCount > 0 ? COLORS.primary : COLORS.storm} />
                <Text style={[styles.filterBtnText, extraFiltersCount > 0 && styles.filterBtnTextActive]}>
                  {extraFiltersCount > 0 ? `Filtros (${extraFiltersCount})` : "Filtros"}
                </Text>
              </TouchableOpacity>
            </View>
          )
        }
      />

      {/* Search bar — hide in select mode */}
      {!selectMode ? (
        <View style={styles.searchWrap}>
          <Search size={15} color={COLORS.storm} />
          <TextInput
            style={styles.searchInput}
            value={searchText}
            onChangeText={setSearchText}
            placeholder="Buscar movimientos…"
            placeholderTextColor={COLORS.storm}
            returnKeyType="search"
          />
          {searchText.length > 0 ? (
            <TouchableOpacity onPress={() => setSearchText("")}>
              <X size={15} color={COLORS.storm} />
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}

      {/* Type filter pills */}
      {!selectMode ? (
        <View style={styles.segmentedWrap}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.segmentedRow}>
            {TYPE_FILTERS.map((opt) => (
              <TouchableOpacity
                key={opt.value}
                style={[styles.pill, activeTypeFilter === opt.value && styles.pillActive]}
                onPress={() => setActiveTypeFilter(opt.value as FilterType)}
              >
                <Text style={[styles.pillText, activeTypeFilter === opt.value && styles.pillTextActive]}>
                  {opt.label}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      ) : null}

      {/* Active filter chips */}
      {!selectMode && (activeDatePreset !== null || activeCategoryId || activeAccountId || activeStatusFilter !== "all") ? (
        <View style={styles.activeFiltersBar}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.activeFiltersPills}>
            {activeStatusFilter !== "all" ? (
              <TouchableOpacity style={styles.activeFilterChip} onPress={() => setActiveStatusFilter("all")}>
                <Text style={styles.activeFilterChipText}>
                  {STATUS_FILTERS.find((f) => f.value === activeStatusFilter)?.label ?? "Estado"} ×
                </Text>
              </TouchableOpacity>
            ) : null}
            {activeDatePreset ? (
              <TouchableOpacity style={styles.activeFilterChip} onPress={() => setActiveDatePreset(null)}>
                <Text style={styles.activeFilterChipText}>
                  {activeDatePreset === "Rango…" && customDateFrom && customDateTo
                    ? `${customDateFrom} – ${customDateTo}`
                    : activeDatePreset}{" "}
                  ×
                </Text>
              </TouchableOpacity>
            ) : null}
            {activeCategoryId ? (
              <TouchableOpacity style={styles.activeFilterChip} onPress={() => setActiveCategoryId(null)}>
                <Text style={styles.activeFilterChipText}>
                  {categoriesSorted.find((c) => c.id === activeCategoryId)?.name ?? "Categoría"} ×
                </Text>
              </TouchableOpacity>
            ) : null}
            {activeAccountId ? (
              <TouchableOpacity style={styles.activeFilterChip} onPress={() => setActiveAccountId(null)}>
                <Text style={styles.activeFilterChipText}>
                  {accountsSorted.find((a) => a.id === activeAccountId)?.name ?? "Cuenta"} ×
                </Text>
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity onPress={clearAllFilters}>
              <Text style={styles.clearAll}>Limpiar</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      ) : null}

      {/* Bulk action bar */}
      {selectMode && selectedIds.size > 0 ? (
        <View style={styles.bulkBar}>
          <TouchableOpacity
            style={styles.bulkBtn}
            onPress={() => {
              setSelectedIds(new Set(allMovements.map((m) => m.id)));
            }}
          >
            <Text style={styles.bulkBtnText}>Sel. todos ({allMovements.length})</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.bulkBtn}
            onPress={() => exportCSV(selectedMovements)}
          >
            <Download size={14} color={COLORS.primary} />
            <Text style={[styles.bulkBtnText, { color: COLORS.primary }]}>CSV</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.bulkBtn, styles.bulkBtnDanger]}
            onPress={() => setBulkDeleteConfirm(true)}
          >
            <Trash2 size={14} color={COLORS.danger} />
            <Text style={[styles.bulkBtnText, { color: COLORS.danger }]}>
              Eliminar ({selectedIds.size})
            </Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {/* Filter bottom sheet */}
      <Modal
        visible={filterSheetOpen}
        transparent
        animationType="none"
        onRequestClose={() => setFilterSheetOpen(false)}
      >
        <Animated.View style={[styles.filterOverlay, { opacity: filterOverlayOpacity }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setFilterSheetOpen(false)} />
          <Animated.View
            style={[styles.filterSheet, { paddingBottom: insets.bottom + SPACING.lg, transform: [{ translateY: filterSheetY }] }]}
            onStartShouldSetResponder={() => true}
          >
            <View style={styles.filterSheetHandle} />
            <Text style={styles.filterSheetTitle}>Filtros</Text>

            <Text style={styles.filterSectionLabel}>Estado</Text>
            <View style={styles.filterPillWrap}>
              {STATUS_FILTERS.map((f) => (
                <TouchableOpacity
                  key={f.value}
                  style={[styles.pill, activeStatusFilter === f.value && styles.pillActive]}
                  onPress={() => setActiveStatusFilter(f.value as FilterStatus)}
                >
                  <Text style={[styles.pillText, activeStatusFilter === f.value && styles.pillTextActive]}>{f.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.filterSectionLabel}>Período</Text>
            <View style={styles.filterPillWrap}>
              <TouchableOpacity
                style={[styles.pill, activeDatePreset === null && styles.pillActive]}
                onPress={() => setActiveDatePreset(null)}
              >
                <Text style={[styles.pillText, activeDatePreset === null && styles.pillTextActive]}>Todo</Text>
              </TouchableOpacity>
              {DATE_PRESETS.map((p) => (
                <TouchableOpacity
                  key={p.label}
                  style={[styles.pill, activeDatePreset === p.label && styles.pillActive]}
                  onPress={() => setActiveDatePreset(p.label)}
                >
                  <Text style={[styles.pillText, activeDatePreset === p.label && styles.pillTextActive]}>{p.label}</Text>
                </TouchableOpacity>
              ))}
              <TouchableOpacity
                style={[styles.pill, activeDatePreset === "Rango…" && styles.pillActive]}
                onPress={() => {
                  setActiveDatePreset("Rango…");
                  if (!customDateFrom || !customDateTo) {
                    const now = new Date();
                    setCustomDateFrom(format(startOfMonth(now), "yyyy-MM-dd"));
                    setCustomDateTo(format(endOfMonth(now), "yyyy-MM-dd"));
                  }
                }}
              >
                <Text style={[styles.pillText, activeDatePreset === "Rango…" && styles.pillTextActive]}>Rango…</Text>
              </TouchableOpacity>
            </View>
            {activeDatePreset === "Rango…" ? (
              <View style={styles.customRangeRow}>
                <DatePickerInput
                  label="Desde"
                  value={customDateFrom}
                  onChange={setCustomDateFrom}
                  hideLabel
                  variant="formRow"
                />
                <DatePickerInput
                  label="Hasta"
                  value={customDateTo}
                  onChange={setCustomDateTo}
                  hideLabel
                  variant="formRow"
                  minimumDate={
                    customDateFrom
                      ? (() => {
                          const [y, m, d] = customDateFrom.split("-").map(Number);
                          return new Date(y, m - 1, d);
                        })()
                      : undefined
                  }
                />
              </View>
            ) : null}

            {categoriesSorted.length > 0 ? (
              <>
                <Text style={styles.filterSectionLabel}>Categoría</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <View style={styles.filterPillWrap}>
                    <TouchableOpacity style={[styles.pill, activeCategoryId === null && styles.pillActive]} onPress={() => setActiveCategoryId(null)}>
                      <Text style={[styles.pillText, activeCategoryId === null && styles.pillTextActive]}>Todas</Text>
                    </TouchableOpacity>
                    {categoriesSorted.map((cat) => (
                      <TouchableOpacity key={cat.id} style={[styles.pill, activeCategoryId === cat.id && styles.pillActive]} onPress={() => setActiveCategoryId(cat.id)}>
                        <Text style={[styles.pillText, activeCategoryId === cat.id && styles.pillTextActive]}>{cat.name}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </ScrollView>
              </>
            ) : null}

            {accountsSorted.length > 0 ? (
              <>
                <Text style={styles.filterSectionLabel}>Cuenta</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <View style={styles.filterPillWrap}>
                    <TouchableOpacity style={[styles.pill, activeAccountId === null && styles.pillActive]} onPress={() => setActiveAccountId(null)}>
                      <Text style={[styles.pillText, activeAccountId === null && styles.pillTextActive]}>Todas</Text>
                    </TouchableOpacity>
                    {accountsSorted.map((acc) => (
                      <TouchableOpacity key={acc.id} style={[styles.pill, activeAccountId === acc.id && styles.pillActive]} onPress={() => setActiveAccountId(acc.id)}>
                        <Text style={[styles.pillText, activeAccountId === acc.id && styles.pillTextActive]}>{acc.name}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </ScrollView>
              </>
            ) : null}

            <TouchableOpacity style={styles.applyBtn} onPress={() => setFilterSheetOpen(false)}>
              <Text style={styles.applyBtnText}>Aplicar</Text>
            </TouchableOpacity>
          </Animated.View>
        </Animated.View>
      </Modal>

      {/* List */}
      <FlatList
        data={allMovements}
        keyExtractor={(item) => String(item.id)}
        renderItem={({ item }) => (
          <SwipeableMovementRow
            movement={item}
            baseCurrencyCode={baseCurrency}
            selected={selectedIds.has(item.id)}
            selectMode={selectMode}
            onPress={() => {
              if (selectMode) {
                toggleSelect(item.id);
              } else {
                router.push(`/movement/${item.id}?from=movements`);
              }
            }}
            onLongPress={() => {
              if (!selectMode) {
                setSelectMode(true);
                toggleSelect(item.id);
              }
            }}
            onDelete={() => startUndoDelete(item)}
          />
        )}
        refreshControl={
          <RefreshControl refreshing={isLoading && !isFetchingNextPage} onRefresh={onRefresh} tintColor={COLORS.primary} />
        }
        onEndReached={() => {
          if (hasNextPage && !isFetchingNextPage) void fetchNextPage();
        }}
        onEndReachedThreshold={0.3}
        ListFooterComponent={
          isFetchingNextPage ? (
            <View style={styles.footer}>
              <ActivityIndicator color={COLORS.primary} />
            </View>
          ) : null
        }
        ListHeaderComponent={
          isLoading ? (
            <View style={styles.skeletonList}>
              {[...Array(8)].map((_, i) => (
                <View key={i} style={styles.skeletonRow}>
                  <Skeleton width={42} height={42} borderRadius={14} />
                  <View style={styles.skeletonRowText}>
                    <Skeleton width="60%" height={14} />
                    <Skeleton width="40%" height={12} style={{ marginTop: 6 }} />
                  </View>
                  <Skeleton width={70} height={16} />
                </View>
              ))}
            </View>
          ) : null
        }
        ListEmptyComponent={
          isLoading ? null : (
            <EmptyState
              variant={hasFilters ? "no-results" : "empty"}
              title={hasFilters ? "Sin resultados" : "Sin movimientos"}
              description={
                hasFilters
                  ? "Prueba cambiando los filtros aplicados."
                  : "Registra tu primer movimiento con el botón +"
              }
              action={!hasFilters ? { label: "Nuevo movimiento", onPress: () => setFormVisible(true) } : undefined}
            />
          )
        }
        contentContainerStyle={allMovements.length === 0 ? styles.emptyContainer : undefined}
      />

      {/* Undo-delete banner */}
      {pendingDeleteIds.size > 0 ? (
        <View style={[styles.undoBanner, { bottom: insets.bottom + 80 }]}>
          <Text style={styles.undoText}>
            {pendingDeleteIds.size === 1 ? "Movimiento eliminado" : `${pendingDeleteIds.size} movimientos eliminados`}
          </Text>
          <TouchableOpacity
            onPress={() => pendingDeleteIds.forEach((id) => undoDelete(id))}
            style={styles.undoBtn}
          >
            <Text style={styles.undoBtnText}>Deshacer</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {!selectMode ? (
        <FAB onPress={() => setFormVisible(true)} bottom={insets.bottom + 16} />
      ) : null}

      <MovementForm
        visible={formVisible}
        onClose={() => setFormVisible(false)}
        onSuccess={() => {
          setFormVisible(false);
          void queryClient.invalidateQueries({ queryKey: ["movements"] });
        }}
      />

      {/* Bulk delete confirm */}
      <ConfirmDialog
        visible={bulkDeleteConfirm}
        title={`Eliminar ${selectedIds.size} movimientos`}
        body="Esta acción no se puede deshacer."
        confirmLabel="Eliminar"
        cancelLabel="Cancelar"
        onCancel={() => setBulkDeleteConfirm(false)}
        onConfirm={executeBulkDelete}
      />
    </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.bg },

  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: SPACING.lg,
    marginTop: SPACING.xs,
    marginBottom: SPACING.sm,
    backgroundColor: GLASS.card,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
    gap: SPACING.sm,
  },
  searchInput: {
    flex: 1,
    fontSize: FONT_SIZE.sm,
    color: COLORS.ink,
    fontFamily: FONT_FAMILY.body,
    paddingVertical: SPACING.md,
  },

  filterBtn: {
    height: 34,
    paddingHorizontal: SPACING.md,
    borderRadius: RADIUS.full,
    backgroundColor: GLASS.card,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 5,
  },
  filterBtnActive: { backgroundColor: COLORS.primary + "18" },
  filterBtnText: { fontSize: FONT_SIZE.xs, color: COLORS.storm, fontFamily: FONT_FAMILY.bodyMedium },
  filterBtnTextActive: { color: COLORS.primary },

  segmentedWrap: { height: 44, justifyContent: "center" },
  segmentedRow: { paddingHorizontal: SPACING.lg, gap: SPACING.xs, alignItems: "center" },
  pill: {
    height: 32,
    paddingHorizontal: SPACING.md,
    borderRadius: RADIUS.full,
    backgroundColor: GLASS.card,
    alignItems: "center",
    justifyContent: "center",
  },
  pillActive: { backgroundColor: COLORS.primary },
  pillText: { fontSize: FONT_SIZE.xs, color: COLORS.storm, fontFamily: FONT_FAMILY.bodyMedium, includeFontPadding: false },
  pillTextActive: { color: "#FFFFFF", fontFamily: FONT_FAMILY.bodySemibold },

  activeFiltersBar: { paddingVertical: SPACING.xs },
  activeFiltersPills: { paddingHorizontal: SPACING.lg, gap: SPACING.xs, alignItems: "center" },
  activeFilterChip: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: 3,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.primary + "18",
  },
  activeFilterChipText: { fontSize: FONT_SIZE.xs, color: COLORS.primary, fontFamily: FONT_FAMILY.bodyMedium },
  clearAll: { fontSize: FONT_SIZE.xs, color: COLORS.storm, fontFamily: FONT_FAMILY.body, paddingHorizontal: SPACING.xs },

  // Bulk bar
  bulkBar: {
    flexDirection: "row",
    gap: SPACING.sm,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
    alignItems: "center",
    borderBottomWidth: 0.5,
    borderBottomColor: "rgba(255,255,255,0.07)",
  },
  bulkBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: SPACING.sm + 2,
    paddingVertical: 5,
    borderRadius: RADIUS.full,
    backgroundColor: GLASS.card,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
  },
  bulkBtnDanger: { borderColor: COLORS.danger + "44" },
  bulkBtnText: { fontSize: FONT_SIZE.xs, color: COLORS.storm, fontFamily: FONT_FAMILY.bodyMedium },

  footer: { padding: SPACING.lg, alignItems: "center" },
  emptyContainer: { flexGrow: 1 },
  skeletonList: { padding: SPACING.md, gap: SPACING.md },
  skeletonRow: { flexDirection: "row", alignItems: "center", gap: SPACING.md },
  skeletonRowText: { flex: 1, gap: 6 },

  filterOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.55)" },
  filterSheet: {
    position: "absolute",
    bottom: 0, left: 0, right: 0,
    backgroundColor: "rgba(8,12,18,0.97)",
    borderTopLeftRadius: RADIUS.xl,
    borderTopRightRadius: RADIUS.xl,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.14)",
    padding: SPACING.lg,
    gap: SPACING.md,
    maxHeight: "80%",
  },
  filterSheetHandle: {
    width: 36, height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.22)",
    alignSelf: "center",
    marginBottom: SPACING.xs,
  },
  filterSheetTitle: {
    fontSize: FONT_SIZE.md,
    fontFamily: FONT_FAMILY.heading,
    color: COLORS.ink,
    textAlign: "center",
  },
  filterSectionLabel: {
    fontSize: FONT_SIZE.xs,
    fontFamily: FONT_FAMILY.bodyMedium,
    color: COLORS.storm,
    letterSpacing: 0.2,
  },
  filterPillWrap: { flexDirection: "row", flexWrap: "wrap", gap: SPACING.sm },
  customRangeRow: { flexDirection: "row", gap: SPACING.sm, marginTop: SPACING.xs },
  applyBtn: {
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.md,
    paddingVertical: SPACING.md,
    alignItems: "center",
    marginTop: SPACING.sm,
  },
  applyBtnText: { color: "#FFF", fontSize: FONT_SIZE.sm, fontFamily: FONT_FAMILY.bodySemibold },

  // Undo
  undoBanner: {
    position: "absolute",
    left: SPACING.lg,
    right: SPACING.lg,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "rgba(14,20,30,0.97)",
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm + 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 12,
    zIndex: 50,
  },
  undoText: {
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.sm,
    color: COLORS.ink,
    flex: 1,
  },
  undoBtn: {
    paddingHorizontal: SPACING.md,
    paddingVertical: 4,
    backgroundColor: COLORS.primary + "22",
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: COLORS.primary + "55",
  },
  undoBtnText: {
    fontFamily: FONT_FAMILY.bodySemibold,
    fontSize: FONT_SIZE.sm,
    color: COLORS.pine,
  },
});
