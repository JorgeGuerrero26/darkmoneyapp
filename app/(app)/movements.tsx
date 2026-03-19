import { Search, SlidersHorizontal, X } from "lucide-react-native";
import { FAB } from "../../components/ui/FAB";
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

import { useAuth } from "../../lib/auth-context";
import { useWorkspace } from "../../lib/workspace-context";
import { useWorkspaceSnapshotQuery } from "../../services/queries/workspace-data";
import { usePaginatedMovements } from "../../services/queries/movements";
import { MovementRow } from "../../components/domain/MovementRow";
import { EmptyState } from "../../components/ui/EmptyState";
import { Skeleton } from "../../components/ui/Skeleton";
import { ScreenHeader } from "../../components/layout/ScreenHeader";
import { MovementForm } from "../../components/forms/MovementForm";
import { COLORS, FONT_FAMILY, FONT_SIZE, GLASS, RADIUS, SPACING } from "../../constants/theme";
import type { MovementType, MovementStatus } from "../../types/domain";

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

const now = new Date();
const DATE_PRESETS = [
  { label: "Este mes", from: format(startOfMonth(now), "yyyy-MM-dd"), to: format(endOfMonth(now), "yyyy-MM-dd") },
  { label: "Mes anterior", from: format(startOfMonth(subMonths(now, 1)), "yyyy-MM-dd"), to: format(endOfMonth(subMonths(now, 1)), "yyyy-MM-dd") },
  { label: "Últimos 3 meses", from: format(startOfMonth(subMonths(now, 2)), "yyyy-MM-dd"), to: format(endOfMonth(now), "yyyy-MM-dd") },
  { label: "Últimos 6 meses", from: format(startOfMonth(subMonths(now, 5)), "yyyy-MM-dd"), to: format(endOfMonth(now), "yyyy-MM-dd") },
];

export default function MovementsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { profile } = useAuth();
  const { activeWorkspaceId, activeWorkspace } = useWorkspace();
  const { data: snapshot } = useWorkspaceSnapshotQuery(profile, activeWorkspaceId);

  const [activeTypeFilter, setActiveTypeFilter] = useState<FilterType>("all");
  const [activeStatusFilter, setActiveStatusFilter] = useState<FilterStatus>("all");
  const [activeDatePreset, setActiveDatePreset] = useState<string | null>(null);
  const [activeCategoryId, setActiveCategoryId] = useState<number | null>(null);
  const [activeAccountId, setActiveAccountId] = useState<number | null>(null);
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
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

  const [formVisible, setFormVisible] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => setDebouncedSearch(searchText.trim()), 400);
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current); };
  }, [searchText]);

  const selectedPreset = DATE_PRESETS.find((p) => p.label === activeDatePreset);

  const filters = useMemo(() => ({
    ...(activeTypeFilter !== "all" ? { type: activeTypeFilter as MovementType } : {}),
    ...(activeStatusFilter !== "all" ? { status: activeStatusFilter as MovementStatus } : {}),
    ...(selectedPreset ? { dateFrom: selectedPreset.from, dateTo: selectedPreset.to } : {}),
    ...(activeCategoryId ? { categoryId: activeCategoryId } : {}),
    ...(activeAccountId ? { accountId: activeAccountId } : {}),
    ...(debouncedSearch ? { search: debouncedSearch } : {}),
  }), [activeTypeFilter, activeStatusFilter, selectedPreset, activeCategoryId, activeAccountId, debouncedSearch]);

  const {
    data,
    isLoading,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
  } = usePaginatedMovements(activeWorkspaceId, filters);

  const allMovements = useMemo(
    () => data?.pages.flatMap((p) => p.data) ?? [],
    [data],
  );

  const baseCurrency = activeWorkspace?.baseCurrencyCode ?? profile?.baseCurrencyCode ?? "PEN";

  // Extra filters: everything except type (which lives in the main pill row)
  const extraFiltersCount = [
    activeDatePreset,
    activeCategoryId,
    activeAccountId,
    activeStatusFilter !== "all" ? activeStatusFilter : null,
  ].filter(Boolean).length;

  const hasFilters = activeTypeFilter !== "all" || activeStatusFilter !== "all" || extraFiltersCount > 0 || Boolean(debouncedSearch);

  const accounts = snapshot?.accounts.filter((a) => !a.isArchived) ?? [];
  const categories = snapshot?.categories.filter((c) => c.isActive) ?? [];

  const onRefresh = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ["movements"] });
  }, [queryClient]);

  function clearAllFilters() {
    setActiveTypeFilter("all");
    setActiveStatusFilter("all");
    setActiveDatePreset(null);
    setActiveCategoryId(null);
    setActiveAccountId(null);
  }

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <ScreenHeader
        title="Movimientos"
        rightAction={
          <TouchableOpacity
            style={[styles.filterBtn, extraFiltersCount > 0 && styles.filterBtnActive]}
            onPress={() => setFilterSheetOpen(true)}
            accessibilityLabel="Filtros"
          >
            <SlidersHorizontal
              size={14}
              color={extraFiltersCount > 0 ? COLORS.primary : COLORS.storm}
            />
            <Text style={[styles.filterBtnText, extraFiltersCount > 0 && styles.filterBtnTextActive]}>
              {extraFiltersCount > 0 ? `Filtros (${extraFiltersCount})` : "Filtros"}
            </Text>
          </TouchableOpacity>
        }
      />

      {/* Search bar */}
      <View style={styles.searchWrap}>
        <Search size={15} color={COLORS.storm} />
        <TextInput
          style={styles.searchInput}
          value={searchText}
          onChangeText={setSearchText}
          placeholder="Buscar movimientos…"
          placeholderTextColor={COLORS.textDisabled}
          returnKeyType="search"
        />
        {searchText.length > 0 ? (
          <TouchableOpacity onPress={() => setSearchText("")} accessibilityLabel="Limpiar búsqueda">
            <X size={15} color={COLORS.storm} />
          </TouchableOpacity>
        ) : null}
      </View>

      {/* Type filter — segmented pill row */}
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

      {/* Active filter chips */}
      {(activeDatePreset || activeCategoryId || activeAccountId || activeStatusFilter !== "all") ? (
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
                <Text style={styles.activeFilterChipText}>{activeDatePreset} ×</Text>
              </TouchableOpacity>
            ) : null}
            {activeCategoryId ? (
              <TouchableOpacity style={styles.activeFilterChip} onPress={() => setActiveCategoryId(null)}>
                <Text style={styles.activeFilterChipText}>
                  {categories.find((c) => c.id === activeCategoryId)?.name ?? "Categoría"} ×
                </Text>
              </TouchableOpacity>
            ) : null}
            {activeAccountId ? (
              <TouchableOpacity style={styles.activeFilterChip} onPress={() => setActiveAccountId(null)}>
                <Text style={styles.activeFilterChipText}>
                  {accounts.find((a) => a.id === activeAccountId)?.name ?? "Cuenta"} ×
                </Text>
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity onPress={clearAllFilters}>
              <Text style={styles.clearAll}>Limpiar</Text>
            </TouchableOpacity>
          </ScrollView>
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
                <Text style={[styles.pillText, activeDatePreset === null && styles.pillTextActive]}>Todos</Text>
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
            </View>

            {categories.length > 0 ? (
              <>
                <Text style={styles.filterSectionLabel}>Categoría</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <View style={styles.filterPillWrap}>
                    <TouchableOpacity
                      style={[styles.pill, activeCategoryId === null && styles.pillActive]}
                      onPress={() => setActiveCategoryId(null)}
                    >
                      <Text style={[styles.pillText, activeCategoryId === null && styles.pillTextActive]}>Todas</Text>
                    </TouchableOpacity>
                    {categories.map((cat) => (
                      <TouchableOpacity
                        key={cat.id}
                        style={[styles.pill, activeCategoryId === cat.id && styles.pillActive]}
                        onPress={() => setActiveCategoryId(cat.id)}
                      >
                        <Text style={[styles.pillText, activeCategoryId === cat.id && styles.pillTextActive]}>{cat.name}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </ScrollView>
              </>
            ) : null}

            {accounts.length > 0 ? (
              <>
                <Text style={styles.filterSectionLabel}>Cuenta</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <View style={styles.filterPillWrap}>
                    <TouchableOpacity
                      style={[styles.pill, activeAccountId === null && styles.pillActive]}
                      onPress={() => setActiveAccountId(null)}
                    >
                      <Text style={[styles.pillText, activeAccountId === null && styles.pillTextActive]}>Todas</Text>
                    </TouchableOpacity>
                    {accounts.map((acc) => (
                      <TouchableOpacity
                        key={acc.id}
                        style={[styles.pill, activeAccountId === acc.id && styles.pillActive]}
                        onPress={() => setActiveAccountId(acc.id)}
                      >
                        <Text style={[styles.pillText, activeAccountId === acc.id && styles.pillTextActive]}>{acc.name}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </ScrollView>
              </>
            ) : null}

            <TouchableOpacity
              style={styles.applyBtn}
              onPress={() => setFilterSheetOpen(false)}
            >
              <Text style={styles.applyBtnText}>Aplicar</Text>
            </TouchableOpacity>
          </Animated.View>
        </Animated.View>
      </Modal>

      <FlatList
        data={allMovements}
        keyExtractor={(item) => String(item.id)}
        renderItem={({ item }) => (
          <MovementRow
            movement={item}
            baseCurrencyCode={baseCurrency}
            onPress={() => router.push(`/movement/${item.id}`)}
          />
        )}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
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

      <FAB onPress={() => setFormVisible(true)} bottom={insets.bottom + 16} />

      <MovementForm
        visible={formVisible}
        onClose={() => setFormVisible(false)}
        onSuccess={() => {
          setFormVisible(false);
          void queryClient.invalidateQueries({ queryKey: ["movements"] });
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.bg },

  // Search
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

  // Filter button (header right)
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

  // Type pill row
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

  // Active filter chips
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

  // List
  separator: { height: 0.5, backgroundColor: GLASS.separator, marginLeft: SPACING.lg + 42 + SPACING.md },
  footer: { padding: SPACING.lg, alignItems: "center" },
  emptyContainer: { flexGrow: 1 },
  skeletonList: { padding: SPACING.md, gap: SPACING.md },
  skeletonRow: { flexDirection: "row", alignItems: "center", gap: SPACING.md },
  skeletonRowText: { flex: 1, gap: 6 },


  // Filter sheet
  filterOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.55)" },
  filterSheet: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: COLORS.mist,
    borderTopLeftRadius: RADIUS.xl,
    borderTopRightRadius: RADIUS.xl,
    padding: SPACING.lg,
    gap: SPACING.md,
    maxHeight: "80%",
  },
  filterSheetHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: GLASS.handle,
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
  applyBtn: {
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.md,
    paddingVertical: SPACING.md,
    alignItems: "center",
    marginTop: SPACING.sm,
  },
  applyBtnText: { color: "#FFF", fontSize: FONT_SIZE.sm, fontFamily: FONT_FAMILY.bodySemibold },
});
