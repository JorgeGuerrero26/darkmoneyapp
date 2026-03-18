import { useCallback, useState } from "react";
import {
  Alert,
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
import { format } from "date-fns";
import { es } from "date-fns/locale";

import { useAuth } from "../lib/auth-context";
import { useWorkspace } from "../lib/workspace-context";
import {
  useWorkspaceSnapshotQuery,
  useUpdateSubscriptionMutation,
  useDeleteSubscriptionMutation,
} from "../services/queries/workspace-data";
import type { SubscriptionSummary } from "../types/domain";
import { Card } from "../components/ui/Card";
import { EmptyState } from "../components/ui/EmptyState";
import { SkeletonCard } from "../components/ui/Skeleton";
import { ScreenHeader } from "../components/layout/ScreenHeader";
import { SubscriptionForm } from "../components/forms/SubscriptionForm";
import { formatCurrency } from "../components/ui/AmountDisplay";
import { useToast } from "../hooks/useToast";
import { COLORS, FONT_SIZE, FONT_WEIGHT, RADIUS, SPACING } from "../constants/theme";

export default function SubscriptionsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { profile } = useAuth();
  const { activeWorkspaceId } = useWorkspace();
  const { showToast } = useToast();

  const { data: snapshot, isLoading } = useWorkspaceSnapshotQuery(profile, activeWorkspaceId);
  const updateMutation = useUpdateSubscriptionMutation(activeWorkspaceId);
  const deleteMutation = useDeleteSubscriptionMutation(activeWorkspaceId);

  const [createFormVisible, setCreateFormVisible] = useState(false);
  const [editSubscription, setEditSubscription] = useState<SubscriptionSummary | null>(null);

  const subscriptions = snapshot?.subscriptions ?? [];
  const active = subscriptions.filter((s) => s.status === "active");
  const paused = subscriptions.filter((s) => s.status === "paused");
  const cancelled = subscriptions.filter((s) => s.status === "cancelled");

  const onRefresh = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ["workspace-snapshot"] });
  }, [queryClient]);

  function handleTogglePause(sub: SubscriptionSummary) {
    const newStatus = sub.status === "active" ? "paused" : "active";
    updateMutation.mutate(
      { id: sub.id, input: { status: newStatus } },
      { onSuccess: () => showToast(newStatus === "paused" ? "Suscripción pausada" : "Suscripción reactivada", "success") },
    );
  }

  function handleDelete(sub: SubscriptionSummary) {
    Alert.alert(
      "Eliminar suscripción",
      `¿Eliminar "${sub.name}"? Esta acción no se puede deshacer.`,
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Eliminar",
          style: "destructive",
          onPress: () => deleteMutation.mutate(sub.id, {
            onSuccess: () => showToast("Suscripción eliminada", "success"),
            onError: (e) => showToast(e.message, "error"),
          }),
        },
      ],
    );
  }

  function renderCard(sub: SubscriptionSummary) {
    const monthlyCost =
      sub.frequency === "monthly" ? sub.amount
      : sub.frequency === "yearly" ? sub.amount / 12
      : sub.frequency === "weekly" ? (sub.amount * 52) / 12
      : sub.frequency === "quarterly" ? sub.amount / 3
      : sub.amount;

    return (
      <Card key={sub.id} onPress={() => router.push(`/subscription/${sub.id}`)}>
        <View style={styles.row}>
          <View style={styles.info}>
            <Text style={styles.name}>{sub.name}</Text>
            {sub.vendor ? <Text style={styles.vendor}>{sub.vendor}</Text> : null}
          </View>
          <View style={styles.amounts}>
            <Text style={[styles.amount, sub.status !== "active" && styles.amountMuted]}>
              {formatCurrency(sub.amount, sub.currencyCode)}
            </Text>
            <Text style={styles.freq}>{sub.frequencyLabel}</Text>
          </View>
        </View>
        <View style={styles.metaRow}>
          <Text style={styles.nextDue}>
            Próximo: {format(new Date(sub.nextDueDate), "d MMM", { locale: es })}
          </Text>
          <Text style={styles.monthly}>~{formatCurrency(monthlyCost, sub.currencyCode)}/mes</Text>
        </View>

        {/* Actions */}
        <View style={styles.actions}>
          <TouchableOpacity
            style={[styles.actionBtn, styles.actionBtnSecondary]}
            onPress={(e) => { e.stopPropagation?.(); setEditSubscription(sub); }}
          >
            <Text style={[styles.actionBtnText, styles.actionBtnTextSecondary]}>Editar</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionBtn, styles.actionBtnSecondary]}
            onPress={(e) => { e.stopPropagation?.(); handleTogglePause(sub); }}
          >
            <Text style={[styles.actionBtnText, styles.actionBtnTextSecondary]}>
              {sub.status === "active" ? "Pausar" : "Reactivar"}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionBtn, styles.actionBtnDanger]}
            onPress={(e) => { e.stopPropagation?.(); handleDelete(sub); }}
          >
            <Text style={[styles.actionBtnText, styles.actionBtnTextDanger]}>Eliminar</Text>
          </TouchableOpacity>
        </View>
      </Card>
    );
  }

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <ScreenHeader title="Suscripciones" />

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

      {/* FAB */}
      <TouchableOpacity
        style={[styles.fab, { bottom: insets.bottom + 16 }]}
        activeOpacity={0.85}
        onPress={() => setCreateFormVisible(true)}
        accessibilityLabel="Nueva suscripción"
      >
        <Text style={styles.fabIcon}>+</Text>
      </TouchableOpacity>

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
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.bg },
  content: { padding: SPACING.lg, gap: SPACING.md, paddingBottom: 100 },
  section: { gap: SPACING.sm },
  sectionTitle: {
    fontSize: FONT_SIZE.sm,
    fontWeight: FONT_WEIGHT.semibold,
    color: COLORS.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: SPACING.sm },
  info: { flex: 1, gap: 2 },
  name: { fontSize: FONT_SIZE.md, fontWeight: FONT_WEIGHT.semibold, color: COLORS.text },
  vendor: { fontSize: FONT_SIZE.xs, color: COLORS.textMuted },
  amounts: { alignItems: "flex-end", gap: 2 },
  amount: { fontSize: FONT_SIZE.md, fontWeight: FONT_WEIGHT.bold, color: COLORS.expense },
  amountMuted: { color: COLORS.textMuted },
  freq: { fontSize: FONT_SIZE.xs, color: COLORS.textMuted },
  metaRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: SPACING.sm },
  nextDue: { fontSize: FONT_SIZE.xs, color: COLORS.textMuted },
  monthly: { fontSize: FONT_SIZE.xs, color: COLORS.textMuted },
  actions: { flexDirection: "row", gap: SPACING.sm },
  actionBtn: {
    flex: 1,
    paddingVertical: SPACING.xs + 2,
    borderRadius: RADIUS.md,
    alignItems: "center",
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  actionBtnSecondary: { backgroundColor: "transparent" },
  actionBtnDanger: { backgroundColor: "transparent", borderColor: COLORS.danger + "66" },
  actionBtnText: { fontSize: FONT_SIZE.xs, fontWeight: FONT_WEIGHT.medium },
  actionBtnTextSecondary: { color: COLORS.textMuted },
  actionBtnTextDanger: { color: COLORS.danger },
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
