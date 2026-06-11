import { useCallback, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BarChart3, CheckCircle2, Pause, Pencil, Pin, PinOff, Play, Trash2 } from "lucide-react-native";

import { ErrorBoundary } from "../../components/ui/ErrorBoundary";
import { Card } from "../../components/ui/Card";
import { ScreenHeader } from "../../components/layout/ScreenHeader";
import { HeaderActionGroup } from "../../components/ui/HeaderActionGroup";
import { ConfirmDialog } from "../../components/ui/ConfirmDialog";
import { ResourceModuleTemplate } from "../../components/ui/ResourceModuleTemplate";
import { SkeletonCard, SkeletonList } from "../../components/ui/Skeleton";
import { SubscriptionForm } from "../../components/forms/SubscriptionForm";
import { SubscriptionAnalyticsModal } from "../../components/domain/SubscriptionAnalyticsModal";
import { SubscriptionDetailHeader } from "../../features/subscriptions/components/SubscriptionDetailHeader";
import { SubscriptionDetailQuickStats } from "../../features/subscriptions/components/SubscriptionDetailQuickStats";
import { SubscriptionDetailMovements } from "../../features/subscriptions/components/SubscriptionDetailMovements";
import { MarkSubscriptionPaidSheet } from "../../features/subscriptions/components/MarkSubscriptionPaidSheet";
import { useOriginBackNavigation } from "../../hooks/useOriginBackNavigation";
import { useAuth } from "../../lib/auth-context";
import { useWorkspace } from "../../lib/workspace-context";
import { useWorkspaceSnapshotQuery } from "../../services/queries/workspace-data";
import {
  useDeleteSubscriptionMutation,
  useMarkSubscriptionPaidMutation,
  useToggleSubscriptionPinMutation,
  useUpdateSubscriptionMutation,
} from "../../services/queries/subscriptions-recurring-income";
import { useToast } from "../../hooks/useToast";
import { COLORS, FONT_FAMILY, FONT_SIZE, FONT_WEIGHT, RADIUS, SPACING } from "../../constants/theme";
import type { SubscriptionSummary } from "../../types/domain";

function parseSubscriptionId(raw: string | undefined): number | null {
  if (!raw) return null;
  const parsed = parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function SubscriptionDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { handleBack } = useOriginBackNavigation({
    originRoutes: { dashboard: "/(app)/dashboard", subscriptions: "/(app)/subscriptions" },
  });
  const { profile } = useAuth();
  const { activeWorkspaceId, activeWorkspace } = useWorkspace();
  const { showToast } = useToast();

  const [editFormVisible, setEditFormVisible] = useState(false);
  const [deleteConfirmVisible, setDeleteConfirmVisible] = useState(false);
  const [analyticsOpen, setAnalyticsOpen] = useState(false);
  const [markPaidVisible, setMarkPaidVisible] = useState(false);

  const { data: snapshot, isLoading } = useWorkspaceSnapshotQuery(profile, activeWorkspaceId);
  const updateMutation = useUpdateSubscriptionMutation(activeWorkspaceId);
  const deleteMutation = useDeleteSubscriptionMutation(activeWorkspaceId);
  const togglePinMutation = useToggleSubscriptionPinMutation(activeWorkspaceId);
  const markPaidMutation = useMarkSubscriptionPaidMutation(activeWorkspaceId);

  const subscriptionId = parseSubscriptionId(id);
  const subscription: SubscriptionSummary | null = useMemo(() => {
    if (subscriptionId == null) return null;
    return snapshot?.subscriptions.find((s) => s.id === subscriptionId) ?? null;
  }, [snapshot, subscriptionId]);

  const postedMovements = snapshot?.subscriptionPostedMovements ?? [];
  const baseCurrencyCode = activeWorkspace?.baseCurrencyCode ?? "PEN";

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

  const handleTogglePin = useCallback(() => {
    if (!subscription) return;
    togglePinMutation.mutate(
      { id: subscription.id, isPinned: !subscription.isPinned },
      { onError: (err) => showToast(err.message, "error") },
    );
  }, [subscription, showToast, togglePinMutation]);

  const handleDelete = useCallback(async () => {
    if (!subscription) return;
    setDeleteConfirmVisible(false);
    try {
      await deleteMutation.mutateAsync(subscription.id);
      showToast("Suscripción eliminada", "success");
      handleBack();
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : "No se pudo eliminar", "error");
    }
  }, [subscription, deleteMutation, handleBack, showToast]);

  const isPaused = subscription?.status === "paused";

  const handleMarkPaid = useCallback(
    async (args: { paidDate: string; amount: number; accountId: number }) => {
      if (!subscription) return;
      try {
        const { nextDueDate } = await markPaidMutation.mutateAsync({
          subscription,
          paidDate: args.paidDate,
          amount: args.amount,
          accountId: args.accountId,
        });
        setMarkPaidVisible(false);
        showToast(`Pago registrado · Próximo cobro: ${nextDueDate}`, "success");
      } catch (err: unknown) {
        showToast(err instanceof Error ? err.message : "No se pudo registrar el pago", "error");
      }
    },
    [markPaidMutation, showToast, subscription],
  );

  return (
    <ResourceModuleTemplate
      topInset={insets.top}
      header={
        <ScreenHeader
          title={subscription?.name ?? "Suscripción"}
          subtitle={activeWorkspace?.name}
          onBack={handleBack}
          rightAction={
            subscription ? (
              <HeaderActionGroup
                actions={[
                  {
                    key: "pin",
                    icon: subscription.isPinned ? PinOff : Pin,
                    onPress: handleTogglePin,
                    accessibilityLabel: subscription.isPinned ? "Desfijar" : "Fijar",
                  },
                  {
                    key: "analytics",
                    icon: BarChart3,
                    onPress: () => setAnalyticsOpen(true),
                    accessibilityLabel: "Ver analítica",
                  },
                  {
                    key: "edit",
                    icon: Pencil,
                    onPress: () => setEditFormVisible(true),
                    accessibilityLabel: "Editar suscripción",
                  },
                  {
                    key: "delete",
                    icon: Trash2,
                    onPress: () => setDeleteConfirmVisible(true),
                    accessibilityLabel: "Eliminar suscripción",
                  },
                ]}
              />
            ) : null
          }
        />
      }
      list={
        isLoading ? (
          <SkeletonList>
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </SkeletonList>
        ) : !subscription ? (
          <View style={styles.center}>
            <Text style={styles.errorTitle}>Suscripción no encontrada</Text>
            <Text style={styles.errorBody}>
              {subscriptionId == null
                ? "El identificador de la suscripción no es válido."
                : "Es posible que la suscripción haya sido eliminada."}
            </Text>
          </View>
        ) : (
          <ScrollView contentContainerStyle={styles.content}>
            <SubscriptionDetailHeader subscription={subscription} />

            <Card style={styles.quickActions}>
              <Text style={styles.quickActionsHint}>Acciones rápidas</Text>
              <View style={styles.quickActionsRow}>
                {subscription.status === "active" ? (
                  <QuickActionButton
                    icon={CheckCircle2}
                    label="Marcar pagada"
                    onPress={() => setMarkPaidVisible(true)}
                  />
                ) : null}
                <QuickActionButton
                  icon={isPaused ? Play : Pause}
                  label={isPaused ? "Reactivar" : "Pausar"}
                  onPress={handleTogglePause}
                />
                <QuickActionButton
                  icon={BarChart3}
                  label="Análisis"
                  onPress={() => setAnalyticsOpen(true)}
                />
              </View>
            </Card>

            <SubscriptionDetailQuickStats subscription={subscription} />

            <SubscriptionDetailMovements
              subscriptionId={subscription.id}
              currencyCode={subscription.currencyCode}
              allPostedMovements={postedMovements}
            />

            {subscription.description || subscription.notes ? (
              <Card>
                <Text style={styles.sectionTitle}>Detalles</Text>
                {subscription.description ? (
                  <Text style={styles.notes}>{subscription.description}</Text>
                ) : null}
                {subscription.notes ? (
                  <>
                    {subscription.description ? <View style={styles.notesDivider} /> : null}
                    <Text style={styles.notesLabel}>Notas</Text>
                    <Text style={styles.notes}>{subscription.notes}</Text>
                  </>
                ) : null}
              </Card>
            ) : null}
          </ScrollView>
        )
      }
      overlays={
        <>
          {subscription ? (
            <SubscriptionForm
              visible={editFormVisible}
              onClose={() => setEditFormVisible(false)}
              onSuccess={() => setEditFormVisible(false)}
              editSubscription={subscription}
            />
          ) : null}
          <SubscriptionAnalyticsModal
            visible={analyticsOpen && Boolean(subscription)}
            onClose={() => setAnalyticsOpen(false)}
            subscription={subscription}
            movements={postedMovements}
            baseCurrencyCode={baseCurrencyCode}
          />
          <ConfirmDialog
            visible={deleteConfirmVisible && Boolean(subscription)}
            title="¿Eliminar suscripción?"
            body={
              subscription
                ? `Se eliminará "${subscription.name}" permanentemente.`
                : undefined
            }
            confirmLabel="Sí, eliminar"
            cancelLabel="Cancelar"
            destructive
            onCancel={() => setDeleteConfirmVisible(false)}
            onConfirm={() => void handleDelete()}
          />
          <MarkSubscriptionPaidSheet
            visible={markPaidVisible}
            subscription={subscription}
            accounts={snapshot?.accounts ?? []}
            isPending={markPaidMutation.isPending}
            onClose={() => setMarkPaidVisible(false)}
            onConfirm={(args) => void handleMarkPaid(args)}
          />
        </>
      }
    />
  );
}

function QuickActionButton({
  icon: Icon,
  label,
  onPress,
}: {
  icon: typeof Pin;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.quickAction, pressed && styles.quickActionPressed]}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Icon size={16} color={COLORS.primary} strokeWidth={2} />
      <Text style={styles.quickActionLabel}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: SPACING.lg,
    gap: SPACING.md,
    paddingBottom: SPACING.xxxl,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: SPACING.lg,
    gap: SPACING.sm,
  },
  errorTitle: {
    color: COLORS.text,
    fontSize: FONT_SIZE.md,
    fontWeight: FONT_WEIGHT.semibold,
  },
  errorBody: {
    color: COLORS.textMuted,
    fontSize: FONT_SIZE.sm,
    textAlign: "center",
  },
  quickActions: { gap: SPACING.sm },
  quickActionsHint: {
    fontFamily: FONT_FAMILY.bodySemibold,
    fontSize: FONT_SIZE.xs,
    color: COLORS.textMuted,
    textTransform: "uppercase",
  },
  quickActionsRow: { flexDirection: "row", gap: SPACING.sm },
  quickAction: {
    flex: 1,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.xs,
    alignItems: "center",
    gap: SPACING.xs,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.bgCard,
  },
  quickActionPressed: { opacity: 0.6 },
  quickActionLabel: {
    fontFamily: FONT_FAMILY.bodySemibold,
    fontSize: FONT_SIZE.xs,
    color: COLORS.primary,
  },
  sectionTitle: {
    fontSize: FONT_SIZE.xs,
    fontWeight: FONT_WEIGHT.semibold,
    color: COLORS.textMuted,
    textTransform: "uppercase",
    marginBottom: SPACING.xs,
  },
  notes: { fontSize: FONT_SIZE.sm, color: COLORS.text, lineHeight: 20 },
  notesLabel: {
    fontFamily: FONT_FAMILY.bodySemibold,
    fontSize: FONT_SIZE.xs,
    color: COLORS.textMuted,
    textTransform: "uppercase",
    marginBottom: SPACING.xs,
    marginTop: SPACING.sm,
  },
  notesDivider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginVertical: SPACING.sm,
  },
});

export default function SubscriptionDetailScreenRoot() {
  return (
    <ErrorBoundary>
      <SubscriptionDetailScreen />
    </ErrorBoundary>
  );
}
