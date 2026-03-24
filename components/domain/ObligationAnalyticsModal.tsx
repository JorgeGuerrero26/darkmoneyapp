import { useEffect, useMemo, useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { BlurView } from "expo-blur";
import {
  X,
  TrendingUp,
  Calendar,
  CheckCircle2,
  Clock,
  CreditCard,
  ChevronLeft,
  ChevronRight,
} from "lucide-react-native";
import { endOfMonth, format, startOfMonth, subMonths } from "date-fns";
import { es } from "date-fns/locale";

import { formatCurrency } from "../ui/AmountDisplay";
import { ProgressBar } from "../ui/ProgressBar";
import { DatePickerInput } from "../ui/DatePickerInput";
import { parseDisplayDate, todayPeru } from "../../lib/date";
import { sortObligationEventsNewestFirst } from "../../lib/sort-obligation-events";
import { COLORS, FONT_FAMILY, FONT_SIZE, GLASS, RADIUS, SPACING } from "../../constants/theme";
import { OBLIGATION_EVENT_HISTORY_PAGE_SIZE } from "../../constants/config";
import type { ObligationSummary, ObligationEventSummary, SharedObligationSummary } from "../../types/domain";
import { useObligationEventsQuery } from "../../services/queries/workspace-data";
import {
  analyticsChartSectionTitle,
  analyticsEventPaymentNoun,
  analyticsInstallmentsDoneAdj,
  analyticsPaidMetricLabel,
  analyticsPaymentCountMetricLabel,
  obligationHistoryEventColor,
  obligationProgressPaidAdjective,
} from "../../lib/obligation-viewer-labels";

function ymdToLocalDate(ymd: string): Date {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function currentMonthRangeYmd(): { from: string; to: string } {
  const today = ymdToLocalDate(todayPeru());
  return {
    from: format(startOfMonth(today), "yyyy-MM-dd"),
    to: format(endOfMonth(today), "yyyy-MM-dd"),
  };
}

type HistoryPreset = "month" | "3m" | "year" | "all" | "custom";
type ChartScope = "6" | "12" | "all";

const EVENT_LABELS: Record<string, { label: string }> = {
  payment: { label: "Pago" },
  principal_increase: { label: "Aumento principal" },
  principal_decrease: { label: "Reducción principal" },
  opening: { label: "Apertura" },
  status_change: { label: "Cambio de estado" },
  conditions_update: { label: "Actualización" },
};

type Props = {
  visible: boolean;
  obligation: ObligationSummary | SharedObligationSummary | null;
  onClose: () => void;
};

export function ObligationAnalyticsModal({ visible, obligation, onClose }: Props) {
  const [historyPreset, setHistoryPreset] = useState<HistoryPreset>("month");
  const [historyFrom, setHistoryFrom] = useState("");
  const [historyTo, setHistoryTo] = useState("");
  const [chartScope, setChartScope] = useState<ChartScope>("6");
  const [historyPageIndex, setHistoryPageIndex] = useState(0);

  useEffect(() => {
    if (!visible || !obligation) return;
    const { from, to } = currentMonthRangeYmd();
    setHistoryPreset("month");
    setHistoryFrom(from);
    setHistoryTo(to);
    setChartScope("6");
    setHistoryPageIndex(0);
  }, [visible, obligation?.id]);

  useEffect(() => {
    setHistoryPageIndex(0);
  }, [historyFrom, historyTo, historyPreset]);

  const isSharedViewer =
    obligation != null &&
    "viewerMode" in obligation &&
    (obligation as SharedObligationSummary).viewerMode === "shared_viewer";

  const {
    data: remoteEvents,
    isPending: remoteEventsPending,
    isError: remoteEventsError,
  } = useObligationEventsQuery(obligation?.id, visible && isSharedViewer);

  // Obligaciones compartidas suelen llegar sin `events`; los cargamos desde Supabase.
  const eventsForModal = useMemo(() => {
    if (!obligation) return [] as ObligationEventSummary[];
    const local = obligation.events ?? [];
    if (isSharedViewer) return remoteEvents ?? local;
    return local;
  }, [obligation, isSharedViewer, remoteEvents]);

  // Todos los hooks deben ejecutarse siempre (nunca después de `return null`).
  const paymentEvents = useMemo(() => {
    return eventsForModal
      .filter((e) => e.eventType === "payment")
      .sort((a, b) => b.eventDate.localeCompare(a.eventDate));
  }, [eventsForModal]);

  const monthlyPayments = useMemo(() => {
    const eventMonth = (e: ObligationEventSummary) => e.eventDate.slice(0, 7);

    if (chartScope === "all") {
      const keys = [...new Set(paymentEvents.map(eventMonth))].sort();
      const anchor = ymdToLocalDate(todayPeru());
      const fallbackKey = format(startOfMonth(anchor), "yyyy-MM");
      const monthKeys = keys.length > 0 ? keys : [fallbackKey];
      return monthKeys.map((key) => {
        const d = ymdToLocalDate(`${key}-01`);
        const label = format(d, "MMM yy", { locale: es });
        const total = paymentEvents.filter((e) => eventMonth(e) === key).reduce((s, e) => s + e.amount, 0);
        return { label, key, total };
      });
    }

    const n = chartScope === "12" ? 12 : 6;
    const anchor = ymdToLocalDate(todayPeru());
    const months: { label: string; key: string; total: number }[] = [];
    for (let i = n - 1; i >= 0; i--) {
      const d = startOfMonth(subMonths(anchor, i));
      const key = format(d, "yyyy-MM");
      const label = format(d, "MMM", { locale: es });
      const total = paymentEvents.filter((e) => eventMonth(e) === key).reduce((s, e) => s + e.amount, 0);
      months.push({ label, key, total });
    }
    return months;
  }, [paymentEvents, chartScope]);

  const allEventsSorted = useMemo(
    () => sortObligationEventsNewestFirst(eventsForModal),
    [eventsForModal],
  );

  const filteredHistoryEvents = useMemo(() => {
    if (historyPreset === "all") {
      return allEventsSorted;
    }
    const from = historyFrom.trim();
    const to = historyTo.trim();
    if (!from || !to) {
      return allEventsSorted;
    }
    return allEventsSorted.filter((e) => {
      const d = e.eventDate.slice(0, 10);
      return d >= from && d <= to;
    });
  }, [allEventsSorted, historyFrom, historyTo, historyPreset]);

  const historyPageSize = OBLIGATION_EVENT_HISTORY_PAGE_SIZE;
  const historyTotalPages = Math.max(1, Math.ceil(filteredHistoryEvents.length / historyPageSize));
  const historySafePage = Math.min(historyPageIndex, historyTotalPages - 1);
  const historyPageOffset = historySafePage * historyPageSize;
  const paginatedHistoryEvents = filteredHistoryEvents.slice(
    historyPageOffset,
    historyPageOffset + historyPageSize,
  );

  /**
   * Obligaciones compartidas (edge) a veces traen `principal` / `currentPrincipal` en 0 pero sí
   * `pendingAmount` y `progressPercent`. Entonces "Pagado" y "Principal" salían 0 aunque la barra
   * mostraba el % correcto. Si aplica: principal ≈ pendiente / (1 − progress/100).
   *
   * El % de avance puede redondearse o calcularse distinto que la suma de eventos; si hay cobros/pagos
   * en el historial, priorizamos **pendiente + suma(eventos)** para alinear tarjetas con el historial y el gráfico.
   */
  const analyticsAmounts = useMemo(() => {
    if (!obligation) return { currentPrincipal: 0, paidAmount: 0 };

    const pendingRaw = Number(obligation.pendingAmount);
    const safePending = Number.isFinite(pendingRaw) ? Math.max(0, pendingRaw) : 0;
    const pctRaw = Number(obligation.progressPercent);
    const pct = Number.isFinite(pctRaw) ? Math.min(100, Math.max(0, pctRaw)) : 0;

    const cp = obligation.currentPrincipalAmount;
    const p0 = obligation.principalAmount;
    const principalFromFields =
      cp != null && cp > 0 ? cp : p0 != null && p0 > 0 ? p0 : 0;

    let currentPrincipal = principalFromFields;

    if (currentPrincipal <= 0 && safePending > 0 && pct > 0 && pct < 100) {
      currentPrincipal = safePending / (1 - pct / 100);
    } else if (currentPrincipal <= 0 && safePending > 0) {
      currentPrincipal = safePending;
    }

    let paidAmount = currentPrincipal - safePending;

    const paidFromEvents = paymentEvents.reduce((s, e) => s + (Number(e.amount) || 0), 0);
    if (paidFromEvents > 0.004) {
      const paidFromBalance = Number.isFinite(paidAmount) ? paidAmount : 0;
      const noPrincipalFromApi = principalFromFields <= 0;
      const balanceVsEventsMismatch = Math.abs(paidFromBalance - paidFromEvents) > 0.05;
      if (noPrincipalFromApi || balanceVsEventsMismatch) {
        paidAmount = paidFromEvents;
        currentPrincipal = safePending + paidFromEvents;
      }
    }

    return {
      currentPrincipal: Number.isFinite(currentPrincipal) ? currentPrincipal : 0,
      paidAmount: Number.isFinite(paidAmount) ? Math.max(0, paidAmount) : 0,
    };
  }, [obligation, paymentEvents]);

  if (!obligation) return null;

  const currency = obligation.currencyCode;
  const { currentPrincipal, paidAmount } = analyticsAmounts;
  /** Coherente con las tarjetas (evita % redondeado en servidor vs suma real de eventos). */
  const displayProgressPercent =
    currentPrincipal > 0.009
      ? Math.min(100, Math.max(0, (Math.max(0, paidAmount) / currentPrincipal) * 100))
      : obligation.progressPercent;
  const isPaid = obligation.status === "paid";

  const needsChartScroll =
    chartScope === "all" && monthlyPayments.length > 6;

  const maxMonthly = Math.max(...monthlyPayments.map((m) => m.total), 1);

  const totalInstallments = obligation.installmentCount ?? 0;
  const paidInstallments = paymentEvents.length;

  function applyHistoryPreset(p: HistoryPreset) {
    setHistoryPreset(p);
    if (p === "all") {
      setHistoryFrom("");
      setHistoryTo("");
      return;
    }
    const today = ymdToLocalDate(todayPeru());
    if (p === "month") {
      setHistoryFrom(format(startOfMonth(today), "yyyy-MM-dd"));
      setHistoryTo(format(endOfMonth(today), "yyyy-MM-dd"));
      return;
    }
    if (p === "3m") {
      setHistoryFrom(format(startOfMonth(subMonths(today, 2)), "yyyy-MM-dd"));
      setHistoryTo(format(endOfMonth(today), "yyyy-MM-dd"));
      return;
    }
    if (p === "year") {
      setHistoryFrom(`${today.getFullYear()}-01-01`);
      setHistoryTo(format(endOfMonth(today), "yyyy-MM-dd"));
      return;
    }
    if (p === "custom") {
      const { from, to } = currentMonthRangeYmd();
      setHistoryFrom(from);
      setHistoryTo(to);
    }
  }

  const chartTitle = analyticsChartSectionTitle(obligation.direction, isSharedViewer, chartScope);

  const paidMetricLabel = analyticsPaidMetricLabel(obligation.direction, isSharedViewer);
  const paymentCountMetricLabel = analyticsPaymentCountMetricLabel(obligation.direction, isSharedViewer);
  const installmentsDoneAdj = analyticsInstallmentsDoneAdj(obligation.direction, isSharedViewer);
  const eventPaymentNoun = analyticsEventPaymentNoun(obligation.direction, isSharedViewer);

  const metrics = [
    {
      key: "principal",
      label: "Principal",
      value: formatCurrency(currentPrincipal, currency),
      icon: TrendingUp,
      color: COLORS.primary,
    },
    {
      key: "paid",
      label: paidMetricLabel,
      value: formatCurrency(Math.max(0, paidAmount), currency),
      icon: CheckCircle2,
      color: COLORS.income,
    },
    {
      key: "pending",
      label: "Pendiente",
      value: formatCurrency(obligation.pendingAmount, currency),
      icon: Clock,
      color: COLORS.warning,
    },
    {
      key: "paymentCount",
      label: paymentCountMetricLabel,
      value: String(obligation.paymentCount),
      icon: CreditCard,
      color: COLORS.storm,
    },
  ];

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <BlurView intensity={25} tint="dark" style={StyleSheet.absoluteFill} />
      </Pressable>

      <View style={styles.sheet} pointerEvents="box-none">
        <View style={styles.card}>
          {/* Handle */}
          <View style={styles.handle} />

          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerText}>
              <Text style={styles.title} numberOfLines={1}>{obligation.title}</Text>
              <Text style={styles.subtitle}>{obligation.counterparty}</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <X size={18} color={COLORS.storm} />
            </TouchableOpacity>
          </View>

          <ScrollView
            contentContainerStyle={styles.content}
            showsVerticalScrollIndicator={false}
          >
            {/* Progress */}
            <View style={styles.progressSection}>
              <View style={styles.progressLabels}>
                <Text style={styles.progressPct}>
                  {Math.round(displayProgressPercent)}%{" "}
                  {obligationProgressPaidAdjective(obligation.direction, isSharedViewer)}
                </Text>
                {obligation.dueDate ? (
                  <Text style={styles.dueDate}>
                    <Calendar size={11} color={COLORS.storm} /> Vence {format(parseDisplayDate(obligation.dueDate), "d MMM yyyy", { locale: es })}
                  </Text>
                ) : null}
              </View>
              <ProgressBar
                percent={displayProgressPercent}
                alertPercent={isPaid ? 101 : 90}
                height={8}
              />
              <View style={styles.progressAmounts}>
                <Text style={styles.amountSmall}>{formatCurrency(Math.max(0, paidAmount), currency)}</Text>
                <Text style={styles.amountSmall}>{formatCurrency(currentPrincipal, currency)}</Text>
              </View>
            </View>

            {/* 4 Key metrics */}
            <View style={styles.metricsGrid}>
              {metrics.map((m) => (
                <View key={m.key} style={styles.metricCard}>
                  <m.icon size={16} color={m.color} strokeWidth={2} />
                  <Text style={[styles.metricValue, { color: m.color }]}>{m.value}</Text>
                  <Text style={styles.metricLabel}>{m.label}</Text>
                </View>
              ))}
            </View>

            {/* Monthly payments chart */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>{chartTitle}</Text>
              {needsChartScroll ? (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator
                  contentContainerStyle={styles.chartScroll}
                >
                  <View style={[styles.chart, styles.chartWide]}>
                    {monthlyPayments.map((m) => (
                      <View key={m.key} style={[styles.chartBar, styles.chartBarFixed]}>
                        <View style={styles.barTrack}>
                          <View
                            style={[
                              styles.barFill,
                              { height: `${Math.round((m.total / maxMonthly) * 100)}%` as any },
                              m.total === 0 && styles.barEmpty,
                            ]}
                          />
                        </View>
                        <Text style={styles.barLabel} numberOfLines={1}>
                          {m.label}
                        </Text>
                        {m.total > 0 ? (
                          <Text style={styles.barValue} numberOfLines={1}>
                            {formatCurrency(m.total, currency).replace(/\s/g, "")}
                          </Text>
                        ) : null}
                      </View>
                    ))}
                  </View>
                </ScrollView>
              ) : (
                <View style={styles.chart}>
                  {monthlyPayments.map((m) => (
                    <View key={m.key} style={styles.chartBar}>
                      <View style={styles.barTrack}>
                        <View
                          style={[
                            styles.barFill,
                            { height: `${Math.round((m.total / maxMonthly) * 100)}%` as any },
                            m.total === 0 && styles.barEmpty,
                          ]}
                        />
                      </View>
                      <Text style={styles.barLabel} numberOfLines={1}>
                        {m.label}
                      </Text>
                      {m.total > 0 ? (
                        <Text style={styles.barValue} numberOfLines={1}>
                          {formatCurrency(m.total, currency).replace(/\s/g, "")}
                        </Text>
                      ) : null}
                    </View>
                  ))}
                </View>
              )}
              <View style={styles.pillRowWrap}>
                {(
                  [
                    { id: "6" as ChartScope, label: "6 meses" },
                    { id: "12" as ChartScope, label: "12 meses" },
                    { id: "all" as ChartScope, label: "Todo" },
                  ] as const
                ).map((opt) => (
                  <TouchableOpacity
                    key={opt.id}
                    style={[styles.filterPill, chartScope === opt.id && styles.filterPillActive]}
                    onPress={() => setChartScope(opt.id)}
                  >
                    <Text style={[styles.filterPillText, chartScope === opt.id && styles.filterPillTextActive]}>
                      {opt.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Installment grid */}
            {totalInstallments > 0 ? (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>
                  Cuotas — {paidInstallments} de {totalInstallments} {installmentsDoneAdj}
                </Text>
                <View style={styles.installmentGrid}>
                  {Array.from({ length: totalInstallments }, (_, i) => {
                    const n = i + 1;
                    const paid = n <= paidInstallments;
                    return (
                      <View
                        key={n}
                        style={[styles.installmentCell, paid ? styles.installmentPaid : styles.installmentPending]}
                      >
                        <Text style={[styles.installmentNum, { color: paid ? COLORS.pine : COLORS.storm }]}>
                          {n}
                        </Text>
                      </View>
                    );
                  })}
                </View>
              </View>
            ) : null}

            {/* Event history */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Historial de eventos</Text>
              <Text style={styles.sectionHint}>
                Por defecto solo el mes actual; amplía el rango o elige «Todo el historial».
              </Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.historyPresetRow}>
                {(
                  [
                    { id: "month" as HistoryPreset, label: "Mes actual" },
                    { id: "3m" as HistoryPreset, label: "3 meses" },
                    { id: "year" as HistoryPreset, label: "Este año" },
                    { id: "all" as HistoryPreset, label: "Todo" },
                    { id: "custom" as HistoryPreset, label: "Rango…" },
                  ] as const
                ).map((opt) => (
                  <TouchableOpacity
                    key={opt.id}
                    style={[styles.filterPill, historyPreset === opt.id && styles.filterPillActive]}
                    onPress={() => applyHistoryPreset(opt.id)}
                  >
                    <Text style={[styles.filterPillText, historyPreset === opt.id && styles.filterPillTextActive]}>
                      {opt.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
              {historyPreset === "custom" ? (
                <View style={styles.customRange}>
                  <DatePickerInput
                    label="Desde"
                    value={historyFrom}
                    onChange={(v) => {
                      setHistoryFrom(v);
                      setHistoryPreset("custom");
                    }}
                    hideLabel
                    variant="formRow"
                  />
                  <DatePickerInput
                    label="Hasta"
                    value={historyTo}
                    onChange={(v) => {
                      setHistoryTo(v);
                      setHistoryPreset("custom");
                    }}
                    hideLabel
                    variant="formRow"
                    minimumDate={historyFrom ? ymdToLocalDate(historyFrom) : undefined}
                  />
                </View>
              ) : null}
              {filteredHistoryEvents.length === 0 ? (
                <Text style={styles.emptyHistory}>
                  {isSharedViewer && remoteEventsError
                    ? "No pudimos cargar el historial. Revisa tu conexión o permisos de la cuenta compartida."
                    : isSharedViewer && remoteEventsPending && eventsForModal.length === 0
                      ? "Cargando historial…"
                      : allEventsSorted.length === 0
                        ? "Sin eventos registrados aún."
                        : "Ningún evento en este rango de fechas."}
                </Text>
              ) : (
                <>
                  {paginatedHistoryEvents.map((ev) => {
                    const tint = obligationHistoryEventColor(
                      ev.eventType,
                      obligation.direction,
                      isSharedViewer,
                    );
                    const label =
                      ev.eventType === "payment"
                        ? eventPaymentNoun
                        : (EVENT_LABELS[ev.eventType]?.label ?? ev.eventType);
                    return (
                      <View key={ev.id} style={styles.eventRow}>
                        <View style={[styles.eventDot, { backgroundColor: tint + "33", borderColor: tint + "55" }]}>
                          <View style={[styles.eventDotInner, { backgroundColor: tint }]} />
                        </View>
                        <View style={styles.eventInfo}>
                          <View style={styles.eventTopRow}>
                            <Text style={styles.eventLabel}>{label}</Text>
                            {ev.installmentNo ? (
                              <View style={styles.installmentBadge}>
                                <Text style={styles.installmentBadgeText}>Cuota {ev.installmentNo}</Text>
                              </View>
                            ) : null}
                            <Text style={[styles.eventAmount, { color: tint }]}>
                              {ev.eventType === "payment" ? "−" : ev.eventType === "principal_increase" ? "+" : ""}
                              {formatCurrency(ev.amount, currency)}
                            </Text>
                          </View>
                          {ev.description ? (
                            <Text style={styles.eventDesc}>{ev.description}</Text>
                          ) : null}
                          {ev.reason ? (
                            <Text style={styles.eventReason}>{ev.reason}</Text>
                          ) : null}
                          <Text style={styles.eventDate}>
                            {format(parseDisplayDate(ev.eventDate), "d MMM yyyy", { locale: es })}
                          </Text>
                        </View>
                      </View>
                    );
                  })}
                  {filteredHistoryEvents.length > historyPageSize ? (
                    <View style={styles.historyPager}>
                      <TouchableOpacity
                        style={[styles.historyPagerBtn, historySafePage <= 0 && styles.historyPagerBtnDisabled]}
                        disabled={historySafePage <= 0}
                        onPress={() => setHistoryPageIndex((p) => Math.max(0, p - 1))}
                        accessibilityRole="button"
                        accessibilityLabel="Página anterior del historial"
                      >
                        <ChevronLeft size={22} color={historySafePage <= 0 ? COLORS.storm : COLORS.ink} />
                      </TouchableOpacity>
                      <Text style={styles.historyPagerText}>
                        {historySafePage + 1} de {historyTotalPages} ·{" "}
                        {historyPageOffset + 1}–
                        {Math.min(historyPageOffset + historyPageSize, filteredHistoryEvents.length)} de{" "}
                        {filteredHistoryEvents.length}
                      </Text>
                      <TouchableOpacity
                        style={[
                          styles.historyPagerBtn,
                          historySafePage >= historyTotalPages - 1 && styles.historyPagerBtnDisabled,
                        ]}
                        disabled={historySafePage >= historyTotalPages - 1}
                        onPress={() =>
                          setHistoryPageIndex((p) => Math.min(historyTotalPages - 1, p + 1))
                        }
                        accessibilityRole="button"
                        accessibilityLabel="Página siguiente del historial"
                      >
                        <ChevronRight
                          size={22}
                          color={
                            historySafePage >= historyTotalPages - 1 ? COLORS.storm : COLORS.ink
                          }
                        />
                      </TouchableOpacity>
                    </View>
                  ) : null}
                </>
              )}
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.55)",
  },
  sheet: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "flex-end",
  },
  card: {
    maxHeight: "92%",
    backgroundColor: "rgba(8,12,18,0.96)",
    borderTopLeftRadius: RADIUS.xl,
    borderTopRightRadius: RADIUS.xl,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderTopColor: "rgba(255,255,255,0.18)",
    borderLeftColor: "rgba(255,255,255,0.10)",
    borderRightColor: "rgba(255,255,255,0.07)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.55,
    shadowRadius: 28,
    elevation: 20,
  },
  handle: {
    alignSelf: "center",
    width: 36,
    height: 4,
    borderRadius: RADIUS.full,
    backgroundColor: "rgba(255,255,255,0.22)",
    marginTop: SPACING.md,
    marginBottom: SPACING.xs,
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    borderBottomWidth: 0.5,
    borderBottomColor: "rgba(255,255,255,0.10)",
  },
  headerText: { flex: 1 },
  title: {
    fontFamily: FONT_FAMILY.heading,
    fontSize: FONT_SIZE.lg,
    color: COLORS.ink,
  },
  subtitle: {
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.sm,
    color: COLORS.storm,
    marginTop: 2,
  },
  closeBtn: {
    padding: SPACING.xs,
    backgroundColor: "rgba(255,255,255,0.07)",
    borderRadius: RADIUS.sm,
  },
  content: {
    padding: SPACING.lg,
    gap: SPACING.lg,
    paddingBottom: SPACING.xxxl,
  },

  // ── Progress ──
  progressSection: { gap: SPACING.xs },
  progressLabels: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  progressPct: { fontFamily: FONT_FAMILY.bodySemibold, fontSize: FONT_SIZE.sm, color: COLORS.ink },
  dueDate: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.xs, color: COLORS.storm },
  progressAmounts: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 4,
  },
  amountSmall: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.xs, color: COLORS.storm },

  // ── Metrics ──
  metricsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: SPACING.sm,
  },
  metricCard: {
    flex: 1,
    minWidth: "45%",
    backgroundColor: GLASS.card,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderTopColor: "rgba(255,255,255,0.14)",
    borderLeftColor: "rgba(255,255,255,0.08)",
    borderRightColor: "rgba(255,255,255,0.06)",
    borderBottomColor: "rgba(255,255,255,0.04)",
    padding: SPACING.md,
    gap: 4,
    alignItems: "flex-start",
  },
  metricValue: {
    fontFamily: FONT_FAMILY.heading,
    fontSize: FONT_SIZE.md,
  },
  metricLabel: {
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.xs,
    color: COLORS.storm,
  },

  // ── Section ──
  section: { gap: SPACING.sm },
  sectionTitle: {
    fontFamily: FONT_FAMILY.bodySemibold,
    fontSize: FONT_SIZE.sm,
    color: COLORS.storm,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },

  sectionHint: {
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.xs,
    color: COLORS.storm,
    lineHeight: 18,
  },
  historyPresetRow: {
    flexDirection: "row",
    gap: SPACING.xs,
    paddingVertical: SPACING.xs,
  },
  pillRowWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: SPACING.xs,
    marginTop: SPACING.sm,
  },
  filterPill: {
    paddingHorizontal: SPACING.md,
    paddingVertical: 6,
    borderRadius: RADIUS.full,
    backgroundColor: GLASS.card,
    borderWidth: 1,
    borderColor: GLASS.cardBorder,
  },
  filterPillActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  filterPillText: {
    fontSize: FONT_SIZE.xs,
    fontFamily: FONT_FAMILY.bodyMedium,
    color: COLORS.storm,
  },
  filterPillTextActive: {
    color: "#FFFFFF",
    fontFamily: FONT_FAMILY.bodySemibold,
  },
  customRange: { gap: SPACING.sm, marginTop: SPACING.xs },

  // ── Chart ──
  chartScroll: {
    flexGrow: 1,
    paddingVertical: SPACING.xs,
  },
  chart: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: SPACING.xs,
    height: 88,
    minWidth: "100%",
  },
  chartWide: {
    minWidth: undefined,
    paddingRight: SPACING.md,
  },
  chartBar: {
    flex: 1,
    minWidth: 28,
    alignItems: "center",
    gap: 3,
  },
  chartBarFixed: {
    flex: 0,
    width: 40,
  },
  barTrack: {
    flex: 1,
    width: "100%",
    justifyContent: "flex-end",
    backgroundColor: "rgba(255,255,255,0.05)",
    borderRadius: 4,
    overflow: "hidden",
  },
  barFill: {
    width: "100%",
    backgroundColor: COLORS.primary,
    borderRadius: 4,
    minHeight: 3,
  },
  barEmpty: { backgroundColor: "transparent", minHeight: 0 },
  barLabel: {
    fontFamily: FONT_FAMILY.body,
    fontSize: 10,
    color: COLORS.storm,
    textTransform: "capitalize",
  },
  barValue: {
    fontFamily: FONT_FAMILY.bodySemibold,
    fontSize: 9,
    color: COLORS.primary,
  },

  // ── Installment grid ──
  installmentGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  installmentCell: {
    width: 32,
    height: 32,
    borderRadius: RADIUS.sm,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  installmentPaid: {
    backgroundColor: COLORS.pine + "22",
    borderColor: COLORS.pine + "55",
  },
  installmentPending: {
    backgroundColor: "rgba(255,255,255,0.05)",
    borderColor: "rgba(255,255,255,0.12)",
  },
  installmentNum: {
    fontFamily: FONT_FAMILY.bodyMedium,
    fontSize: 11,
  },

  // ── Event history ──
  historyPager: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: SPACING.md,
    paddingTop: SPACING.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(255,255,255,0.12)",
    gap: SPACING.sm,
  },
  historyPagerBtn: {
    padding: SPACING.sm,
    borderRadius: RADIUS.md,
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  historyPagerBtnDisabled: {
    opacity: 0.35,
  },
  historyPagerText: {
    flex: 1,
    textAlign: "center",
    fontSize: FONT_SIZE.xs,
    fontFamily: FONT_FAMILY.bodyMedium,
    color: COLORS.storm,
  },
  emptyHistory: {
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.sm,
    color: COLORS.storm,
    textAlign: "center",
    paddingVertical: SPACING.md,
  },
  eventRow: {
    flexDirection: "row",
    gap: SPACING.sm,
    paddingVertical: SPACING.xs,
  },
  eventDot: {
    width: 20,
    height: 20,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
    flexShrink: 0,
  },
  eventDotInner: {
    width: 7,
    height: 7,
    borderRadius: RADIUS.full,
  },
  eventInfo: { flex: 1, gap: 2 },
  eventTopRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.xs,
    flexWrap: "wrap",
  },
  eventLabel: {
    fontFamily: FONT_FAMILY.bodySemibold,
    fontSize: FONT_SIZE.sm,
    color: COLORS.ink,
  },
  installmentBadge: {
    backgroundColor: COLORS.primary + "22",
    borderRadius: RADIUS.full,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  installmentBadgeText: {
    fontFamily: FONT_FAMILY.bodyMedium,
    fontSize: 10,
    color: COLORS.primary,
  },
  eventAmount: {
    fontFamily: FONT_FAMILY.heading,
    fontSize: FONT_SIZE.sm,
    marginLeft: "auto" as any,
  },
  eventDesc: {
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.xs,
    color: COLORS.ink,
  },
  eventReason: {
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.xs,
    color: COLORS.storm,
    fontStyle: "italic",
  },
  eventDate: {
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.xs,
    color: COLORS.storm,
    marginTop: 1,
  },
});
