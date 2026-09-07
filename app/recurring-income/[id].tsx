import { useCallback, useMemo, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { format } from "date-fns";
import { MoreVertical, BarChart3 } from "lucide-react-native";

import { ErrorBoundary } from "../../components/ui/ErrorBoundary";
import { Card } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { SearchableSelectSheet } from "../../components/ui/SearchableSelectSheet";
import { ScreenHeader } from "../../components/layout/ScreenHeader";
import { EntityActionSheet } from "../../components/ui/EntityActionSheet";
import { HeaderActionGroup } from "../../components/ui/HeaderActionGroup";
import { ConfirmDialog } from "../../components/ui/ConfirmDialog";
import { ResourceModuleTemplate } from "../../components/ui/ResourceModuleTemplate";
import { SkeletonCard, SkeletonList } from "../../components/ui/Skeleton";
import { RecurringIncomeForm } from "../../components/forms/RecurringIncomeForm";
import { RecurringIncomeAnalyticsModal } from "../../components/domain/RecurringIncomeAnalyticsModal";
import { RecurringIncomeArrivalSheet, type RecurringIncomeBaseChangeMode } from "../../features/recurring-income/components/RecurringIncomeArrivalSheet";
import { RecurringIncomeDetailHeader } from "../../features/recurring-income/components/RecurringIncomeDetailHeader";
import { RecurringIncomeDetailFacts } from "../../features/recurring-income/components/RecurringIncomeDetailFacts";
import { RecurringIncomeDetailHistory } from "../../features/recurring-income/components/RecurringIncomeDetailHistory";
import { recurringIncomeStanding } from "../../features/recurring-income/lib/recurringIncomeStanding";
import { formatCurrency } from "../../components/ui/AmountDisplay";
import { todayPeru } from "../../lib/date";
import { formatSubscriptionYmd } from "../../lib/subscription-helpers";
import { sortByName } from "../../lib/sort-locale";
import { useOriginBackNavigation } from "../../hooks/useOriginBackNavigation";
import { useAuth } from "../../lib/auth-context";
import { useWorkspace } from "../../lib/workspace-context";
import { useUiStore } from "../../store/ui-store";
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
  // Fuerza el re-render de la pantalla al alternar modo privacidad (la máscara
  // vive en formatCurrency, que lee el store imperativamente).
  useUiStore((state) => state.privacyMode);
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { handleBack } = useOriginBackNavigation({
    originRoutes: { dashboard: "/(app)/dashboard", "recurring-income": "/(app)/recurring-income" },
  });
  const { profile } = useAuth();
  const { activeWorkspaceId, activeWorkspace } = useWorkspace();
  const { showToast } = useToast();

  const [editFormVisible, setEditFormVisible] = useState(false);
  const [deleteConfirmVisible, setDeleteConfirmVisible] = useState(false);
  const [analyticsOpen, setAnalyticsOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [payerPickerOpen, setPayerPickerOpen] = useState(false);

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

  const counterparties = useMemo(
    () => sortByName((snapshot?.counterparties ?? []).filter((party) => !party.isArchived)),
    [snapshot?.counterparties],
  );

  /* El mismo cálculo que pinta la cápsula: qué llegadas vencieron sin confirmar. La pantalla no
     recalcula nada — sale entero de recurringIncomeStanding, que tiene sus tests. */
  const standing = useMemo(() => {
    if (!item) return null;
    return recurringIncomeStanding({
      item,
      today: todayPeru(),
      formatAmount: (amount) => formatCurrency(amount, item.currencyCode),
      formatDate: (ymd) => formatSubscriptionYmd(ymd),
    });
  }, [item]);
  const pendingDates = standing?.pendingDates ?? [];

  const handlePickPayer = useCallback((payerPartyId: number | null) => {
    if (!item) return;
    updateMutation.mutate(
      { id: item.id, input: { payerPartyId } },
      { onError: (err) => showToast(err.message, "error") },
    );
  }, [item, showToast, updateMutation]);

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

  /**
   * `date` es la llegada que se está anotando.
   *
   * Con dos sueldos sin confirmar, abrir siempre en "hoy" obligaba a corregir la fecha a mano
   * cada vez — y equivocarse ahí desplaza el calendario entero.
   */
  const openArrival = useCallback((date?: string) => {
    if (!item) return;
    setArrivalDate(date ?? format(new Date(), "yyyy-MM-dd"));
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
          onBack={handleBack}
          rightAction={
            item ? (
              /* Analítica se queda como ícono —es a lo que se entra a mirar— y lo
                 administrativo baja al menú, donde se lee. Igual que en suscripción. */
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

            {/* Eran tres cajas iguales para tres cosas distintas: una es a lo que se viene, otra
                es administrativa y "Análisis" ya estaba como ícono en el encabezado. Con dos
                llegadas sin confirmar, "Marcar recibido" tampoco decía cuál: ahora lo dice. */}
            {item.status === "active" ? (
              <Button
                label={
                  pendingDates.length > 1
                    ? `Anotar las ${pendingDates.length} llegadas`
                    : "Anotar la llegada"
                }
                size="lg"
                onPress={() => openArrival(pendingDates[0])}
              />
            ) : (
              <Button label="Reactivar" size="lg" onPress={handleTogglePause} />
            )}

            <RecurringIncomeDetailFacts
              item={item}
              onPickPayer={() => setPayerPickerOpen(true)}
            />

            <RecurringIncomeDetailHistory
              workspaceId={activeWorkspaceId}
              recurringIncomeId={item.id}
              fallbackCurrencyCode={item.currencyCode}
              expectedAmount={item.amount}
              pendingDates={pendingDates}
              remindDaysBefore={item.remindDaysBefore}
              onAnnotate={(date) => openArrival(date)}
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
          <SearchableSelectSheet
            visible={payerPickerOpen}
            title="Quién paga"
            options={[
              { value: null as number | null, label: "Nadie elegido" },
              ...counterparties.map((party) => ({ value: party.id as number | null, label: party.name })),
            ]}
            value={item?.payerPartyId ?? null}
            onChange={handlePickPayer}
            onClose={() => setPayerPickerOpen(false)}
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
          {item ? (
            <EntityActionSheet
              visible={menuOpen}
              onClose={() => setMenuOpen(false)}
              sheetTitle="Más acciones"
              summaryTitle={item.name}
              actions={[
                {
                  key: "edit",
                  label: "Editar ingreso fijo",
                  variant: "secondary" as const,
                  onPress: () => { setMenuOpen(false); setEditFormVisible(true); },
                },
                {
                  key: "pause",
                  label: isPaused ? "Reactivar ingreso fijo" : "Pausar ingreso fijo",
                  variant: "secondary" as const,
                  onPress: () => { setMenuOpen(false); handleTogglePause(); },
                },
                {
                  key: "pin",
                  label: item.isPinned ? "Quitar de fijados" : "Fijar en la lista",
                  variant: "secondary" as const,
                  onPress: () => { setMenuOpen(false); handleTogglePin(); },
                },
                {
                  key: "delete",
                  label: "Eliminar ingreso fijo",
                  variant: "ghost" as const,
                  onPress: () => { setMenuOpen(false); setDeleteConfirmVisible(true); },
                },
              ]}
            />
          ) : null}

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
