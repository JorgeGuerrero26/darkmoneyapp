import { Plus, X } from "lucide-react-native";
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

  // Debounce search input 400ms
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
  const extraFiltersCount = [activeDatePreset, activeCategoryId, activeAccountId].filter(Boolean).length;
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

  function renderFilterPills(
    options: { label: string; value: string }[],
    active: string,
    onSelect: (v: string) => void,
  ) {
    return (
      <View style={styles.pillRowWrap}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pillRow}>
          {options.map((opt) => (
            <TouchableOpacity
              key={opt.value}
              style={[styles.pill, active === opt.value && styles.pillActive]}
              onPress={() => onSelect(opt.value)}
            >
              <Text style={[styles.pillText, active === opt.value && styles.pillTextActive]}>
                {opt.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>
    );
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
            <Text style={[styles.filterBtnText, extraFiltersCount > 0 && styles.filterBtnTextActive]}>
              {extraFiltersCount > 0 ? `Filtros (${extraFiltersCount})` : "Filtros"}
            </Text>
          </TouchableOpacity>
        }
      />

      {/* Search bar */}
      <View style={styles.searchWrap}>
        <TextInput
          style={styles.searchInput}
          value={searchText}
          onChangeText={setSearchText}
          placeholder="Buscar movimientos…"
          placeholderTextColor={COLORS.textDisabled}
          returnKeyType="search"
          clearButtonMode="while-editing"
        />
        {searchText.length > 0 ? (
          <TouchableOpacity style={styles.searchClear} onPress={() => setSearchText("")} accessibilityLabel="Limpiar búsqueda">
            <X size={16} color={COLORS.storm} />
          </TouchableOpacity>
        ) : null}
      </View>

      {/* Type + Status pills */}
      {renderFilterPills(TYPE_FILTERS, activeTypeFilter, (v) => setActiveTypeFilter(v as FilterType))}
      {renderFilterPills(STATUS_FILTERS, activeStatusFilter, (v) => setActiveStatusFilter(v as FilterStatus))}

      {/* Active filter summary bar */}
      {(activeDatePreset || activeCategoryId || activeAccountId) ? (
        <View style={styles.activeFiltersBar}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.activeFiltersPills}>
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
              <Text style={styles.clearAll}>Limpiar todo</Text>
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
            <Text style={styles.filterSheetTitle}>Filtros adicionales</Text>

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
                  <Skeleton width={40} height={40} borderRadius={20} />
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

      {/* FAB */}
      <TouchableOpacity
        style={[styles.fab, { bottom: insets.bottom + 16 }]}
        activeOpacity={0.85}
        onPress={() => setFormVisible(true)}
        accessibilityLabel="Nuevo movimiento"
      >
        <Plus size={22} color="#FFF" />
      </TouchableOpacity>

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
  pillRowWrap: { height: 48, justifyContent: "center" },
  pillRow: { paddingHorizontal: SPACING.lg, gap: SPACING.sm, alignItems: "center" },
  pill: {
    height: 36,
    paddingHorizontal: SPACING.lg,
    borderRadius: RADIUS.full,
    backgroundColor: GLASS.card,
    borderWidth: 1,
    borderColor: GLASS.cardBorder,
    alignItems: "center",
    justifyContent: "center",
  },
  pillActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  pillText: { fontSize: FONT_SIZE.sm, color: COLORS.storm, fontFamily: FONT_FAMILY.bodyMedium, includeFontPadding: false },
  pillTextActive: { color: "#FFFFFF" },
  separator: { height: 1, backgroundColor: GLASS.separator, marginLeft: SPACING.lg + 36 + SPACING.md },
  footer: { padding: SPACING.lg, alignItems: "center" },
  emptyContainer: { flexGrow: 1 },
  skeletonList: { padding: SPACING.md, gap: SPACING.md },
  skeletonRow: { flexDirection: "row", alignItems: "center", gap: SPACING.md },
  skeletonRowText: { flex: 1, gap: 6 },
  fab: {
    position: "absolute",
    right: SPACING.lg,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: COLORS.primary,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 8,
  },
  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: SPACING.lg,
    marginVertical: SPACING.sm,
    backgroundColor: COLORS.bgInput,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: GLASS.cardBorder,
    paddingHorizontal: SPACING.md,
  },
  searchInput: {
    flex: 1,
    fontSize: FONT_SIZE.md,
    color: COLORS.ink,
    paddingVertical: SPACING.sm,
  },
  searchClear: { padding: 4 },
  filterBtn: {
    height: 36,
    paddingHorizontal: SPACING.lg,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: GLASS.cardBorder,
    backgroundColor: GLASS.card,
    alignItems: "center",
    justifyContent: "center",
  },
  filterBtnActive: { borderColor: COLORS.primary, backgroundColor: COLORS.primary + "22" },
  filterBtnText: { fontSize: FONT_SIZE.sm, color: COLORS.storm, fontFamily: FONT_FAMILY.bodyMedium },
  filterBtnTextActive: { color: COLORS.primary },
  activeFiltersBar: { paddingVertical: SPACING.xs },
  activeFiltersPills: { paddingHorizontal: SPACING.lg, gap: SPACING.sm, alignItems: "center" },
  activeFilterChip: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: 3,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.primary + "22",
    borderWidth: 1,
    borderColor: COLORS.primary + "55",
  },
  activeFilterChipText: { fontSize: FONT_SIZE.xs, color: COLORS.primary },
  clearAll: { fontSize: FONT_SIZE.xs, color: COLORS.storm, paddingHorizontal: SPACING.xs },
  filterOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.5)" },
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
  filterSheetTitle: { fontSize: FONT_SIZE.md, fontFamily: FONT_FAMILY.heading, color: COLORS.ink, textAlign: "center" },
  filterSectionLabel: { fontSize: FONT_SIZE.xs, fontFamily: FONT_FAMILY.bodySemibold, color: COLORS.storm, textTransform: "uppercase", letterSpacing: 0.5 },
  filterPillWrap: { flexDirection: "row", flexWrap: "wrap", gap: SPACING.sm },
  applyBtn: { backgroundColor: COLORS.primary, borderRadius: RADIUS.md, paddingVertical: SPACING.md, alignItems: "center", marginTop: SPACING.sm },
  applyBtnText: { color: "#FFF", fontSize: FONT_SIZE.md, fontFamily: FONT_FAMILY.bodySemibold },
});
