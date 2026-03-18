import { useCallback, useMemo, useState } from "react";
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { format, startOfMonth, endOfMonth, isWithinInterval, addDays } from "date-fns";
import { es } from "date-fns/locale";

import { useAuth } from "../../lib/auth-context";
import { useWorkspace } from "../../lib/workspace-context";
import { useWorkspaceSnapshotQuery } from "../../services/queries/workspace-data";
import { Card } from "../../components/ui/Card";
import { BudgetCard } from "../../components/domain/BudgetCard";
import { SkeletonCard } from "../../components/ui/Skeleton";
import { ScreenHeader } from "../../components/layout/ScreenHeader";
import { formatCurrency } from "../../components/ui/AmountDisplay";
import { MovementForm } from "../../components/forms/MovementForm";
import { WorkspaceSelector } from "../../components/layout/WorkspaceSelector";
import { COLORS, FONT_SIZE, FONT_WEIGHT, SPACING } from "../../constants/theme";
import { UPCOMING_DAYS_WINDOW } from "../../constants/config";

export default function DashboardScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { profile } = useAuth();
  const { activeWorkspaceId, activeWorkspace, setWorkspaces } = useWorkspace();

  const [formVisible, setFormVisible] = useState(false);

  const { data: snapshot, isLoading, error, refetch } = useWorkspaceSnapshotQuery(
    profile,
    activeWorkspaceId,
  );

  // Sync workspace list to context so selector works
  if (snapshot?.workspaces) {
    setWorkspaces(snapshot.workspaces);
  }

  const baseCurrency = activeWorkspace?.baseCurrencyCode ?? profile?.baseCurrencyCode ?? "PEN";

  // Total net worth (accounts with includeInNetWorth = true)
  const totalNetWorth = useMemo(() => {
    if (!snapshot) return 0;
    return snapshot.accounts
      .filter((a) => a.includeInNetWorth && !a.isArchived)
      .reduce((sum, a) => sum + (a.currentBalanceInBaseCurrency ?? a.currentBalance), 0);
  }, [snapshot]);

  // Monthly cashflow
  const { monthlyIncome, monthlyExpense } = useMemo(() => {
    if (!snapshot) return { monthlyIncome: 0, monthlyExpense: 0 };
    const now = new Date();
    const start = startOfMonth(now);
    const end = endOfMonth(now);
    let income = 0;
    let expense = 0;
    // We use subscription amounts as proxy since movements are paginated separately
    for (const sub of snapshot.subscriptions) {
      const next = new Date(sub.nextDueDate);
      if (isWithinInterval(next, { start, end })) {
        expense += sub.amountInBaseCurrency ?? sub.amount;
      }
    }
    return { monthlyIncome: income, monthlyExpense: expense };
  }, [snapshot]);

  // Upcoming subscriptions (next 7 days)
  const upcomingSubscriptions = useMemo(() => {
    if (!snapshot) return [];
    const now = new Date();
    const limit = addDays(now, UPCOMING_DAYS_WINDOW);
    return snapshot.subscriptions.filter((s) => {
      const due = new Date(s.nextDueDate);
      return due >= now && due <= limit;
    });
  }, [snapshot]);

  // Budget alerts
  const alertBudgets = useMemo(() => {
    if (!snapshot) return [];
    return snapshot.budgets.filter((b) => b.isNearLimit || b.isOverLimit);
  }, [snapshot]);

  // Obligations summary
  const obligationsSummary = useMemo(() => {
    if (!snapshot) return { receivable: 0, payable: 0 };
    const active = snapshot.obligations.filter((o) => o.status === "active");
    return {
      receivable: active.filter((o) => o.direction === "receivable").length,
      payable: active.filter((o) => o.direction === "payable").length,
    };
  }, [snapshot]);

  const onRefresh = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ["workspace-snapshot"] });
  }, [queryClient]);

  if (isLoading) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top }]}>
        <ScreenHeader title="Inicio" />
        <ScrollView contentContainerStyle={styles.content}>
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <ScreenHeader
        title={activeWorkspace?.name ?? "Inicio"}
        subtitle={`${format(new Date(), "MMMM yyyy", { locale: es })}`}
        rightAction={<WorkspaceSelector />}
      />

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={isLoading}
            onRefresh={onRefresh}
            tintColor={COLORS.primary}
          />
        }
      >
        {/* Net Worth card */}
        <Card>
          <Text style={styles.cardLabel}>Patrimonio neto</Text>
          <Text style={styles.netWorthAmount}>
            {formatCurrency(totalNetWorth, baseCurrency)}
          </Text>
          <Text style={styles.cardMeta}>{baseCurrency} · Solo cuentas incluidas</Text>
        </Card>

        {/* Upcoming subscriptions */}
        {upcomingSubscriptions.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Próximas suscripciones</Text>
            {upcomingSubscriptions.map((sub) => (
              <Card key={sub.id} style={styles.subCard} onPress={() => router.push(`/subscription/${sub.id}`)}>
                <View style={styles.subRow}>
                  <Text style={styles.subName} numberOfLines={1}>{sub.name}</Text>
                  <Text style={styles.subAmount}>
                    {formatCurrency(sub.amount, sub.currencyCode)}
                  </Text>
                </View>
                <Text style={styles.subDate}>
                  Vence {format(new Date(sub.nextDueDate), "d MMM", { locale: es })}
                </Text>
              </Card>
            ))}
          </View>
        ) : null}

        {/* Budget alerts */}
        {alertBudgets.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Alertas de presupuesto</Text>
            {alertBudgets.map((budget) => (
              <BudgetCard key={budget.id} budget={budget} onPress={() => router.push("/(app)/budgets")} />
            ))}
          </View>
        ) : null}

        {/* Obligations summary */}
        {(obligationsSummary.receivable > 0 || obligationsSummary.payable > 0) ? (
          <Card onPress={() => router.push("/(app)/more")}>
            <Text style={styles.cardLabel}>Créditos y deudas activos</Text>
            <View style={styles.obRow}>
              {obligationsSummary.receivable > 0 ? (
                <View style={styles.obItem}>
                  <Text style={[styles.obCount, { color: COLORS.income }]}>
                    {obligationsSummary.receivable}
                  </Text>
                  <Text style={styles.obLabel}>por cobrar</Text>
                </View>
              ) : null}
              {obligationsSummary.payable > 0 ? (
                <View style={styles.obItem}>
                  <Text style={[styles.obCount, { color: COLORS.expense }]}>
                    {obligationsSummary.payable}
                  </Text>
                  <Text style={styles.obLabel}>por pagar</Text>
                </View>
              ) : null}
            </View>
          </Card>
        ) : null}

        {/* Empty state */}
        {!alertBudgets.length && !upcomingSubscriptions.length && (
          <View style={styles.emptyHint}>
            <Text style={styles.emptyText}>
              Todo en orden 👍{"\n"}Crea movimientos con el botón + en la pestaña Movimientos.
            </Text>
          </View>
        )}
      </ScrollView>

      {/* FAB */}
      <TouchableOpacity
        style={[styles.fab, { bottom: insets.bottom + 80 }]}
        onPress={() => setFormVisible(true)}
        activeOpacity={0.85}
        accessibilityLabel="Nuevo movimiento"
      >
        <Text style={styles.fabIcon}>+</Text>
      </TouchableOpacity>

      <MovementForm
        visible={formVisible}
        onClose={() => setFormVisible(false)}
        onSuccess={() => {
          setFormVisible(false);
          void queryClient.invalidateQueries({ queryKey: ["workspace-snapshot"] });
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.bg },
  content: { padding: SPACING.lg, gap: SPACING.md },
  cardLabel: { fontSize: FONT_SIZE.sm, color: COLORS.textMuted, marginBottom: SPACING.xs },
  netWorthAmount: {
    fontSize: FONT_SIZE.xxxl,
    fontWeight: FONT_WEIGHT.bold,
    color: COLORS.text,
    marginBottom: SPACING.xs,
  },
  cardMeta: { fontSize: FONT_SIZE.xs, color: COLORS.textMuted },
  section: { gap: SPACING.sm },
  sectionTitle: {
    fontSize: FONT_SIZE.sm,
    fontWeight: FONT_WEIGHT.semibold,
    color: COLORS.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  subCard: { padding: SPACING.md },
  subRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  subName: { fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.medium, color: COLORS.text, flex: 1 },
  subAmount: { fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.semibold, color: COLORS.expense },
  subDate: { fontSize: FONT_SIZE.xs, color: COLORS.textMuted, marginTop: 2 },
  obRow: { flexDirection: "row", gap: SPACING.xl, marginTop: SPACING.sm },
  obItem: { alignItems: "center" },
  obCount: { fontSize: FONT_SIZE.xxl, fontWeight: FONT_WEIGHT.bold },
  obLabel: { fontSize: FONT_SIZE.xs, color: COLORS.textMuted },
  emptyHint: { alignItems: "center", paddingVertical: SPACING.xl },
  emptyText: { color: COLORS.textMuted, fontSize: FONT_SIZE.sm, textAlign: "center", lineHeight: 22 },
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
  fabIcon: { color: "#FFFFFF", fontSize: 28, fontWeight: "300", lineHeight: 32 },
});
