import { useCallback, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ban, BarChart3, MoreVertical, Pause } from "lucide-react-native";

import { ErrorBoundary } from "../../components/ui/ErrorBoundary";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
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
import { COLORS, FONT_FAMILY, FONT_SIZE, FONT_WEIGHT, RADIUS, SPACING, SURFACE } from "../../constants/theme";
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
  const { showToast } = useToast();

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
      ? rollDueDateForward(subscription.nextDueDate, subscription.frequency, subscription.intervalCount, todayPeru())
      : undefined;
    updateMutation.mutate(
      { id: subscription.id, input: { status: newStatus, ...(nextDueDate ? { nextDueDate } : {}) } },
      {
        onSuccess: () => showToast(
          newStatus === "paused"
            ? "Pausada"
            : `Reactivada. Próximo pago: ${formatSubscriptionYmd(nextDueDate ?? subscription.nextDueDate)}`,
          "success",
        ),
        onError: (e) => showToast(e.message, "error"),
      },
    );
  }, [subscription, updateMutation, showToast]);

  const handleCancelSubscription = useCallback(() => {
    if (!subscription) return;
    setCancelConfirmVisible(false);
    updateMutation.mutate(
      { id: subscription.id, input: { status: "cancelled" } },
      {
        onSuccess: () => showToast("Suscripción cancelada. Su historial se conserva.", "success"),
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

  /* "Sin cuenta" y "Sin categoría" son huecos con arreglo: se llenan desde su propia fila, sin
     abrir el formulario entero. Sin cuenta, además, "Anotar el gasto solo" no puede funcionar. */
  const handlePickAccount = useCallback((accountId: number | null) => {
    if (!subscription) return;
    updateMutation.mutate(
      { id: subscription.id, input: { accountId } },
      { onError: (err) => showToast(err.message, "error") },
    );
  }, [subscription, updateMutation, showToast]);

  const handlePickCategory = useCallback((categoryId: number | null) => {
    if (!subscription) return;
    updateMutation.mutate(
      { id: subscription.id, input: { categoryId } },
      { onError: (err) => showToast(err.message, "error") },
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
        <>
          {/* Eran cuatro íconos sin etiqueta —uno de ellos un alfiler tachado que lo mismo
              decía "está fijada" que "toca para fijarla"— comiéndose el sitio del nombre. Lo
              administrativo baja al menú, donde cada acción se lee. El subtítulo era el dueño
              de la cuenta: sale en todas las suscripciones y nunca cambia. */}
          <ScreenHeader
            title={subscription?.name ?? "Suscripción"}
            onBack={handleBack}
            rightAction={
              subscription ? (
                <HeaderActionGroup
                  actions={[
                    {
                      key: "analytics",
                      icon: BarChart3,
                      onPress: () => setAnalyticsOpen(true),
                      accessibilityLabel: "Ver analítica",
                    },
                    {
                      key: "menu",
                      icon: MoreVertical,
                      onPress: () => setMenuOpen(true),
                      accessibilityLabel: "Más acciones",
                    },
                  ]}
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
          <ScrollView contentContainerStyle={styles.content}>
            <SubscriptionDetailHeader subscription={subscription} occurrences={occurrences} />

            {/* Eran cuatro acciones del mismo tamaño y color: una es a lo que se viene, dos son
                administrativas y una es irreversible. Y "Análisis" estaba dos veces en la misma
                pantalla —aquí y como ícono del encabezado—. */}
            {subscription.status === "active" ? (
              <Button
                label={isOverdue ? "Ponerla al día" : "Marcar como pagada"}
                size="lg"
                onPress={() => setMarkPaidVisible(true)}
              />
            ) : (
              <Button label="Reactivar" size="lg" onPress={handleTogglePause} />
            )}

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

            {/* Administrativas: bajan al final, separadas de lo que se viene a hacer. */}
            <View style={styles.footerActions}>
              {/* Reactivar ya es la acción primaria cuando está parada: aquí sobraría. */}
              {subscription.status === "active" ? (
                <FooterAction icon={Pause} label="Pausar" onPress={handleTogglePause} />
              ) : null}
              {subscription.status !== "cancelled" ? (
                <FooterAction icon={Ban} label="Cancelar" onPress={() => setCancelConfirmVisible(true)} />
              ) : null}
            </View>

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
                  key: "edit",
                  label: "Editar suscripción",
                  variant: "secondary",
                  onPress: () => { setMenuOpen(false); setEditFormVisible(true); },
                },
                {
                  key: "pin",
                  label: subscription.isPinned ? "Quitar de fijadas" : "Fijar en la lista",
                  variant: "secondary",
                  onPress: () => { setMenuOpen(false); handleTogglePin(); },
                },
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

function FooterAction({
  icon: Icon,
  label,
  onPress,
}: {
  icon: typeof Pause;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.footerAction, pressed && styles.footerActionPressed]}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Icon size={15} color={COLORS.storm} strokeWidth={2} />
      <Text style={styles.footerActionLabel}>{label}</Text>
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
  footerActions: {
    flexDirection: "row",
    gap: SPACING.sm,
    marginTop: SPACING.lg,
  },
  footerAction: {
    flex: 1,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: SPACING.xs,
    minHeight: 48,
    borderWidth: 1,
    borderColor: SURFACE.cardBorder,
    borderRadius: RADIUS.md,
  },
  footerActionPressed: { opacity: 0.6 },
  footerActionLabel: {
    fontFamily: FONT_FAMILY.bodyMedium,
    fontSize: FONT_SIZE.sm,
    color: COLORS.fog,
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
