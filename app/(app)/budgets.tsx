import { FAB } from "../../components/ui/FAB";
import { StaggeredItem } from "../../components/ui/StaggeredItem";
import { ErrorBoundary } from "../../components/ui/ErrorBoundary";
import { UndoBanner } from "../../components/ui/UndoBanner";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as Haptics from "expo-haptics";
import {
  Animated,
  PanResponder,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Search, Trash2, X, Target } from "lucide-react-native";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useNavigation } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAuth } from "../../lib/auth-context";
import { useWorkspace } from "../../lib/workspace-context";
import {
  useWorkspaceSnapshotQuery,
  useDeleteBudgetMutation,
} from "../../services/queries/workspace-data";
import type { BudgetOverview, BudgetScopeKind } from "../../types/domain";
import {
  applyBudgetComputedMetrics,
  buildBudgetMetricsMap,
} from "../../lib/budget-metrics";
import { useBudgetScopeMovementsQuery } from "../../services/queries/budget-analytics";
import { BudgetCard } from "../../components/domain/BudgetCard";
import { BudgetAnalyticsModal } from "../../components/domain/BudgetAnalyticsModal";
import { SkeletonCard } from "../../components/ui/Skeleton";
import { EmptyState } from "../../components/ui/EmptyState";
import { ScreenHeader } from "../../components/layout/ScreenHeader";
import { BudgetForm } from "../../components/forms/BudgetForm";
import { useToast } from "../../hooks/useToast";
import { COLORS, FONT_FAMILY, FONT_SIZE, GLASS, RADIUS, SPACING } from "../../constants/theme";

type BudgetFilter = "all" | "attention" | BudgetScopeKind;

const BUDGET_FILTERS: Array<{ label: string; value: BudgetFilter }> = [
  { label: "Todas", value: "all" },
  { label: "Con alerta", value: "attention" },
  { label: "General", value: "general" },
  { label: "Categoría", value: "category" },
  { label: "Cuenta", value: "account" },
  { label: "Cat + cuenta", value: "category_account" },
];

function BudgetsScreen() {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const router = useRouter();
  const navigation = useNavigation();
  const params = useLocalSearchParams<{ from?: string }>();
  const [formVisible, setFormVisible] = useState(false);
  const [editBudget, setEditBudget] = useState<BudgetOverview | null>(null);
  const [analyticsBudgetId, setAnalyticsBudgetId] = useState<number | null>(null);
  const [searchText, setSearchText] = useState("");
  const [budgetFilter, setBudgetFilter] = useState<BudgetFilter>("all");
  const { profile } = useAuth();
  const { activeWorkspaceId, activeWorkspace } = useWorkspace();
  const { showToast } = useToast();
  const deleteMutation = useDeleteBudgetMutation(activeWorkspaceId);
  const [pendingDeleteIds, setPendingDeleteIds] = useState<Set<number>>(new Set());
  const [pendingDeleteLabels, setPendingDeleteLabels] = useState<Record<number, string>>({});
  const deleteTimers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  function startUndoDelete(budget: BudgetOverview) {
    setPendingDeleteIds((prev) => new Set(prev).add(budget.id));
    setPendingDeleteLabels((prev) => ({ ...prev, [budget.id]: budget.name }));
    const timer = setTimeout(() => {
      deleteMutation.mutate(budget.id, {
        onError: (error) => showToast(error.message, "error"),
      });
      setPendingDeleteIds((prev) => {
        const next = new Set(prev);
        next.delete(budget.id);
        return next;
      });
      deleteTimers.current.delete(budget.id);
    }, 5000);
    deleteTimers.current.set(budget.id, timer);
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

  useEffect(() => () => {
    deleteTimers.current.forEach(clearTimeout);
  }, []);

  const {
    data: snapshot,
    isLoading: snapshotLoading,
    dataUpdatedAt,
  } = useWorkspaceSnapshotQuery(profile, activeWorkspaceId);

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
  } = useBudgetScopeMovementsQuery(
    activeWorkspaceId,
    activeBudgets,
    dataUpdatedAt,
  );

  const metricsMap = useMemo(
    () =>
      buildBudgetMetricsMap(activeBudgets, scopedMovements, {
        workspaceBaseCurrencyCode: baseCurrencyCode,
        exchangeRates: snapshot?.exchangeRates ?? [],
      }),
    [activeBudgets, baseCurrencyCode, scopedMovements, snapshot?.exchangeRates],
  );

  const correctedBudgets = useMemo(
    () => {
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
    },
    [activeBudgets, budgetMovementsError, metricsMap],
  );

  const isMetricsLoading =
    activeBudgets.length > 0 &&
    !budgetMovementsError &&
    movementsLoading &&
    scopedMovements.length === 0;

  const fallbackRoute =
    params.from === "dashboard"
      ? "/(app)/dashboard"
      : params.from === "notifications"
        ? "/notifications"
        : "/(app)/more";

  const handleBack = useCallback(() => {
    if (navigation.canGoBack()) {
      router.back();
      return;
    }
    router.replace(fallbackRoute as any);
  }, [fallbackRoute, navigation, router]);

  const refreshTriggeredRef = useRef(false);
  const onRefresh = useCallback(() => {
    refreshTriggeredRef.current = true;
    void queryClient.invalidateQueries({ queryKey: ["workspace-snapshot"] });
  }, [queryClient]);

  useEffect(() => {
    if (!snapshotLoading && !movementsLoading && refreshTriggeredRef.current) {
      refreshTriggeredRef.current = false;
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  }, [movementsLoading, snapshotLoading]);

  useFocusEffect(
    useCallback(() => {
      void queryClient.invalidateQueries({ queryKey: ["workspace-snapshot"] });
    }, [queryClient]),
  );

  const handleDelete = useCallback((budget: BudgetOverview) => {
    startUndoDelete(budget);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filteredBudgets = useMemo(() => {
    const query = searchText.trim().toLowerCase();
    return correctedBudgets.filter((budget) => {
      if (budgetFilter === "attention" && !budget.isNearLimit && !budget.isOverLimit) return false;
      if (budgetFilter !== "all" && budgetFilter !== "attention" && budget.scopeKind !== budgetFilter) return false;

      if (!query) return true;
      const haystack = [
        budget.name,
        budget.scopeLabel,
        budget.categoryName ?? "",
        budget.accountName ?? "",
        budget.notes ?? "",
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(query);
    });
  }, [budgetFilter, correctedBudgets, searchText]);

  const alertBudgets = useMemo(
    () => filteredBudgets.filter((budget) => budget.isOverLimit || budget.isNearLimit),
    [filteredBudgets],
  );
  const okBudgets = useMemo(
    () => filteredBudgets.filter((budget) => !budget.isOverLimit && !budget.isNearLimit),
    [filteredBudgets],
  );

  const analyticsBudget = useMemo(
    () => correctedBudgets.find((budget) => budget.id === analyticsBudgetId) ?? null,
    [analyticsBudgetId, correctedBudgets],
  );
  const analyticsMetrics = analyticsBudgetId != null ? metricsMap.get(analyticsBudgetId) ?? null : null;

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <ScreenHeader title="Presupuestos" onBack={handleBack} />

      <View style={styles.searchWrap}>
        <Search size={15} color={COLORS.storm} />
        <TextInput
          style={styles.searchInput}
          value={searchText}
          onChangeText={setSearchText}
          placeholder="Buscar presupuestos…"
          placeholderTextColor={COLORS.storm}
          returnKeyType="search"
        />
        {searchText.length > 0 ? (
          <TouchableOpacity onPress={() => setSearchText("")}>
            <X size={15} color={COLORS.storm} />
          </TouchableOpacity>
        ) : null}
      </View>

      <View style={styles.filterRow}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterPills}>
          {BUDGET_FILTERS.map((filter) => (
            <TouchableOpacity
              key={filter.value}
              style={[styles.pill, budgetFilter === filter.value && styles.pillActive]}
              onPress={() => {
                void Haptics.selectionAsync();
                setBudgetFilter(filter.value);
              }}
            >
              <Text style={[styles.pillText, budgetFilter === filter.value && styles.pillTextActive]}>
                {filter.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={snapshotLoading || movementsLoading}
            onRefresh={onRefresh}
            tintColor={COLORS.primary}
          />
        }
      >
        {snapshotLoading || isMetricsLoading ? (
          <>
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </>
        ) : filteredBudgets.length === 0 && correctedBudgets.length === 0 ? (
          <EmptyState
            icon={Target}
            title="Sin presupuestos activos"
            description="Pon un límite de gasto por categoría y recibe una alerta cuando estés cerca de alcanzarlo."
            action={{ label: "Crear primer presupuesto", onPress: () => setFormVisible(true) }}
          />
        ) : filteredBudgets.length === 0 ? (
          <EmptyState
            variant="no-results"
            title="Sin resultados"
            description="Ningún presupuesto coincide con tu búsqueda o filtros."
            action={{
              label: "Limpiar filtros",
              onPress: () => {
                setSearchText("");
                setBudgetFilter("all");
              },
            }}
          />
        ) : (
          <>
            {alertBudgets.length > 0 ? (
              <>
                <Text style={styles.sectionTitle}>Requieren atención</Text>
                {alertBudgets.map((budget, index) => (
                  <StaggeredItem key={budget.id} index={index}>
                    <SwipeableBudgetRow
                      budget={budget}
                      onEdit={() => setEditBudget(budget)}
                      onDelete={() => handleDelete(budget)}
                      onAnalytics={() => setAnalyticsBudgetId(budget.id)}
                    />
                  </StaggeredItem>
                ))}
              </>
            ) : null}

            {okBudgets.length > 0 ? (
              <>
                <Text style={styles.sectionTitle}>
                  {alertBudgets.length > 0 ? "En buen estado" : "Presupuestos"}
                </Text>
                {okBudgets.map((budget, index) => (
                  <StaggeredItem key={budget.id} index={alertBudgets.length + index}>
                    <SwipeableBudgetRow
                      budget={budget}
                      onEdit={() => setEditBudget(budget)}
                      onDelete={() => handleDelete(budget)}
                      onAnalytics={() => setAnalyticsBudgetId(budget.id)}
                    />
                  </StaggeredItem>
                ))}
              </>
            ) : null}
          </>
        )}
      </ScrollView>

      <FAB onPress={() => setFormVisible(true)} bottom={insets.bottom + 16} />

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
      <BudgetAnalyticsModal
        visible={Boolean(analyticsBudget)}
        budget={analyticsBudget}
        analytics={analyticsMetrics}
        onClose={() => setAnalyticsBudgetId(null)}
      />
      <UndoBanner
        visible={pendingDeleteIds.size > 0}
        message={pendingDeleteIds.size === 1
          ? `Presupuesto "${Object.values(pendingDeleteLabels).at(-1) ?? ""}" eliminado`
          : `${pendingDeleteIds.size} presupuestos eliminados`}
        onUndo={() => pendingDeleteIds.forEach((id) => undoDelete(id))}
        durationMs={5000}
        bottomOffset={insets.bottom + 80}
      />
    </View>
  );
}

const REVEAL_WIDTH = 82;

function SwipeableBudgetRow({
  budget,
  onEdit,
  onDelete,
  onAnalytics,
}: {
  budget: BudgetOverview;
  onEdit: () => void;
  onDelete: () => void;
  onAnalytics: () => void;
}) {
  const translateX = useRef(new Animated.Value(0)).current;
  const isOpen = useRef(false);

  const actionOpacity = translateX.interpolate({
    inputRange: [-REVEAL_WIDTH, -16, 0],
    outputRange: [1, 0.6, 0],
    extrapolate: "clamp",
  });

  const snapTo = (toValue: number, cb?: () => void) => {
    isOpen.current = toValue !== 0;
    Animated.spring(translateX, {
      toValue,
      useNativeDriver: true,
      tension: 80,
      friction: 11,
    }).start(cb);
  };

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, { dx, dy }) =>
        Math.abs(dx) > Math.abs(dy) * 1.5 && Math.abs(dx) > 10,
      onPanResponderGrant: () => { translateX.stopAnimation(); },
      onPanResponderMove: (_, { dx }) => {
        const base = isOpen.current ? -REVEAL_WIDTH : 0;
        const next = Math.max(-REVEAL_WIDTH * 1.4, Math.min(0, base + dx));
        translateX.setValue(next);
      },
      onPanResponderRelease: (_, { dx, vx }) => {
        const base = isOpen.current ? -REVEAL_WIDTH : 0;
        const finalX = base + dx;
        if (finalX < -REVEAL_WIDTH / 2 || vx < -0.4) {
          snapTo(-REVEAL_WIDTH);
        } else {
          snapTo(0);
        }
      },
    }),
  ).current;

  function handleCardPress() {
    if (isOpen.current) {
      snapTo(0);
      return;
    }
    onEdit();
  }

  function handleDeletePress() {
    snapTo(0, onDelete);
  }

  return (
    <View style={swipeStyles.container}>
      <Animated.View style={[swipeStyles.actionBg, { opacity: actionOpacity }]}>
        <TouchableOpacity style={swipeStyles.actionBtn} onPress={handleDeletePress} activeOpacity={0.8}>
          <Trash2 size={20} color={COLORS.danger} strokeWidth={2} />
          <Text style={swipeStyles.actionLabel}>Eliminar</Text>
        </TouchableOpacity>
      </Animated.View>

      <Animated.View
        style={{ transform: [{ translateX }] }}
        {...panResponder.panHandlers}
      >
        <BudgetCard budget={budget} onPress={handleCardPress} onAnalytics={onAnalytics} />
      </Animated.View>
    </View>
  );
}

const swipeStyles = StyleSheet.create({
  container: {
    position: "relative",
    overflow: "hidden",
    borderRadius: RADIUS.xl,
  },
  actionBg: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    width: REVEAL_WIDTH,
    backgroundColor: COLORS.danger + "30",
    justifyContent: "center",
    alignItems: "center",
    borderTopLeftRadius: RADIUS.xl,
    borderBottomLeftRadius: RADIUS.xl,
  },
  actionBtn: {
    flex: 1,
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  actionLabel: {
    fontSize: FONT_SIZE.xs,
    fontFamily: FONT_FAMILY.bodySemibold,
    color: COLORS.danger,
  },
});

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.bg },
  content: { padding: SPACING.lg, gap: SPACING.md, paddingBottom: 100 },
  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: SPACING.lg,
    marginTop: SPACING.xs,
    marginBottom: SPACING.md,
    backgroundColor: GLASS.card,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
    gap: SPACING.sm,
    borderWidth: 0.5,
    borderColor: "rgba(255,255,255,0.10)",
  },
  searchInput: {
    flex: 1,
    fontSize: FONT_SIZE.sm,
    color: COLORS.ink,
    fontFamily: FONT_FAMILY.body,
    paddingVertical: SPACING.sm + 2,
  },
  filterRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: SPACING.sm,
  },
  filterPills: {
    paddingHorizontal: SPACING.lg,
    gap: SPACING.xs,
    alignItems: "center",
  },
  pill: {
    height: 30,
    paddingHorizontal: SPACING.md,
    borderRadius: RADIUS.full,
    backgroundColor: GLASS.card,
    alignItems: "center",
    justifyContent: "center",
  },
  pillActive: { backgroundColor: COLORS.primary },
  pillText: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.storm,
    fontFamily: FONT_FAMILY.bodyMedium,
    includeFontPadding: false,
  },
  pillTextActive: { color: "#FFF", fontFamily: FONT_FAMILY.bodySemibold },
  sectionTitle: {
    fontSize: FONT_SIZE.sm,
    fontFamily: FONT_FAMILY.bodySemibold,
    color: COLORS.storm,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginTop: SPACING.xs,
  },
});

export default function BudgetsScreenRoot() {
  return (
    <ErrorBoundary>
      <BudgetsScreen />
    </ErrorBoundary>
  );
}
