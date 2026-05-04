import {
  BarChart3,
  CalendarClock,
  Download,
  Pause,
  Play,
  Search,
  SlidersHorizontal,
  Trash2,
  X,
} from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { FAB } from "../components/ui/FAB";
import { ErrorBoundary } from "../components/ui/ErrorBoundary";
import { UndoBanner } from "../components/ui/UndoBanner";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Animated,
  Dimensions,
  Modal,
  PanResponder,
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
import { format } from "date-fns";
import { es } from "date-fns/locale";

import { useAuth } from "../lib/auth-context";
import { useWorkspace } from "../lib/workspace-context";
import { buildSubscriptionsCsv } from "../lib/subscriptions-csv";
import { shareCsvAsFile } from "../lib/share-csv-file";
import {
  useWorkspaceSnapshotQuery,
  useUpdateSubscriptionMutation,
  useDeleteSubscriptionMutation,
} from "../services/queries/workspace-data";
import type { SubscriptionFrequency, SubscriptionSummary } from "../types/domain";
import { SubscriptionAnalyticsModal } from "../components/domain/SubscriptionAnalyticsModal";
import { Card } from "../components/ui/Card";
import { EmptyState } from "../components/ui/EmptyState";
import { SkeletonCard } from "../components/ui/Skeleton";
import { ScreenHeader } from "../components/layout/ScreenHeader";
import { SubscriptionForm } from "../components/forms/SubscriptionForm";
import { formatCurrency } from "../components/ui/AmountDisplay";
import { useToast } from "../hooks/useToast";
import { COLORS, FONT_FAMILY, FONT_SIZE, GLASS, RADIUS, SPACING } from "../constants/theme";

function formatYmdLocal(ymd: string, pattern: string) {
  const p = ymd.split("-").map(Number);
  if (p.length !== 3 || p.some((n) => Number.isNaN(n))) return ymd;
  return format(new Date(p[0], p[1] - 1, p[2]), pattern, { locale: es });
}

type StatusFilter = "all" | "active" | "paused" | "cancelled";

const STATUS_FILTERS: { label: string; value: StatusFilter }[] = [
  { label: "Todos", value: "all" },
  { label: "Activas", value: "active" },
  { label: "Pausadas", value: "paused" },
  { label: "Canceladas", value: "cancelled" },
];

const FREQ_FILTERS: { label: string; value: "all" | SubscriptionFrequency }[] = [
  { label: "Todas", value: "all" },
  { label: "Diario", value: "daily" },
  { label: "Semanal", value: "weekly" },
  { label: "Mensual", value: "monthly" },
  { label: "Trimestral", value: "quarterly" },
  { label: "Anual", value: "yearly" },
  { label: "Personalizado", value: "custom" },
];

const SUB_SWIPE_REVEAL = 96;
const SUB_ACTION_PANEL_W = 176;

function SwipeableSubscriptionRow({
  sub,
  onEdit,
  onDeleteRequest,
  onTogglePause,
  cardContent,
}: {
  sub: SubscriptionSummary;
  onEdit: () => void;
  onDeleteRequest: () => void;
  onTogglePause: () => void;
  cardContent: ReactNode;
}) {
  const translateX = useRef(new Animated.Value(0)).current;
  const openSideRef = useRef<"right" | null>(null);
  const startBaseRef = useRef(0);

  const canPause = sub.status === "active" || sub.status === "paused";
  const pauseLabel = sub.status === "active" ? "Pausar" : "Reactivar";

  const rightOpacity = translateX.interpolate({
    inputRange: [-SUB_ACTION_PANEL_W, -12, 0],
    outputRange: [1, 0.4, 0],
    extrapolate: "clamp",
  });

  const snapTo = useCallback((to: number, side: "right" | null, cb?: () => void) => {
    openSideRef.current = side;
    Animated.spring(translateX, {
      toValue: to,
      useNativeDriver: true,
      tension: 80,
      friction: 11,
    }).start(({ finished }) => {
      if (finished) cb?.();
    });
  }, [translateX]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
      onMoveShouldSetPanResponder: (_, { dx, dy }) =>
        Math.abs(dx) > Math.abs(dy) * 1.5 && Math.abs(dx) > 12,
      onPanResponderGrant: () => {
        translateX.stopAnimation();
        startBaseRef.current =
          openSideRef.current === "right"
            ? -SUB_ACTION_PANEL_W
            : 0;
      },
      onPanResponderMove: (_, { dx }) => {
        const next = Math.max(
          -SUB_ACTION_PANEL_W * 1.15,
          Math.min(0, startBaseRef.current + dx),
        );
        translateX.setValue(next);
      },
      onPanResponderRelease: (_, { dx, vx }) => {
        const v = Math.max(
          -SUB_ACTION_PANEL_W * 1.15,
          Math.min(0, startBaseRef.current + dx),
        );
        if (v < -SUB_ACTION_PANEL_W / 2 || vx < -0.35) {
          snapTo(-SUB_ACTION_PANEL_W, "right");
          return;
        }
        snapTo(0, null);
      },
      }),
    [snapTo, translateX],
  );

  function handleCardPress() {
    if (openSideRef.current !== null) {
      snapTo(0, null);
      return;
    }
    onEdit();
  }

  function handleDeleteAction() {
    snapTo(0, null, onDeleteRequest);
  }

  function handlePauseAction() {
    snapTo(0, null, onTogglePause);
  }

  return (
    <View style={subSwipeStyles.wrap}>
      <Animated.View style={[subSwipeStyles.rightActionsPanel, { opacity: rightOpacity }]} pointerEvents="box-none">
        {canPause ? (
          <TouchableOpacity
            style={[subSwipeStyles.panelActionCell, subSwipeStyles.panelActionCellBorder]}
            onPress={handlePauseAction}
            activeOpacity={0.85}
          >
            {sub.status === "active" ? (
              <Pause size={18} color={COLORS.gold} strokeWidth={2} />
            ) : (
              <Play size={18} color={COLORS.primary} strokeWidth={2} />
            )}
            <Text
              style={[
                subSwipeStyles.panelActionLabel,
                { color: sub.status === "active" ? COLORS.gold : COLORS.primary },
              ]}
            >
              {pauseLabel}
            </Text>
          </TouchableOpacity>
        ) : null}
        <TouchableOpacity
          style={[subSwipeStyles.panelActionCell, subSwipeStyles.panelActionDelete]}
          onPress={handleDeleteAction}
          activeOpacity={0.85}
        >
          <Trash2 size={18} color={COLORS.danger} strokeWidth={2} />
          <Text style={[subSwipeStyles.panelActionLabel, { color: COLORS.danger }]}>Eliminar</Text>
        </TouchableOpacity>
      </Animated.View>

      <Animated.View style={{ transform: [{ translateX }] }} {...panResponder.panHandlers}>
        <Card onPress={handleCardPress}>{cardContent}</Card>
      </Animated.View>
    </View>
  );
}

const subSwipeStyles = StyleSheet.create({
  wrap: {
    position: "relative",
    overflow: "hidden",
    borderRadius: RADIUS.xl,
  },
  rightActionsPanel: {
    position: "absolute",
    right: 0,
    top: 0,
    bottom: 0,
    width: SUB_ACTION_PANEL_W,
    flexDirection: "row",
    backgroundColor: GLASS.card,
    borderTopLeftRadius: RADIUS.xl,
    borderBottomLeftRadius: RADIUS.xl,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: GLASS.cardBorder,
  },
  panelActionCell: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: SPACING.sm,
  },
  panelActionCellBorder: {
    borderRightWidth: 1,
    borderRightColor: GLASS.cardBorder,
  },
  panelActionDelete: {
    backgroundColor: COLORS.danger + "10",
  },
  panelActionLabel: {
    fontSize: FONT_SIZE.xs,
    fontFamily: FONT_FAMILY.bodySemibold,
    textAlign: "center",
  },
});

function SubscriptionsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { profile } = useAuth();
  const { activeWorkspaceId, activeWorkspace } = useWorkspace();
  const { showToast } = useToast();

  const { data: snapshot, isLoading } = useWorkspaceSnapshotQuery(profile, activeWorkspaceId);
  const updateMutation = useUpdateSubscriptionMutation(activeWorkspaceId);
  const deleteMutation = useDeleteSubscriptionMutation(activeWorkspaceId);

  const [createFormVisible, setCreateFormVisible] = useState(false);
  const [editSubscription, setEditSubscription] = useState<SubscriptionSummary | null>(null);
  const [analyticsTarget, setAnalyticsTarget] = useState<SubscriptionSummary | null>(null);
  const [pendingDeleteIds, setPendingDeleteIds] = useState<Set<number>>(new Set());
  const [pendingDeleteLabels, setPendingDeleteLabels] = useState<Record<number, string>>({});
  const deleteTimers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  function startUndoDelete(sub: SubscriptionSummary) {
    setPendingDeleteIds((prev) => new Set(prev).add(sub.id));
    setPendingDeleteLabels((prev) => ({ ...prev, [sub.id]: sub.name }));
    const timer = setTimeout(() => {
      deleteMutation.mutate(sub.id, {
        onError: (e) => showToast(e.message, "error"),
      });
      setPendingDeleteIds((prev) => { const n = new Set(prev); n.delete(sub.id); return n; });
      deleteTimers.current.delete(sub.id);
    }, 5000);
    deleteTimers.current.set(sub.id, timer);
  }

  function undoDelete(id: number) {
    const timer = deleteTimers.current.get(id);
    if (timer) clearTimeout(timer);
    deleteTimers.current.delete(id);
    setPendingDeleteIds((prev) => { const n = new Set(prev); n.delete(id); return n; });
  }

  useEffect(() => () => { deleteTimers.current.forEach(clearTimeout); }, []);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [frequencyFilter, setFrequencyFilter] = useState<"all" | SubscriptionFrequency>("all");
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

  const extraFiltersCount = frequencyFilter !== "all" ? 1 : 0;

  const subscriptions = snapshot?.subscriptions ?? [];
  const postedMovements = snapshot?.subscriptionPostedMovements ?? [];

  const filteredSubscriptions = useMemo(() => {
    let list = subscriptions.filter((s) => !pendingDeleteIds.has(s.id));
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          s.vendor.toLowerCase().includes(q) ||
          (s.description ?? "").toLowerCase().includes(q) ||
          (s.notes ?? "").toLowerCase().includes(q),
      );
    }
    if (statusFilter !== "all") list = list.filter((s) => s.status === statusFilter);
    if (frequencyFilter !== "all") list = list.filter((s) => s.frequency === frequencyFilter);
    return list;
  }, [subscriptions, search, statusFilter, frequencyFilter]);

  const active = filteredSubscriptions.filter((s) => s.status === "active");
  const paused = filteredSubscriptions.filter((s) => s.status === "paused");
  const cancelled = filteredSubscriptions.filter((s) => s.status === "cancelled");

  const onRefresh = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ["workspace-snapshot"] });
  }, [queryClient]);

  function clearSheetFilters() {
    setFrequencyFilter("all");
  }

  async function handleExportCsv() {
    if (filteredSubscriptions.length === 0) {
      showToast("No hay filas para exportar", "warning");
      return;
    }
    try {
      const csv = buildSubscriptionsCsv(filteredSubscriptions);
      await shareCsvAsFile(csv, `suscripciones-${activeWorkspace?.name?.replace(/\s+/g, "_") ?? "workspace"}.csv`);
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : "Error al exportar", "error");
    }
  }

  function handleTogglePause(sub: SubscriptionSummary) {
    const newStatus = sub.status === "active" ? "paused" : "active";
    updateMutation.mutate(
      { id: sub.id, input: { status: newStatus } },
      { onSuccess: () => showToast(newStatus === "paused" ? "Suscripción pausada" : "Suscripción reactivada", "success") },
    );
  }


  function renderCard(sub: SubscriptionSummary) {
    const monthlyCost =
      sub.frequency === "monthly" ? sub.amount
      : sub.frequency === "yearly" ? sub.amount / 12
      : sub.frequency === "weekly" ? (sub.amount * 52) / 12
      : sub.frequency === "quarterly" ? sub.amount / 3
      : sub.amount;

    const inner = (
      <>
        <View style={styles.cardHeader}>
          <View style={styles.cardHeaderMain}>
            <Text style={styles.name} numberOfLines={1}>
              {sub.name}
            </Text>
            {sub.vendor ? (
              <Text style={styles.vendor} numberOfLines={1}>
                {sub.vendor}
              </Text>
            ) : null}
          </View>
          <View style={styles.cardHeaderRight}>
            <TouchableOpacity
              style={styles.analyticsIconBtn}
              onPress={(e) => {
                e.stopPropagation?.();
                setAnalyticsTarget(sub);
              }}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityLabel="Ver análisis"
            >
              <BarChart3 size={14} color={COLORS.storm} strokeWidth={2} />
            </TouchableOpacity>
            <View style={styles.amounts}>
              <Text style={[styles.amount, sub.status !== "active" && styles.amountMuted]}>
                {formatCurrency(sub.amount, sub.currencyCode)}
              </Text>
              <Text style={styles.freq}>{sub.frequencyLabel}</Text>
            </View>
          </View>
        </View>
        <View style={styles.metaRow}>
          <Text style={styles.nextDue}>
            Próximo: {formatYmdLocal(sub.nextDueDate, "d MMM")}
          </Text>
          <Text style={styles.monthly}>~{formatCurrency(monthlyCost, sub.currencyCode)}/mes</Text>
        </View>
      </>
    );

    return (
      <SwipeableSubscriptionRow
        key={sub.id}
        sub={sub}
        onEdit={() => setEditSubscription(sub)}
        onDeleteRequest={() => startUndoDelete(sub)}
        onTogglePause={() => handleTogglePause(sub)}
        cardContent={inner}
      />
    );
  }

  const frequencyLabel =
    FREQ_FILTERS.find((f) => f.value === frequencyFilter)?.label ?? "Frecuencia";

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <ScreenHeader
        title="Suscripciones"
        onBack={() => router.replace("/(app)/more")}
        rightAction={
          <View style={styles.headerRightRow}>
            <TouchableOpacity
              style={styles.filterBtn}
              onPress={() => void handleExportCsv()}
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
        }
      />

      <View style={styles.searchWrap}>
        <Search size={15} color={COLORS.storm} />
        <TextInput
          style={styles.searchInput}
          value={search}
          onChangeText={setSearch}
          placeholder="Buscar suscripciones…"
          placeholderTextColor={COLORS.storm}
          returnKeyType="search"
        />
        {search.length > 0 ? (
          <TouchableOpacity onPress={() => setSearch("")} hitSlop={8}>
            <X size={15} color={COLORS.storm} />
          </TouchableOpacity>
        ) : null}
      </View>

      <View style={styles.segmentedWrap}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.segmentedRow}>
          {STATUS_FILTERS.map((opt) => (
            <TouchableOpacity
              key={opt.value}
              style={[styles.pill, statusFilter === opt.value && styles.pillActive]}
              onPress={() => {
                void Haptics.selectionAsync();
                setStatusFilter(opt.value);
              }}
            >
              <Text style={[styles.pillText, statusFilter === opt.value && styles.pillTextActive]}>{opt.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {frequencyFilter !== "all" ? (
        <View style={styles.activeFiltersBar}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.activeFiltersPills}>
            <TouchableOpacity style={styles.activeFilterChip} onPress={() => setFrequencyFilter("all")}>
              <Text style={styles.activeFilterChipText}>
                {frequencyLabel} ×
              </Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={clearSheetFilters}>
              <Text style={styles.clearAll}>Limpiar</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      ) : null}

      <Modal
        visible={filterSheetOpen}
        transparent
        animationType="none"
        onRequestClose={() => setFilterSheetOpen(false)}
      >
        <Animated.View style={[styles.filterOverlay, { opacity: filterOverlayOpacity }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setFilterSheetOpen(false)} />
          <Animated.View
            style={[
              styles.filterSheet,
              { paddingBottom: insets.bottom + SPACING.lg, transform: [{ translateY: filterSheetY }] },
            ]}
            onStartShouldSetResponder={() => true}
          >
            <View style={styles.filterSheetHandle} />
            <Text style={styles.filterSheetTitle}>Filtros</Text>

            <Text style={styles.filterSectionLabel}>Frecuencia</Text>
            <View style={styles.filterPillWrap}>
              {FREQ_FILTERS.map((f) => (
                <TouchableOpacity
                  key={String(f.value)}
                  style={[styles.sheetPill, frequencyFilter === f.value && styles.sheetPillActive]}
                  onPress={() => setFrequencyFilter(f.value)}
                >
                  <Text style={[styles.sheetPillText, frequencyFilter === f.value && styles.sheetPillTextActive]}>
                    {f.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity style={styles.applyBtn} onPress={() => setFilterSheetOpen(false)}>
              <Text style={styles.applyBtnText}>Aplicar</Text>
            </TouchableOpacity>
          </Animated.View>
        </Animated.View>
      </Modal>

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={isLoading} onRefresh={onRefresh} tintColor={COLORS.primary} />
        }
      >
        {isLoading ? (
          <>
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </>
        ) : subscriptions.length === 0 ? (
          <EmptyState
            icon={CalendarClock}
            title="Sin suscripciones"
            description="Lleva el control de Netflix, Spotify y todo lo que pagas cada mes. Te avisamos antes de que se cobren."
            action={{ label: "Agregar suscripción", onPress: () => setCreateFormVisible(true) }}
          />
        ) : filteredSubscriptions.length === 0 ? (
          <EmptyState variant="no-results" title="Sin resultados" description="Prueba con otros filtros o limpia la búsqueda." />
        ) : null}

        {active.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Activas ({active.length})</Text>
            {active.map(renderCard)}
          </View>
        ) : null}

        {paused.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Pausadas ({paused.length})</Text>
            {paused.map(renderCard)}
          </View>
        ) : null}

        {cancelled.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Canceladas ({cancelled.length})</Text>
            {cancelled.map(renderCard)}
          </View>
        ) : null}
      </ScrollView>

      <FAB onPress={() => setCreateFormVisible(true)} bottom={insets.bottom + 16} />

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
        baseCurrencyCode={activeWorkspace?.baseCurrencyCode ?? "PEN"}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.bg },

  headerRightRow: { flexDirection: "row", gap: SPACING.xs, alignItems: "center" },
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
  pillText: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.storm,
    fontFamily: FONT_FAMILY.bodyMedium,
    includeFontPadding: false,
  },
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

  filterOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.55)" },
  filterSheet: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "rgba(8,12,18,0.97)",
    borderTopLeftRadius: RADIUS.xl,
    borderTopRightRadius: RADIUS.xl,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.14)",
    padding: SPACING.lg,
    gap: SPACING.md,
    maxHeight: "70%",
  },
  filterSheetHandle: {
    width: 36,
    height: 4,
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
  sheetPill: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.full,
    backgroundColor: GLASS.card,
    borderWidth: 1,
    borderColor: GLASS.cardBorder,
  },
  sheetPillActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  sheetPillText: { fontSize: FONT_SIZE.xs, color: COLORS.storm, fontFamily: FONT_FAMILY.bodyMedium },
  sheetPillTextActive: { color: "#FFFFFF", fontFamily: FONT_FAMILY.bodySemibold },
  applyBtn: {
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.md,
    paddingVertical: SPACING.md,
    alignItems: "center",
    marginTop: SPACING.sm,
  },
  applyBtnText: { color: "#FFF", fontSize: FONT_SIZE.sm, fontFamily: FONT_FAMILY.bodySemibold },

  content: { padding: SPACING.lg, gap: SPACING.md, paddingBottom: 100 },
  section: { gap: SPACING.sm },
  sectionTitle: {
    fontSize: FONT_SIZE.sm,
    fontFamily: FONT_FAMILY.bodySemibold,
    color: COLORS.storm,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: SPACING.sm,
    gap: SPACING.xs,
  },
  cardHeaderMain: { flex: 1, minWidth: 0, gap: 2 },
  cardHeaderRight: {
    flexDirection: "row",
    alignItems: "center",
    flexShrink: 0,
    gap: SPACING.sm,
  },
  analyticsIconBtn: {
    padding: 4,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: 6,
    justifyContent: "center",
    alignItems: "center",
  },
  name: { fontSize: FONT_SIZE.md, fontFamily: FONT_FAMILY.bodySemibold, color: COLORS.ink },
  vendor: { fontSize: FONT_SIZE.xs, color: COLORS.storm },
  amounts: { alignItems: "flex-end", gap: 2 },
  amount: { fontSize: FONT_SIZE.md, fontFamily: FONT_FAMILY.heading, color: COLORS.expense },
  amountMuted: { color: COLORS.storm },
  freq: { fontSize: FONT_SIZE.xs, color: COLORS.storm },
  metaRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: SPACING.sm },
  nextDue: { fontSize: FONT_SIZE.xs, color: COLORS.storm },
  monthly: { fontSize: FONT_SIZE.xs, color: COLORS.storm },
});

export default function SubscriptionsScreenRoot() {
  return (
    <ErrorBoundary>
      <SubscriptionsScreen />
    </ErrorBoundary>
  );
}
