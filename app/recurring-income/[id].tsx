import { useCallback, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { format } from "date-fns";
import { BarChart3, CheckCircle2, Pause, Pencil, Pin, PinOff, Play, Trash2 } from "lucide-react-native";

import { ErrorBoundary } from "../../components/ui/ErrorBoundary";
import { Card } from "../../components/ui/Card";
import { ScreenHeader } from "../../components/layout/ScreenHeader";
import { HeaderActionGroup } from "../../components/ui/HeaderActionGroup";
import { ConfirmDialog } from "../../components/ui/ConfirmDialog";
import { ResourceModuleTemplate } from "../../components/ui/ResourceModuleTemplate";
import { SkeletonCard, SkeletonList } from "../../components/ui/Skeleton";
import { RecurringIncomeForm } from "../../components/forms/RecurringIncomeForm";
import { RecurringIncomeAnalyticsModal } from "../../components/domain/RecurringIncomeAnalyticsModal";
import { RecurringIncomeArrivalSheet, type RecurringIncomeBaseChangeMode } from "../../features/recurring-income/components/RecurringIncomeArrivalSheet";
import { RecurringIncomeDetailHeader } from "../../features/recurring-income/components/RecurringIncomeDetailHeader";
import { RecurringIncomeDetailQuickStats } from "../../features/recurring-income/components/RecurringIncomeDetailQuickStats";
import { RecurringIncomeDetailHistory } from "../../features/recurring-income/components/RecurringIncomeDetailHistory";
import { useOriginBackNavigation } from "../../hooks/useOriginBackNavigation";
import { useAuth } from "../../lib/auth-context";
import { useWorkspace } from "../../lib/workspace-context";
import {
  useConfirmRecurringIncomeArrivalMutation,
  useWorkspaceSnapshotQuery,
} from "../../services/queries/workspace-data";
import {
  useDeleteRecurringIncomeMutation,
  useToggleRecurringIncomePinMutation,
  useUpdateRecurringIncomeMutation,
} from "../../services/queries/subscriptions-recurring-income";
import { useToast } from "../../hooks/useToast";
import { COLORS, FONT_FAMILY, FONT_SIZE, FONT_WEIGHT, RADIUS, SPACING } from "../../constants/theme";
import type { RecurringIncomeSummary } from "../../types/domain";

function parseRecurringIncomeId(raw: string | undefined): number | null {
  if (!raw) return null;
  const parsed = parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function parseMoneyInput(value: string) {
  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function RecurringIncomeDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { handleBack } = useOriginBackNavigation({
    originRoutes: { dashboard: "/(app)/dashboard", "recurring-income": "/recurring-income" },
  });
  const { profile } = useAuth();
  const { activeWorkspaceId, activeWorkspace } = useWorkspace();
  const { showToast } = useToast();

  const [editFormVisible, setEditFormVisible] = useState(false);
  const [deleteConfirmVisible, setDeleteConfirmVisible] = useState(false);
  const [analyticsOpen, setAnalyticsOpen] = useState(false);

  // Arrival sheet state (replica del route principal porque el sheet es controlado)
  const [arrivalVisible, setArrivalVisible] = useState(false);
  const [arrivalDate, setArrivalDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [arrivalAmount, setArrivalAmount] = useState("");
  const [arrivalAccountId, setArrivalAccountId] = useState<number | null>(null);
  const [arrivalBaseChangeMode, setArrivalBaseChangeMode] = useState<RecurringIncomeBaseChangeMode>("none");
  const [arrivalNewBaseAmount, setArrivalNewBaseAmount] = useState("");
  const [arrivalNotes, setArrivalNotes] = useState("");
  const [arrivalError, setArrivalError] = useState("");

  const { data: snapshot, isLoading } = useWorkspaceSnapshotQuery(profile, activeWorkspaceId);
  const updateMutation = useUpdateRecurringIncomeMutation(activeWorkspaceId);
  const deleteMutation = useDeleteRecurringIncomeMutation(activeWorkspaceId);
  const togglePinMutation = useToggleRecurringIncomePinMutation(activeWorkspaceId);
  const confirmArrivalMutation = useConfirmRecurringIncomeArrivalMutation(activeWorkspaceId);

  const itemId = parseRecurringIncomeId(id);
  const item: RecurringIncomeSummary | null = useMemo(() => {
    if (itemId == null) return null;
    return snapshot?.recurringIncome.find((entry) => entry.id === itemId) ?? null;
  }, [snapshot, itemId]);

  const accounts = useMemo(
    () => snapshot?.accounts.filter((account) => !account.isArchived) ?? [],
    [snapshot?.accounts],
  );

  const handleTogglePause = useCallback(() => {
    if (!item) return;
    const newStatus = item.status === "active" ? "paused" : "active";
    updateMutation.mutate(
      { id: item.id, input: { status: newStatus } },
      {
        onSuccess: () => showToast(newStatus === "paused" ? "Pausado" : "Reactivado", "success"),
        onError: (e) => showToast(e.message, "error"),
      },
    );
  }, [item, updateMutation, showToast]);

  const handleTogglePin = useCallback(() => {
    if (!item) return;
    togglePinMutation.mutate(
      { id: item.id, isPinned: !item.isPinned },
      { onError: (err) => showToast(err.message, "error") },
    );
  }, [item, showToast, togglePinMutation]);

  const handleDelete = useCallback(async () => {
    if (!item) return;
    setDeleteConfirmVisible(false);
    try {
      await deleteMutation.mutateAsync(item.id);
      showToast("Ingreso fijo eliminado", "success");
      handleBack();
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : "No se pudo eliminar", "error");
    }
  }, [item, deleteMutation, handleBack, showToast]);

  const openArrival = useCallback(() => {
    if (!item) return;
    setArrivalDate(format(new Date(), "yyyy-MM-dd"));
    setArrivalAmount(String(item.amount));
    setArrivalAccountId(item.accountId ?? null);
    setArrivalBaseChangeMode("none");
    setArrivalNewBaseAmount(String(item.amount));
    setArrivalNotes("");
    setArrivalError("");
    setArrivalVisible(true);
  }, [item]);

  const closeArrival = useCallback(() => {
    setArrivalVisible(false);
    setArrivalError("");
  }, []);

  const parsedArrivalNewBaseAmount = parseMoneyInput(arrivalNewBaseAmount);
  const arrivalBaseDelta = item && parsedArrivalNewBaseAmount != null
    ? parsedArrivalNewBaseAmount - item.amount
    : null;

  const handleConfirmArrival = useCallback(async () => {
    if (!item) return;
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
      if (arrivalBaseChangeMode === "bonus" && nextBaseAmount <= item.amount) {
        setArrivalError("Si hubo bonificación permanente, el nuevo monto base debe ser mayor al actual.");
        return;
      }
      if (arrivalBaseChangeMode === "discount" && nextBaseAmount >= item.amount) {
        setArrivalError("Si hubo descuento permanente, el nuevo monto base debe ser menor al actual.");
        return;
      }
    }

    try {
      setArrivalError("");
      await confirmArrivalMutation.mutateAsync({
        recurringIncomeId: item.id,
        recurringIncomeName: item.name,
        expectedDate: item.nextExpectedDate,
        actualDate: arrivalDate,
        amount: actualAmount,
        accountId: arrivalAccountId,
        currentAccountId: item.accountId ?? null,
        categoryId: item.categoryId ?? null,
        payerPartyId: item.payerPartyId ?? null,
        description: item.description ?? null,
        notes: arrivalNotes.trim() || null,
        currencyCode: item.currencyCode,
        frequency: item.frequency,
        intervalCount: item.intervalCount,
        currentBaseAmount: item.amount,
        newBaseAmount: nextBaseAmount,
        baseChangeKind: arrivalBaseChangeMode === "none" ? null : arrivalBaseChangeMode,
      });
      showToast("Llegada confirmada", "success");
      closeArrival();
    } catch (err: unknown) {
      setArrivalError(err instanceof Error ? err.message : "No se pudo confirmar la llegada.");
    }
  }, [
    arrivalAccountId,
    arrivalAmount,
    arrivalBaseChangeMode,
    arrivalDate,
    arrivalNewBaseAmount,
    arrivalNotes,
    closeArrival,
    confirmArrivalMutation,
    item,
    showToast,
  ]);

  const isPaused = item?.status === "paused";

  return (
    <ResourceModuleTemplate
      topInset={insets.top}
      header={
        <ScreenHeader
          title={item?.name ?? "Ingreso fijo"}
          subtitle={activeWorkspace?.name}
          onBack={handleBack}
          rightAction={
            item ? (
              <HeaderActionGroup
                actions={[
                  {
                    key: "pin",
                    icon: item.isPinned ? PinOff : Pin,
                    onPress: handleTogglePin,
                    accessibilityLabel: item.isPinned ? "Desfijar" : "Fijar",
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
                    accessibilityLabel: "Editar ingreso fijo",
                  },
                  {
                    key: "delete",
                    icon: Trash2,
                    onPress: () => setDeleteConfirmVisible(true),
                    accessibilityLabel: "Eliminar ingreso fijo",
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
        ) : !item ? (
          <View style={styles.center}>
            <Text style={styles.errorTitle}>Ingreso fijo no encontrado</Text>
            <Text style={styles.errorBody}>
              {itemId == null
                ? "El identificador del ingreso fijo no es válido."
                : "Es posible que el ingreso fijo haya sido eliminado."}
            </Text>
          </View>
        ) : (
          <ScrollView contentContainerStyle={styles.content}>
            <RecurringIncomeDetailHeader item={item} />

            <Card style={styles.quickActions}>
              <Text style={styles.quickActionsHint}>Acciones rápidas</Text>
              <View style={styles.quickActionsRow}>
                {item.status === "active" ? (
                  <QuickActionButton
                    icon={CheckCircle2}
                    label="Marcar recibido"
                    onPress={openArrival}
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

            <RecurringIncomeDetailQuickStats item={item} />

            <RecurringIncomeDetailHistory
              workspaceId={activeWorkspaceId}
              recurringIncomeId={item.id}
              fallbackCurrencyCode={item.currencyCode}
            />

            {item.description || item.notes ? (
              <Card>
                <Text style={styles.sectionTitle}>Detalles</Text>
                {item.description ? (
                  <Text style={styles.notes}>{item.description}</Text>
                ) : null}
                {item.notes ? (
                  <>
                    {item.description ? <View style={styles.notesDivider} /> : null}
                    <Text style={styles.notesLabel}>Notas</Text>
                    <Text style={styles.notes}>{item.notes}</Text>
                  </>
                ) : null}
              </Card>
            ) : null}
          </ScrollView>
        )
      }
      overlays={
        <>
          {item ? (
            <RecurringIncomeForm
              visible={editFormVisible}
              onClose={() => setEditFormVisible(false)}
              onSuccess={() => setEditFormVisible(false)}
              editRecurringIncome={item}
            />
          ) : null}
          <RecurringIncomeAnalyticsModal
            visible={analyticsOpen && Boolean(item)}
            onClose={() => setAnalyticsOpen(false)}
            item={item}
            baseCurrencyCode={activeWorkspace?.baseCurrencyCode ?? "PEN"}
            exchangeRates={snapshot?.exchangeRates ?? []}
          />
          <RecurringIncomeArrivalSheet
            visible={arrivalVisible}
            item={item}
            accounts={accounts}
            date={arrivalDate}
            onDateChange={setArrivalDate}
            amount={arrivalAmount}
            onAmountChange={setArrivalAmount}
            accountId={arrivalAccountId}
            onAccountIdChange={setArrivalAccountId}
            baseChangeMode={arrivalBaseChangeMode}
            onBaseChangeModeChange={setArrivalBaseChangeMode}
            newBaseAmount={arrivalNewBaseAmount}
            onNewBaseAmountChange={setArrivalNewBaseAmount}
            notes={arrivalNotes}
            onNotesChange={setArrivalNotes}
            error={arrivalError}
            parsedNewBaseAmount={parsedArrivalNewBaseAmount}
            baseDelta={arrivalBaseDelta}
            loading={confirmArrivalMutation.isPending}
            onClose={closeArrival}
            onSubmit={() => void handleConfirmArrival()}
          />
          <ConfirmDialog
            visible={deleteConfirmVisible && Boolean(item)}
            title="¿Eliminar ingreso fijo?"
            body={
              item
                ? `Se eliminará "${item.name}" permanentemente.`
                : undefined
            }
            confirmLabel="Sí, eliminar"
            cancelLabel="Cancelar"
            destructive
            onCancel={() => setDeleteConfirmVisible(false)}
            onConfirm={() => void handleDelete()}
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

export default function RecurringIncomeDetailScreenRoot() {
  return (
    <ErrorBoundary>
      <RecurringIncomeDetailScreen />
    </ErrorBoundary>
  );
}
