import { useMemo, useState, useCallback } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { BarChart3 } from "lucide-react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { format } from "date-fns";
import { es } from "date-fns/locale";

import { useAuth } from "../../lib/auth-context";
import { useWorkspace } from "../../lib/workspace-context";
import {
  useWorkspaceSnapshotQuery,
  useUpdateSubscriptionMutation,
  useDeleteSubscriptionMutation,
} from "../../services/queries/workspace-data";
import type { SubscriptionSummary } from "../../types/domain";
import { Card } from "../../components/ui/Card";
import { ScreenHeader } from "../../components/layout/ScreenHeader";
import { ConfirmDialog } from "../../components/ui/ConfirmDialog";
import { SubscriptionForm } from "../../components/forms/SubscriptionForm";
import { formatCurrency } from "../../components/ui/AmountDisplay";
import { useToast } from "../../hooks/useToast";
import { COLORS, FONT_SIZE, FONT_WEIGHT, RADIUS, SPACING } from "../../constants/theme";
import { SubscriptionAnalyticsModal } from "../../components/domain/SubscriptionAnalyticsModal";

function formatYmdLocal(ymd: string, pattern: string) {
  const p = ymd.split("-").map(Number);
  if (p.length !== 3 || p.some((n) => Number.isNaN(n))) return ymd;
  return format(new Date(p[0], p[1] - 1, p[2]), pattern, { locale: es });
}

export default function SubscriptionDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { profile } = useAuth();
  const { activeWorkspaceId, activeWorkspace } = useWorkspace();
  const { showToast } = useToast();

  const [editFormVisible, setEditFormVisible] = useState(false);
  const [deleteConfirmVisible, setDeleteConfirmVisible] = useState(false);
  const [analyticsOpen, setAnalyticsOpen] = useState(false);

  const { data: snapshot, isLoading } = useWorkspaceSnapshotQuery(profile, activeWorkspaceId);
  const updateMutation = useUpdateSubscriptionMutation(activeWorkspaceId);
  const deleteMutation = useDeleteSubscriptionMutation(activeWorkspaceId);

  const subscription: SubscriptionSummary | null = useMemo(
    () => snapshot?.subscriptions.find((s) => s.id === parseInt(id ?? "0")) ?? null,
    [snapshot, id],
  );

  const postedMovements = snapshot?.subscriptionPostedMovements ?? [];

  const handleTogglePause = useCallback(() => {
    if (!subscription) return;
    const newStatus = subscription.status === "active" ? "paused" : "active";
    updateMutation.mutate(
      { id: subscription.id, input: { status: newStatus } },
      {
        onSuccess: () => showToast(newStatus === "paused" ? "Pausada" : "Reactivada", "success"),
        onError: (e) => showToast(e.message, "error"),
      },
    );
  }, [subscription, updateMutation, showToast]);

  function confirmDeleteSubscription() {
    if (!subscription) return;
    deleteMutation.mutate(subscription.id, {
      onSuccess: () => {
        setDeleteConfirmVisible(false);
        showToast("Suscripción eliminada", "success");
        router.back();
      },
      onError: (e) => showToast(e.message, "error"),
    });
  }

  const monthlyCost = subscription
    ? subscription.frequency === "monthly" ? subscription.amount
      : subscription.frequency === "yearly" ? subscription.amount / 12
      : subscription.frequency === "weekly" ? (subscription.amount * 52) / 12
      : subscription.frequency === "quarterly" ? subscription.amount / 3
      : subscription.amount
    : 0;

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <ScreenHeader
        title={subscription?.name ?? "Suscripción"}
        subtitle={activeWorkspace?.name}
        rightAction={
          <View style={styles.headerActions}>
            {subscription ? (
              <>
                <TouchableOpacity style={styles.editBtn} onPress={() => setAnalyticsOpen(true)}>
                  <Text style={styles.editBtnText}>Análisis</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.editBtn} onPress={() => setEditFormVisible(true)}>
                  <Text style={styles.editBtnText}>Editar</Text>
                </TouchableOpacity>
              </>
            ) : null}
            <TouchableOpacity onPress={() => router.back()}>
              <Text style={styles.back}>‹ Volver</Text>
            </TouchableOpacity>
          </View>
        }
      />

      {isLoading ? (
        <View style={styles.center}><ActivityIndicator color={COLORS.primary} /></View>
      ) : !subscription ? (
        <View style={styles.center}><Text style={styles.errorText}>No encontrada</Text></View>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          {/* Hero */}
          <Card style={styles.heroCard}>
            <Text style={styles.heroAmount}>{formatCurrency(subscription.amount, subscription.currencyCode)}</Text>
            <Text style={styles.heroFreq}>{subscription.frequencyLabel}</Text>
            {monthlyCost !== subscription.amount ? (
              <Text style={styles.heroMonthly}>~{formatCurrency(monthlyCost, subscription.currencyCode)}/mes</Text>
            ) : null}
            <View style={[styles.statusBadge, subscription.status !== "active" && styles.statusBadgeMuted]}>
              <Text style={[styles.statusText, subscription.status !== "active" && styles.statusTextMuted]}>
                {subscription.status === "active" ? "Activa" : subscription.status === "paused" ? "Pausada" : "Cancelada"}
              </Text>
            </View>
          </Card>

          {/* Details */}
          <Card>
            {subscription.vendor ? <><DetailRow label="Proveedor" value={subscription.vendor} /><Divider /></> : null}
            <DetailRow label="Próximo cobro" value={formatYmdLocal(subscription.nextDueDate, "d 'de' MMMM yyyy")} />
            <Divider />
            <DetailRow label="Inicio" value={formatYmdLocal(subscription.startDate, "d MMM yyyy")} />
            {subscription.endDate ? (
              <>
                <Divider />
                <DetailRow label="Fin" value={formatYmdLocal(subscription.endDate, "d MMM yyyy")} />
              </>
            ) : null}
            {subscription.accountName ? (
              <>
                <Divider />
                <DetailRow label="Cuenta" value={subscription.accountName} />
              </>
            ) : null}
            {subscription.categoryName ? (
              <>
                <Divider />
                <DetailRow label="Categoría" value={subscription.categoryName} />
              </>
            ) : null}
            <Divider />
            <DetailRow label="Recordatorio" value={subscription.remindDaysBefore > 0 ? `${subscription.remindDaysBefore} días antes` : "Sin recordatorio"} />
            <Divider />
            <DetailRow label="Crear movimiento automático" value={subscription.autoCreateMovement ? "Sí" : "No"} />
            {subscription.description ? (
              <>
                <Divider />
                <DetailRow label="Descripción" value={subscription.description} />
              </>
            ) : null}
            {subscription.notes ? (
              <>
                <Divider />
                <DetailRow label="Notas" value={subscription.notes} />
              </>
            ) : null}
          </Card>

          {/* Actions */}
          <View style={styles.actionsRow}>
            <TouchableOpacity
              style={[styles.actionBtn, styles.actionBtnSecondary]}
              onPress={handleTogglePause}
            >
              <Text style={[styles.actionBtnText, styles.actionBtnTextSecondary]}>
                {subscription.status === "active" ? "Pausar" : "Reactivar"}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionBtn, styles.actionBtnDanger]}
              onPress={() => setDeleteConfirmVisible(true)}
            >
              <Text style={[styles.actionBtnText, styles.actionBtnTextDanger]}>Eliminar</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      )}

      <SubscriptionForm
        visible={editFormVisible}
        onClose={() => setEditFormVisible(false)}
        onSuccess={() => setEditFormVisible(false)}
        editSubscription={subscription ?? undefined}
      />

      <SubscriptionAnalyticsModal
        visible={analyticsOpen && Boolean(subscription)}
        onClose={() => setAnalyticsOpen(false)}
        subscription={subscription}
        movements={postedMovements}
        baseCurrencyCode={activeWorkspace?.baseCurrencyCode ?? "PEN"}
      />

      <ConfirmDialog
        visible={deleteConfirmVisible && Boolean(subscription)}
        title="Eliminar suscripción"
        body={
          subscription
            ? `¿Eliminar «${subscription.name}»? Esta acción no se puede deshacer.`
            : undefined
        }
        confirmLabel="Eliminar"
        cancelLabel="Cancelar"
        destructive
        onCancel={() => setDeleteConfirmVisible(false)}
        onConfirm={confirmDeleteSubscription}
      />
    </View>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={rowStyles.row}>
      <Text style={rowStyles.label}>{label}</Text>
      <Text style={rowStyles.value}>{value}</Text>
    </View>
  );
}
function Divider() { return <View style={rowStyles.divider} />; }
const rowStyles = StyleSheet.create({
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: SPACING.md },
  label: { fontSize: FONT_SIZE.sm, color: COLORS.textMuted, flex: 1 },
  value: { fontSize: FONT_SIZE.sm, color: COLORS.text, fontWeight: FONT_WEIGHT.medium, flex: 2, textAlign: "right" },
  divider: { height: 1, backgroundColor: COLORS.border, marginVertical: SPACING.sm },
});

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.bg },
  content: { padding: SPACING.lg, gap: SPACING.md, paddingBottom: SPACING.xl },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  errorText: { color: COLORS.textMuted, fontSize: FONT_SIZE.md },
  headerActions: { flexDirection: "row", alignItems: "center", gap: SPACING.sm },
  editBtnRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  editBtn: {
    paddingHorizontal: SPACING.sm, paddingVertical: 4,
    borderRadius: RADIUS.full, borderWidth: 1, borderColor: COLORS.primary,
  },
  editBtnText: { fontSize: FONT_SIZE.xs, color: COLORS.primary, fontWeight: FONT_WEIGHT.medium },
  back: { fontSize: FONT_SIZE.sm, color: COLORS.primary },
  heroCard: { alignItems: "center", gap: SPACING.sm, paddingVertical: SPACING.xl },
  heroAmount: { fontSize: 36, fontWeight: FONT_WEIGHT.bold, color: COLORS.expense },
  heroFreq: { fontSize: FONT_SIZE.md, color: COLORS.textMuted },
  heroMonthly: { fontSize: FONT_SIZE.sm, color: COLORS.textDisabled },
  statusBadge: {
    paddingHorizontal: SPACING.md, paddingVertical: 4,
    borderRadius: RADIUS.full, backgroundColor: COLORS.income + "22",
  },
  statusBadgeMuted: { backgroundColor: COLORS.border },
  statusText: { fontSize: FONT_SIZE.xs, color: COLORS.income, fontWeight: FONT_WEIGHT.semibold },
  statusTextMuted: { color: COLORS.textMuted },
  actionsRow: { flexDirection: "row", gap: SPACING.sm },
  actionBtn: {
    flex: 1, paddingVertical: SPACING.sm, borderRadius: RADIUS.md,
    alignItems: "center", borderWidth: 1,
  },
  actionBtnSecondary: { borderColor: COLORS.border, backgroundColor: "transparent" },
  actionBtnDanger: { borderColor: COLORS.danger + "66", backgroundColor: "transparent" },
  actionBtnText: { fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.medium },
  actionBtnTextSecondary: { color: COLORS.textMuted },
  actionBtnTextDanger: { color: COLORS.danger },
});
