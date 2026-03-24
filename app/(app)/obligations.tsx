import { FAB } from "../../components/ui/FAB";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  PanResponder,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Users, CreditCard, TrendingUp, TrendingDown, Trash2, BarChart2 } from "lucide-react-native";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { useAuth } from "../../lib/auth-context";
import { useWorkspace } from "../../lib/workspace-context";
import {
  buildShareByObligationId,
  getDirectionLabel,
  getObligationStatusLabel,
  getShareStatusLabel,
} from "../../lib/obligation-labels";
import { obligationSwipeActionLabel } from "../../lib/obligation-viewer-labels";
import {
  useWorkspaceSnapshotQuery,
  useDeleteObligationMutation,
  useObligationSharesQuery,
  useSharedObligationsQuery,
} from "../../services/queries/workspace-data";
import { useToast } from "../../hooks/useToast";
import { ConfirmDialog } from "../../components/ui/ConfirmDialog";
import { ObligationAnalyticsModal } from "../../components/domain/ObligationAnalyticsModal";
import type {
  ObligationShareSummary,
  ObligationSummary,
  ObligationStatus,
  SharedObligationSummary,
} from "../../types/domain";
import { Card } from "../../components/ui/Card";
import { ProgressBar } from "../../components/ui/ProgressBar";
import { EmptyState } from "../../components/ui/EmptyState";
import { SkeletonCard } from "../../components/ui/Skeleton";
import { ScreenHeader } from "../../components/layout/ScreenHeader";
import { ObligationForm } from "../../components/forms/ObligationForm";
import { PaymentForm } from "../../components/forms/PaymentForm";
import { PrincipalAdjustmentForm } from "../../components/forms/PrincipalAdjustmentForm";
import { formatCurrency } from "../../components/ui/AmountDisplay";
import { COLORS, FONT_FAMILY, FONT_SIZE, GLASS, RADIUS, SPACING } from "../../constants/theme";

// ─── Status config ───────────────────────────────────────────────────────────

/** Colores por obligations.status; el texto sale de getObligationStatusLabel (paridad web). */
const STATUS_COLORS: Record<ObligationStatus, string> = {
  active: COLORS.primary,
  draft: COLORS.storm,
  paid: COLORS.income,
  cancelled: COLORS.storm,
  defaulted: COLORS.warning,
};

type FilterChip = { id: string; label: string };
const FILTER_CHIPS: FilterChip[] = [
  { id: "all",       label: "Todas" },
  { id: "receivable",label: "Me deben" },
  { id: "payable",   label: "Debo" },
  { id: "active",    label: "Activa" },
  { id: "defaulted", label: "Incumplido" },
  { id: "draft",     label: "Borrador" },
  { id: "paid",      label: "Liquidada" },
  { id: "cancelled", label: "Cancelada" },
];

// ─── Swipeable row ────────────────────────────────────────────────────────────
// LEFT swipe (←) → reveals DELETE on the right
// RIGHT swipe (→) → reveals PAGAR on the left

const REVEAL_W = 90;

type SwipeableObligationRowProps = {
  obligation: ObligationSummary | SharedObligationSummary;
  /** Share activo (pending | accepted) para esta obligación; si no hay fila, sin tercer badge. */
  obligationShare?: ObligationShareSummary | null;
  /** Obligación de otro usuario compartida contigo (no eliminar / no es “tuya”). */
  isSharedWithMe?: boolean;
  onEdit: () => void;
  onPayment: () => void;
  onDelete: () => void;
  onAnalytics: () => void;
};

function SwipeableObligationRow({
  obligation,
  obligationShare,
  isSharedWithMe,
  onEdit,
  onPayment,
  onDelete,
  onAnalytics,
}: SwipeableObligationRowProps) {
  const translateX = useRef(new Animated.Value(0)).current;
  // "right" = swiped right (pay), "left" = swiped left (delete), null = closed
  const openDir = useRef<"right" | "left" | null>(null);

  const payOpacity = translateX.interpolate({
    inputRange: [0, 16, REVEAL_W],
    outputRange: [0, 0.6, 1],
    extrapolate: "clamp",
  });
  const deleteOpacity = translateX.interpolate({
    inputRange: [-REVEAL_W, -16, 0],
    outputRange: [1, 0.6, 0],
    extrapolate: "clamp",
  });

  const snapTo = (toValue: number, cb?: () => void) => {
    if (toValue === 0) openDir.current = null;
    else if (toValue > 0) openDir.current = "right";
    else openDir.current = "left";
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
        const base = openDir.current === "right" ? REVEAL_W : openDir.current === "left" ? -REVEAL_W : 0;
        const raw = base + dx;
        const minX = isSharedWithMe ? Math.min(0, base) : -REVEAL_W * 1.4;
        const clamped = Math.min(REVEAL_W * 1.4, Math.max(minX, raw));
        translateX.setValue(clamped);
      },
      onPanResponderRelease: (_, { dx, vx }) => {
        const base = openDir.current === "right" ? REVEAL_W : openDir.current === "left" ? -REVEAL_W : 0;
        const finalX = base + dx;
        if (finalX > REVEAL_W / 2 || vx > 0.4) {
          snapTo(REVEAL_W);
        } else if (!isSharedWithMe && (finalX < -REVEAL_W / 2 || vx < -0.4)) {
          snapTo(-REVEAL_W);
        } else {
          snapTo(0);
        }
      },
    })
  ).current;

  function handleCardPress() {
    if (openDir.current !== null) { snapTo(0); return; }
    onEdit();
  }

  const isPaid = obligation.status === "paid" || obligation.status === "cancelled";
  const color = obligation.direction === "receivable" ? COLORS.income : COLORS.expense;
  const directionColor = obligation.direction === "receivable" ? COLORS.income : COLORS.expense;
  const obligationStatusColor = STATUS_COLORS[obligation.status] ?? STATUS_COLORS.active;
  const obligationStatusLabel = getObligationStatusLabel(obligation.status);
  const directionLabel = getDirectionLabel(obligation.direction);
  const shareLabel = obligationShare ? getShareStatusLabel(obligationShare.status) : null;
  const shareColor =
    obligationShare?.status === "pending"
      ? COLORS.warning
      : obligationShare?.status === "accepted"
        ? COLORS.income
        : COLORS.storm;

  const paySwipeLabel = obligationSwipeActionLabel(obligation.direction, Boolean(isSharedWithMe));

  return (
    <View style={swipeStyles.container}>
      {/* LEFT action (pay) — revealed by swiping RIGHT */}
      <Animated.View style={[swipeStyles.payBg, { opacity: payOpacity }]}>
        <TouchableOpacity style={swipeStyles.actionBtn} onPress={() => snapTo(0, onPayment)} activeOpacity={0.8}>
          <CreditCard size={20} color={COLORS.pine} strokeWidth={2} />
          <Text style={[swipeStyles.actionLabel, { color: COLORS.pine }]}>{paySwipeLabel}</Text>
        </TouchableOpacity>
      </Animated.View>

      {/* RIGHT action (delete) — revealed by swiping LEFT; no aplica a compartidos contigo */}
      {!isSharedWithMe ? (
        <Animated.View style={[swipeStyles.deleteBg, { opacity: deleteOpacity }]}>
          <TouchableOpacity style={swipeStyles.actionBtn} onPress={() => snapTo(0, onDelete)} activeOpacity={0.8}>
            <Trash2 size={20} color={COLORS.danger} strokeWidth={2} />
            <Text style={[swipeStyles.actionLabel, { color: COLORS.danger }]}>Eliminar</Text>
          </TouchableOpacity>
        </Animated.View>
      ) : null}

      {/* Swipeable card */}
      <Animated.View
        style={{ transform: [{ translateX }] }}
        {...panResponder.panHandlers}
      >
        <Card onPress={handleCardPress} style={swipeStyles.card}>
          <View style={swipeStyles.header}>
            <Text style={swipeStyles.title} numberOfLines={1}>{obligation.title}</Text>
            <View style={swipeStyles.headerRight}>
              <TouchableOpacity onPress={onAnalytics} style={swipeStyles.analyticsBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <BarChart2 size={14} color={COLORS.storm} strokeWidth={2} />
              </TouchableOpacity>
              <Text style={[swipeStyles.amount, { color }]}>
                {formatCurrency(obligation.pendingAmount, obligation.currencyCode)}
              </Text>
            </View>
          </View>

          <View style={swipeStyles.metaRow}>
            <Text style={swipeStyles.counterparty}>{obligation.counterparty}</Text>
          </View>

          <View style={swipeStyles.badgesRow}>
            <View
              style={[
                swipeStyles.badgePill,
                { backgroundColor: directionColor + "22", borderColor: directionColor + "44" },
              ]}
            >
              <Text style={[swipeStyles.badgePillText, { color: directionColor }]}>{directionLabel}</Text>
            </View>
            <View
              style={[
                swipeStyles.badgePill,
                {
                  backgroundColor: obligationStatusColor + "22",
                  borderColor: obligationStatusColor + "44",
                },
              ]}
            >
              <Text style={[swipeStyles.badgePillText, { color: obligationStatusColor }]}>
                {obligationStatusLabel}
              </Text>
            </View>
            {shareLabel ? (
              <View
                style={[
                  swipeStyles.badgePill,
                  { backgroundColor: shareColor + "22", borderColor: shareColor + "44" },
                ]}
              >
                <Users size={10} color={shareColor} strokeWidth={2} />
                <Text style={[swipeStyles.badgePillText, { color: shareColor }]}>{shareLabel}</Text>
              </View>
            ) : null}
            {isSharedWithMe && "share" in obligation ? (
              <View
                style={[
                  swipeStyles.badgePill,
                  { backgroundColor: COLORS.secondary + "22", borderColor: COLORS.secondary + "44" },
                ]}
              >
                <Users size={10} color={COLORS.secondary} strokeWidth={2} />
                <Text style={[swipeStyles.badgePillText, { color: COLORS.secondary }]} numberOfLines={1}>
                  Compartido
                  {(obligation as SharedObligationSummary).share.ownerDisplayName?.trim()
                    ? ` · ${(obligation as SharedObligationSummary).share.ownerDisplayName!.trim()}`
                    : ""}
                </Text>
              </View>
            ) : null}
          </View>

          {!isPaid ? (
            <>
              <ProgressBar percent={obligation.progressPercent} alertPercent={100} height={5} />
              <View style={swipeStyles.progressRow}>
                <Text style={swipeStyles.progressText}>{Math.round(obligation.progressPercent)}% pagado</Text>
                {obligation.dueDate ? (
                  <Text style={swipeStyles.dueDate}>
                    Vence {format(new Date(obligation.dueDate), "d MMM yyyy", { locale: es })}
                  </Text>
                ) : null}
              </View>
            </>
          ) : null}

        </Card>
      </Animated.View>
    </View>
  );
}

// ─── Screen ──────────────────────────────────────────────────────────────────

export default function ObligationsScreen() {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { profile } = useAuth();
  const { activeWorkspaceId } = useWorkspace();
  const { showToast } = useToast();
  const deleteMutation = useDeleteObligationMutation(activeWorkspaceId);

  const { data: snapshot, isLoading } = useWorkspaceSnapshotQuery(profile, activeWorkspaceId);
  const { data: obligationShares = [] } = useObligationSharesQuery(activeWorkspaceId);
  const { data: sharedObligations = [], isLoading: sharedLoading, isFetching: sharedFetching } =
    useSharedObligationsQuery(profile?.id);

  const shareByObligationId = useMemo(
    () => buildShareByObligationId(obligationShares),
    [obligationShares],
  );

  const [activeFilter, setActiveFilter] = useState("all");
  const [createFormVisible, setCreateFormVisible] = useState(false);
  const [editObligation, setEditObligation] = useState<ObligationSummary | null>(null);
  const [paymentObligation, setPaymentObligation] = useState<ObligationSummary | null>(null);
  const [adjustObligation, setAdjustObligation] = useState<ObligationSummary | null>(null);
  const [adjustMode, setAdjustMode] = useState<"increase" | "decrease">("increase");
  const [deleteTarget, setDeleteTarget] = useState<ObligationSummary | null>(null);
  const [analyticsObligation, setAnalyticsObligation] = useState<
    ObligationSummary | SharedObligationSummary | null
  >(null);

  // Undo-delete: hidden list of ids pending actual deletion
  const [pendingDeleteIds, setPendingDeleteIds] = useState<Set<number>>(new Set());
  const deleteTimers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  function startUndoDelete(ob: ObligationSummary) {
    setPendingDeleteIds((prev) => new Set(prev).add(ob.id));
    const timer = setTimeout(() => {
      deleteMutation.mutate(ob.id, {
        onError: (e) => showToast(e.message, "error"),
      });
      setPendingDeleteIds((prev) => {
        const next = new Set(prev);
        next.delete(ob.id);
        return next;
      });
      deleteTimers.current.delete(ob.id);
    }, 5000);
    deleteTimers.current.set(ob.id, timer);
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

  // Clear timers on unmount
  useEffect(() => {
    return () => { deleteTimers.current.forEach(clearTimeout); };
  }, []);

  const obligations = snapshot?.obligations ?? [];

  function passesFilter(ob: ObligationSummary | SharedObligationSummary) {
    if (activeFilter === "all") return true;
    if (activeFilter === "receivable" || activeFilter === "payable") return ob.direction === activeFilter;
    return ob.status === activeFilter;
  }

  const filtered = obligations.filter((ob) => passesFilter(ob));
  const filteredShared = sharedObligations.filter((ob) => passesFilter(ob));

  const listRefreshing = isLoading || sharedFetching;

  const onRefresh = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ["workspace-snapshot"] });
    void queryClient.invalidateQueries({ queryKey: ["shared-obligations"] });
    if (activeWorkspaceId) {
      void queryClient.invalidateQueries({ queryKey: ["obligation-shares", activeWorkspaceId] });
    }
  }, [queryClient, activeWorkspaceId]);

  function openAdjust(ob: ObligationSummary, mode: "increase" | "decrease") {
    setAdjustMode(mode);
    setAdjustObligation(ob);
  }

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <ScreenHeader title="Créditos y Deudas" />

      {/* Filter chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filtersRow}
        style={styles.filtersScroll}
      >
        {FILTER_CHIPS.map((chip) => (
          <TouchableOpacity
            key={chip.id}
            style={[styles.filterChip, activeFilter === chip.id && styles.filterChipActive]}
            onPress={() => setActiveFilter(chip.id)}
          >
            <Text style={[styles.filterChipText, activeFilter === chip.id && styles.filterChipTextActive]}>
              {chip.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={listRefreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />
        }
      >
        {isLoading ? (
          <>
            <SkeletonCard /><SkeletonCard /><SkeletonCard />
          </>
        ) : (
          <>
            {filtered.filter((ob) => !pendingDeleteIds.has(ob.id)).length === 0 &&
            filteredShared.length === 0 &&
            !sharedLoading ? (
              <EmptyState
                title="Sin obligaciones"
                description="Registra préstamos, deudas y créditos aquí. Las que otros compartan contigo aparecen abajo en «Compartidos contigo»."
                action={
                  activeFilter === "all"
                    ? { label: "Nueva obligación", onPress: () => setCreateFormVisible(true) }
                    : undefined
                }
              />
            ) : null}

            {filtered.filter((ob) => !pendingDeleteIds.has(ob.id)).length > 0 ? (
              <>
                <Text style={styles.sectionLabel}>Tu workspace</Text>
                {filtered
                  .filter((ob) => !pendingDeleteIds.has(ob.id))
                  .map((ob) => (
                    <SwipeableObligationRow
                      key={`w-${ob.id}`}
                      obligation={ob}
                      obligationShare={shareByObligationId.get(ob.id) ?? null}
                      onEdit={() => setEditObligation(ob)}
                      onPayment={() => setPaymentObligation(ob)}
                      onDelete={() => startUndoDelete(ob)}
                      onAnalytics={() => setAnalyticsObligation(ob)}
                    />
                  ))}
              </>
            ) : null}

            {sharedLoading && filteredShared.length === 0 ? (
              <View style={styles.sharedLoading}>
                <ActivityIndicator color={COLORS.primary} />
                <Text style={styles.sharedLoadingText}>Cargando compartidos contigo…</Text>
              </View>
            ) : null}

            {filteredShared.length > 0 ? (
              <>
                <Text style={styles.sectionLabel}>Compartidos contigo</Text>
                <Text style={styles.sectionHint}>
                  Créditos o deudas que otro usuario compartió contigo (invitación aceptada).
                </Text>
                {filteredShared.map((ob) => (
                  <SwipeableObligationRow
                    key={`s-${ob.workspaceId}-${ob.id}`}
                    obligation={ob}
                    obligationShare={ob.share}
                    isSharedWithMe
                    onEdit={() => setEditObligation(ob)}
                    onPayment={() => setPaymentObligation(ob)}
                    onDelete={() => {}}
                    onAnalytics={() => setAnalyticsObligation(ob)}
                  />
                ))}
              </>
            ) : null}
          </>
        )}
      </ScrollView>

      <FAB onPress={() => setCreateFormVisible(true)} bottom={insets.bottom + 16} />

      {/* Forms */}
      <ObligationForm
        visible={createFormVisible}
        onClose={() => setCreateFormVisible(false)}
        onSuccess={() => setCreateFormVisible(false)}
      />
      <ObligationForm
        visible={Boolean(editObligation)}
        onClose={() => setEditObligation(null)}
        onSuccess={() => setEditObligation(null)}
        editObligation={editObligation ?? undefined}
        onAdjust={openAdjust}
      />
      <PaymentForm
        visible={Boolean(paymentObligation)}
        onClose={() => setPaymentObligation(null)}
        onSuccess={() => setPaymentObligation(null)}
        obligation={paymentObligation}
      />
      <PrincipalAdjustmentForm
        visible={Boolean(adjustObligation)}
        mode={adjustMode}
        obligation={adjustObligation}
        onClose={() => setAdjustObligation(null)}
        onSuccess={() => setAdjustObligation(null)}
      />

      {/* Undo-delete banner */}
      {pendingDeleteIds.size > 0 ? (
        <View style={styles.undoBanner}>
          <Text style={styles.undoText}>
            {pendingDeleteIds.size === 1 ? "Obligación eliminada" : `${pendingDeleteIds.size} obligaciones eliminadas`}
          </Text>
          <TouchableOpacity
            onPress={() => pendingDeleteIds.forEach((id) => undoDelete(id))}
            style={styles.undoBtn}
          >
            <Text style={styles.undoBtnText}>Deshacer</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      <ObligationAnalyticsModal
        visible={Boolean(analyticsObligation)}
        obligation={analyticsObligation}
        onClose={() => setAnalyticsObligation(null)}
      />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const swipeStyles = StyleSheet.create({
  container: {
    position: "relative",
    overflow: "hidden",
    borderRadius: RADIUS.xl,
  },
  payBg: {
    position: "absolute",
    top: 0,
    left: 0,
    bottom: 0,
    width: REVEAL_W,
    backgroundColor: COLORS.pine + "30",
    justifyContent: "center",
    alignItems: "center",
    borderTopRightRadius: RADIUS.xl,
    borderBottomRightRadius: RADIUS.xl,
  },
  deleteBg: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    width: REVEAL_W,
    backgroundColor: COLORS.danger + "28",
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
  },
  card: { padding: SPACING.md },
  header: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: SPACING.xs,
    gap: SPACING.xs,
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    flexShrink: 0,
    gap: SPACING.sm,
  },
  analyticsBtn: {
    padding: 4,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: 6,
    justifyContent: "center",
    alignItems: "center",
  },
  title: {
    flex: 1,
    fontSize: FONT_SIZE.md,
    fontFamily: FONT_FAMILY.bodySemibold,
    color: COLORS.ink,
    marginRight: SPACING.sm,
  },
  amount: {
    fontSize: FONT_SIZE.md,
    fontFamily: FONT_FAMILY.heading,
    includeFontPadding: false,
    textAlignVertical: "center",
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: SPACING.sm,
  },
  counterparty: { fontSize: FONT_SIZE.sm, color: COLORS.storm, flex: 1 },
  progressRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 4,
  },
  progressText: { fontSize: FONT_SIZE.xs, color: COLORS.storm },
  dueDate: { fontSize: FONT_SIZE.xs, color: COLORS.warning },
  badgesRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: SPACING.xs,
    marginBottom: SPACING.sm,
  },
  badgePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 3,
    borderRadius: RADIUS.full,
    borderWidth: 1,
  },
  badgePillText: {
    fontSize: FONT_SIZE.xs,
    fontFamily: FONT_FAMILY.bodyMedium,
  },
});

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.bg },
  filtersScroll: { flexGrow: 0 },
  filtersRow: {
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
    gap: SPACING.sm,
  },
  filterChip: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs + 2,
    borderRadius: RADIUS.full,
    backgroundColor: GLASS.card,
    borderWidth: 1,
    borderColor: GLASS.cardBorder,
  },
  filterChipActive: {
    backgroundColor: COLORS.pine + "22",
    borderColor: COLORS.pine + "55",
  },
  filterChipText: {
    fontSize: FONT_SIZE.sm,
    fontFamily: FONT_FAMILY.bodyMedium,
    color: COLORS.storm,
  },
  filterChipTextActive: { color: COLORS.pine },
  content: { padding: SPACING.lg, gap: SPACING.sm, paddingBottom: 100 },
  sectionLabel: {
    fontSize: FONT_SIZE.xs,
    fontFamily: FONT_FAMILY.bodySemibold,
    color: COLORS.storm,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginTop: SPACING.sm,
    marginBottom: SPACING.xs,
  },
  sectionHint: {
    fontSize: FONT_SIZE.xs,
    fontFamily: FONT_FAMILY.body,
    color: COLORS.storm,
    opacity: 0.85,
    marginBottom: SPACING.sm,
    marginTop: -SPACING.xs,
  },
  sharedLoading: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
    paddingVertical: SPACING.md,
  },
  sharedLoadingText: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.storm,
    fontFamily: FONT_FAMILY.body,
  },
  undoBanner: {
    position: "absolute",
    bottom: 90,
    left: SPACING.lg,
    right: SPACING.lg,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "rgba(20,26,34,0.97)",
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm + 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 10,
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
