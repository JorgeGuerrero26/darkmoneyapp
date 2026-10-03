import { useCallback, useMemo, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MoreVertical } from "lucide-react-native";

import { ErrorBoundary } from "../../components/ui/ErrorBoundary";
import { SearchableSelectSheet } from "../../components/ui/SearchableSelectSheet";
import { ScreenHeader } from "../../components/layout/ScreenHeader";
import { EntityActionSheet } from "../../components/ui/EntityActionSheet";
import { HeaderActionGroup } from "../../components/ui/HeaderActionGroup";
import { DetailTabs } from "../../components/ui/DetailTabs";
import { ConfirmDialog } from "../../components/ui/ConfirmDialog";
import { ResourceModuleTemplate } from "../../components/ui/ResourceModuleTemplate";
import { SkeletonCard, SkeletonList } from "../../components/ui/Skeleton";
import { RecurringIncomeForm } from "../../components/forms/RecurringIncomeForm";
import { RecurringIncomeAnalyticsModal } from "../../components/domain/RecurringIncomeAnalyticsModal";
import { RecurringIncomeArrivalSheet } from "../../features/recurring-income/components/RecurringIncomeArrivalSheet";
import { useArrivalSheetController } from "../../features/recurring-income/lib/useArrivalSheetController";
import { RecurringIncomeDetailHero } from "../../features/recurring-income/components/RecurringIncomeDetailHero";
import { RecurringIncomeDetailFields } from "../../features/recurring-income/components/RecurringIncomeDetailFields";
import { RecurringIncomeDetailBreakdown } from "../../features/recurring-income/components/RecurringIncomeDetailBreakdown";
import { RecurringIncomeDetailActions } from "../../features/recurring-income/components/RecurringIncomeDetailActions";
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
import { useWorkspaceSnapshotQuery } from "../../services/queries/workspace-data";
import {
  useDeleteRecurringIncomeMutation,
  useToggleRecurringIncomePinMutation,
  useUpdateRecurringIncomeMutation,
} from "../../services/queries/subscriptions-recurring-income";
import { useToast } from "../../hooks/useToast";
import { COLORS, FONT_SIZE, FONT_WEIGHT, SPACING } from "../../constants/theme";
import type { RecurringIncomeSummary } from "../../types/domain";

type RecurringIncomeDetailTab = "details" | "activity";

const DETAIL_TABS: Array<{ id: RecurringIncomeDetailTab; label: string }> = [
  { id: "details", label: "Detalles" },
  { id: "activity", label: "Actividad" },
];

function parseRecurringIncomeId(raw: string | undefined): number | null {
  if (!raw) return null;
  const parsed = parseInt(raw, 10);
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
  const { showToast, showErrorToast } = useToast();

  const [editFormVisible, setEditFormVisible] = useState(false);
  const [detailTab, setDetailTab] = useState<RecurringIncomeDetailTab>("details");
  const [deleteConfirmVisible, setDeleteConfirmVisible] = useState(false);
  const [analyticsOpen, setAnalyticsOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [payerPickerOpen, setPayerPickerOpen] = useState(false);
  const [accountPickerOpen, setAccountPickerOpen] = useState(false);
  const [categoryPickerOpen, setCategoryPickerOpen] = useState(false);

  /* El estado, la validación y el envío del sheet viven en useArrivalSheetController, que ya
     usan la lista y el dashboard. Aquí vivía una réplica con su propia validación. */
  const arrival = useArrivalSheetController(activeWorkspaceId);

  const { data: snapshot, isLoading } = useWorkspaceSnapshotQuery(profile, activeWorkspaceId);
  const updateMutation = useUpdateRecurringIncomeMutation(activeWorkspaceId);
  const deleteMutation = useDeleteRecurringIncomeMutation(activeWorkspaceId);
  const togglePinMutation = useToggleRecurringIncomePinMutation(activeWorkspaceId);

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
  const categories = useMemo(
    () => snapshot?.categories.filter((category) => category.isActive && (category.kind === "income" || category.kind === "both")) ?? [],
    [snapshot?.categories],
  );

  /* La hoja y la lista de llegadas comparten el mismo cálculo de fechas pendientes. */
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
      { onError: (err) => showErrorToast("No se pudo cambiar quién paga", err) },
    );
  }, [item, showErrorToast, updateMutation]);

  const handlePickAccount = useCallback((accountId: number | null) => {
    if (!item) return;
    updateMutation.mutate(
      { id: item.id, input: { accountId } },
      { onError: (err) => showErrorToast("No se pudo cambiar la cuenta", err) },
    );
  }, [item, showErrorToast, updateMutation]);

  const handlePickCategory = useCallback((categoryId: number | null) => {
    if (!item) return;
    updateMutation.mutate(
      { id: item.id, input: { categoryId } },
      { onError: (err) => showErrorToast("No se pudo cambiar la categoría", err) },
    );
  }, [item, showErrorToast, updateMutation]);

  const handleTogglePause = useCallback(() => {
    if (!item || updateMutation.isPending) return;
    const newStatus = item.status === "active" ? "paused" : "active";
    updateMutation.mutate(
      { id: item.id, input: { status: newStatus } },
      {
        onSuccess: () => showToast(newStatus === "paused" ? "Ingreso pausado" : "Ingreso reactivado", "success", item.name),
        onError: (e) => showErrorToast(newStatus === "paused" ? "No se pudo pausar el ingreso" : "No se pudo reactivar el ingreso", e),
      },
    );
  }, [item, updateMutation, showToast, showErrorToast]);

  const handleTogglePin = useCallback(() => {
    if (!item) return;
    togglePinMutation.mutate(
      { id: item.id, isPinned: !item.isPinned },
      { onError: (err) => showErrorToast(item.isPinned ? "No se pudo desfijar el ingreso" : "No se pudo fijar el ingreso", err) },
    );
  }, [item, showErrorToast, togglePinMutation]);

  const handleDelete = useCallback(async () => {
    if (!item) return;
    setDeleteConfirmVisible(false);
    try {
      await deleteMutation.mutateAsync(item.id);
      showToast("Ingreso fijo eliminado", "success");
      handleBack();
    } catch (err: unknown) {
      showErrorToast("No se pudo eliminar el ingreso fijo", err);
    }
  }, [item, deleteMutation, handleBack, showErrorToast, showToast]);

  const openArrival = useCallback((date?: string) => {
    if (item) arrival.open(item, date);
  }, [arrival, item]);

  return (
    <ResourceModuleTemplate
      topInset={insets.top}
      header={
        <>
          <ScreenHeader
            title="Ingreso fijo"
            subtitle={item?.name}
            onBack={handleBack}
            rightAction={
              item ? (
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
          {item ? (
            <View style={styles.detailTabs}>
              <DetailTabs tabs={DETAIL_TABS} activeTab={detailTab} onChange={setDetailTab} />
            </View>
          ) : null}
        </>
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
          <ScrollView key={detailTab} style={styles.scroll} contentContainerStyle={styles.content}>
            {detailTab === "details" ? (
              <>
                <RecurringIncomeDetailHero item={item} />
                <RecurringIncomeDetailFields
                  item={item}
                  onPickPayer={() => setPayerPickerOpen(true)}
                  onPickAccount={() => setAccountPickerOpen(true)}
                  onPickCategory={() => setCategoryPickerOpen(true)}
                />
                <RecurringIncomeDetailBreakdown
                  grossAmount={item.grossAmount}
                  deductions={item.deductions}
                  netAmount={item.amount}
                  currencyCode={item.currencyCode}
                />
              </>
            ) : (
              <RecurringIncomeDetailHistory
                workspaceId={activeWorkspaceId}
                recurringIncomeId={item.id}
                fallbackCurrencyCode={item.currencyCode}
                expectedAmount={item.amount}
                pendingDates={pendingDates}
                onAnnotate={(date) => openArrival(date)}
              />
            )}
          </ScrollView>
        )
      }
      fab={item ? (
        <RecurringIncomeDetailActions
          bottomInset={insets.bottom}
          status={item.status}
          pendingCount={pendingDates.length}
          onEdit={() => setEditFormVisible(true)}
          onAnnotate={() => openArrival(pendingDates[0])}
          onReactivate={handleTogglePause}
        />
      ) : null}
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
          <SearchableSelectSheet
            visible={accountPickerOpen}
            title="Entra a"
            options={[
              { value: null as number | null, label: "Sin cuenta" },
              ...accounts.map((account) => ({ value: account.id as number | null, label: account.name })),
            ]}
            value={item?.accountId ?? null}
            onChange={handlePickAccount}
            onClose={() => setAccountPickerOpen(false)}
          />
          <SearchableSelectSheet
            visible={categoryPickerOpen}
            title="Categoría"
            options={[
              { value: null as number | null, label: "Sin categoría" },
              ...categories.map((category) => ({ value: category.id as number | null, label: category.name })),
            ]}
            value={item?.categoryId ?? null}
            onChange={handlePickCategory}
            onClose={() => setCategoryPickerOpen(false)}
          />
          <RecurringIncomeArrivalSheet
            {...arrival.sheetProps}
            accounts={accounts}
          />
          {item ? (
            <EntityActionSheet
              visible={menuOpen}
              onClose={() => setMenuOpen(false)}
              sheetTitle="Más acciones"
              summaryTitle={item.name}
              actions={[
                {
                  key: "analytics",
                  label: "Ver analítica",
                  variant: "secondary",
                  onPress: () => { setMenuOpen(false); setAnalyticsOpen(true); },
                },
                {
                  key: "pin",
                  label: item.isPinned ? "Quitar de fijados" : "Fijar en la lista",
                  variant: "secondary",
                  onPress: () => { setMenuOpen(false); handleTogglePin(); },
                },
                ...(item.status === "active" ? [{
                  key: "pause",
                  label: "Pausar ingreso fijo",
                  variant: "secondary" as const,
                  onPress: () => { setMenuOpen(false); handleTogglePause(); },
                }] : []),
                {
                  key: "delete",
                  label: "Eliminar ingreso fijo",
                  variant: "ghost",
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
            confirmLoading={deleteMutation.isPending}
            confirmLoadingLabel="Eliminando…"
            onCancel={() => setDeleteConfirmVisible(false)}
            onConfirm={() => void handleDelete()}
          />
        </>
      }
    />
  );
}


const styles = StyleSheet.create({
  detailTabs: { paddingHorizontal: SPACING.xl },
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

export default function RecurringIncomeDetailScreenRoot() {
  return (
    <ErrorBoundary>
      <RecurringIncomeDetailScreen />
    </ErrorBoundary>
  );
}
