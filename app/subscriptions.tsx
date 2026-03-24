import {
  BarChart3,
  Download,
  Pause,
  Play,
  Search,
  SlidersHorizontal,
  Trash2,
  X,
} from "lucide-react-native";
import { FAB } from "../components/ui/FAB";
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
import { ConfirmDialog } from "../components/ui/ConfirmDialog";
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

/** Ancho de la zona al deslizar: izquierda → pausar/reactivar, derecha → eliminar */
const SUB_SWIPE_REVEAL = 88;

type SubSwipeOpen = "delete" | "pause" | null;

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
  const openKind = useRef<SubSwipeOpen>(null);
  const startBaseRef = useRef(0);

  const canPause = sub.status === "active" || sub.status === "paused";
  const pauseLabel = sub.status === "active" ? "Pausar" : "Reactivar";

  const leftOpacity = translateX.interpolate({
    inputRange: [0, SUB_SWIPE_REVEAL],
    outputRange: [0, 1],
    extrapolate: "clamp",
  });
  const rightOpacity = translateX.interpolate({
    inputRange: [-SUB_SWIPE_REVEAL, 0],
    outputRange: [1, 0],
    extrapolate: "clamp",
  });

  const snapTo = useCallback((to: number, kind: SubSwipeOpen) => {
    openKind.current = kind;
    Animated.spring(translateX, {
      toValue: to,
      useNativeDriver: true,
      tension: 80,
      friction: 11,
    }).start();
  }, [translateX]);

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, { dx, dy }) =>
        Math.abs(dx) > Math.abs(dy) * 1.5 && Math.abs(dx) > 12,
      onPanResponderGrant: () => {
        translateX.stopAnimation();
        startBaseRef.current =
          openKind.current === "delete"
            ? -SUB_SWIPE_REVEAL
            : openKind.current === "pause"
              ? SUB_SWIPE_REVEAL
              : 0;
      },
      onPanResponderMove: (_, { dx }) => {
        const maxExtent = canPause ? SUB_SWIPE_REVEAL * 1.35 : 0;
        const next = Math.max(
          -SUB_SWIPE_REVEAL * 1.35,
          Math.min(maxExtent, startBaseRef.current + dx),
        );
        translateX.setValue(next);
      },
      onPanResponderRelease: (_, { dx, vx }) => {
        const maxExtent = canPause ? SUB_SWIPE_REVEAL * 1.35 : 0;
        const v = Math.max(
          -SUB_SWIPE_REVEAL * 1.35,
          Math.min(maxExtent, startBaseRef.current + dx),
        );
        let snap = 0;
        let nextOpen: SubSwipeOpen = null;
        if (v < -SUB_SWIPE_REVEAL / 2 || vx < -0.35) {
          snap = -SUB_SWIPE_REVEAL;
          nextOpen = "delete";
        } else if (canPause && (v > SUB_SWIPE_REVEAL / 2 || vx > 0.35)) {
          snap = SUB_SWIPE_REVEAL;
          nextOpen = "pause";
        }
        openKind.current = nextOpen;
        Animated.spring(translateX, {
          toValue: snap,
          useNativeDriver: true,
          tension: 80,
          friction: 11,
        }).start();
      },
    }),
  ).current;

  function handleCardPress() {
    if (openKind.current !== null) {
      snapTo(0, null);
      return;
    }
    onEdit();
  }

  function handleDeleteAction() {
    snapTo(0, null);
    onDeleteRequest();
  }

  function handlePauseAction() {
    snapTo(0, null);
    onTogglePause();
  }

  return (
    <View style={subSwipeStyles.wrap}>
      {canPause ? (
        <Animated.View style={[subSwipeStyles.leftReveal, { opacity: leftOpacity }]}>
          <TouchableOpacity style={subSwipeStyles.swipeActionInner} onPress={handlePauseAction} activeOpacity={0.85}>
            {sub.status === "active" ? (
              <Pause size={20} color={COLORS.gold} strokeWidth={2} />
            ) : (
              <Play size={20} color={COLORS.primary} strokeWidth={2} />
            )}
            <Text
              style={[
                subSwipeStyles.swipeActionLabel,
                { color: sub.status === "active" ? COLORS.gold : COLORS.primary },
              ]}
            >
              {pauseLabel}
            </Text>
          </TouchableOpacity>
        </Animated.View>
      ) : null}

      <Animated.View style={[subSwipeStyles.rightReveal, { opacity: rightOpacity }]}>
        <TouchableOpacity style={subSwipeStyles.swipeActionInner} onPress={handleDeleteAction} activeOpacity={0.85}>
          <Trash2 size={20} color={COLORS.danger} strokeWidth={2} />
          <Text style={subSwipeStyles.swipeActionLabelDanger}>Eliminar</Text>
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
  leftReveal: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: SUB_SWIPE_REVEAL,
    backgroundColor: COLORS.warningMuted,
    justifyContent: "center",
    alignItems: "center",
    borderTopRightRadius: RADIUS.xl,
    borderBottomRightRadius: RADIUS.xl,
  },
  rightReveal: {
    position: "absolute",
    right: 0,
    top: 0,
    bottom: 0,
    width: SUB_SWIPE_REVEAL,
    backgroundColor: COLORS.dangerMuted,
    justifyContent: "center",
    alignItems: "center",
    borderTopLeftRadius: RADIUS.xl,
    borderBottomLeftRadius: RADIUS.xl,
  },
  swipeActionInner: {
    flex: 1,
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  swipeActionLabel: {
    fontSize: FONT_SIZE.xs,
    fontFamily: FONT_FAMILY.bodySemibold,
  },
  swipeActionLabelDanger: {
    fontSize: FONT_SIZE.xs,
    fontFamily: FONT_FAMILY.bodySemibold,
    color: COLORS.danger,
  },
});

export default function SubscriptionsScreen() {
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
  const [deleteTarget, setDeleteTarget] = useState<SubscriptionSummary | null>(null);
  const [analyticsTarget, setAnalyticsTarget] = useState<SubscriptionSummary | null>(null);
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
    let list = subscriptions;
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

  function confirmDeleteSubscription() {
    if (!deleteTarget) return;
    const id = deleteTarget.id;
    deleteMutation.mutate(id, {
      onSuccess: () => {
        setDeleteTarget(null);
        showToast("Suscripción eliminada", "success");
      },
      onError: (e) => showToast(e.message, "error"),
    });
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
        onDeleteRequest={() => setDeleteTarget(sub)}
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
              onPress={() => setStatusFilter(opt.value)}
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
          <EmptyState title="Sin suscripciones" description="Registra tus pagos recurrentes." action={{ label: "Nueva suscripción", onPress: () => setCreateFormVisible(true) }} />
        ) : filteredSubscriptions.length === 0 ? (
          <EmptyState title="Sin resultados" description="Prueba otros filtros o la búsqueda." />
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

      <ConfirmDialog
        visible={Boolean(deleteTarget)}
        title="Eliminar suscripción"
        body={
          deleteTarget
            ? `¿Eliminar «${deleteTarget.name}»? Esta acción no se puede deshacer.`
            : undefined
        }
        confirmLabel="Eliminar"
        cancelLabel="Cancelar"
        destructive
        onCancel={() => setDeleteTarget(null)}
        onConfirm={confirmDeleteSubscription}
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
