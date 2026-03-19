import { Plus, Users } from "lucide-react-native";
import { useCallback, useState } from "react";
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { supabase } from "../lib/supabase";
import { format } from "date-fns";
import { es } from "date-fns/locale";

import { useAuth } from "../lib/auth-context";
import { useWorkspace } from "../lib/workspace-context";
import { useWorkspaceSnapshotQuery } from "../services/queries/workspace-data";
import type { ObligationSummary } from "../types/domain";
import { Card } from "../components/ui/Card";
import { ProgressBar } from "../components/ui/ProgressBar";
import { EmptyState } from "../components/ui/EmptyState";
import { SkeletonCard } from "../components/ui/Skeleton";
import { ScreenHeader } from "../components/layout/ScreenHeader";
import { ObligationForm } from "../components/forms/ObligationForm";
import { PaymentForm } from "../components/forms/PaymentForm";
import { formatCurrency } from "../components/ui/AmountDisplay";
import { COLORS, FONT_SIZE, FONT_WEIGHT, RADIUS, SPACING } from "../constants/theme";

export default function ObligationsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { profile } = useAuth();
  const { activeWorkspaceId } = useWorkspace();

  const { data: snapshot, isLoading } = useWorkspaceSnapshotQuery(profile, activeWorkspaceId);

  const { data: shareRows } = useQuery({
    queryKey: ["obligation-shares", activeWorkspaceId],
    queryFn: async () => {
      if (!supabase || !activeWorkspaceId) return [];
      const { data } = await supabase
        .from("obligation_shares")
        .select("obligation_id")
        .eq("workspace_id", activeWorkspaceId)
        .eq("status", "accepted");
      return data ?? [];
    },
    enabled: Boolean(supabase && activeWorkspaceId),
  });
  const sharedObligationIds = new Set((shareRows ?? []).map((r: any) => r.obligation_id as number));

  const [createFormVisible, setCreateFormVisible] = useState(false);
  const [editObligation, setEditObligation] = useState<ObligationSummary | null>(null);
  const [paymentObligation, setPaymentObligation] = useState<ObligationSummary | null>(null);

  const obligations = snapshot?.obligations ?? [];
  const receivable = obligations.filter((o) => o.direction === "receivable");
  const payable = obligations.filter((o) => o.direction === "payable");

  const onRefresh = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ["workspace-snapshot"] });
  }, [queryClient]);

  function renderGroup(title: string, items: typeof obligations, color: string) {
    if (items.length === 0) return null;
    return (
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color }]}>{title}</Text>
        {items.map((ob) => (
          <Card key={ob.id} onPress={() => router.push(`/obligation/${ob.id}`)}>
            <View style={styles.obHeader}>
              <Text style={styles.obTitle} numberOfLines={1}>{ob.title}</Text>
              <Text style={[styles.obAmount, { color }]}>
                {formatCurrency(ob.pendingAmount, ob.currencyCode)}
              </Text>
            </View>
            <Text style={styles.obCounterparty}>{ob.counterparty}</Text>
            <ProgressBar percent={ob.progressPercent} alertPercent={100} height={6} />
            <Text style={styles.obProgress}>{Math.round(ob.progressPercent)}% pagado</Text>
            {ob.dueDate ? (
              <Text style={styles.obDue}>
                Vence {format(new Date(ob.dueDate), "d MMM yyyy", { locale: es })}
              </Text>
            ) : null}

            {sharedObligationIds.has(ob.id) ? (
              <View style={styles.sharedBadge}>
                <Users size={11} color={COLORS.income} /><Text style={styles.sharedBadgeText}>Compartida</Text>
              </View>
            ) : null}

            {/* Quick actions */}
            <View style={styles.obActions}>
              <TouchableOpacity
                style={styles.actionBtn}
                onPress={(e) => { e.stopPropagation?.(); setPaymentObligation(ob); }}
              >
                <Text style={styles.actionBtnText}>Registrar pago</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionBtn, styles.actionBtnSecondary]}
                onPress={(e) => { e.stopPropagation?.(); setEditObligation(ob); }}
              >
                <Text style={[styles.actionBtnText, styles.actionBtnTextSecondary]}>Editar</Text>
              </TouchableOpacity>
            </View>
          </Card>
        ))}
      </View>
    );
  }

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <ScreenHeader title="Créditos y Deudas" />

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
        ) : obligations.length === 0 ? (
          <EmptyState
            title="Sin obligaciones activas"
            description="Registra préstamos, deudas y créditos aquí."
            action={{ label: "Nueva obligación", onPress: () => setCreateFormVisible(true) }}
          />
        ) : (
          <>
            {renderGroup("Por cobrar", receivable, COLORS.income)}
            {renderGroup("Por pagar", payable, COLORS.expense)}
          </>
        )}
      </ScrollView>

      {/* FAB */}
      <TouchableOpacity
        style={[styles.fab, { bottom: insets.bottom + 16 }]}
        activeOpacity={0.85}
        onPress={() => setCreateFormVisible(true)}
        accessibilityLabel="Nueva obligación"
      >
        <Plus size={22} color="#FFF" />
      </TouchableOpacity>

      {/* Create form */}
      <ObligationForm
        visible={createFormVisible}
        onClose={() => setCreateFormVisible(false)}
        onSuccess={() => setCreateFormVisible(false)}
      />

      {/* Edit form */}
      <ObligationForm
        visible={Boolean(editObligation)}
        onClose={() => setEditObligation(null)}
        onSuccess={() => setEditObligation(null)}
        editObligation={editObligation ?? undefined}
      />

      {/* Payment form */}
      <PaymentForm
        visible={Boolean(paymentObligation)}
        onClose={() => setPaymentObligation(null)}
        onSuccess={() => setPaymentObligation(null)}
        obligation={paymentObligation}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.bg },
  content: { padding: SPACING.lg, gap: SPACING.md, paddingBottom: 100 },
  section: { gap: SPACING.sm },
  sectionTitle: { fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.semibold, textTransform: "uppercase", letterSpacing: 0.5 },
  obHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 4 },
  obTitle: { flex: 1, fontSize: FONT_SIZE.md, fontWeight: FONT_WEIGHT.semibold, color: COLORS.text },
  obAmount: { fontSize: FONT_SIZE.md, fontWeight: FONT_WEIGHT.bold },
  obCounterparty: { fontSize: FONT_SIZE.sm, color: COLORS.textMuted, marginBottom: SPACING.sm },
  obProgress: { fontSize: FONT_SIZE.xs, color: COLORS.textMuted, marginTop: 4 },
  obDue: { fontSize: FONT_SIZE.xs, color: COLORS.warning, marginTop: 2 },
  obActions: { flexDirection: "row", gap: SPACING.sm, marginTop: SPACING.sm },
  actionBtn: {
    flex: 1,
    paddingVertical: SPACING.xs + 2,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.primary,
    alignItems: "center",
  },
  actionBtnSecondary: { backgroundColor: "transparent", borderWidth: 1, borderColor: COLORS.border },
  actionBtnText: { fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.medium, color: "#FFFFFF" },
  actionBtnTextSecondary: { color: COLORS.textMuted },
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
  sharedBadge: {
    alignSelf: "flex-start",
    backgroundColor: COLORS.income + "22",
    borderRadius: RADIUS.full,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 2,
  },
  sharedBadgeText: { fontSize: FONT_SIZE.xs, color: COLORS.income, fontWeight: FONT_WEIGHT.medium },
});
