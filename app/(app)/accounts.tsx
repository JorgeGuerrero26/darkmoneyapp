import { GestureDetector } from "react-native-gesture-handler";
import { ErrorBoundary } from "../../components/ui/ErrorBoundary";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SectionListRenderItem } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  Archive, CheckSquare, Download, X,
} from "lucide-react-native";
import { format } from "date-fns";

import AsyncStorage from "@react-native-async-storage/async-storage";
import { useAuth } from "../../lib/auth-context";
import { useWorkspace } from "../../lib/workspace-context";
import {
  useWorkspaceSnapshotQuery,
  useArchiveAccountMutation,
  useSyncExchangeRatePairMutation,
} from "../../services/queries/workspace-data";
import { AccountCard } from "../../components/domain/AccountCard";
import { AccountAnalyticsModal } from "../../components/domain/AccountAnalyticsModal";
import { SkeletonCard } from "../../components/ui/Skeleton";
import { BulkActionBar } from "../../components/ui/BulkActionBar";
import { ScreenHeader } from "../../components/layout/ScreenHeader";
import { FAB } from "../../components/ui/FAB";
import { FilterToolbar } from "../../components/ui/FilterToolbar";
import { ActiveFilterBar, type ActiveFilterItem } from "../../components/ui/ActiveFilterBar";
import { HeaderActionGroup } from "../../components/ui/HeaderActionGroup";
import { ConfirmDialog } from "../../components/ui/ConfirmDialog";
import { ResourceModuleTemplate } from "../../components/ui/ResourceModuleTemplate";
import { ResourceSectionList, type ResourceSection } from "../../components/ui/ResourceSectionList";
import { AccountForm } from "../../components/forms/AccountForm";
import { AccountNetWorthSummary } from "../../features/accounts/components/AccountNetWorthSummary";
import { useToast } from "../../hooks/useToast";
import { humanizeError } from "../../lib/errors";
import { shareCsvAsFile } from "../../lib/share-csv-file";
import { DEFAULT_EXCHANGE_CURRENCY } from "../../constants/currencies";
import { useSwipeTab } from "../../hooks/useSwipeTab";
import type { AccountSummary } from "../../types/domain";

type AccountTypeFilter = "all" | "bank" | "cash" | "savings" | "credit_card" | "investment" | "loan" | "other";
type AccountListSection = ResourceSection<AccountSummary, "active" | "archived">;

const TYPE_FILTERS: { label: string; value: AccountTypeFilter }[] = [
  { label: "Todas", value: "all" },
  { label: "Banco",       value: "bank" },
  { label: "Efectivo",    value: "cash" },
  { label: "Ahorro",      value: "savings" },
  { label: "Tarjeta",     value: "credit_card" },
  { label: "Inversión",   value: "investment" },
  { label: "Préstamo",    value: "loan" },
  { label: "Otro",        value: "other" },
];

function buildAccountCSV(accounts: AccountSummary[]): string {
  const BOM = "\uFEFF";
  const headers = ["Nombre", "Tipo", "Moneda", "Saldo actual", "Saldo inicial", "En patrimonio", "Archivada", "Última actividad"];
  const rows = accounts.map((a) => [
    a.name, a.type, a.currencyCode,
    String(a.currentBalance), String(a.openingBalance),
    a.includeInNetWorth ? "Sí" : "No",
    a.isArchived ? "Sí" : "No",
    a.lastActivity ?? "",
  ].map((v) => `"${v.replace(/"/g, '""')}"`).join(","));
  return BOM + [headers.join(","), ...rows].join("\n");
}

const ACCOUNTS_CURRENCY_KEY = "darkmoney.accounts.displayCurrency";

function buildRateMap(rates: { fromCurrencyCode: string; toCurrencyCode: string; rate: number }[]) {
  const map = new Map<string, number>();
  for (const r of rates) {
    const key = `${r.fromCurrencyCode.toUpperCase()}:${r.toCurrencyCode.toUpperCase()}`;
    if (!map.has(key) && r.rate > 0) map.set(key, r.rate);
  }
  return map;
}

function resolveConversion(map: Map<string, number>, from: string, to: string): number {
  if (from === to) return 1;
  const direct = map.get(`${from}:${to}`);
  if (direct) return direct;
  const inverse = map.get(`${to}:${from}`);
  if (inverse) return 1 / inverse;
  return 1;
}

function hasConversionRate(map: Map<string, number>, from: string, to: string): boolean {
  if (from === to) return true;
  return map.has(`${from}:${to}`) || map.has(`${to}:${from}`);
}

function AccountsScreen() {
  const swipeGesture = useSwipeTab();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { profile } = useAuth();
  const { activeWorkspaceId, activeWorkspace } = useWorkspace();
  const { showToast } = useToast();

  const { data: snapshot, isLoading } = useWorkspaceSnapshotQuery(profile, activeWorkspaceId);
  const archiveAccount = useArchiveAccountMutation(activeWorkspaceId);
  const syncExchangeRatePair = useSyncExchangeRatePairMutation();
  const syncPairRequestRef = useRef<string | null>(null);

  // ── Currency display ──────────────────────────────────────────────────────
  const [displayCurrency, setDisplayCurrency] = useState<string | null>(null);
  const baseCurrency = (activeWorkspace?.baseCurrencyCode ?? profile?.baseCurrencyCode ?? "PEN").toUpperCase();

  const exchangeRateMap = useMemo(
    () => buildRateMap(snapshot?.exchangeRates ?? []),
    [snapshot?.exchangeRates],
  );

  const currencyOptions = useMemo(() => {
    const options = [baseCurrency];
    if (baseCurrency !== DEFAULT_EXCHANGE_CURRENCY) options.push(DEFAULT_EXCHANGE_CURRENCY);
    return Array.from(new Set(options));
  }, [baseCurrency]);

  const disabledCurrencyOptions = useMemo(
    () => currencyOptions.filter((currency) => !hasConversionRate(exchangeRateMap, baseCurrency, currency)),
    [baseCurrency, currencyOptions, exchangeRateMap],
  );

  const [currencyLoaded, setCurrencyLoaded] = useState(false);
  useEffect(() => {
    if (currencyLoaded) return;
    void AsyncStorage.getItem(ACCOUNTS_CURRENCY_KEY).then((stored) => {
      setDisplayCurrency(stored && currencyOptions.includes(stored) ? stored : baseCurrency);
      setCurrencyLoaded(true);
    });
  }, [baseCurrency, currencyLoaded, currencyOptions]);

  useEffect(() => {
    if (!currencyLoaded || !displayCurrency || currencyOptions.includes(displayCurrency)) return;
    setDisplayCurrency(baseCurrency);
    void AsyncStorage.setItem(ACCOUNTS_CURRENCY_KEY, baseCurrency);
  }, [baseCurrency, currencyLoaded, currencyOptions, displayCurrency]);

  useEffect(() => {
    if (baseCurrency === DEFAULT_EXCHANGE_CURRENCY) return;
    if (hasConversionRate(exchangeRateMap, baseCurrency, DEFAULT_EXCHANGE_CURRENCY)) return;

    const pairKey = `${baseCurrency}:${DEFAULT_EXCHANGE_CURRENCY}`;
    if (syncPairRequestRef.current === pairKey || syncExchangeRatePair.isPending) return;

    syncPairRequestRef.current = pairKey;
    syncExchangeRatePair.mutate(
      {
        fromCurrencyCode: baseCurrency,
        toCurrencyCode: DEFAULT_EXCHANGE_CURRENCY,
      },
      {
        onError: (err: unknown) => {
          showToast(humanizeError(err), "warning");
        },
      },
    );
  }, [baseCurrency, exchangeRateMap, showToast, syncExchangeRatePair]);

  const requestedCurrency = displayCurrency ?? baseCurrency;
  const activeCurrency = hasConversionRate(exchangeRateMap, baseCurrency, requestedCurrency)
    ? requestedCurrency
    : baseCurrency;

  function handleCurrencyChange(c: string) {
    if (!hasConversionRate(exchangeRateMap, baseCurrency, c)) return;
    setDisplayCurrency(c);
    void AsyncStorage.setItem(ACCOUNTS_CURRENCY_KEY, c);
  }

  // ── UI state ──────────────────────────────────────────────────────────────
  const [formVisible, setFormVisible] = useState(false);
  const [editAccount, setEditAccount] = useState<AccountSummary | null>(null);
  const [analyticsAccount, setAnalyticsAccount] = useState<AccountSummary | null>(null);
  const [searchText, setSearchText] = useState("");
  const [typeFilters, setTypeFilters] = useState<AccountTypeFilter[]>([]);
  const [showArchived, setShowArchived] = useState(false);

  // ── Multi-select ──────────────────────────────────────────────────────────
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkArchiveConfirm, setBulkArchiveConfirm] = useState(false);

  const toggleSelect = useCallback((id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  function exitSelectMode() {
    setSelectMode(false);
    setSelectedIds(new Set());
  }

  // ── Data ──────────────────────────────────────────────────────────────────
  const { allAccounts, totalNetWorth } = useMemo(() => {
    const accounts = snapshot?.accounts ?? [];
    const netWorth = accounts
      .filter((a) => !a.isArchived && a.includeInNetWorth)
      .reduce((sum, a) => {
        // currentBalanceInBaseCurrency is already converted to workspace base currency
        const inBase = a.currentBalanceInBaseCurrency ?? a.currentBalance;
        // Then convert from baseCurrency → activeCurrency
        return sum + inBase * resolveConversion(exchangeRateMap, baseCurrency, activeCurrency);
      }, 0);
    return { allAccounts: accounts, totalNetWorth: netWorth };
  }, [snapshot, exchangeRateMap, baseCurrency, activeCurrency]);

  const filtered = useMemo(() => {
    const q = searchText.toLowerCase();
    return allAccounts.filter((a) => {
      if (!showArchived && a.isArchived) return false;
      if (typeFilters.length > 0 && !typeFilters.includes(a.type as AccountTypeFilter)) return false;
      if (q && !a.name.toLowerCase().includes(q) && !a.currencyCode.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [allAccounts, searchText, typeFilters, showArchived]);

  const activeFiltered = filtered.filter((a) => !a.isArchived);
  const archivedFiltered = filtered.filter((a) => a.isArchived);
  const accountSections = useMemo<AccountListSection[]>(() => {
    const sections: AccountListSection[] = [];
    if (activeFiltered.length > 0) {
      sections.push({ key: "active", label: "Activas", data: activeFiltered, headerVariant: "hidden" });
    }
    if (archivedFiltered.length > 0) {
      sections.push({
        key: "archived",
        label: `Archivadas (${archivedFiltered.length})`,
        data: archivedFiltered,
        headerVariant: "divider",
        headerIcon: Archive,
      });
    }
    return sections;
  }, [activeFiltered, archivedFiltered]);

  const activeFilterItems = useMemo<ActiveFilterItem[]>(() => {
    const items: ActiveFilterItem[] = [];

    for (const typeFilter of typeFilters) {
      items.push({
        key: `type-${typeFilter}`,
        label: TYPE_FILTERS.find((filter) => filter.value === typeFilter)?.label ?? "Tipo",
        onRemove: () => setTypeFilters((current) => current.filter((value) => value !== typeFilter)),
      });
    }

    if (showArchived) {
      items.push({
        key: "archived",
        label: "Archivadas",
        onRemove: () => setShowArchived(false),
      });
    }

    if (searchText.trim()) {
      items.push({
        key: "search",
        label: `Busqueda: ${searchText.trim()}`,
        onRemove: () => setSearchText(""),
      });
    }

    return items;
  }, [searchText, showArchived, typeFilters]);

  function clearAccountFilters() {
    setTypeFilters([]);
    setShowArchived(false);
    setSearchText("");
  }

  const onRefresh = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ["workspace-snapshot"] });
  }, [queryClient]);

  useFocusEffect(
    useCallback(() => {
      void queryClient.invalidateQueries({ queryKey: ["workspace-snapshot"] });
    }, [queryClient]),
  );

  const handleArchive = useCallback(async (account: AccountSummary) => {
    try {
      await archiveAccount.mutateAsync({ id: account.id, archived: !account.isArchived });
      showToast(account.isArchived ? "Cuenta restaurada ✓" : "Cuenta archivada ✓", "success");
    } catch (err: unknown) {
      showToast(humanizeError(err), "error");
    }
  }, [archiveAccount, showToast]);

  async function executeBulkArchive() {
    for (const id of selectedIds) {
      const acc = allAccounts.find((a) => a.id === id);
      if (!acc) continue;
      await archiveAccount.mutateAsync({ id, archived: true });
    }
    exitSelectMode();
    setBulkArchiveConfirm(false);
    showToast("Cuentas archivadas", "success");
  }

  async function exportCSV(accounts: AccountSummary[]) {
    const csv = buildAccountCSV(accounts);
    const fileName = `cuentas_${format(new Date(), "yyyyMMdd")}.csv`;
    try {
      await shareCsvAsFile(csv, fileName);
    } catch {
      showToast("No se pudo exportar", "error");
    }
  }

  const selectedAccounts = allAccounts.filter((a) => selectedIds.has(a.id));

  const renderAccount: SectionListRenderItem<AccountSummary, AccountListSection> = useCallback(({ item: account, section }) => (
    section.key === "active" ? (
      <AccountCard
        account={account}
        selected={selectedIds.has(account.id)}
        selectMode={selectMode}
        onPress={() => {
          if (selectMode) { toggleSelect(account.id); return; }
          router.push(`/account/${account.id}?from=accounts`);
        }}
        onLongPress={() => {
          if (!selectMode) {
            setSelectMode(true);
            toggleSelect(account.id);
          }
        }}
        onArchive={() => handleArchive(account)}
        onAnalytics={() => setAnalyticsAccount(account)}
      />
    ) : (
      <AccountCard
        account={account}
        selected={selectedIds.has(account.id)}
        selectMode={selectMode}
        onPress={() => {
          if (selectMode) { toggleSelect(account.id); return; }
          setEditAccount(account);
          setFormVisible(true);
        }}
        onLongPress={() => {
          if (!selectMode) {
            setSelectMode(true);
            toggleSelect(account.id);
          }
        }}
        onRestore={() => handleArchive(account)}
        onAnalytics={() => setAnalyticsAccount(account)}
      />
    )
  ), [handleArchive, router, selectMode, selectedIds, toggleSelect]);

  const summaryHeader = !selectMode && activeFiltered.length > 0 ? (
    <AccountNetWorthSummary
      totalNetWorth={totalNetWorth}
      activeCurrency={activeCurrency}
      currencyOptions={currencyOptions}
      disabledCurrencyOptions={disabledCurrencyOptions}
      onCurrencyChange={handleCurrencyChange}
    />
  ) : null;

  return (
    <GestureDetector gesture={swipeGesture}>
      <ResourceModuleTemplate
        topInset={insets.top}
        header={
          <ScreenHeader
            title={selectMode ? `${selectedIds.size} seleccionadas` : "Cuentas"}
            rightAction={
              selectMode ? (
                <HeaderActionGroup
                  actions={[{
                    key: "cancel",
                    icon: X,
                    label: "Cancelar",
                    onPress: exitSelectMode,
                    accessibilityLabel: "Cancelar seleccion",
                  }]}
                />
              ) : (
                <HeaderActionGroup
                  actions={[{
                    key: "export",
                    icon: Download,
                    onPress: () => exportCSV(filtered),
                    accessibilityLabel: "Exportar CSV",
                  }]}
                />
              )
            }
          />
        }
        toolbar={
          <FilterToolbar
            options={TYPE_FILTERS}
            selectedValues={typeFilters}
            onSelectedValuesChange={setTypeFilters}
            allValue="all"
            searchValue={searchText}
            onSearchChange={setSearchText}
            searchPlaceholder="Buscar cuentas..."
            actions={[{
              key: "archived",
              icon: Archive,
              onPress: () => setShowArchived((v) => !v),
              active: showArchived,
              accessibilityLabel: "Mostrar cuentas archivadas",
            }]}
          />
        }
        activeFilters={
          !selectMode ? (
            <ActiveFilterBar items={activeFilterItems} onClear={clearAccountFilters} />
          ) : null
        }
        summary={summaryHeader}
        bulkActions={
          selectMode && selectedIds.size > 0 ? (
            <BulkActionBar
              selectedCount={selectedIds.size}
              onClear={exitSelectMode}
              actions={[
                {
                  key: "select-all",
                  label: `Sel. todas (${activeFiltered.length})`,
                  icon: CheckSquare,
                  onPress: () => setSelectedIds(new Set(activeFiltered.map((a) => a.id))),
                },
                {
                  key: "csv",
                  label: "CSV",
                  icon: Download,
                  tone: "primary",
                  onPress: () => exportCSV(selectedAccounts),
                },
                {
                  key: "archive",
                  label: `Archivar (${selectedIds.size})`,
                  icon: Archive,
                  tone: "neutral",
                  onPress: () => setBulkArchiveConfirm(true),
                },
              ]}
            />
          ) : null
        }
        list={
          <ResourceSectionList
            sections={accountSections}
            keyExtractor={(account) => String(account.id)}
            renderItem={renderAccount}
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
              title: "Sin cuentas",
              description: "Agrega tu primera cuenta con el botón +",
              action: { label: "Nueva cuenta", onPress: () => setFormVisible(true) },
            }}
            refreshing={isLoading}
            onRefresh={onRefresh}
          />
        }
        fab={
          !selectMode ? (
            <FAB onPress={() => { setEditAccount(null); setFormVisible(true); }} bottom={insets.bottom + 16} />
          ) : null
        }
        overlays={
          <>
            <AccountForm
              visible={formVisible}
              editAccount={editAccount ?? undefined}
              onClose={() => { setFormVisible(false); setEditAccount(null); }}
              onSuccess={() => { setFormVisible(false); setEditAccount(null); }}
            />

            <AccountAnalyticsModal
              visible={Boolean(analyticsAccount)}
              account={analyticsAccount}
              onClose={() => setAnalyticsAccount(null)}
            />

            <ConfirmDialog
              visible={bulkArchiveConfirm}
              title={`Archivar ${selectedIds.size} cuentas`}
              body="Las cuentas dejarán de aparecer en la lista principal. Podrás restaurarlas después."
              confirmLabel="Archivar"
              cancelLabel="Cancelar"
              onCancel={() => setBulkArchiveConfirm(false)}
              onConfirm={executeBulkArchive}
            />
          </>
        }
      />
    </GestureDetector>
  );
}

export default function AccountsScreenRoot() {
  return (
    <ErrorBoundary>
      <AccountsScreen />
    </ErrorBoundary>
  );
}
