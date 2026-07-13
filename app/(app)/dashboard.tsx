import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useFocusEffect, useLocalSearchParams } from "expo-router";
import {
  Animated,
  Easing,
  Image,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  InteractionManager,
} from "react-native";
import { useRouter } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { STALE } from "../../lib/query-client";
import { supabase } from "../../lib/supabase";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  format,
  startOfMonth,
  endOfMonth,
  subMonths,
  subDays,
  startOfDay,
  endOfDay,
  startOfWeek,
  addDays,
  getDay,
  differenceInDays,
} from "date-fns";
import { es } from "date-fns/locale";
import {
  AlertTriangle, AlertCircle, Clock, Tag, ArrowRight, Bell, Banknote,
  Brain, Lock, Sparkles, Target, TrendingUp, X, Eye, EyeOff,
  type LucideIcon,
} from "lucide-react-native";

import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import { useAuth } from "../../lib/auth-context";
import { useWorkspace, useWorkspaceListStore } from "../../lib/workspace-context";
import {
  useWorkspaceSnapshotQuery,
  useDashboardMovementsQuery,
  useDashboardAnalyticsQuery,
  usePersistDashboardAnalyticsMutation,
  usePersistLearningFeedbackMutation,
  useUpdateMovementMutation,
  useNotificationsQuery,
  useDashboardAiFlowMutation,
  useDashboardAiHealthMutation,
  useDashboardAiHistoryMutation,
  useDashboardAiPatternsMutation,
  useDashboardAiSummaryMutation,
  type DashboardMovementRow,
  type DashboardAnalyticsBundle,
} from "../../services/queries/workspace-data";
import {
  useSharedObligationsQuery,
  mergeWorkspaceAndSharedObligations,
} from "../../services/queries/obligations";
import { useBudgetScopeMovementsQuery } from "../../services/queries/budget-analytics";
import type { BudgetOverview, ExchangeRateSummary, SubscriptionSummary } from "../../types/domain";
import { useUiStore } from "../../store/ui-store";
import { Card } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { ProgressBar } from "../../components/ui/ProgressBar";
import { SkeletonCard, SkeletonList } from "../../components/ui/Skeleton";
import { ScreenHeader } from "../../components/layout/ScreenHeader";
import { formatCurrency } from "../../components/ui/AmountDisplay";
import { MovementForm } from "../../components/forms/MovementForm";
import { BottomSheet } from "../../components/ui/BottomSheet";
import { WorkspaceSelector } from "../../components/layout/WorkspaceSelector";
import { COLORS, ELEVATION, FONT_FAMILY, FONT_SIZE, RADIUS, SPACING, SURFACE } from "../../constants/theme";
import { FAB } from "../../components/ui/FAB";
import { ConfirmDialog } from "../../components/ui/ConfirmDialog";
import { DayMovementsSheet, type DaySheetMode } from "../../components/dashboard/DayMovementsSheet";
import {
  movementActsAsExpense,
  movementActsAsIncome,
  movementDisplayAccountId,
  movementDisplayAmount,
} from "../../lib/movement-display";
import { getAccountIcon } from "../../lib/account-icons";
import { parseDisplayDate } from "../../lib/date";
import {
  applyBudgetComputedMetrics,
  buildBudgetMetricsMap,
} from "../../lib/budget-metrics";
import { RingChart, type RingSegment } from "../../components/ui/RingChart";
import { SparkLine } from "../../components/ui/SparkLine";
import { ErrorBoundary } from "../../components/ui/ErrorBoundary";
import { useToast } from "../../hooks/useToast";
import { MarkSubscriptionPaidSheet } from "../../features/subscriptions/components/MarkSubscriptionPaidSheet";
import { RecurringIncomeArrivalSheet } from "../../features/recurring-income/components/RecurringIncomeArrivalSheet";
import { useArrivalSheetController } from "../../features/recurring-income/lib/useArrivalSheetController";
import { useMarkSubscriptionPaidMutation } from "../../services/queries/subscriptions-recurring-income";
import { buildCategorySuggestionCandidates } from "../../services/analytics/category-suggestions";
import { detectMovementAnomalies } from "../../services/analytics/anomaly-detection";
import { simulateMonthEndCashflow } from "../../services/analytics/cashflow-forecast";
import { findProbableDuplicateGroups } from "../../services/analytics/duplicate-detection";
import { buildFinancialGraphRank, type FinancialGraphRankNode } from "../../services/analytics/financial-graph";
import { buildFocusActionRanking } from "../../services/analytics/focus-scoring";
import { buildHistoryFactorAnalysis } from "../../services/analytics/history-factor-analysis";
import { detectHistoryChangePoint } from "../../services/analytics/history-change-points";
import { clusterHistoryMonths } from "../../services/analytics/month-clustering";
import { buildPaymentOptimizationPlan, type PaymentOptimizationRecommendation } from "../../services/analytics/payment-optimization";
import { buildPatternClusters } from "../../services/analytics/pattern-clustering";
import { normalizeAnalyticsText } from "../../services/analytics/movement-features";
import { useBcrpMacroIndicatorsQuery } from "../../services/queries/bcrp-data";
import { LinearGradient } from "expo-linear-gradient";

// --- Constants & helpers (extraídos a features/dashboard/lib) -----------------

import {
  isAdvancedDashboardGiftEmail,
  DASHBOARD_AI_FLOW_CACHE_KEY_PREFIX,
  DASHBOARD_AI_HEALTH_CACHE_KEY_PREFIX,
  DASHBOARD_AI_HISTORY_CACHE_KEY_PREFIX,
  DASHBOARD_AI_PATTERNS_CACHE_KEY_PREFIX,
  DASHBOARD_AI_SUMMARY_CACHE_KEY_PREFIX,
  DASHBOARD_AI_TONE_KEY_PREFIX,
  DASHBOARD_CURRENCY_KEY,
  PERIOD_LABELS,
  UPCOMING_DAYS,
} from "../../features/dashboard/lib/constants";
import type {
  ConversionCtx,
  DashboardChartDay,
  Period,
} from "../../features/dashboard/lib/types";
import {
  buildExchangeRateMap,
  convertAmt,
  expenseAmt,
  getPeriodBounds,
  inRange,
  incomeAmt,
  isCategorizedCashflow,
  isExpense,
  isIncome,
  isTransfer,
  movementPreviewActionLabel,
  pctChange,
  resolveRate,
  sortMovementsRecentFirst,
  transferAmt,
} from "../../features/dashboard/lib/aggregations";

import {
  getDashboardAiFlowCacheKey,
  getDashboardAiHealthCacheKey,
  getDashboardAiHistoryCacheKey,
  getDashboardAiPatternsCacheKey,
  getDashboardAiSummaryCacheKey,
  getDashboardAiToneKey,
  getDashboardAiUsageDate,
} from "../../features/dashboard/lib/ai-cache-keys";

// --- Stats --------------------------------------------------------------------

import { useDashboardStats } from "../../features/dashboard/hooks/useDashboardStats";
import { useDashboardRealtimeSync } from "../../features/dashboard/hooks/useDashboardRealtimeSync";
import { useDashboardEntitlement } from "../../features/dashboard/hooks/useDashboardEntitlement";
import { DashboardSectionBoundary } from "../../features/dashboard/components/shared/DashboardSectionBoundary";

// DashboardReviewInbox/FutureFlowWindow + builders extraídos a features/dashboard/lib/dashboard-builders.ts

import {
  type DashboardAnomalyFinding,
  type DashboardCategorySuggestion,
  type DashboardProjectionModel,
  type ExplanationTone,
  type MovementPreviewSheetState,
  explanationToneLabel,
} from "../../features/dashboard/lib/advanced-types";
import {
  buildAnomalyFindings,
  buildCategorySuggestions,
  buildLearningFeedbackCategorySuggestions,
  buildMonthProjectionModel,
} from "../../features/dashboard/lib/advanced-builders";


// --- Sub-components -----------------------------------------------------------

import { SectionTitle } from "../../features/dashboard/components/simple/SectionTitle";
import { MacroContextCard } from "../../features/dashboard/components/simple/MacroContextCard";
import { ModeToggle } from "../../features/dashboard/components/simple/ModeToggle";
import { HeroCard } from "../../features/dashboard/components/simple/HeroCard";
import { MiniBarChart } from "../../features/dashboard/components/simple/MiniBarChart";
import { AccountsScroll } from "../../features/dashboard/components/simple/AccountsScroll";
import { UpcomingSection } from "../../features/dashboard/components/simple/UpcomingSection";
import { UrgentAlertsCard } from "../../features/dashboard/components/simple/UrgentAlertsCard";
import { useDismissedDashboardAlerts } from "../../hooks/useDismissedDashboardAlerts";
import { BudgetsSection } from "../../features/dashboard/components/simple/BudgetsSection";
import { LeadersRow } from "../../features/dashboard/components/simple/LeadersRow";
import { CategoryComparison } from "../../features/dashboard/components/simple/CategoryComparison";
import { AccountsBreakdown } from "../../features/dashboard/components/simple/AccountsBreakdown";
import { SavingsTrendCard } from "../../features/dashboard/components/simple/SavingsTrendCard";
import { ReviewInbox } from "../../features/dashboard/components/simple/ReviewInbox";
import { FutureFlowPreview } from "../../features/dashboard/components/simple/FutureFlowPreview";
import { ProjectionFormulaBreakdown } from "../../features/dashboard/components/simple/ProjectionFormulaBreakdown";
import { GettingStartedCard } from "../../features/dashboard/components/simple/GettingStartedCard";
import {
  buildFutureFlowWindows,
  buildReviewInboxSnapshot,
  convertDashboardCurrency,
  type DashboardReviewInbox,
  type FutureFlowWindow,
} from "../../features/dashboard/lib/dashboard-builders";

// MacroContextCard, ModeToggle, useCountUp, HeroCard, FlowRow/FlowCard, MiniBarChart extraídos a features/dashboard/

// MiniBarChart extraído a features/dashboard/components/simple/MiniBarChart.tsx

// ChronologyStrip / AccountsScroll / UpcomingSection / UrgentAlertsCard extraídos a features/dashboard/components/simple/

// BudgetsSection / LeadersRow / CategoryComparison / AccountsBreakdown / SavingsTrendCard extraídos a features/dashboard/components/simple/

// ReviewInbox / FutureFlowPreview / ProjectionFormulaBreakdown extraídos a features/dashboard/components/simple/

// ExplanationTone + explanationToneLabel extraídos a features/dashboard/lib/advanced-types.ts

import {
  ExplanationActions,
  ExplanationIntro,
  ExplanationResult,
  ExplanationSection,
  ExplanationVisualSummary,
} from "../../features/dashboard/components/advanced/ExplanationCard";

import { LearningPanel } from "../../features/dashboard/components/advanced/LearningPanel";
import { ProCommandCenter } from "../../features/dashboard/components/advanced/ProCommandCenter";

import {
  CategoryBreakdown,
  MonthlyPulse,
  ObligationsSection,
  SubscriptionsSummary,
} from "../../features/dashboard/components/advanced/AdvancedSections";

import {
  AlertCenter,
  HealthScore,
  ObligationWatch,
  PaymentOptimizationCard,
} from "../../features/dashboard/components/advanced/HealthAndAlerts";

import {
  ActivityTimeline,
  AdvancedGiftCard,
  AlgorithmReadinessCard,
  AnomalyWatch,
  CurrencyExposure,
  DashboardLayerHeader,
  DataQuality,
  FinancialGraphCard,
  PeriodRadar,
  TransferSnapshot,
  WeeklyPattern,
} from "../../features/dashboard/components/advanced/AdvancedCards";

import {
  AnnualHistoryPanel,
  CategoryDonutChart,
  ProjectionBridgeChart,
  SavingsMomentumChart,
  type AnnualHistoryMonth,
} from "../../features/dashboard/components/advanced/DashboardCharts";
import {
  ADVANCED_TABS,
  DashboardTabBar,
  type AdvancedTab,
  type TabIndicator,
} from "../../features/dashboard/components/advanced/DashboardTabBar";
import {
  DASHBOARD_AI_TONE_OPTIONS,
  GEMINI_BRAND,
  buildDashboardAiTextParts,
  ensureDashboardAiComplexTerms,
  type DashboardAiComplexTerm,
  type DashboardAiDailyCache,
  type DashboardAiTextPart,
  type DashboardAiTone,
  type DashboardAiToneResponse,
} from "../../features/dashboard/lib/dashboard-ai-content";

import { AdvancedDashboard } from "../../features/dashboard/components/advanced/AdvancedDashboard";

const PRO_GATE_FEATURES = [
  { icon: TrendingUp, label: "Flujo y salud financiera en profundidad" },
  { icon: Target,     label: "Radar de calidad y métricas avanzadas" },
  { icon: Brain,      label: "Aprendizaje inteligente de patrones" },
  { icon: Sparkles,   label: "Widgets personalizables y presets" },
];

function ProGate() {
  return (
    <View style={subStyles.proGate}>
      <View style={subStyles.proGateHeader}>
        <View style={subStyles.proGateIconWrapLg}>
          <Lock size={22} color={COLORS.gold} strokeWidth={1.8} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: SPACING.sm }}>
            <Text style={subStyles.proGateTitleLg}>Dashboard Avanzado</Text>
            <View style={subStyles.proGateBadge}>
              <Text style={subStyles.proGateBadgeText}>PRO</Text>
            </View>
          </View>
          <Text style={subStyles.proGateBody}>Análisis en profundidad disponible solo en el plan PRO</Text>
        </View>
      </View>
      <View style={subStyles.proGateFeatures}>
        {PRO_GATE_FEATURES.map(({ icon: Icon, label }) => (
          <View key={label} style={subStyles.proGateFeatureRow}>
            <Icon size={13} color={COLORS.gold} strokeWidth={2} />
            <Text style={subStyles.proGateFeatureText}>{label}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

// --- Main screen --------------------------------------------------------------

function ProGateLoading() {
  return (
    <View style={[subStyles.proGate, { flexDirection: "row", alignItems: "center" }]}>
      <View style={subStyles.proGateIconWrap}>
        <Lock size={16} color={COLORS.storm} strokeWidth={1.8} />
      </View>
      <View style={subStyles.proGateText}>
        <Text style={subStyles.proGateTitle}>Dashboard Avanzado</Text>
        <Text style={subStyles.proGateBody}>Verificando acceso...</Text>
      </View>
      <View style={[subStyles.proGateBadge, subStyles.proGateBadgeMuted]}>
        <Text style={[subStyles.proGateBadgeText, { color: COLORS.storm }]}>PRO</Text>
      </View>
    </View>
  );
}

function DashboardScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { profile, session, signOut } = useAuth();
  const { activeWorkspaceId, activeWorkspace, setWorkspaces } = useWorkspace();
  const dismissedAlerts = useDismissedDashboardAlerts(activeWorkspaceId);

  useDashboardRealtimeSync({ workspaceId: activeWorkspaceId });

  const { showToast } = useToast();
  const markPaidMutation = useMarkSubscriptionPaidMutation(activeWorkspaceId);
  const [dashboardPayTarget, setDashboardPayTarget] = useState<SubscriptionSummary | null>(null);
  const arrival = useArrivalSheetController(activeWorkspaceId);

  const handleDashboardMarkPaid = useCallback(
    async (args: { paidDate: string; amount: number; accountId: number }) => {
      if (!dashboardPayTarget) return;
      try {
        const { nextDueDate } = await markPaidMutation.mutateAsync({
          subscription: dashboardPayTarget,
          paidDate: args.paidDate,
          amount: args.amount,
          accountId: args.accountId,
        });
        setDashboardPayTarget(null);
        showToast(`Pago registrado · Próximo cobro: ${nextDueDate}`, "success");
      } catch (error: unknown) {
        showToast(error instanceof Error ? error.message : "No se pudo registrar el pago", "error");
      }
    },
    [dashboardPayTarget, markPaidMutation, showToast],
  );

  const [signOutVisible, setSignOutVisible] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  function handleSignOut() {
    setSignOutVisible(true);
  }

  async function confirmSignOut() {
    setSigningOut(true);
    await signOut().finally(() => setSigningOut(false));
  }
  const { dashboardMode, setDashboardMode, dashboardScrollY, setDashboardScrollY, privacyMode, togglePrivacyMode } = useUiStore();
  const scrollRef = useRef<import("react-native").ScrollView>(null);
  const scrollSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const advancedSectionY = useRef(0);
  // Lee dashboardScrollY desde una ref para evitar que el useFocusEffect se
  // re-dispare en cada cambio (cada 200ms mientras el usuario scrollea), lo
  // cual provocaba "pops" si el scrollTo de restauración llegaba mientras el
  // usuario ya había empezado a scrollear.
  const dashboardScrollYRef = useRef(dashboardScrollY);
  dashboardScrollYRef.current = dashboardScrollY;
  const userHasScrolledRef = useRef(false);

  // Restaurar posición de scroll solo al recuperar foco — una vez por focus.
  useFocusEffect(
    useCallback(() => {
      userHasScrolledRef.current = false;
      let t: ReturnType<typeof setTimeout> | undefined;
      const initialY = dashboardScrollYRef.current;
      if (initialY > 0) {
        t = setTimeout(() => {
          if (!userHasScrolledRef.current) {
            scrollRef.current?.scrollTo({ y: initialY, animated: false });
          }
        }, 80);
      }
      return () => {
        if (t !== undefined) clearTimeout(t);
        if (scrollSaveTimer.current) clearTimeout(scrollSaveTimer.current);
        scrollSaveTimer.current = null;
      };
    }, []),
  );

  const [period, setPeriod] = useState<Period>("month");
  const [formVisible, setFormVisible] = useState(false);
  const [daySheet, setDaySheet] = useState<{
    dayStart: Date;
    dayEnd: Date;
    mode: DaySheetMode;
  } | null>(null);
  // Tap del "Resumen financiero del día": el resolver llega con daySheet=today +
  // token único. Se consume una vez por token (los params persisten en la pantalla).
  const digestParams = useLocalSearchParams<{ daySheet?: string | string[]; daySheetToken?: string | string[] }>();
  const daySheetTokenConsumedRef = useRef<string | null>(null);
  useEffect(() => {
    const token = Array.isArray(digestParams.daySheetToken) ? digestParams.daySheetToken[0] : digestParams.daySheetToken;
    const mode = Array.isArray(digestParams.daySheet) ? digestParams.daySheet[0] : digestParams.daySheet;
    if (!token || mode !== "today" || daySheetTokenConsumedRef.current === token) return;
    daySheetTokenConsumedRef.current = token;
    const now = new Date();
    setDaySheet({ dayStart: startOfDay(now), dayEnd: endOfDay(now), mode: "all" });
  }, [digestParams.daySheet, digestParams.daySheetToken]);
  const [displayCurrency, setDisplayCurrency] = useState<string | null>(null);
  const currencyLoadedRef = useRef(false);

  const dashboardEntitlement = useDashboardEntitlement({
    userId: session?.user?.id ?? profile?.id ?? null,
    email: profile?.email,
  });
  const isPro = dashboardEntitlement.tier === "pro" && dashboardEntitlement.reason === "pro_subscription";
  const hasAdvancedDashboardGift = dashboardEntitlement.reason === "gift_email";
  const hasAdvancedDashboardAccess = dashboardEntitlement.features.advancedDashboard;

  const {
    data: snapshot,
    isLoading: snapLoading,
    dataUpdatedAt,
  } = useWorkspaceSnapshotQuery(profile, activeWorkspaceId);
  const { data: movements = [] } = useDashboardMovementsQuery(activeWorkspaceId, profile?.id);
  const { data: dashboardAnalytics } = useDashboardAnalyticsQuery(activeWorkspaceId, profile?.id);
  const { data: sharedObligations = [] } = useSharedObligationsQuery(session?.user?.id ?? null);

  const lastUpdateLabel = useMemo(() => {
    if (!dataUpdatedAt) return "";
    const seconds = Math.floor((Date.now() - dataUpdatedAt) / 1000);
    if (seconds < 10) return "Ahora";
    if (seconds < 60) return `Actualizado hace ${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `Actualizado hace ${minutes}min`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `Actualizado hace ${hours}h`;
    return `Actualizado hace ${Math.floor(hours / 24)}d`;
  }, [dataUpdatedAt]);

  const obligationsMerged = useMemo(
    () => mergeWorkspaceAndSharedObligations(snapshot?.obligations ?? [], sharedObligations),
    [snapshot?.obligations, sharedObligations],
  );

  useEffect(() => {
    if (snapshot?.workspaces?.length) setWorkspaces(snapshot.workspaces);
  }, [snapshot?.workspaces, setWorkspaces]);

  // Prefetch queries for other tabs after workspace is ready
  useEffect(() => {
    if (!supabase || !activeWorkspaceId) return;
    void queryClient.prefetchQuery({
      queryKey: ["obligation-shares", activeWorkspaceId],
      staleTime: STALE.medium,
      queryFn: async () => {
        const { data, error } = await supabase!
          .from("obligation_shares")
          .select("id, workspace_id, obligation_id, owner_user_id, invited_by_user_id, invited_user_id, owner_display_name, invited_display_name, invited_email, status, token, message, accepted_at, responded_at, last_sent_at, created_at, updated_at")
          .eq("workspace_id", activeWorkspaceId)
          .in("status", ["pending", "accepted"])
          .order("updated_at", { ascending: false });
        if (error) return [];
        return (data ?? []).map((row: Record<string, unknown>) => ({
          id: Number(row.id),
          workspaceId: Number(row.workspace_id),
          obligationId: Number(row.obligation_id),
          ownerUserId: String(row.owner_user_id ?? ""),
          invitedByUserId: String(row.invited_by_user_id ?? ""),
          invitedUserId: String(row.invited_user_id ?? ""),
          ownerDisplayName: (row.owner_display_name as string) ?? null,
          invitedDisplayName: (row.invited_display_name as string) ?? null,
          invitedEmail: String(row.invited_email ?? ""),
          status: row.status as string,
          token: String(row.token ?? ""),
          message: (row.message as string) ?? null,
          acceptedAt: (row.accepted_at as string) ?? null,
          respondedAt: (row.responded_at as string) ?? null,
          lastSentAt: (row.last_sent_at as string) ?? null,
          createdAt: String(row.created_at ?? ""),
          updatedAt: String(row.updated_at ?? ""),
        }));
      },
    });
    void queryClient.prefetchQuery({
      queryKey: ["obligation-payment-request-counts", activeWorkspaceId],
      staleTime: STALE.medium,
      queryFn: async () => {
        const { data, error } = await supabase!
          .from("obligation_payment_requests")
          .select("obligation_id")
          .eq("workspace_id", activeWorkspaceId)
          .eq("status", "pending");
        if (error) return new Map();
        const counts = new Map<number, number>();
        for (const row of (data ?? []) as { obligation_id: number }[]) {
          counts.set(Number(row.obligation_id), (counts.get(Number(row.obligation_id)) ?? 0) + 1);
        }
        return counts;
      },
    });
  }, [activeWorkspaceId, queryClient]);

  const snapshotActiveWorkspace = useMemo(
    () => snapshot?.workspaces?.find((workspace) => workspace.id === activeWorkspaceId) ?? null,
    [snapshot?.workspaces, activeWorkspaceId],
  );

  const resolvedActiveWorkspace = activeWorkspace ?? snapshotActiveWorkspace;
  const baseCurrency = resolvedActiveWorkspace?.baseCurrencyCode ?? profile?.baseCurrencyCode ?? "PEN";
  const workspaceDisplayName = resolvedActiveWorkspace?.name ?? "Tu workspace";
  const snapshotBudgets = useMemo(() => snapshot?.budgets ?? [], [snapshot?.budgets]);

  const {
    data: scopedBudgetMovements = [],
    error: dashboardBudgetMovementsError,
  } = useBudgetScopeMovementsQuery(activeWorkspaceId, snapshotBudgets, dataUpdatedAt);

  // Build exchange rate map from snapshot
  const exchangeRateMap = useMemo(
    () => buildExchangeRateMap(snapshot?.exchangeRates ?? []),
    [snapshot?.exchangeRates],
  );

  const dashboardBudgetMetricsMap = useMemo(
    () =>
      buildBudgetMetricsMap(snapshotBudgets, scopedBudgetMovements, {
        workspaceBaseCurrencyCode: baseCurrency,
        exchangeRates: snapshot?.exchangeRates ?? [],
      }),
    [baseCurrency, scopedBudgetMovements, snapshot?.exchangeRates, snapshotBudgets],
  );

  const correctedDashboardBudgets = useMemo<BudgetOverview[]>(() => {
    if (dashboardBudgetMovementsError) return snapshotBudgets;
    return snapshotBudgets.map((budget) =>
      applyBudgetComputedMetrics(
        budget,
        dashboardBudgetMetricsMap.get(budget.id) ?? {
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
  }, [dashboardBudgetMetricsMap, dashboardBudgetMovementsError, snapshotBudgets]);

  // Map accountId -> currencyCode for movement conversion
  const accountCurrencyMap = useMemo(() => {
    const map = new Map<number, string>();
    for (const a of snapshot?.accounts ?? []) map.set(a.id, a.currencyCode);
    return map;
  }, [snapshot?.accounts]);

  // Currency options: all currencies present in workspace that have exchange rates
  const currencyOptions = useMemo(() => {
    const all = new Set<string>();
    all.add(baseCurrency);
    for (const a of snapshot?.accounts ?? []) all.add(a.currencyCode.toUpperCase());
    for (const o of obligationsMerged) all.add(o.currencyCode.toUpperCase());
    for (const s of snapshot?.subscriptions ?? []) all.add(s.currencyCode.toUpperCase());
    return Array.from(all).filter((c) =>
      c === baseCurrency.toUpperCase() ||
      resolveRate(exchangeRateMap, baseCurrency.toUpperCase(), c, baseCurrency) !== null,
    );
  }, [baseCurrency, exchangeRateMap, snapshot, obligationsMerged]);

  // Load persisted currency once
  useEffect(() => {
    if (currencyLoadedRef.current) return;
    currencyLoadedRef.current = true;
    void AsyncStorage.getItem(DASHBOARD_CURRENCY_KEY).then((stored) => {
      if (stored && currencyOptions.includes(stored)) setDisplayCurrency(stored);
      else setDisplayCurrency(baseCurrency);
    });
  }, [baseCurrency, currencyOptions]);

  // Persist currency selection
  const handleCurrencyChange = useCallback((c: string) => {
    setDisplayCurrency(c);
    void AsyncStorage.setItem(DASHBOARD_CURRENCY_KEY, c);
  }, []);

  const activeCurrency = displayCurrency ?? baseCurrency;

  // Conversion context passed to all amount functions
  const conversionCtx = useMemo<ConversionCtx>(
    () => ({ accountCurrencyMap, exchangeRateMap, displayCurrency: activeCurrency, baseCurrency }),
    [accountCurrencyMap, exchangeRateMap, activeCurrency, baseCurrency],
  );

  // Net worth: sum balances converted to display currency
  const netWorth = useMemo(() => {
    if (!snapshot) return 0;
    return snapshot.accounts
      .filter((a) => a.includeInNetWorth && !a.isArchived)
      .reduce((sum, a) => {
        const amt = a.currentBalanceInBaseCurrency ?? a.currentBalance;
        return sum + (convertAmt(amt, baseCurrency, activeCurrency, exchangeRateMap, baseCurrency) ?? 0);
      }, 0);
  }, [snapshot, baseCurrency, activeCurrency, exchangeRateMap]);

  const stats = useDashboardStats(movements, period, conversionCtx);
  const hasAnyMovement = movements.length > 0;
  const hasPeriodActivity = stats.chartDays.some(
    (day) => day.income > 0 || day.expense > 0 || day.transferTotal > 0,
  );

  const [isRefreshing, setIsRefreshing] = useState(false);

  const onRefresh = useCallback(() => {
    setIsRefreshing(true);
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ["workspace-snapshot"] }),
      queryClient.invalidateQueries({ queryKey: ["dashboard-movements"] }),
      queryClient.invalidateQueries({ queryKey: ["budget-scope-movements"] }),
      queryClient.invalidateQueries({ queryKey: ["shared-obligations"] }),
    ]).finally(() => setIsRefreshing(false));
  }, [queryClient]);

  const activeAccounts = useMemo(
    () => (snapshot?.accounts ?? []).filter((a) => !a.isArchived),
    [snapshot],
  );

  const categoryMap = useMemo(() => {
    const m = new Map<number, string>();
    for (const c of snapshot?.categories ?? []) m.set(c.id, c.name);
    return m;
  }, [snapshot?.categories]);

  const accountMap = useMemo(() => {
    const m = new Map<number, string>();
    for (const a of snapshot?.accounts ?? []) m.set(a.id, a.name);
    return m;
  }, [snapshot?.accounts]);

  const isAdvanced = dashboardMode === "advanced";
  const isCheckingAdvancedAccess = isAdvanced && !hasAdvancedDashboardGift && dashboardEntitlement.isLoading;
  const shouldShowAdvancedProGate = isAdvanced && !isCheckingAdvancedAccess && !hasAdvancedDashboardAccess;

  // snapLoading (isPending && isFetching) es false cuando la query quedó pausada
  // (NetInfo reportó offline) o en error, aunque data siga undefined: sin el guard
  // extra se renderizaba el estado "tablero limpio" falso (incidente 2026-07-13).
  if (snapLoading || (Boolean(activeWorkspaceId) && !snapshot)) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top }]}>
        <ScreenHeader
          title={`Hola, ${profile?.fullName?.split(" ")[0] ?? "usuario"}`}
          subtitle={`${workspaceDisplayName} · ${format(new Date(), "d MMM yyyy", { locale: es })}${lastUpdateLabel ? ` · ${lastUpdateLabel}` : ""}`}
          showPlanBadge
        />
        <ScrollView contentContainerStyle={styles.content}>
          <SkeletonList>
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </SkeletonList>
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <ScreenHeader
        title={`Hola, ${profile?.fullName?.split(" ")[0] ?? "usuario"}`}
        subtitle={`${workspaceDisplayName} · ${format(new Date(), "d MMM yyyy", { locale: es })}${lastUpdateLabel ? ` · ${lastUpdateLabel}` : ""}`}
        rightAction={<DashboardHeaderRight onSignOut={handleSignOut} privacyMode={privacyMode} onTogglePrivacy={() => { void Haptics.selectionAsync(); togglePrivacyMode(); }} />}
        showPlanBadge
      />

      <ScrollView
        ref={scrollRef}
        contentContainerStyle={styles.content}
        scrollEventThrottle={16}
        onScroll={(e) => {
          const y = e.nativeEvent.contentOffset.y;
          userHasScrolledRef.current = true;
          if (scrollSaveTimer.current) clearTimeout(scrollSaveTimer.current);
          scrollSaveTimer.current = setTimeout(() => setDashboardScrollY(y), 200);
        }}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={onRefresh}
            tintColor={COLORS.pine}
            colors={[COLORS.pine]}
            progressBackgroundColor={SURFACE.deepNavy}
          />
        }
      >
        {/* 1. Mode toggle */}
        <ModeToggle mode={dashboardMode} setMode={setDashboardMode} isPro={hasAdvancedDashboardAccess} />
        {isCheckingAdvancedAccess ? <ProGateLoading /> : shouldShowAdvancedProGate ? (
          <>
            <ProGate />
          </>
        ) : (
          <>

        {!isAdvanced ? (
          <>
            <DashboardSectionBoundary sectionLabel="Balance">
              <HeroCard
                netWorth={netWorth}
                income={stats.income}
                expense={stats.expense}
                currency={activeCurrency}
                period={period}
                setPeriod={setPeriod}
                currencyOptions={currencyOptions}
                onCurrencyChange={handleCurrencyChange}
              />
            </DashboardSectionBoundary>

            {!hasAnyMovement ? (
              <DashboardSectionBoundary sectionLabel="Primer movimiento">
                <GettingStartedCard
                  hasAccounts={activeAccounts.length > 0}
                  onCreateMovement={() => setFormVisible(true)}
                  onOpenAccounts={() => router.push("/accounts" as never)}
                />
              </DashboardSectionBoundary>
            ) : null}

            <DashboardSectionBoundary sectionLabel="Alertas urgentes">
              <UrgentAlertsCard
                obligations={obligationsMerged}
                budgets={correctedDashboardBudgets}
                subscriptions={snapshot?.subscriptions ?? []}
                router={router}
                isDismissed={dismissedAlerts.isDismissed}
                onDismiss={dismissedAlerts.dismiss}
              />
            </DashboardSectionBoundary>

            {hasPeriodActivity ? (
              <DashboardSectionBoundary sectionLabel="Flujo reciente">
                <MiniBarChart
                  data={stats.chartDays}
                  onSelectDay={(d) => setDaySheet({ dayStart: d.dayStart, dayEnd: d.dayEnd, mode: "all" })}
                />
              </DashboardSectionBoundary>
            ) : null}

            <DashboardSectionBoundary sectionLabel="Cuentas">
              <AccountsScroll
                accounts={activeAccounts}
                onPress={(id) => router.push(`/account/${id}?from=dashboard`)}
              />
              <AccountsBreakdown
                accounts={snapshot?.accounts ?? []}
                displayCurrency={activeCurrency}
                baseCurrency={baseCurrency}
                exchangeRateMap={exchangeRateMap}
              />
            </DashboardSectionBoundary>

            <DashboardSectionBoundary sectionLabel="Agenda y presupuestos">
              <LeadersRow obligations={obligationsMerged} router={router} />
              <UpcomingSection
                obligations={obligationsMerged}
                subscriptions={snapshot?.subscriptions ?? []}
                recurringIncome={snapshot?.recurringIncome ?? []}
                router={router}
                onPaySubscription={(id) => {
                  const sub = (snapshot?.subscriptions ?? []).find((s) => s.id === id);
                  if (sub) setDashboardPayTarget(sub);
                }}
                onConfirmIncome={(id) => {
                  const item = (snapshot?.recurringIncome ?? []).find((r) => r.id === id);
                  if (item) arrival.open(item);
                }}
              />
              <BudgetsSection budgets={correctedDashboardBudgets} router={router} />
            </DashboardSectionBoundary>

            {hasAnyMovement ? (
              <DashboardSectionBoundary sectionLabel="Categorías y ahorro">
                <CategoryComparison
                  catTotals={stats.catTotals}
                  prevCatTotals={stats.prevCatTotals}
                  categories={snapshot?.categories ?? []}
                  currency={activeCurrency}
                />
                <SavingsTrendCard monthlyPulse={stats.monthlyPulse} currency={activeCurrency} />
              </DashboardSectionBoundary>
            ) : null}

            {hasAnyMovement ? (
              <DashboardSectionBoundary sectionLabel="Contexto macro">
                <MacroContextCard />
              </DashboardSectionBoundary>
            ) : null}
          </>
        ) : null}

        {/* -- Advanced section -- */}
        {isAdvanced && hasAdvancedDashboardAccess && (
          <View onLayout={(e) => { advancedSectionY.current = e.nativeEvent.layout.y; }}>
          <AdvancedDashboard
            movements={movements}
            obligations={obligationsMerged}
            subscriptions={snapshot?.subscriptions ?? []}
            recurringIncome={snapshot?.recurringIncome ?? []}
            snapshot={snapshot}
            activeAccounts={activeAccounts}
            activeCurrency={activeCurrency}
            baseCurrency={baseCurrency}
            exchangeRateMap={exchangeRateMap}
            currentVisibleBalance={netWorth}
            workspaceId={activeWorkspaceId}
            userId={profile?.id ?? null}
            userEmail={profile?.email ?? null}
            showAdvancedGift={hasAdvancedDashboardGift}
            analytics={dashboardAnalytics}
            router={router}
            accountCurrencyMap={accountCurrencyMap}
            onRequestPrecisionFocus={() => {
              scrollRef.current?.scrollTo({ y: advancedSectionY.current, animated: true });
            }}
            onScrollToTop={() => {
              scrollRef.current?.scrollTo({ y: 0, animated: true });
            }}
          />
          </View>
        )}
          </>
        )}
      </ScrollView>

      <FAB onPress={() => setFormVisible(true)} bottom={insets.bottom + 16} />

      <MovementForm
        visible={formVisible}
        onClose={() => setFormVisible(false)}
        onSuccess={() => {
          setFormVisible(false);
          InteractionManager.runAfterInteractions(() => {
            void queryClient.invalidateQueries({ queryKey: ["dashboard-movements"] });
          });
        }}
      />

      {daySheet ? (
        <DayMovementsSheet
          visible
          onClose={() => setDaySheet(null)}
          dayStart={daySheet.dayStart}
          dayEnd={daySheet.dayEnd}
          mode={daySheet.mode}
          movements={movements}
          ctx={conversionCtx}
          categoryMap={categoryMap}
          accountMap={accountMap}
          workspaceId={activeWorkspaceId}
          onMovementPress={(id) => {
            setDaySheet(null);
            router.push(`/movement/${id}?from=dashboard`);
          }}
        />
      ) : null}
      <MarkSubscriptionPaidSheet
        visible={Boolean(dashboardPayTarget)}
        subscription={dashboardPayTarget}
        accounts={snapshot?.accounts ?? []}
        isPending={markPaidMutation.isPending}
        onClose={() => setDashboardPayTarget(null)}
        onConfirm={(args) => void handleDashboardMarkPaid(args)}
      />
      <RecurringIncomeArrivalSheet
        {...arrival.sheetProps}
        accounts={activeAccounts}
      />
      <ConfirmDialog
        visible={signOutVisible}
        title="Cerrar sesión"
        body="¿Estás seguro que deseas salir de tu cuenta?"
        confirmLabel="Salir"
        cancelLabel="Cancelar"
        destructive
        confirmLoading={signingOut}
        confirmLoadingLabel="Cerrando sesión"
        onCancel={() => setSignOutVisible(false)}
        onConfirm={() => { void confirmSignOut(); }}
      />
    </View>
  );
}

// --- Styles -------------------------------------------------------------------

// alertStyles extraído junto con UrgentAlertsCard a features/dashboard/components/simple/

// subStyles extraido a features/dashboard/components/simple/styles.ts
import { dashboardSimpleStyles as subStyles } from "../../features/dashboard/components/simple/styles";

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.canvas },
  content: { padding: SPACING.lg, gap: SPACING.xl, paddingBottom: 100 },
});

// --- Dashboard header right actions -------------------------------------------

function DashboardHeaderRight({
  onSignOut,
  privacyMode,
  onTogglePrivacy,
}: {
  onSignOut: () => void;
  privacyMode: boolean;
  onTogglePrivacy: () => void;
}) {
  const { profile } = useAuth();
  const { workspaces } = useWorkspaceListStore();
  const router = useRouter();
  const { data: notifications = [] } = useNotificationsQuery(profile?.id ?? null);
  const unreadCount = (notifications as { readAt: string | null }[]).filter((n) => !n.readAt).length;

  return (
    <View style={hdrStyles.row}>
      {workspaces.length > 1 && <WorkspaceSelector />}
      <TouchableOpacity
        style={hdrStyles.iconBtn}
        onPress={onTogglePrivacy}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        accessibilityRole="button"
        accessibilityLabel={privacyMode ? "Mostrar montos" : "Ocultar montos"}
      >
        {privacyMode
          ? <EyeOff size={19} color={COLORS.storm} strokeWidth={2} />
          : <Eye size={19} color={COLORS.storm} strokeWidth={2} />}
      </TouchableOpacity>
      <TouchableOpacity
        style={hdrStyles.iconBtn}
        onPress={() => router.push("/notifications")}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Bell size={19} color={COLORS.storm} strokeWidth={2} />
        {unreadCount > 0 && (
          <View style={hdrStyles.badge}>
            <Text style={hdrStyles.badgeText}>{unreadCount > 9 ? "9+" : String(unreadCount)}</Text>
          </View>
        )}
      </TouchableOpacity>
      <TouchableOpacity style={hdrStyles.avatar} onPress={onSignOut}>
        {profile?.avatarUrl
          ? <Image source={{ uri: profile.avatarUrl }} style={hdrStyles.avatarImage} />
          : <Text style={hdrStyles.avatarText}>{profile?.initials ?? "?"}</Text>}
      </TouchableOpacity>
    </View>
  );
}

const hdrStyles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
  },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: RADIUS.lg,
    backgroundColor: SURFACE.card,
    borderWidth: 1,
    borderColor: SURFACE.cardBorder,
    alignItems: "center",
    justifyContent: "center",
  },
  badge: {
    position: "absolute",
    top: -4,
    right: -4,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: COLORS.danger,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 3,
  },
  badgeText: {
    fontSize: 9,
    fontFamily: FONT_FAMILY.bodySemibold,
    color: COLORS.ink,
    lineHeight: 12,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: RADIUS.lg,
    backgroundColor: COLORS.primary + "22",
    borderWidth: 1,
    borderColor: COLORS.primary + "55",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  avatarImage: {
    width: 36,
    height: 36,
    borderRadius: RADIUS.lg,
  },
  avatarText: {
    fontSize: FONT_SIZE.xs,
    fontFamily: FONT_FAMILY.bodySemibold,
    color: COLORS.primary,
    letterSpacing: 0.5,
  },
});

export default function DashboardScreenRoot() {
  return (
    <ErrorBoundary>
      <DashboardScreen />
    </ErrorBoundary>
  );
}
