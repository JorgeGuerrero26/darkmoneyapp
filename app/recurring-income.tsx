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
  useRecurringIncomeOccurrencesQuery,
  useUpdateRecurringIncomeMutation,
  useWorkspaceSnapshotQuery,
} from "../services/queries/workspace-data";
import type {
  RecurringIncomeFrequency,
  RecurringIncomeOccurrenceSummary,
  RecurringIncomeSummary,
} from "../types/domain";
import { ScreenHeader } from "../components/layout/ScreenHeader";
import { Card } from "../components/ui/Card";
import { EmptyState } from "../components/ui/EmptyState";
import { SkeletonCard } from "../components/ui/Skeleton";
import { FAB } from "../components/ui/FAB";
import { ConfirmDialog } from "../components/ui/ConfirmDialog";
import { RecurringIncomeForm } from "../components/forms/RecurringIncomeForm";
import { DatePickerInput } from "../components/ui/DatePickerInput";
import { Button } from "../components/ui/Button";
import { CurrencyInput } from "../components/ui/CurrencyInput";
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

type BaseChangeMode = "none" | "bonus" | "discount";

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

function parseMoneyInput(value: string) {
  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function occurrenceStatusLabel(status: RecurringIncomeOccurrenceSummary["status"]) {
  return status === "late" ? "Tardía" : "A tiempo";
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
  const [historyTarget, setHistoryTarget] = useState<RecurringIncomeSummary | null>(null);
  const { data: historyItems = [], isLoading: historyLoading } = useRecurringIncomeOccurrencesQuery(
    activeWorkspaceId,
    historyTarget?.id ?? null,
  );

  const [createFormVisible, setCreateFormVisible] = useState(false);
  const [editTarget, setEditTarget] = useState<RecurringIncomeSummary | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<RecurringIncomeSummary | null>(null);
  const [arrivalTarget, setArrivalTarget] = useState<RecurringIncomeSummary | null>(null);
  const [arrivalDate, setArrivalDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [arrivalAmount, setArrivalAmount] = useState("");
  const [arrivalAccountId, setArrivalAccountId] = useState<number | null>(null);
  const [arrivalBaseChangeMode, setArrivalBaseChangeMode] = useState<BaseChangeMode>("none");
  const [arrivalNewBaseAmount, setArrivalNewBaseAmount] = useState("");
  const [arrivalNotes, setArrivalNotes] = useState("");
  const [arrivalError, setArrivalError] = useState("");
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
  const arrivalSelectedAccount = arrivalAccountId != null
    ? activeAccounts.find((account) => account.id === arrivalAccountId) ?? null
    : null;
  const parsedArrivalAmount = parseMoneyInput(arrivalAmount);
  const parsedArrivalNewBaseAmount = parseMoneyInput(arrivalNewBaseAmount);
  const arrivalBaseDelta = arrivalTarget && parsedArrivalNewBaseAmount != null
    ? parsedArrivalNewBaseAmount - arrivalTarget.amount
    : null;

  function openConfirmArrival(item: RecurringIncomeSummary) {
    setArrivalTarget(item);
    setArrivalDate(format(new Date(), "yyyy-MM-dd"));
    setArrivalAmount(String(item.amount));
    setArrivalAccountId(item.accountId ?? null);
    setArrivalBaseChangeMode("none");
    setArrivalNewBaseAmount(String(item.amount));
    setArrivalNotes("");
    setArrivalError("");
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
    const actualAmount = parseMoneyInput(arrivalAmount);
    if (!arrivalDate.trim()) {
      setArrivalError("La fecha real de llegada es obligatoria.");
      return;
    }
    if (actualAmount == null) {
      setArrivalError("Ingresa un monto real mayor a 0.");
      return;
    }
    if (arrivalAccountId == null) {
      setArrivalError("Elige la cuenta destino para registrar el movimiento.");
      return;
    }
    let nextBaseAmount: number | null = null;
    if (arrivalBaseChangeMode !== "none") {
      nextBaseAmount = parseMoneyInput(arrivalNewBaseAmount);
      if (nextBaseAmount == null) {
        setArrivalError("Ingresa el nuevo monto base para las próximas llegadas.");
        return;
      }
      if (arrivalBaseChangeMode === "bonus" && nextBaseAmount <= arrivalTarget.amount) {
        setArrivalError("Si hubo bonificación permanente, el nuevo monto base debe ser mayor al actual.");
        return;
      }
      if (arrivalBaseChangeMode === "discount" && nextBaseAmount >= arrivalTarget.amount) {
        setArrivalError("Si hubo descuento permanente, el nuevo monto base debe ser menor al actual.");
        return;
      }
    }

    try {
      setArrivalError("");
      await confirmArrivalMutation.mutateAsync({
        recurringIncomeId: arrivalTarget.id,
        recurringIncomeName: arrivalTarget.name,
        expectedDate: arrivalTarget.nextExpectedDate,
        actualDate: arrivalDate,
        amount: actualAmount,
        accountId: arrivalAccountId,
        currentAccountId: arrivalTarget.accountId ?? null,
        categoryId: arrivalTarget.categoryId ?? null,
        payerPartyId: arrivalTarget.payerPartyId ?? null,
        description: arrivalTarget.description ?? null,
        currencyCode: arrivalTarget.currencyCode,
        frequency: arrivalTarget.frequency,
        intervalCount: arrivalTarget.intervalCount,
        currentBaseAmount: arrivalTarget.amount,
        newBaseAmount: nextBaseAmount,
        baseChangeKind: arrivalBaseChangeMode === "none" ? null : arrivalBaseChangeMode,
        notes: arrivalNotes.trim() || null,
      });
      setArrivalTarget(null);
      showToast("Llegada confirmada", "success");
    } catch (error) {
      setArrivalError(error instanceof Error ? error.message : "No pudimos confirmar la llegada");
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

              <View style={styles.cardActionsRow}>
                <TouchableOpacity
                  style={styles.inlineActionChip}
                  onPress={() => setHistoryTarget(item)}
                  activeOpacity={0.85}
                >
                  <Text style={styles.inlineActionText}>Ver historial</Text>
                </TouchableOpacity>
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
        onRequestClose={() => {
          setArrivalTarget(null);
          setArrivalError("");
        }}
      >
        <Pressable
          style={styles.overlay}
          onPress={() => {
            setArrivalTarget(null);
            setArrivalError("");
          }}
        >
          <View style={styles.arrivalSheet} onStartShouldSetResponder={() => true}>
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.arrivalSheetContent}>
              <Text style={styles.arrivalTitle}>Confirmar llegada</Text>
              {arrivalTarget ? (
                <>
                  <Text style={styles.arrivalSubtitle}>
                    {arrivalTarget.name} · Programado para {formatYmdLocal(arrivalTarget.nextExpectedDate, "d MMM yyyy")}
                  </Text>
                  <View style={styles.arrivalSummaryCard}>
                    <Text style={styles.arrivalSummaryTitle}>Monto base actual</Text>
                    <Text style={styles.arrivalSummaryAmount}>
                      {formatCurrency(arrivalTarget.amount, arrivalTarget.currencyCode)}
                    </Text>
                    <Text style={styles.arrivalSummaryBody}>
                      Este es el monto fijo que hoy usa el sistema para futuras llegadas.
                    </Text>
                  </View>

                  <DatePickerInput label="Fecha real de llegada" value={arrivalDate} onChange={setArrivalDate} />

                  <CurrencyInput
                    label="Monto real recibido"
                    value={arrivalAmount}
                    onChangeText={setArrivalAmount}
                    currencyCode={arrivalTarget.currencyCode}
                  />

                  <View style={styles.arrivalSection}>
                    <Text style={styles.arrivalSectionLabel}>Cuenta destino del movimiento</Text>
                    {arrivalTarget.accountId ? (
                      <View style={styles.arrivalInfoCard}>
                        <Text style={styles.arrivalInfoBody}>
                          El movimiento se registrará en {arrivalTarget.accountName ?? "la cuenta configurada"}.
                        </Text>
                      </View>
                    ) : (
                      <>
                        <Text style={styles.arrivalHelper}>
                          Este ingreso fijo no tiene cuenta base. Elige una ahora para registrar el movimiento y la guardaremos para próximas llegadas.
                        </Text>
                        {activeAccounts.length > 0 ? (
                          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                            <View style={styles.filterPillWrap}>
                              {activeAccounts.map((account) => (
                                <TouchableOpacity
                                  key={account.id}
                                  style={[styles.filterPill, arrivalAccountId === account.id && styles.filterPillActive]}
                                  onPress={() => setArrivalAccountId(account.id)}
                                >
                                  <Text style={[styles.filterPillText, arrivalAccountId === account.id && styles.filterPillTextActive]}>
                                    {account.name}
                                  </Text>
                                </TouchableOpacity>
                              ))}
                            </View>
                          </ScrollView>
                        ) : (
                          <View style={styles.arrivalInfoCard}>
                            <Text style={styles.arrivalInfoBody}>
                              No hay cuentas activas disponibles. Primero crea o reactiva una cuenta para poder registrar este ingreso como movimiento.
                            </Text>
                          </View>
                        )}
                      </>
                    )}
                  </View>

                  <View style={styles.arrivalSection}>
                    <Text style={styles.arrivalSectionLabel}>Cambio de monto base desde ahora</Text>
                    <Text style={styles.arrivalHelper}>
                      Si este ingreso cambió de forma permanente, indícalo aquí para que las próximas llegadas usen el nuevo base.
                    </Text>
                    <View style={styles.filterPillWrap}>
                      {[
                        { key: "none" as const, label: "Sin cambio" },
                        { key: "bonus" as const, label: "Bonificación" },
                        { key: "discount" as const, label: "Descuento" },
                      ].map((option) => (
                        <TouchableOpacity
                          key={option.key}
                          style={[styles.filterPill, arrivalBaseChangeMode === option.key && styles.filterPillActive]}
                          onPress={() => setArrivalBaseChangeMode(option.key)}
                        >
                          <Text style={[styles.filterPillText, arrivalBaseChangeMode === option.key && styles.filterPillTextActive]}>
                            {option.label}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>

                    {arrivalBaseChangeMode !== "none" ? (
                      <>
                        <CurrencyInput
                          label="Nuevo monto base para próximas llegadas"
                          value={arrivalNewBaseAmount}
                          onChangeText={setArrivalNewBaseAmount}
                          currencyCode={arrivalTarget.currencyCode}
                        />
                        <View style={styles.arrivalInfoCard}>
                          <Text style={styles.arrivalInfoBody}>
                            Base actual: {formatCurrency(arrivalTarget.amount, arrivalTarget.currencyCode)}
                          </Text>
                          <Text style={styles.arrivalInfoBody}>
                            Nuevo base: {parsedArrivalNewBaseAmount != null
                              ? formatCurrency(parsedArrivalNewBaseAmount, arrivalTarget.currencyCode)
                              : "Pendiente"}
                          </Text>
                          <Text style={styles.arrivalInfoBody}>
                            Cambio: {arrivalBaseDelta == null
                              ? "Pendiente"
                              : `${arrivalBaseDelta >= 0 ? "+" : "-"}${formatCurrency(Math.abs(arrivalBaseDelta), arrivalTarget.currencyCode)}`}
                          </Text>
                        </View>
                      </>
                    ) : null}
                  </View>

                  <TextInput
                    style={styles.notesInput}
                    multiline
                    value={arrivalNotes}
                    onChangeText={setArrivalNotes}
                    placeholder="Notas (opcional)"
                    placeholderTextColor={COLORS.textDisabled}
                  />

                  {arrivalError ? <Text style={styles.arrivalErrorText}>{arrivalError}</Text> : null}

                  <View style={styles.arrivalActions}>
                    <Button
                      label="Cancelar"
                      variant="ghost"
                      onPress={() => {
                        setArrivalTarget(null);
                        setArrivalError("");
                      }}
                      style={styles.cancelBtn}
                    />
                    <Button
                      label="Confirmar y crear movimiento"
                      onPress={handleConfirmArrival}
                      loading={confirmArrivalMutation.isPending}
                      style={styles.submitBtn}
                    />
                  </View>
                </>
              ) : null}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>

      <Modal
        visible={Boolean(historyTarget)}
        transparent
        animationType="fade"
        onRequestClose={() => setHistoryTarget(null)}
      >
        <Pressable style={styles.overlay} onPress={() => setHistoryTarget(null)}>
          <View style={styles.arrivalSheet} onStartShouldSetResponder={() => true}>
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.arrivalSheetContent}>
              <Text style={styles.arrivalTitle}>Historial de llegadas</Text>
              {historyTarget ? (
                <Text style={styles.arrivalSubtitle}>
                  {historyTarget.name} · Base actual {formatCurrency(historyTarget.amount, historyTarget.currencyCode)}
                </Text>
              ) : null}

              {historyLoading ? (
                <SkeletonCard style={{ minHeight: 120 }} />
              ) : historyItems.length === 0 ? (
                <View style={styles.arrivalInfoCard}>
                  <Text style={styles.arrivalInfoBody}>
                    Aún no hay llegadas confirmadas para este ingreso fijo.
                  </Text>
                </View>
              ) : (
                historyItems.map((occurrence) => (
                  <View key={occurrence.id} style={styles.historyCard}>
                    <View style={styles.historyHeader}>
                      <Text style={styles.historyAmount}>
                        {formatCurrency(occurrence.amount, occurrence.currencyCode)}
                      </Text>
                      <View
                        style={[
                          styles.historyStatusBadge,
                          occurrence.status === "late" && styles.historyStatusBadgeLate,
                        ]}
                      >
                        <Text
                          style={[
                            styles.historyStatusText,
                            occurrence.status === "late" && styles.historyStatusTextLate,
                          ]}
                        >
                          {occurrenceStatusLabel(occurrence.status)}
                        </Text>
                      </View>
                    </View>
                    <Text style={styles.historyDates}>
                      Esperada: {formatYmdLocal(occurrence.expectedDate, "d MMM yyyy")} · Llegó: {formatYmdLocal(occurrence.actualDate, "d MMM yyyy")}
                    </Text>
                    {occurrence.notes?.trim() ? (
                      <Text style={styles.historyNotes}>{occurrence.notes.trim()}</Text>
                    ) : null}
                    {occurrence.movementId ? (
                      <TouchableOpacity
                        style={styles.inlineActionChip}
                        onPress={() => {
                          const movementId = occurrence.movementId;
                          setHistoryTarget(null);
                          router.push(`/movement/${movementId}`);
                        }}
                        activeOpacity={0.85}
                      >
                        <Text style={styles.inlineActionText}>Ver movimiento</Text>
                      </TouchableOpacity>
                    ) : null}
                  </View>
                ))
              )}

              <View style={styles.arrivalActions}>
                <Button label="Cerrar" variant="ghost" onPress={() => setHistoryTarget(null)} style={styles.cancelBtn} />
              </View>
            </ScrollView>
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
  cardActionsRow: { flexDirection: "row", marginTop: SPACING.xs },
  metaChip: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: 6,
    borderRadius: RADIUS.full,
    backgroundColor: "rgba(255,255,255,0.04)",
    color: COLORS.storm,
    fontSize: FONT_SIZE.xs,
    overflow: "hidden",
  } as any,
  inlineActionChip: {
    alignSelf: "flex-start",
    paddingHorizontal: SPACING.sm + 2,
    paddingVertical: 7,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: COLORS.primary + "55",
    backgroundColor: COLORS.primary + "14",
  },
  inlineActionText: {
    color: COLORS.primary,
    fontSize: FONT_SIZE.xs,
    fontFamily: FONT_FAMILY.bodySemibold,
  },
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.52)", justifyContent: "flex-end" },
  arrivalSheet: {
    backgroundColor: COLORS.bg,
    margin: SPACING.lg,
    borderRadius: RADIUS.xl,
    padding: SPACING.lg,
    borderWidth: 1,
    borderColor: GLASS.cardBorder,
    maxHeight: SCREEN_HEIGHT * 0.84,
  } as any,
  arrivalSheetContent: { gap: SPACING.md },
  arrivalTitle: { color: COLORS.ink, fontFamily: FONT_FAMILY.heading, fontSize: FONT_SIZE.xl },
  arrivalSubtitle: { color: COLORS.storm, fontSize: FONT_SIZE.sm },
  arrivalSummaryCard: {
    gap: SPACING.xs,
    padding: SPACING.md,
    borderRadius: RADIUS.lg,
    backgroundColor: COLORS.primary + "12",
    borderWidth: 1,
    borderColor: COLORS.primary + "32",
  },
  arrivalSummaryTitle: {
    color: COLORS.storm,
    fontSize: FONT_SIZE.xs,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  arrivalSummaryAmount: {
    color: COLORS.primary,
    fontFamily: FONT_FAMILY.heading,
    fontSize: FONT_SIZE.xl,
  },
  arrivalSummaryBody: {
    color: COLORS.storm,
    fontSize: FONT_SIZE.xs,
    lineHeight: 18,
  },
  arrivalSection: { gap: SPACING.sm },
  arrivalSectionLabel: {
    color: COLORS.ink,
    fontSize: FONT_SIZE.sm,
    fontFamily: FONT_FAMILY.bodySemibold,
  },
  arrivalHelper: {
    color: COLORS.storm,
    fontSize: FONT_SIZE.xs,
    lineHeight: 18,
  },
  arrivalInfoCard: {
    gap: SPACING.xs,
    padding: SPACING.md,
    borderRadius: RADIUS.lg,
    backgroundColor: GLASS.card,
    borderWidth: 1,
    borderColor: GLASS.cardBorder,
  },
  arrivalInfoBody: {
    color: COLORS.storm,
    fontSize: FONT_SIZE.xs,
    lineHeight: 18,
  },
  historyCard: {
    gap: SPACING.xs,
    padding: SPACING.md,
    borderRadius: RADIUS.lg,
    backgroundColor: GLASS.card,
    borderWidth: 1,
    borderColor: GLASS.cardBorder,
  },
  historyHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: SPACING.sm,
  },
  historyAmount: {
    color: COLORS.ink,
    fontSize: FONT_SIZE.md,
    fontFamily: FONT_FAMILY.bodySemibold,
  },
  historyStatusBadge: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: 5,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.primary + "18",
  },
  historyStatusBadgeLate: {
    backgroundColor: COLORS.gold + "18",
  },
  historyStatusText: {
    color: COLORS.primary,
    fontSize: FONT_SIZE.xs,
    fontFamily: FONT_FAMILY.bodySemibold,
  },
  historyStatusTextLate: {
    color: COLORS.gold,
  },
  historyDates: {
    color: COLORS.storm,
    fontSize: FONT_SIZE.xs,
    lineHeight: 18,
  },
  historyNotes: {
    color: COLORS.ink,
    fontSize: FONT_SIZE.xs,
    lineHeight: 18,
  },
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
  arrivalErrorText: {
    color: COLORS.danger,
    fontSize: FONT_SIZE.xs,
    lineHeight: 18,
    fontFamily: FONT_FAMILY.bodyMedium,
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
