import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SectionListRenderItem } from "react-native";
import { Download, SlidersHorizontal, TrendingUp } from "lucide-react-native";
import { useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { format } from "date-fns";

import { ErrorBoundary } from "../components/ui/ErrorBoundary";
import { UndoBanner } from "../components/ui/UndoBanner";
import { ScreenHeader } from "../components/layout/ScreenHeader";
import { HeaderActionGroup } from "../components/ui/HeaderActionGroup";
import { FilterToolbar, type FilterToolbarOption } from "../components/ui/FilterToolbar";
import { ActiveFilterBar, type ActiveFilterItem } from "../components/ui/ActiveFilterBar";
import { ResourceContextNote } from "../components/ui/ResourceContextNote";
import { ResourceModuleTemplate } from "../components/ui/ResourceModuleTemplate";
import { ResourceSectionList } from "../components/ui/ResourceSectionList";
import { SkeletonCard } from "../components/ui/Skeleton";
import { FAB } from "../components/ui/FAB";
import { RecurringIncomeAnalyticsModal } from "../components/domain/RecurringIncomeAnalyticsModal";
import { RecurringIncomeForm } from "../components/forms/RecurringIncomeForm";
import {
  RecurringIncomeArrivalSheet,
  type RecurringIncomeBaseChangeMode,
} from "../features/recurring-income/components/RecurringIncomeArrivalSheet";
import { RecurringIncomeFilterSheet } from "../features/recurring-income/components/RecurringIncomeFilterSheet";
import { RecurringIncomeSummaryBar } from "../features/recurring-income/components/RecurringIncomeSummaryBar";
import { RecurringIncomeSwipeRow } from "../features/recurring-income/components/RecurringIncomeSwipeRow";
import {
  buildRecurringIncomeSections,
  type RecurringIncomeListSection,
} from "../features/recurring-income/lib/buildRecurringIncomeSections";
import {
  filterRecurringIncome,
  getMonthlyRecurringIncomeAmount,
  recurringIncomeFilterLabel,
  ymdWithin30Days,
  type ActiveRecurringIncomeFilter,
  type RecurringIncomeAdvancedFilters,
  type RecurringIncomeFilter,
} from "../features/recurring-income/lib/recurringIncomeFilters";
import { useAuth } from "../lib/auth-context";
import { useWorkspace } from "../lib/workspace-context";
import { buildRecurringIncomeCsv } from "../lib/recurring-income-csv";
import { shareCsvAsFile } from "../lib/share-csv-file";
import {
  useConfirmRecurringIncomeArrivalMutation,
  useDeleteRecurringIncomeMutation,
  useUpdateRecurringIncomeMutation,
  useWorkspaceSnapshotQuery,
} from "../services/queries/workspace-data";
import { useToast } from "../hooks/useToast";
import { useOriginBackNavigation } from "../hooks/useOriginBackNavigation";
import type { RecurringIncomeFrequency, RecurringIncomeSummary } from "../types/domain";

const QUICK_FILTERS: Array<FilterToolbarOption<RecurringIncomeFilter>> = [
  { label: "Todos", value: "all" },
  { label: "Activos", value: "active" },
  { label: "Pausados", value: "paused" },
  { label: "Cancelados", value: "cancelled" },
];

function parseMoneyInput(value: string) {
  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function RecurringIncomeScreen() {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { handleBack } = useOriginBackNavigation();
  const { profile } = useAuth();
  const { activeWorkspaceId, activeWorkspace } = useWorkspace();
  const { showToast } = useToast();

  const { data: snapshot, isLoading } = useWorkspaceSnapshotQuery(profile, activeWorkspaceId);
  const updateMutation = useUpdateRecurringIncomeMutation(activeWorkspaceId);
  const deleteMutation = useDeleteRecurringIncomeMutation(activeWorkspaceId);
  const confirmArrivalMutation = useConfirmRecurringIncomeArrivalMutation(activeWorkspaceId);

  const [createFormVisible, setCreateFormVisible] = useState(false);
  const [editTarget, setEditTarget] = useState<RecurringIncomeSummary | null>(null);
  const [analyticsTarget, setAnalyticsTarget] = useState<RecurringIncomeSummary | null>(null);
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [activeFilters, setActiveFilters] = useState<ActiveRecurringIncomeFilter[]>([]);
  const [frequencyFilter, setFrequencyFilter] = useState<"all" | RecurringIncomeFrequency>("all");
  const [payerFilter, setPayerFilter] = useState<number | null>(null);
  const [accountFilter, setAccountFilter] = useState<number | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<number | null>(null);
  const [upcomingOnly, setUpcomingOnly] = useState(false);
  const [pendingDeleteIds, setPendingDeleteIds] = useState<Set<number>>(new Set());
  const [pendingDeleteLabels, setPendingDeleteLabels] = useState<Record<number, string>>({});
  const deleteTimers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  const [arrivalTarget, setArrivalTarget] = useState<RecurringIncomeSummary | null>(null);
  const [arrivalDate, setArrivalDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [arrivalAmount, setArrivalAmount] = useState("");
  const [arrivalAccountId, setArrivalAccountId] = useState<number | null>(null);
  const [arrivalBaseChangeMode, setArrivalBaseChangeMode] = useState<RecurringIncomeBaseChangeMode>("none");
  const [arrivalNewBaseAmount, setArrivalNewBaseAmount] = useState("");
  const [arrivalNotes, setArrivalNotes] = useState("");
  const [arrivalError, setArrivalError] = useState("");

  const recurringIncome = useMemo(
    () => (snapshot?.recurringIncome ?? []).filter((item) => !pendingDeleteIds.has(item.id)),
    [pendingDeleteIds, snapshot?.recurringIncome],
  );
  const activeAccounts = useMemo(() => snapshot?.accounts.filter((account) => !account.isArchived) ?? [], [snapshot?.accounts]);
  const categories = useMemo(
    () => snapshot?.categories.filter((category) => category.isActive && (category.kind === "income" || category.kind === "both")) ?? [],
    [snapshot?.categories],
  );
  const counterparties = useMemo(
    () => snapshot?.counterparties.filter((counterparty) => !counterparty.isArchived) ?? [],
    [snapshot?.counterparties],
  );
  const baseCurrencyCode = activeWorkspace?.baseCurrencyCode ?? profile?.baseCurrencyCode ?? "PEN";

  const advancedFilters = useMemo<RecurringIncomeAdvancedFilters>(() => ({
    payerId: payerFilter,
    accountId: accountFilter,
    categoryId: categoryFilter,
    upcomingOnly,
  }), [accountFilter, categoryFilter, payerFilter, upcomingOnly]);

  const effectiveFilters = useMemo<ActiveRecurringIncomeFilter[]>(() => {
    if (frequencyFilter === "all") return activeFilters;
    return [...activeFilters, frequencyFilter];
  }, [activeFilters, frequencyFilter]);

  const filteredRecurringIncome = useMemo(
    () => filterRecurringIncome(recurringIncome, effectiveFilters, searchText, advancedFilters),
    [advancedFilters, effectiveFilters, recurringIncome, searchText],
  );
  const sections = useMemo(
    () => buildRecurringIncomeSections(filteredRecurringIncome),
    [filteredRecurringIncome],
  );

  const activeFilterItems = useMemo<ActiveFilterItem[]>(() => {
    const items = activeFilters.map((filter) => ({
      key: `filter-${filter}`,
      label: recurringIncomeFilterLabel(filter),
      onRemove: () => setActiveFilters((current) => current.filter((value) => value !== filter)),
    }));

    if (frequencyFilter !== "all") {
      items.push({
        key: "frequency",
        label: `Frecuencia: ${recurringIncomeFilterLabel(frequencyFilter)}`,
        onRemove: () => setFrequencyFilter("all"),
      });
    }
    if (searchText.trim()) {
      items.push({
        key: "search",
        label: `Búsqueda: ${searchText.trim()}`,
        onRemove: () => setSearchText(""),
      });
    }
    if (payerFilter != null) {
      items.push({
        key: "payer",
        label: `Pagador: ${counterparties.find((item) => item.id === payerFilter)?.name ?? payerFilter}`,
        onRemove: () => setPayerFilter(null),
      });
    }
    if (accountFilter != null) {
      items.push({
        key: "account",
        label: `Cuenta: ${activeAccounts.find((item) => item.id === accountFilter)?.name ?? accountFilter}`,
        onRemove: () => setAccountFilter(null),
      });
    }
    if (categoryFilter != null) {
      items.push({
        key: "category",
        label: `Categoría: ${categories.find((item) => item.id === categoryFilter)?.name ?? categoryFilter}`,
        onRemove: () => setCategoryFilter(null),
      });
    }
    if (upcomingOnly) {
      items.push({
        key: "upcoming",
        label: "Próximos 30 días",
        onRemove: () => setUpcomingOnly(false),
      });
    }

    return items;
  }, [activeAccounts, activeFilters, categories, categoryFilter, counterparties, frequencyFilter, payerFilter, searchText, accountFilter, upcomingOnly]);

  const summary = useMemo(() => {
    return filteredRecurringIncome.reduce(
      (acc, item) => {
        if (item.status === "active") {
          acc.activeCount += 1;
          acc.monthlyTotal += getMonthlyRecurringIncomeAmount(item, true);
          if (ymdWithin30Days(item.nextExpectedDate)) acc.upcomingCount += 1;
        }
        if (item.status === "paused") acc.pausedCount += 1;
        return acc;
      },
      { monthlyTotal: 0, activeCount: 0, upcomingCount: 0, pausedCount: 0 },
    );
  }, [filteredRecurringIncome]);

  const parsedArrivalNewBaseAmount = parseMoneyInput(arrivalNewBaseAmount);
  const arrivalBaseDelta = arrivalTarget && parsedArrivalNewBaseAmount != null
    ? parsedArrivalNewBaseAmount - arrivalTarget.amount
    : null;
  const extraFiltersCount = [
    frequencyFilter !== "all",
    payerFilter != null,
    accountFilter != null,
    categoryFilter != null,
    upcomingOnly,
  ].filter(Boolean).length;
  const hasFilters = activeFilterItems.length > 0;
  const contextNote = filteredRecurringIncome.length === recurringIncome.length
    ? "Ingresos fijos agrupados por estado y calculados como ingreso mensual equivalente."
    : `Mostrando ${filteredRecurringIncome.length} de ${recurringIncome.length} ingresos fijos.`;

  useEffect(() => () => {
    deleteTimers.current.forEach(clearTimeout);
  }, []);

  const onRefresh = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ["workspace-snapshot"] });
  }, [queryClient]);

  const clearFilters = useCallback(() => {
    setActiveFilters([]);
    setSearchText("");
    setFrequencyFilter("all");
    setPayerFilter(null);
    setAccountFilter(null);
    setCategoryFilter(null);
    setUpcomingOnly(false);
  }, []);

  const clearAdvancedFilters = useCallback(() => {
    setFrequencyFilter("all");
    setPayerFilter(null);
    setAccountFilter(null);
    setCategoryFilter(null);
    setUpcomingOnly(false);
  }, []);

  const startUndoDelete = useCallback((item: RecurringIncomeSummary) => {
    setPendingDeleteIds((prev) => new Set(prev).add(item.id));
    setPendingDeleteLabels((prev) => ({ ...prev, [item.id]: item.name }));
    const timer = setTimeout(() => {
      deleteMutation.mutate(item.id, {
        onError: (error) => showToast(error.message, "error"),
      });
      setPendingDeleteIds((prev) => {
        const next = new Set(prev);
        next.delete(item.id);
        return next;
      });
      deleteTimers.current.delete(item.id);
    }, 5000);
    deleteTimers.current.set(item.id, timer);
  }, [deleteMutation, showToast]);

  const undoDelete = useCallback((id: number) => {
    const timer = deleteTimers.current.get(id);
    if (timer) clearTimeout(timer);
    deleteTimers.current.delete(id);
    setPendingDeleteIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }, []);

  const openConfirmArrival = useCallback((item: RecurringIncomeSummary) => {
    setArrivalTarget(item);
    setArrivalDate(format(new Date(), "yyyy-MM-dd"));
    setArrivalAmount(String(item.amount));
    setArrivalAccountId(item.accountId ?? null);
    setArrivalBaseChangeMode("none");
    setArrivalNewBaseAmount(String(item.amount));
    setArrivalNotes("");
    setArrivalError("");
  }, []);

  const closeConfirmArrival = useCallback(() => {
    setArrivalTarget(null);
    setArrivalError("");
  }, []);

  const handleConfirmArrival = useCallback(async () => {
    if (!arrivalTarget) return;
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
      if (arrivalBaseChangeMode === "bonus" && nextBaseAmount <= arrivalTarget.amount) {
        setArrivalError("Si hubo bonificación permanente, el nuevo monto base debe ser mayor al actual.");
        return;
      }
      if (arrivalBaseChangeMode === "discount" && nextBaseAmount >= arrivalTarget.amount) {
        setArrivalError("Si hubo descuento permanente, el nuevo monto base debe ser menor al actual.");
        return;
      }
    }

    try {
      setArrivalError("");
      await confirmArrivalMutation.mutateAsync({
        recurringIncomeId: arrivalTarget.id,
        recurringIncomeName: arrivalTarget.name,
        expectedDate: arrivalTarget.nextExpectedDate,
        actualDate: arrivalDate,
        amount: actualAmount,
        accountId: arrivalAccountId,
        currentAccountId: arrivalTarget.accountId ?? null,
        categoryId: arrivalTarget.categoryId ?? null,
        payerPartyId: arrivalTarget.payerPartyId ?? null,
        description: arrivalTarget.description ?? null,
        currencyCode: arrivalTarget.currencyCode,
        frequency: arrivalTarget.frequency,
        intervalCount: arrivalTarget.intervalCount,
        currentBaseAmount: arrivalTarget.amount,
        newBaseAmount: nextBaseAmount,
        baseChangeKind: arrivalBaseChangeMode === "none" ? null : arrivalBaseChangeMode,
        notes: arrivalNotes.trim() || null,
      });
      setArrivalTarget(null);
      showToast("Llegada confirmada", "success");
    } catch (error) {
      const message = error instanceof Error ? error.message : "No pudimos confirmar la llegada";
      setArrivalError(message);
      showToast(message, "error");
    }
  }, [
    arrivalAccountId,
    arrivalAmount,
    arrivalBaseChangeMode,
    arrivalDate,
    arrivalNewBaseAmount,
    arrivalNotes,
    arrivalTarget,
    confirmArrivalMutation,
    showToast,
  ]);

  const handleToggleStatus = useCallback((item: RecurringIncomeSummary) => {
    const nextStatus = item.status === "active" ? "paused" : "active";
    updateMutation.mutate(
      { id: item.id, input: { status: nextStatus } },
      {
        onSuccess: () => showToast(nextStatus === "paused" ? "Ingreso pausado" : "Ingreso reactivado", "success"),
        onError: (error) => showToast(error.message, "error"),
      },
    );
  }, [showToast, updateMutation]);

  const exportCSV = useCallback(async (rows: RecurringIncomeSummary[]) => {
    if (rows.length === 0) {
      showToast("No hay filas para exportar", "warning");
      return;
    }
    try {
      const csv = buildRecurringIncomeCsv(rows);
      await shareCsvAsFile(csv, `ingresos-fijos-${activeWorkspace?.name?.replace(/\s+/g, "_") ?? "workspace"}.csv`);
    } catch (error: unknown) {
      showToast(error instanceof Error ? error.message : "Error al exportar", "error");
    }
  }, [activeWorkspace?.name, showToast]);

  const renderItem: SectionListRenderItem<RecurringIncomeSummary, RecurringIncomeListSection> = useCallback(({ item }) => (
    <RecurringIncomeSwipeRow
      item={item}
      monthlyAmount={getMonthlyRecurringIncomeAmount(item)}
      onEdit={() => setEditTarget(item)}
      onDelete={() => startUndoDelete(item)}
      onConfirmArrival={() => openConfirmArrival(item)}
      onToggleStatus={() => handleToggleStatus(item)}
      onAnalytics={() => setAnalyticsTarget(item)}
    />
  ), [handleToggleStatus, openConfirmArrival, startUndoDelete]);

  return (
    <ResourceModuleTemplate
      topInset={insets.top}
      header={
        <ScreenHeader
          title="Ingresos fijos"
          onBack={handleBack}
          rightAction={
            <HeaderActionGroup
              actions={[
                {
                  key: "export",
                  icon: Download,
                  onPress: () => exportCSV(filteredRecurringIncome),
                  disabled: filteredRecurringIncome.length === 0,
                  accessibilityLabel: "Exportar ingresos fijos en CSV",
                },
                {
                  key: "filters",
                  icon: SlidersHorizontal,
                  label: extraFiltersCount > 0 ? `Filtros (${extraFiltersCount})` : "Filtros",
                  active: extraFiltersCount > 0,
                  onPress: () => setFilterSheetOpen(true),
                  accessibilityLabel: "Abrir filtros avanzados de ingresos fijos",
                },
              ]}
            />
          }
        />
      }
      toolbar={
        <FilterToolbar
          options={QUICK_FILTERS}
          selectedValues={activeFilters}
          onSelectedValuesChange={(values) =>
            setActiveFilters(values.filter((value): value is ActiveRecurringIncomeFilter => value !== "all"))
          }
          allValue="all"
          searchValue={searchText}
          onSearchChange={setSearchText}
          searchPlaceholder="Buscar ingresos fijos..."
        />
      }
      activeFilters={<ActiveFilterBar items={activeFilterItems} onClear={clearFilters} />}
      context={recurringIncome.length > 0 ? <ResourceContextNote>{contextNote}</ResourceContextNote> : null}
      summary={
        filteredRecurringIncome.length > 0 ? (
          <RecurringIncomeSummaryBar
            monthlyTotal={summary.monthlyTotal}
            activeCount={summary.activeCount}
            upcomingCount={summary.upcomingCount}
            pausedCount={summary.pausedCount}
            currencyCode={baseCurrencyCode}
          />
        ) : null
      }
      list={
        <ResourceSectionList
          sections={sections}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderItem}
          loading={{
            isLoading,
            skeleton: (
              <>
                <SkeletonCard />
                <SkeletonCard />
                <SkeletonCard />
              </>
            ),
          }}
          empty={{
            icon: hasFilters ? undefined : TrendingUp,
            variant: hasFilters ? "no-results" : "empty",
            title: hasFilters ? "Sin resultados" : "Sin ingresos fijos",
            description: hasFilters
              ? "Prueba quitando filtros o ajustando la búsqueda."
              : "Registra tu sueldo, renta u otros ingresos recurrentes para seguir lo que entra cada mes.",
            action: !hasFilters ? { label: "Agregar ingreso fijo", onPress: () => setCreateFormVisible(true) } : undefined,
          }}
          refreshing={isLoading}
          onRefresh={onRefresh}
        />
      }
      fab={<FAB onPress={() => setCreateFormVisible(true)} bottom={insets.bottom + 16} />}
      overlays={
        <>
          <RecurringIncomeFilterSheet
            visible={filterSheetOpen}
            onClose={() => setFilterSheetOpen(false)}
            frequencyFilter={frequencyFilter}
            onFrequencyFilterChange={setFrequencyFilter}
            payerFilter={payerFilter}
            onPayerFilterChange={setPayerFilter}
            accountFilter={accountFilter}
            onAccountFilterChange={setAccountFilter}
            categoryFilter={categoryFilter}
            onCategoryFilterChange={setCategoryFilter}
            upcomingOnly={upcomingOnly}
            onUpcomingOnlyChange={setUpcomingOnly}
            accounts={activeAccounts}
            categories={categories}
            counterparties={counterparties}
            onClear={clearAdvancedFilters}
          />
          <RecurringIncomeArrivalSheet
            visible={Boolean(arrivalTarget)}
            item={arrivalTarget}
            accounts={activeAccounts}
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
            onClose={closeConfirmArrival}
            onSubmit={handleConfirmArrival}
          />
          <RecurringIncomeForm
            visible={createFormVisible}
            onClose={() => setCreateFormVisible(false)}
            onSuccess={() => setCreateFormVisible(false)}
          />
          <RecurringIncomeForm
            visible={Boolean(editTarget)}
            onClose={() => setEditTarget(null)}
            onSuccess={() => setEditTarget(null)}
            editRecurringIncome={editTarget ?? undefined}
          />
          <RecurringIncomeAnalyticsModal
            visible={Boolean(analyticsTarget)}
            item={analyticsTarget}
            baseCurrencyCode={baseCurrencyCode}
            exchangeRates={snapshot?.exchangeRates ?? []}
            onClose={() => setAnalyticsTarget(null)}
          />
          <UndoBanner
            visible={pendingDeleteIds.size > 0}
            message={pendingDeleteIds.size === 1
              ? `"${Object.values(pendingDeleteLabels).at(-1) ?? ""}" eliminado`
              : `${pendingDeleteIds.size} ingresos fijos eliminados`}
            onUndo={() => pendingDeleteIds.forEach((id) => undoDelete(id))}
            durationMs={5000}
            bottomOffset={insets.bottom + 80}
          />
        </>
      }
    />
  );
}

export default function RecurringIncomeScreenRoot() {
  return (
    <ErrorBoundary>
      <RecurringIncomeScreen />
    </ErrorBoundary>
  );
}
