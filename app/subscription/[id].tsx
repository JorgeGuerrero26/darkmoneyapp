import { useCallback, useMemo, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MoreVertical } from "lucide-react-native";

import { ErrorBoundary } from "../../components/ui/ErrorBoundary";
import { EntityActionSheet } from "../../components/ui/EntityActionSheet";
import { SearchableSelectSheet } from "../../components/ui/SearchableSelectSheet";
import { ScreenHeader } from "../../components/layout/ScreenHeader";
import { HeaderActionGroup } from "../../components/ui/HeaderActionGroup";
import { NotificationReasonBanner } from "../../components/ui/NotificationReasonBanner";
import { ConfirmDialog } from "../../components/ui/ConfirmDialog";
import { ResourceModuleTemplate } from "../../components/ui/ResourceModuleTemplate";
import { SkeletonCard, SkeletonList } from "../../components/ui/Skeleton";
import { SubscriptionForm } from "../../components/forms/SubscriptionForm";
import { SubscriptionAnalyticsModal } from "../../components/domain/SubscriptionAnalyticsModal";
import { SubscriptionDetailHeader } from "../../features/subscriptions/components/SubscriptionDetailHeader";
import { SubscriptionDetailFacts } from "../../features/subscriptions/components/SubscriptionDetailFacts";
import { SubscriptionDetailMovements } from "../../features/subscriptions/components/SubscriptionDetailMovements";
import { SubscriptionDetailActions } from "../../features/subscriptions/components/SubscriptionDetailActions";
import { MarkSubscriptionPaidSheet } from "../../features/subscriptions/components/MarkSubscriptionPaidSheet";
import { useOriginBackNavigation } from "../../hooks/useOriginBackNavigation";
import { useNotificationReason } from "../../hooks/useNotificationReason";
import { useAuth } from "../../lib/auth-context";
import { todayPeru } from "../../lib/date";
import { formatSubscriptionYmd, rollDueDateForward } from "../../lib/subscription-helpers";
import { sortByName } from "../../lib/sort-locale";
import { useWorkspace } from "../../lib/workspace-context";
import { useUiStore } from "../../store/ui-store";
import { useWorkspaceSnapshotQuery } from "../../services/queries/workspace-data";
import { useSubscriptionOccurrencesQuery } from "../../services/queries/subscription-occurrences";
import {
  useDeleteSubscriptionMutation,
  useMarkSubscriptionPaidMutation,
  useToggleSubscriptionPinMutation,
  useUpdateSubscriptionMutation,
} from "../../services/queries/subscriptions-recurring-income";
import { useToast } from "../../hooks/useToast";
import { COLORS, FONT_SIZE, FONT_WEIGHT, SPACING } from "../../constants/theme";
import type { SubscriptionSummary } from "../../types/domain";

function parseSubscriptionId(raw: string | undefined): number | null {
  if (!raw) return null;
  const parsed = parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function SubscriptionDetailScreen() {
  // Fuerza el re-render de la pantalla al alternar modo privacidad (la máscara
  // vive en formatCurrency, que lee el store imperativamente).
  useUiStore((state) => state.privacyMode);
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { handleBack } = useOriginBackNavigation({
    originRoutes: {
      dashboard: "/(app)/dashboard",
      subscriptions: "/(app)/subscriptions",
      notifications: "/notifications",
    },
  });
  const { reason: notificationReason, dismiss: dismissNotificationReason } = useNotificationReason();
  const { profile } = useAuth();
  const { activeWorkspaceId, activeWorkspace } = useWorkspace();
  const { showToast, showErrorToast } = useToast();

  const [editFormVisible, setEditFormVisible] = useState(false);
  const [deleteConfirmVisible, setDeleteConfirmVisible] = useState(false);
  const [cancelConfirmVisible, setCancelConfirmVisible] = useState(false);
  const [analyticsOpen, setAnalyticsOpen] = useState(false);
  const [markPaidVisible, setMarkPaidVisible] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [accountPickerOpen, setAccountPickerOpen] = useState(false);
  const [categoryPickerOpen, setCategoryPickerOpen] = useState(false);

  const { data: snapshot, isLoading } = useWorkspaceSnapshotQuery(profile, activeWorkspaceId);
  const updateMutation = useUpdateSubscriptionMutation(activeWorkspaceId);
  const deleteMutation = useDeleteSubscriptionMutation(activeWorkspaceId);
  const togglePinMutation = useToggleSubscriptionPinMutation(activeWorkspaceId);
  const markPaidMutation = useMarkSubscriptionPaidMutation(activeWorkspaceId);
  const { data: occurrences } = useSubscriptionOccurrencesQuery(parseSubscriptionId(id));

  const subscriptionId = parseSubscriptionId(id);
  const subscription: SubscriptionSummary | null = useMemo(() => {
    if (subscriptionId == null) return null;
    return snapshot?.subscriptions.find((s) => s.id === subscriptionId) ?? null;
  }, [snapshot, subscriptionId]);

  const postedMovements = snapshot?.subscriptionPostedMovements ?? [];
  const baseCurrencyCode = activeWorkspace?.baseCurrencyCode ?? "PEN";
  // Lo que se viene a hacer cambia de nombre según la situación: ponerla al día no es lo mismo
  // que anotar el cobro del mes.
  const isOverdue = subscription != null && subscription.nextDueDate < todayPeru();
  const activeAccounts = useMemo(
    () => sortByName((snapshot?.accounts ?? []).filter((account) => !account.isArchived)),
    [snapshot?.accounts],
  );
  const expenseCategories = useMemo(
    () => sortByName(
      (snapshot?.categories ?? []).filter((c) => c.isActive && (c.kind === "expense" || c.kind === "both")),
    ),
    [snapshot?.categories],
  );

  const handleTogglePause = useCallback(() => {
    if (!subscription) return;
    const newStatus = subscription.status === "active" ? "paused" : "active";
    // Al reactivar (desde pausada o cancelada), rodar la fecha vencida a la
    // primera ocurrencia >= hoy según la cadencia registrada.
    const nextDueDate = newStatus === "active"
      ? rollDueDateForward(
          subscription.nextDueDate,
          subscription.frequency,
          subscription.intervalCount,
          todayPeru(),
          subscription.dayOfMonth,
        )
      : undefined;
    updateMutation.mutate(
      { id: subscription.id, input: { status: newStatus, ...(nextDueDate ? { nextDueDate } : {}) } },
      {
        onSuccess: () => showToast(
          newStatus === "paused" ? "Suscripción pausada" : "Suscripción reactivada",
          "success",
          newStatus === "paused"
            ? subscription.name
            : `${subscription.name} · próximo pago ${formatSubscriptionYmd(nextDueDate ?? subscription.nextDueDate)}`,
        ),
        onError: (e) => showErrorToast(newStatus === "paused" ? "No se pudo pausar la suscripción" : "No se pudo reactivar la suscripción", e),
      },
    );
  }, [subscription, updateMutation, showToast]);

  const handleCancelSubscription = useCallback(() => {
    if (!subscription) return;
    setCancelConfirmVisible(false);
    updateMutation.mutate(
      { id: subscription.id, input: { status: "cancelled" } },
      {
        onSuccess: () => showToast("Suscripción cancelada", "success", "Su historial se conserva"),
        onError: (e) => showErrorToast("No se pudo cancelar la suscripción", e),
      },
    );
  }, [subscription, updateMutation, showToast]);

  const handleTogglePin = useCallback(() => {
    if (!subscription) return;
    togglePinMutation.mutate(
      { id: subscription.id, isPinned: !subscription.isPinned },
      { onError: (err) => showErrorToast(subscription.isPinned ? "No se pudo desfijar la suscripción" : "No se pudo fijar la suscripción", err) },
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
      showErrorToast("No se pudo eliminar la suscripción", err);
    }
  }, [subscription, deleteMutation, handleBack, showToast]);

  /* "Sin cuenta" y "Sin categoría" son huecos con arreglo: se llenan desde su propia fila, sin
     abrir el formulario entero. Sin cuenta, además, "Anotar el gasto solo" no puede funcionar. */
  const handlePickAccount = useCallback((accountId: number | null) => {
    if (!subscription) return;
    updateMutation.mutate(
      { id: subscription.id, input: { accountId } },
      { onError: (err) => showErrorToast("No se pudo cambiar la cuenta", err) },
    );
  }, [subscription, updateMutation, showToast]);

  const handlePickCategory = useCallback((categoryId: number | null) => {
    if (!subscription) return;
    updateMutation.mutate(
      { id: subscription.id, input: { categoryId } },
      { onError: (err) => showErrorToast("No se pudo cambiar la categoría", err) },
    );
  }, [subscription, updateMutation, showToast]);

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
        showToast("Pago registrado", "success", `${subscription.name} · próximo cobro ${formatSubscriptionYmd(nextDueDate)}`);
      } catch (err: unknown) {
        showErrorToast("No se pudo registrar el pago", err);
      }
    },
    [markPaidMutation, showToast, subscription],
  );

  return (
    <ResourceModuleTemplate
      topInset={insets.top}
      header={
        <>
          <ScreenHeader
            title="Suscripción"
            onBack={handleBack}
            rightAction={
              subscription ? (
                <HeaderActionGroup
                  actions={[{
                    key: "menu",
                    icon: MoreVertical,
                    onPress: () => setMenuOpen(true),
                    accessibilityLabel: "Más acciones",
                  }]}
                />
              ) : null
            }
          />
          <NotificationReasonBanner reason={notificationReason} onDismiss={dismissNotificationReason} />
        </>
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
          <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
            <SubscriptionDetailHeader subscription={subscription} occurrences={occurrences} />
            <SubscriptionDetailFacts
              subscription={subscription}
              onPickAccount={() => setAccountPickerOpen(true)}
              onPickCategory={() => setCategoryPickerOpen(true)}
            />

            <SubscriptionDetailMovements
              subscriptionId={subscription.id}
              currencyCode={subscription.currencyCode}
              allPostedMovements={postedMovements}
            />

          </ScrollView>
        )
      }
      fab={subscription ? (
        <SubscriptionDetailActions
          bottomInset={insets.bottom}
          status={subscription.status}
          isOverdue={isOverdue}
          onEdit={() => setEditFormVisible(true)}
          onMarkPaid={() => setMarkPaidVisible(true)}
          onReactivate={handleTogglePause}
        />
      ) : null}
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
            visible={cancelConfirmVisible && Boolean(subscription)}
            title="¿Cancelar suscripción?"
            body={
              subscription
                ? `"${subscription.name}" pasará a Canceladas y dejará de generar cobros. Su historial de pagos se conserva y podrás reactivarla cuando quieras.`
                : undefined
            }
            confirmLabel="Sí, cancelar"
            cancelLabel="Volver"
            onCancel={() => setCancelConfirmVisible(false)}
            onConfirm={handleCancelSubscription}
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
          {subscription ? (
            <EntityActionSheet
              visible={menuOpen}
              onClose={() => setMenuOpen(false)}
              sheetTitle="Más acciones"
              summaryTitle={subscription.name}
              actions={[
                {
                  key: "analytics",
                  label: "Ver analítica",
                  variant: "secondary",
                  onPress: () => { setMenuOpen(false); setAnalyticsOpen(true); },
                },
                {
                  key: "pin",
                  label: subscription.isPinned ? "Quitar de fijadas" : "Fijar en la lista",
                  variant: "secondary",
                  onPress: () => { setMenuOpen(false); handleTogglePin(); },
                },
                ...(subscription.status === "active" ? [{
                  key: "pause",
                  label: "Pausar suscripción",
                  variant: "secondary" as const,
                  onPress: () => { setMenuOpen(false); handleTogglePause(); },
                }] : []),
                ...(subscription.status !== "cancelled" ? [{
                  key: "cancel",
                  label: "Cancelar suscripción",
                  variant: "ghost" as const,
                  onPress: () => { setMenuOpen(false); setCancelConfirmVisible(true); },
                }] : []),
                {
                  key: "delete",
                  label: "Eliminar suscripción",
                  variant: "ghost",
                  onPress: () => { setMenuOpen(false); setDeleteConfirmVisible(true); },
                },
              ]}
            />
          ) : null}
          <SearchableSelectSheet
            visible={accountPickerOpen}
            title="Se paga con"
            options={[
              { value: null as number | null, label: "Sin cuenta" },
              ...activeAccounts.map((account) => ({ value: account.id as number | null, label: account.name })),
            ]}
            value={subscription?.accountId ?? null}
            onChange={handlePickAccount}
            onClose={() => setAccountPickerOpen(false)}
          />
          <SearchableSelectSheet
            visible={categoryPickerOpen}
            title="Categoría"
            options={[
              { value: null as number | null, label: "Sin categoría" },
              ...expenseCategories.map((category) => ({ value: category.id as number | null, label: category.name })),
            ]}
            value={subscription?.categoryId ?? null}
            onChange={handlePickCategory}
            onClose={() => setCategoryPickerOpen(false)}
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

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  content: {
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.sm,
    paddingBottom: SPACING.lg,
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
});

export default function SubscriptionDetailScreenRoot() {
  return (
    <ErrorBoundary>
      <SubscriptionDetailScreen />
    </ErrorBoundary>
  );
}
