import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Animated,
  Dimensions,
  Modal,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { CalendarClock, Pause, Play, Search, SlidersHorizontal, Trash2, X } from "lucide-react-native";

import { useAuth } from "../lib/auth-context";
import { useWorkspace } from "../lib/workspace-context";
import {
  useConfirmRecurringIncomeArrivalMutation,
  useDeleteRecurringIncomeMutation,
  useUpdateRecurringIncomeMutation,
  useWorkspaceSnapshotQuery,
} from "../services/queries/workspace-data";
import type { RecurringIncomeFrequency, RecurringIncomeSummary } from "../types/domain";
import { ScreenHeader } from "../components/layout/ScreenHeader";
import { Card } from "../components/ui/Card";
import { EmptyState } from "../components/ui/EmptyState";
import { SkeletonCard } from "../components/ui/Skeleton";
import { FAB } from "../components/ui/FAB";
import { ConfirmDialog } from "../components/ui/ConfirmDialog";
import { RecurringIncomeForm } from "../components/forms/RecurringIncomeForm";
import { DatePickerInput } from "../components/ui/DatePickerInput";
import { Button } from "../components/ui/Button";
import { formatCurrency } from "../components/ui/AmountDisplay";
import { useToast } from "../hooks/useToast";
import { COLORS, FONT_FAMILY, FONT_SIZE, GLASS, RADIUS, SPACING } from "../constants/theme";

const SCREEN_HEIGHT = Dimensions.get("window").height;
const RECURRING_INCOME_SWIPE_REVEAL = 96;
const RECURRING_INCOME_ACTION_PANEL_W = 176;

type StatusFilter = "all" | "active" | "paused" | "cancelled";

const STATUS_FILTERS: { label: string; value: StatusFilter }[] = [
  { label: "Todos", value: "all" },
  { label: "Activos", value: "active" },
  { label: "Pausados", value: "paused" },
  { label: "Cancelados", value: "cancelled" },
];

const FREQ_FILTERS: { label: string; value: "all" | RecurringIncomeFrequency }[] = [
  { label: "Todas", value: "all" },
  { label: "Diario", value: "daily" },
  { label: "Semanal", value: "weekly" },
  { label: "Mensual", value: "monthly" },
  { label: "Trimestral", value: "quarterly" },
  { label: "Anual", value: "yearly" },
  { label: "Personalizado", value: "custom" },
];

function formatYmdLocal(ymd: string, pattern: string) {
  const p = ymd.split("-").map(Number);
  if (p.length !== 3 || p.some((n) => Number.isNaN(n))) return ymd;
  return format(new Date(p[0], p[1] - 1, p[2]), pattern, { locale: es });
}

function ymdWithin30Days(ymd: string) {
  const target = new Date(`${ymd}T00:00:00`);
  const now = new Date();
  const limit = new Date();
  limit.setDate(limit.getDate() + 30);
  return target >= new Date(now.getFullYear(), now.getMonth(), now.getDate()) && target <= limit;
}

function SwipeableRecurringIncomeRow({
  item,
  onEdit,
  onConfirmArrival,
  onToggleStatus,
  onDelete,
  cardContent,
}: {
  item: RecurringIncomeSummary;
  onEdit: () => void;
  onConfirmArrival: () => void;
  onToggleStatus: () => void;
  onDelete: () => void;
  cardContent: ReactNode;
}) {
  const translateX = useRef(new Animated.Value(0)).current;
  const openSideRef = useRef<"left" | "right" | null>(null);
  const startBaseRef = useRef(0);

  const canConfirmArrival = item.status === "active";
  const canToggleStatus = item.status === "active" || item.status === "paused";

  const leftOpacity = translateX.interpolate({
    inputRange: [0, RECURRING_INCOME_SWIPE_REVEAL],
    outputRange: [0, 1],
    extrapolate: "clamp",
  });
  const rightOpacity = translateX.interpolate({
    inputRange: [-RECURRING_INCOME_ACTION_PANEL_W, -12, 0],
    outputRange: [1, 0.4, 0],
    extrapolate: "clamp",
  });

  const snapTo = useCallback((toValue: number, side: "left" | "right" | null, cb?: () => void) => {
    openSideRef.current = side;
    Animated.spring(translateX, {
      toValue,
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
            openSideRef.current === "left"
              ? RECURRING_INCOME_SWIPE_REVEAL
              : openSideRef.current === "right"
                ? -RECURRING_INCOME_ACTION_PANEL_W
                : 0;
        },
        onPanResponderMove: (_, { dx }) => {
          const maxRight = canConfirmArrival ? RECURRING_INCOME_SWIPE_REVEAL * 1.25 : 0;
          const next = Math.max(
            -RECURRING_INCOME_ACTION_PANEL_W * 1.15,
            Math.min(maxRight, startBaseRef.current + dx),
          );
          translateX.setValue(next);
        },
        onPanResponderRelease: (_, { dx, vx }) => {
          const maxRight = canConfirmArrival ? RECURRING_INCOME_SWIPE_REVEAL * 1.25 : 0;
          const value = Math.max(
            -RECURRING_INCOME_ACTION_PANEL_W * 1.15,
            Math.min(maxRight, startBaseRef.current + dx),
          );
          if (value < -RECURRING_INCOME_ACTION_PANEL_W / 2 || vx < -0.35) {
            snapTo(-RECURRING_INCOME_ACTION_PANEL_W, "right");
            return;
          }
          if (canConfirmArrival && (value > RECURRING_INCOME_SWIPE_REVEAL / 2 || vx > 0.35)) {
            snapTo(RECURRING_INCOME_SWIPE_REVEAL, "left");
            return;
          }
          snapTo(0, null);
        },
      }),
    [canConfirmArrival, snapTo, translateX],
  );

  function handleCardPress() {
    if (openSideRef.current !== null) {
      snapTo(0, null);
      return;
    }
    onEdit();
  }

  return (
    <View style={styles.swipeWrap}>
      {canConfirmArrival ? (
        <Animated.View style={[styles.leftReveal, { opacity: leftOpacity }]}>
          <TouchableOpacity style={styles.swipeActionInner} onPress={() => snapTo(0, null, onConfirmArrival)} activeOpacity={0.85}>
            <CalendarClock size={20} color={COLORS.primary} strokeWidth={2} />
            <Text style={[styles.swipeActionLabel, { color: COLORS.primary }]}>Confirmar</Text>
          </TouchableOpacity>
        </Animated.View>
      ) : null}

      <Animated.View style={[styles.rightActionsPanel, { opacity: rightOpacity }]} pointerEvents="box-none">
        {canToggleStatus ? (
          <TouchableOpacity
            style={[styles.panelActionCell, styles.panelActionCellBorder]}
            onPress={() => snapTo(0, null, onToggleStatus)}
            activeOpacity={0.85}
          >
            {item.status === "active" ? (
              <Pause size={18} color={COLORS.gold} strokeWidth={2} />
            ) : (
              <Play size={18} color={COLORS.primary} strokeWidth={2} />
            )}
            <Text style={[styles.panelActionLabel, { color: item.status === "active" ? COLORS.gold : COLORS.primary }]}>
              {item.status === "active" ? "Pausar" : "Reactivar"}
            </Text>
          </TouchableOpacity>
        ) : null}
        <TouchableOpacity
          style={[styles.panelActionCell, styles.panelActionDelete]}
          onPress={() => snapTo(0, null, onDelete)}
          activeOpacity={0.85}
        >
          <Trash2 size={18} color={COLORS.danger} strokeWidth={2} />
          <Text style={[styles.panelActionLabel, { color: COLORS.danger }]}>Eliminar</Text>
        </TouchableOpacity>
      </Animated.View>

      <Animated.View style={{ transform: [{ translateX }] }} {...panResponder.panHandlers}>
        <Card onPress={handleCardPress} style={styles.itemCard}>
          {cardContent}
        </Card>
      </Animated.View>
    </View>
  );
}

export default function RecurringIncomeScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { profile } = useAuth();
  const { activeWorkspaceId, activeWorkspace } = useWorkspace();
  const { showToast } = useToast();

  const { data: snapshot, isLoading } = useWorkspaceSnapshotQuery(profile, activeWorkspaceId);
  const updateMutation = useUpdateRecurringIncomeMutation(activeWorkspaceId);
  const deleteMutation = useDeleteRecurringIncomeMutation(activeWorkspaceId);
  const confirmArrivalMutation = useConfirmRecurringIncomeArrivalMutation(activeWorkspaceId);

  const [createFormVisible, setCreateFormVisible] = useState(false);
  const [editTarget, setEditTarget] = useState<RecurringIncomeSummary | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<RecurringIncomeSummary | null>(null);
  const [arrivalTarget, setArrivalTarget] = useState<RecurringIncomeSummary | null>(null);
  const [arrivalDate, setArrivalDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [arrivalNotes, setArrivalNotes] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [frequencyFilter, setFrequencyFilter] = useState<"all" | RecurringIncomeFrequency>("all");
  const [payerFilter, setPayerFilter] = useState<number | null>(null);
  const [accountFilter, setAccountFilter] = useState<number | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<number | null>(null);
  const [upcomingOnly, setUpcomingOnly] = useState(false);
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
  }, [filterOverlayOpacity, filterSheetOpen, filterSheetY]);

  const items = snapshot?.recurringIncome ?? [];
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items
      .filter((item) => statusFilter === "all" || item.status === statusFilter)
      .filter((item) => frequencyFilter === "all" || item.frequency === frequencyFilter)
      .filter((item) => payerFilter == null || item.payerPartyId === payerFilter)
      .filter((item) => accountFilter == null || item.accountId === accountFilter)
      .filter((item) => categoryFilter == null || item.categoryId === categoryFilter)
      .filter((item) => !upcomingOnly || ymdWithin30Days(item.nextExpectedDate))
      .filter((item) => {
        if (!q) return true;
        return [
          item.name,
          item.payer,
          item.accountName ?? "",
          item.categoryName ?? "",
          item.notes ?? "",
        ].some((value) => value.toLowerCase().includes(q));
      })
      .sort((a, b) => a.nextExpectedDate.localeCompare(b.nextExpectedDate));
  }, [accountFilter, categoryFilter, frequencyFilter, items, payerFilter, search, statusFilter, upcomingOnly]);

  const activeAccounts = useMemo(() => snapshot?.accounts.filter((a) => !a.isArchived) ?? [], [snapshot?.accounts]);
  const categories = useMemo(() => snapshot?.categories.filter((c) => c.isActive && (c.kind === "income" || c.kind === "both")) ?? [], [snapshot?.categories]);
  const counterparties = useMemo(() => snapshot?.counterparties ?? [], [snapshot?.counterparties]);
  const extraFiltersCount = [frequencyFilter !== "all", payerFilter != null, accountFilter != null, categoryFilter != null, upcomingOnly].filter(Boolean).length;

  function openConfirmArrival(item: RecurringIncomeSummary) {
    setArrivalTarget(item);
    setArrivalDate(format(new Date(), "yyyy-MM-dd"));
    setArrivalNotes("");
  }

  function clearExtraFilters() {
    setFrequencyFilter("all");
    setPayerFilter(null);
    setAccountFilter(null);
    setCategoryFilter(null);
    setUpcomingOnly(false);
  }

  async function handleConfirmArrival() {
    if (!arrivalTarget) return;
    try {
      await confirmArrivalMutation.mutateAsync({
        recurringIncomeId: arrivalTarget.id,
        expectedDate: arrivalTarget.nextExpectedDate,
        actualDate: arrivalDate,
        amount: arrivalTarget.amount,
        currencyCode: arrivalTarget.currencyCode,
        frequency: arrivalTarget.frequency,
        intervalCount: arrivalTarget.intervalCount,
        notes: arrivalNotes.trim() || null,
      });
      setArrivalTarget(null);
      showToast("Llegada confirmada", "success");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "No pudimos confirmar la llegada", "error");
    }
  }

  function handleToggleStatus(item: RecurringIncomeSummary) {
    const nextStatus = item.status === "active" ? "paused" : "active";
    updateMutation.mutate(
      { id: item.id, input: { status: nextStatus } },
      {
        onSuccess: () => showToast(nextStatus === "paused" ? "Ingreso pausado" : "Ingreso reactivado", "success"),
        onError: (error) => showToast(error.message, "error"),
      },
    );
  }

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <ScreenHeader
        title="Ingresos fijos"
        subtitle={activeWorkspace?.name}
        onBack={() => router.back()}
        rightAction={(
          <TouchableOpacity style={styles.filterBtn} onPress={() => setFilterSheetOpen(true)}>
            <SlidersHorizontal size={16} color={COLORS.storm} />
            <Text style={styles.filterBtnText}>Filtros{extraFiltersCount > 0 ? ` (${extraFiltersCount})` : ""}</Text>
          </TouchableOpacity>
        )}
      />

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.searchWrap}>
          <Search size={18} color={COLORS.storm} />
          <TextInput
            style={styles.searchInput}
            value={search}
            onChangeText={setSearch}
            placeholder="Buscar ingresos fijos..."
            placeholderTextColor={COLORS.textDisabled}
          />
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={styles.tabRow}>
            {STATUS_FILTERS.map((filter) => (
              <TouchableOpacity
                key={filter.value}
                style={[styles.tabChip, statusFilter === filter.value && styles.tabChipActive]}
                onPress={() => setStatusFilter(filter.value)}
              >
                <Text style={[styles.tabChipText, statusFilter === filter.value && styles.tabChipTextActive]}>
                  {filter.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>

        {isLoading ? (
          <>
            <SkeletonCard style={{ minHeight: 124 }} />
            <SkeletonCard style={{ minHeight: 124 }} />
          </>
        ) : filtered.length === 0 ? (
          <EmptyState
            variant={items.length === 0 ? "empty" : "no-results"}
            title={items.length === 0 ? "Sin ingresos fijos" : "Sin resultados"}
            description={items.length === 0
              ? "Registra tus sueldos, rentas y otros ingresos recurrentes."
              : "Prueba ajustando tus filtros o búsqueda."}
            action={{ label: "Nuevo ingreso fijo", onPress: () => setCreateFormVisible(true) }}
          />
        ) : (
          filtered.map((item) => (
            <SwipeableRecurringIncomeRow
              key={item.id}
              item={item}
              onEdit={() => setEditTarget(item)}
              onConfirmArrival={() => openConfirmArrival(item)}
              onToggleStatus={() => handleToggleStatus(item)}
              onDelete={() => setDeleteTarget(item)}
              cardContent={(
                <>
              <View style={styles.itemHeader}>
                <View style={styles.itemTitleWrap}>
                  <Text style={styles.itemTitle}>{item.name}</Text>
                  <Text style={styles.itemMeta}>
                    {item.payer?.trim() ? item.payer : "Sin pagador"} · {item.frequencyLabel}
                  </Text>
                </View>
                <View style={[styles.statusBadge, item.status !== "active" && styles.statusBadgeMuted]}>
                  <Text style={[styles.statusBadgeText, item.status !== "active" && styles.statusBadgeTextMuted]}>
                    {item.status === "active" ? "Activo" : item.status === "paused" ? "Pausado" : "Cancelado"}
                  </Text>
                </View>
              </View>

              <View style={styles.amountRow}>
                <Text style={styles.amountValue}>{formatCurrency(item.amount, item.currencyCode)}</Text>
                <Text style={styles.expectedDate}>Próxima llegada: {formatYmdLocal(item.nextExpectedDate, "d MMM yyyy")}</Text>
              </View>

              <View style={styles.metaWrap}>
                {item.accountName ? <Text style={styles.metaChip}>{item.accountName}</Text> : null}
                {item.categoryName ? <Text style={styles.metaChip}>{item.categoryName}</Text> : null}
              </View>

                </>
              )}
            />
          ))
        )}
      </ScrollView>

      <FAB onPress={() => setCreateFormVisible(true)} bottom={insets.bottom + SPACING.xl} />

      <RecurringIncomeForm
        visible={createFormVisible}
        onClose={() => setCreateFormVisible(false)}
        onSuccess={() => setCreateFormVisible(false)}
      />
      <RecurringIncomeForm
        visible={Boolean(editTarget)}
        onClose={() => setEditTarget(null)}
        onSuccess={() => setEditTarget(null)}
        editRecurringIncome={editTarget ?? undefined}
      />

      <ConfirmDialog
        visible={Boolean(deleteTarget)}
        title="Eliminar ingreso fijo"
        body={deleteTarget ? `¿Eliminar “${deleteTarget.name}”?` : undefined}
        confirmLabel="Eliminar"
        cancelLabel="Cancelar"
        destructive
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (!deleteTarget) return;
          deleteMutation.mutate(deleteTarget.id, {
            onSuccess: () => {
              showToast("Ingreso fijo eliminado", "success");
              setDeleteTarget(null);
            },
            onError: (error) => showToast(error.message, "error"),
          });
        }}
      />

      <Modal
        visible={Boolean(arrivalTarget)}
        transparent
        animationType="fade"
        onRequestClose={() => setArrivalTarget(null)}
      >
        <Pressable style={styles.overlay} onPress={() => setArrivalTarget(null)}>
          <View style={styles.arrivalSheet} onStartShouldSetResponder={() => true}>
            <Text style={styles.arrivalTitle}>Confirmar llegada</Text>
            {arrivalTarget ? (
              <>
                <Text style={styles.arrivalSubtitle}>
                  {arrivalTarget.name} · {formatCurrency(arrivalTarget.amount, arrivalTarget.currencyCode)}
                </Text>
                <DatePickerInput label="Fecha real de llegada" value={arrivalDate} onChange={setArrivalDate} />
                <TextInput
                  style={styles.notesInput}
                  multiline
                  value={arrivalNotes}
                  onChangeText={setArrivalNotes}
                  placeholder="Notas (opcional)"
                  placeholderTextColor={COLORS.textDisabled}
                />
                <View style={styles.arrivalActions}>
                  <Button label="Cancelar" variant="ghost" onPress={() => setArrivalTarget(null)} style={styles.cancelBtn} />
                  <Button
                    label="Confirmar"
                    onPress={handleConfirmArrival}
                    loading={confirmArrivalMutation.isPending}
                    style={styles.submitBtn}
                  />
                </View>
              </>
            ) : null}
          </View>
        </Pressable>
      </Modal>

      <Modal visible={filterSheetOpen} transparent animationType="none" onRequestClose={() => setFilterSheetOpen(false)}>
        <Animated.View style={[StyleSheet.absoluteFillObject, { opacity: filterOverlayOpacity }]}>
          <Pressable style={styles.overlay} onPress={() => setFilterSheetOpen(false)} />
        </Animated.View>
        <Animated.View style={[styles.filterSheet, { paddingBottom: insets.bottom + SPACING.lg, transform: [{ translateY: filterSheetY }] }]}>
          <View style={styles.filterSheetHandle} />
          <View style={styles.filterHeader}>
            <Text style={styles.filterTitle}>Filtros</Text>
            <TouchableOpacity onPress={() => setFilterSheetOpen(false)}><X size={18} color={COLORS.storm} /></TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.filterContent}>
          <Text style={styles.filterLabel}>Frecuencia</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.filterPillWrap}>
              {FREQ_FILTERS.map((filter) => (
                <TouchableOpacity
                  key={filter.value}
                  style={[styles.filterPill, frequencyFilter === filter.value && styles.filterPillActive]}
                  onPress={() => setFrequencyFilter(filter.value)}
                >
                  <Text style={[styles.filterPillText, frequencyFilter === filter.value && styles.filterPillTextActive]}>
                    {filter.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>

          <Text style={styles.filterLabel}>Pagador</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.filterPillWrap}>
              <TouchableOpacity style={[styles.filterPill, payerFilter == null && styles.filterPillActive]} onPress={() => setPayerFilter(null)}>
                <Text style={[styles.filterPillText, payerFilter == null && styles.filterPillTextActive]}>Todos</Text>
              </TouchableOpacity>
              {counterparties.map((counterparty) => (
                <TouchableOpacity
                  key={counterparty.id}
                  style={[styles.filterPill, payerFilter === counterparty.id && styles.filterPillActive]}
                  onPress={() => setPayerFilter(counterparty.id)}
                >
                  <Text style={[styles.filterPillText, payerFilter === counterparty.id && styles.filterPillTextActive]}>{counterparty.name}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>

          <Text style={styles.filterLabel}>Cuenta</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.filterPillWrap}>
              <TouchableOpacity style={[styles.filterPill, accountFilter == null && styles.filterPillActive]} onPress={() => setAccountFilter(null)}>
                <Text style={[styles.filterPillText, accountFilter == null && styles.filterPillTextActive]}>Todas</Text>
              </TouchableOpacity>
              {activeAccounts.map((account) => (
                <TouchableOpacity
                  key={account.id}
                  style={[styles.filterPill, accountFilter === account.id && styles.filterPillActive]}
                  onPress={() => setAccountFilter(account.id)}
                >
                  <Text style={[styles.filterPillText, accountFilter === account.id && styles.filterPillTextActive]}>{account.name}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>

          <Text style={styles.filterLabel}>Categoría</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.filterPillWrap}>
              <TouchableOpacity style={[styles.filterPill, categoryFilter == null && styles.filterPillActive]} onPress={() => setCategoryFilter(null)}>
                <Text style={[styles.filterPillText, categoryFilter == null && styles.filterPillTextActive]}>Todas</Text>
              </TouchableOpacity>
              {categories.map((category) => (
                <TouchableOpacity
                  key={category.id}
                  style={[styles.filterPill, categoryFilter === category.id && styles.filterPillActive]}
                  onPress={() => setCategoryFilter(category.id)}
                >
                  <Text style={[styles.filterPillText, categoryFilter === category.id && styles.filterPillTextActive]}>{category.name}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>

          <TouchableOpacity style={[styles.toggleRow, upcomingOnly && styles.toggleRowActive]} onPress={() => setUpcomingOnly((value) => !value)}>
            <Text style={styles.toggleLabel}>Solo próximas llegadas de 30 días</Text>
            <Text style={[styles.toggleValue, upcomingOnly && styles.toggleValueActive]}>{upcomingOnly ? "Sí" : "No"}</Text>
          </TouchableOpacity>

          </ScrollView>

          <View style={styles.filterActions}>
            <Button label="Limpiar" variant="ghost" onPress={clearExtraFilters} style={styles.cancelBtn} />
            <Button label="Aplicar" onPress={() => setFilterSheetOpen(false)} style={styles.submitBtn} />
          </View>
        </Animated.View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.bg },
  content: { padding: SPACING.lg, gap: SPACING.md, paddingBottom: 120 },
  filterBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 8,
    borderRadius: RADIUS.full,
    backgroundColor: GLASS.card,
    borderWidth: 1,
    borderColor: GLASS.cardBorder,
  },
  filterBtnText: { color: COLORS.storm, fontSize: FONT_SIZE.xs, fontFamily: FONT_FAMILY.bodyMedium },
  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
    borderRadius: RADIUS.xl,
    backgroundColor: GLASS.card,
    borderWidth: 1,
    borderColor: GLASS.cardBorder,
    paddingHorizontal: SPACING.md,
  },
  searchInput: { flex: 1, color: COLORS.ink, fontSize: FONT_SIZE.md, paddingVertical: SPACING.md },
  tabRow: { flexDirection: "row", gap: SPACING.sm },
  tabChip: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.full,
    backgroundColor: "rgba(255,255,255,0.03)",
  },
  tabChipActive: { backgroundColor: COLORS.primary },
  tabChipText: { color: COLORS.storm, fontFamily: FONT_FAMILY.bodyMedium },
  tabChipTextActive: { color: "#041016" },
  swipeWrap: {
    position: "relative",
    overflow: "hidden",
    borderRadius: RADIUS.xl,
  },
  leftReveal: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: RECURRING_INCOME_SWIPE_REVEAL,
    backgroundColor: COLORS.primary + "16",
    justifyContent: "center",
    alignItems: "center",
    borderTopRightRadius: RADIUS.xl,
    borderBottomRightRadius: RADIUS.xl,
  },
  rightActionsPanel: {
    position: "absolute",
    right: 0,
    top: 0,
    bottom: 0,
    width: RECURRING_INCOME_ACTION_PANEL_W,
    flexDirection: "row",
    backgroundColor: GLASS.card,
    borderTopLeftRadius: RADIUS.xl,
    borderBottomLeftRadius: RADIUS.xl,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: GLASS.cardBorder,
  },
  swipeActionInner: {
    flex: 1,
    width: "100%",
    justifyContent: "center",
    alignItems: "center",
    gap: 4,
  },
  swipeActionLabel: {
    fontSize: FONT_SIZE.xs,
    fontFamily: FONT_FAMILY.bodySemibold,
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
  itemCard: { gap: SPACING.xs },
  itemHeader: { flexDirection: "row", gap: SPACING.md },
  itemTitleWrap: { flex: 1, gap: 4 },
  itemTitle: { color: COLORS.ink, fontFamily: FONT_FAMILY.heading, fontSize: FONT_SIZE.lg },
  itemMeta: { color: COLORS.storm, fontSize: FONT_SIZE.xs },
  amountRow: { gap: 4 },
  amountValue: { color: COLORS.primary, fontFamily: FONT_FAMILY.heading, fontSize: 24 },
  expectedDate: { color: COLORS.storm, fontSize: FONT_SIZE.sm },
  statusBadge: {
    alignSelf: "flex-start",
    paddingHorizontal: SPACING.sm,
    paddingVertical: 6,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.primary + "20",
  },
  statusBadgeMuted: { backgroundColor: COLORS.storm + "20" },
  statusBadgeText: { color: COLORS.primary, fontSize: FONT_SIZE.xs, fontFamily: FONT_FAMILY.bodySemibold },
  statusBadgeTextMuted: { color: COLORS.storm },
  metaWrap: { flexDirection: "row", gap: SPACING.xs, flexWrap: "wrap" },
  metaChip: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: 6,
    borderRadius: RADIUS.full,
    backgroundColor: "rgba(255,255,255,0.04)",
    color: COLORS.storm,
    fontSize: FONT_SIZE.xs,
    overflow: "hidden",
  } as any,
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.52)", justifyContent: "flex-end" },
  arrivalSheet: {
    backgroundColor: COLORS.bg,
    margin: SPACING.lg,
    borderRadius: RADIUS.xl,
    padding: SPACING.lg,
    gap: SPACING.md,
    borderWidth: 1,
    borderColor: GLASS.cardBorder,
  } as any,
  arrivalTitle: { color: COLORS.ink, fontFamily: FONT_FAMILY.heading, fontSize: FONT_SIZE.xl },
  arrivalSubtitle: { color: COLORS.storm, fontSize: FONT_SIZE.sm },
  notesInput: {
    minHeight: 96,
    borderRadius: RADIUS.lg,
    backgroundColor: GLASS.card,
    borderWidth: 1,
    borderColor: GLASS.cardBorder,
    padding: SPACING.md,
    color: COLORS.ink,
    textAlignVertical: "top",
  },
  arrivalActions: { flexDirection: "row", gap: SPACING.md },
  cancelBtn: { flex: 1 },
  submitBtn: { flex: 1 },
  filterSheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: COLORS.bg,
    borderTopLeftRadius: RADIUS.xl,
    borderTopRightRadius: RADIUS.xl,
    borderTopWidth: 1,
    borderColor: GLASS.cardBorder,
    padding: SPACING.lg,
    gap: SPACING.md,
    maxHeight: SCREEN_HEIGHT * 0.8,
  },
  filterSheetHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.22)",
    alignSelf: "center",
    marginBottom: SPACING.xs,
  },
  filterHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  filterTitle: { color: COLORS.ink, fontFamily: FONT_FAMILY.heading, fontSize: FONT_SIZE.lg },
  filterContent: { gap: SPACING.md, paddingBottom: SPACING.sm },
  filterLabel: { color: COLORS.storm, fontSize: FONT_SIZE.xs, textTransform: "uppercase", letterSpacing: 0.6 },
  filterPillWrap: { flexDirection: "row", flexWrap: "wrap", gap: SPACING.xs },
  filterPill: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: GLASS.cardBorder,
    backgroundColor: "rgba(255,255,255,0.03)",
  },
  filterPillActive: { borderColor: COLORS.primary, backgroundColor: COLORS.primary + "18" },
  filterPillText: { color: COLORS.storm, fontSize: FONT_SIZE.sm },
  filterPillTextActive: { color: COLORS.primary },
  toggleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderRadius: RADIUS.lg,
    backgroundColor: GLASS.card,
    borderWidth: 1,
    borderColor: GLASS.cardBorder,
    padding: SPACING.md,
  },
  toggleRowActive: { borderColor: COLORS.primary + "88" },
  toggleLabel: { color: COLORS.ink, fontSize: FONT_SIZE.sm },
  toggleValue: { color: COLORS.storm, fontFamily: FONT_FAMILY.bodySemibold },
  toggleValueActive: { color: COLORS.primary },
  filterActions: { flexDirection: "row", gap: SPACING.md, paddingBottom: SPACING.lg },
});
