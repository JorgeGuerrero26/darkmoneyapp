import { ErrorBoundary } from "../../components/ui/ErrorBoundary";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View, type SectionListRenderItem } from "react-native";
import { COLORS, FONT_FAMILY, FONT_SIZE, RADIUS, SPACING, SURFACE } from "../../constants/theme";
import { useRouter } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  Archive, CheckSquare, ChevronDown, ChevronUp, Download, Layers, PieChart, Plus, X,
} from "lucide-react-native";
import { format } from "date-fns";
import { es } from "date-fns/locale";

import AsyncStorage from "@react-native-async-storage/async-storage";
import { useAuth } from "../../lib/auth-context";
import { useWorkspace } from "../../lib/workspace-context";
import { useUiStore } from "../../store/ui-store";
import {
  useWorkspaceSnapshotQuery,
  useArchiveAccountMutation,
  useSyncExchangeRatePairMutation,
} from "../../services/queries/workspace-data";
import { AccountCard } from "../../components/domain/AccountCard";
import { SkeletonCard, SkeletonList } from "../../components/ui/Skeleton";
import { BulkActionBar } from "../../components/ui/BulkActionBar";
import { ScreenHeader } from "../../components/layout/ScreenHeader";
import { FilterToolbar } from "../../components/ui/FilterToolbar";
import { ActiveFilterBar, type ActiveFilterItem } from "../../components/ui/ActiveFilterBar";
import { HeaderActionGroup } from "../../components/ui/HeaderActionGroup";
import { ConfirmDialog } from "../../components/ui/ConfirmDialog";
import { ResourceContextNote } from "../../components/ui/ResourceContextNote";
import { ResourceModuleTemplate } from "../../components/ui/ResourceModuleTemplate";
import { ResourceSectionList, type ResourceSection } from "../../components/ui/ResourceSectionList";
import { AccountForm } from "../../components/forms/AccountForm";
import { AccountNetWorthSummary } from "../../features/accounts/components/AccountNetWorthSummary";
import { useToast } from "../../hooks/useToast";
import { useNotificationReason } from "../../hooks/useNotificationReason";
import { humanizeError } from "../../lib/errors";
import { shareCsvAsFile } from "../../lib/share-csv-file";
import { DEFAULT_EXCHANGE_CURRENCY } from "../../constants/currencies";
import { buildRateMap, hasConversionRate } from "../../lib/exchange-rate-map";
import { useDisplayCurrency } from "../../features/accounts/lib/display-currency-context";
import { buildAccountCSV } from "../../features/accounts/lib/csv";
import { applyAccountFilter } from "../../features/accounts/lib/filters";
import { computeNetWorth } from "../../features/accounts/lib/net-worth";
import { computeComposition } from "../../features/accounts/lib/composition";
import { NetWorthCompositionChart } from "../../features/accounts/components/NetWorthCompositionChart";
import { useAccountsRealtimeSync } from "../../features/accounts/hooks/useAccountsRealtimeSync";
import type { AccountSummary } from "../../types/domain";

type AccountTypeFilter = "all" | "bank" | "cash" | "savings" | "credit_card" | "investment" | "loan" | "other";
type AccountListSection = ResourceSection<AccountSummary, string>;

const TYPE_FILTERS: { label: string; value: AccountTypeFilter }[] = [
  { label: "Todas las cuentas", value: "all" },
  { label: "Banco",       value: "bank" },
  { label: "Efectivo",    value: "cash" },
  { label: "Ahorro",      value: "savings" },
  { label: "Tarjeta",     value: "credit_card" },
  { label: "Inversión",   value: "investment" },
  { label: "Préstamo",    value: "loan" },
  { label: "Otro",        value: "other" },
];

// Labels and visual order for "group by type" mode.
const TYPE_GROUP_ORDER: { value: string; label: string }[] = [
  { value: "bank",        label: "Bancos" },
  { value: "savings",     label: "Ahorro" },
  { value: "credit_card", label: "Tarjetas" },
  { value: "cash",        label: "Efectivo" },
  { value: "investment",  label: "Inversiones" },
  { value: "loan",        label: "Préstamos" },
  { value: "loan_wallet", label: "Cartera de préstamos" },
  { value: "other",       label: "Otras" },
];

const ACCOUNTS_GROUPING_KEY = "darkmoney.accounts.groupByType";

/**
 * A partir de cuántas cuentas aparecen el buscador y el filtro.
 *
 * Con dos cuentas ocupaban 110 px del encabezado para operar sobre una lista que cabe entera en
 * la pantalla, con 500 px de vacío debajo. Ocho es cuando la lista deja de verse de un vistazo;
 * hasta ahí, ese espacio es del patrimonio.
 */
const LIST_CONTROLS_MIN_ACCOUNTS = 8;
const ACCOUNTS_COMPOSITION_EXPANDED_KEY = "darkmoney.accounts.compositionExpanded";

function AccountsScreen() {
  // Fuerza el re-render de la pantalla al alternar modo privacidad (la máscara
  // vive en formatCurrency, que lee el store imperativamente).
  useUiStore((state) => state.privacyMode);
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { profile } = useAuth();
  const { activeWorkspaceId, activeWorkspace } = useWorkspace();
  const { showToast } = useToast();
  const { reason: notificationReason } = useNotificationReason();

  const { data: snapshot, isLoading, isRefetching, refetch } = useWorkspaceSnapshotQuery(profile, activeWorkspaceId);
  useAccountsRealtimeSync({ workspaceId: activeWorkspaceId });
  const archiveAccount = useArchiveAccountMutation(activeWorkspaceId);
  const syncExchangeRatePair = useSyncExchangeRatePairMutation();
  const syncPairRequestRef = useRef<string | null>(null);


  // ── Currency display (shared via DisplayCurrencyProvider) ──────────────────
  const { displayCurrency, setDisplayCurrency } = useDisplayCurrency();
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

  // If the persisted preference is for a currency we cannot offer (e.g. workspace
  // base changed), silently snap back to the base.
  useEffect(() => {
    if (!displayCurrency) return;
    if (currencyOptions.includes(displayCurrency)) return;
    setDisplayCurrency(baseCurrency);
  }, [baseCurrency, currencyOptions, displayCurrency, setDisplayCurrency]);

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
  }

  // ── UI state ──────────────────────────────────────────────────────────────
  const [formVisible, setFormVisible] = useState(false);
  const [editAccount, setEditAccount] = useState<AccountSummary | null>(null);
  const [searchText, setSearchText] = useState("");
  const [typeFilters, setTypeFilters] = useState<AccountTypeFilter[]>([]);
  const [showArchived, setShowArchived] = useState(false);
  const [groupByType, setGroupByType] = useState(false);
  const [compositionExpanded, setCompositionExpanded] = useState(false);

  // Load persisted toggles.
  useEffect(() => {
    void AsyncStorage.getItem(ACCOUNTS_GROUPING_KEY).then((stored) => {
      if (stored === "1") setGroupByType(true);
    });
    void AsyncStorage.getItem(ACCOUNTS_COMPOSITION_EXPANDED_KEY).then((stored) => {
      if (stored === "1") setCompositionExpanded(true);
    });
  }, []);

  const toggleGroupByType = useCallback(() => {
    setGroupByType((prev) => {
      const next = !prev;
      void AsyncStorage.setItem(ACCOUNTS_GROUPING_KEY, next ? "1" : "0");
      return next;
    });
  }, []);

  const toggleCompositionExpanded = useCallback(() => {
    setCompositionExpanded((prev) => {
      const next = !prev;
      void AsyncStorage.setItem(ACCOUNTS_COMPOSITION_EXPANDED_KEY, next ? "1" : "0");
      return next;
    });
  }, []);

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

  // Auto-exit select mode when all items are deselected
  useEffect(() => {
    if (selectMode && selectedIds.size === 0) {
      setSelectMode(false);
      setSelectedIds(new Set());
    }
  }, [selectMode, selectedIds.size]);

  // ── Data ──────────────────────────────────────────────────────────────────
  const allAccounts = snapshot?.accounts ?? [];
  const totalNetWorth = useMemo(
    () => computeNetWorth({
      accounts: allAccounts,
      baseCurrency,
      displayCurrency: activeCurrency,
      exchangeRateMap,
    }),
    [allAccounts, exchangeRateMap, baseCurrency, activeCurrency],
  );

  const filtered = useMemo(
    () => applyAccountFilter(allAccounts, {
      searchText,
      typeFilters,
      showArchived,
    }),
    [allAccounts, searchText, typeFilters, showArchived],
  );

  const activeFiltered = filtered.filter((a) => !a.isArchived);
  const archivedFiltered = filtered.filter((a) => a.isArchived);
  const accountSections = useMemo<AccountListSection[]>(() => {
    const sections: AccountListSection[] = [];

    if (groupByType) {
      // Group active accounts by type, following TYPE_GROUP_ORDER. Unknown types fall under "other".
      const buckets = new Map<string, AccountSummary[]>();
      for (const account of activeFiltered) {
        const known = TYPE_GROUP_ORDER.some((g) => g.value === account.type);
        const key = known ? account.type : "other";
        const bucket = buckets.get(key);
        if (bucket) bucket.push(account);
        else buckets.set(key, [account]);
      }
      for (const group of TYPE_GROUP_ORDER) {
        const data = buckets.get(group.value);
        if (data && data.length > 0) {
          sections.push({
            key: `type-${group.value}`,
            label: `${group.label} (${data.length})`,
            data,
            headerVariant: "divider",
          });
        }
      }
    } else if (activeFiltered.length > 0) {
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
  }, [activeFiltered, archivedFiltered, groupByType]);

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

    if (groupByType) {
      items.push({
        key: "group-by-type",
        label: "Agrupado por tipo",
        onRemove: toggleGroupByType,
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
  }, [groupByType, searchText, showArchived, toggleGroupByType, typeFilters]);

  function clearAccountFilters() {
    setTypeFilters([]);
    setShowArchived(false);
    setSearchText("");
    if (groupByType) toggleGroupByType();
  }

  const totalAccountsCount = allAccounts.length;
  const totalArchivedCount = useMemo(
    () => allAccounts.filter((a) => a.isArchived).length,
    [allAccounts],
  );
  const hasActiveFilter = typeFilters.length > 0 || showArchived || searchText.trim().length > 0 || groupByType;

  const emptyConfig = useMemo(() => {
    if (totalAccountsCount === 0) {
      return {
        title: "Sin cuentas",
        description: "Agrega tu primera cuenta con el botón +",
        action: { label: "Nueva cuenta", onPress: () => setFormVisible(true) },
      };
    }
    if (hasActiveFilter) {
      return {
        variant: "no-results" as const,
        title: "Sin coincidencias",
        description: searchText.trim()
          ? `No encontramos cuentas para "${searchText.trim()}".`
          : "Ninguna cuenta coincide con los filtros activos.",
        action: { label: "Limpiar filtros", onPress: clearAccountFilters },
      };
    }
    if (totalArchivedCount > 0 && !showArchived) {
      return {
        title: "Sin cuentas activas",
        description: `Tienes ${totalArchivedCount} cuenta${totalArchivedCount === 1 ? "" : "s"} archivada${totalArchivedCount === 1 ? "" : "s"}. Restaura alguna para que vuelva al patrimonio.`,
        action: { label: "Ver archivadas", onPress: () => setShowArchived(true) },
      };
    }
    return {
      title: "Sin cuentas",
      description: "Agrega tu primera cuenta con el botón +",
      action: { label: "Nueva cuenta", onPress: () => setFormVisible(true) },
    };
  }, [hasActiveFilter, searchText, showArchived, totalAccountsCount, totalArchivedCount]);

  const onRefresh = useCallback(async () => {
    // refetch() devuelve promesa → el spinner se mantiene hasta que llegan los saldos nuevos.
    await refetch();
  }, [refetch]);


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
        baseCurrencyCode={baseCurrency}
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
      />
    ) : (
      <AccountCard
        account={account}
        baseCurrencyCode={baseCurrency}
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
      />
    )
  ), [baseCurrency, handleArchive, router, selectMode, selectedIds, toggleSelect]);

  const showListControls = allAccounts.length >= LIST_CONTROLS_MIN_ACCOUNTS;

  /**
   * Por debajo del umbral no hay barra donde ver ni quitar un filtro, así que no puede quedar
   * ninguno puesto: si archivas cuentas hasta bajar de ocho con un filtro activo, la lista
   * escondería cuentas sin decir por qué y sin forma de destaparlas.
   */
  useEffect(() => {
    if (showListControls) return;
    if (typeFilters.length === 0 && searchText === "" && !groupByType) return;
    setTypeFilters([]);
    setSearchText("");
    if (groupByType) toggleGroupByType();
  }, [groupByType, searchText, showListControls, toggleGroupByType, typeFilters.length]);


  /**
   * El conmutador de moneda solo cuando hay algo que convertir: si todas las cuentas que suman
   * al patrimonio están en la misma moneda, ofrecer PEN/USD no cambia ninguna cifra.
   */
  const mixesCurrencies = useMemo(() => {
    const currencies = new Set(
      allAccounts
        .filter((account) => !account.isArchived && account.includeInNetWorth)
        .map((account) => account.currencyCode.toUpperCase()),
    );
    return currencies.size > 1;
  }, [allAccounts]);

  /** La marca de tiempo que importa no es "hace 21 s", es a qué fecha está el patrimonio. */
  const netWorthSupport = useMemo(() => {
    const activeCount = allAccounts.filter((account) => !account.isArchived).length;
    const cuentas = `${activeCount} ${activeCount === 1 ? "cuenta activa" : "cuentas activas"}`;
    return `${cuentas} · al ${format(new Date(), "d 'de' MMMM", { locale: es })}`;
  }, [allAccounts]);

  const composition = useMemo(
    () => computeComposition({
      accounts: allAccounts,
      baseCurrency,
      displayCurrency: activeCurrency,
      exchangeRateMap,
    }),
    [allAccounts, activeCurrency, baseCurrency, exchangeRateMap],
  );

  /**
   * La composición aparece cuando hay algo que componer.
   *
   * Con un solo tipo de cuenta el anillo es una circunferencia entera al 100 % y el centro
   * repite, cuarenta píxeles más abajo, el mismo patrimonio neto que acaba de leerse en el
   * encabezado. Un gráfico de una sola porción no compara nada.
   */
  const hasCompositionData = composition.assets.length > 1 || composition.debts > 0;

  const summaryHeader = !selectMode && activeFiltered.length > 0 ? (
    <>
      <AccountNetWorthSummary
        totalNetWorth={totalNetWorth}
        activeCurrency={activeCurrency}
        support={netWorthSupport}
        currencyOptions={mixesCurrencies ? currencyOptions : []}
        disabledCurrencyOptions={disabledCurrencyOptions}
        onCurrencyChange={handleCurrencyChange}
      />
      {hasCompositionData ? (
        <>
          <View style={localStyles.compositionCard}>
            <TouchableOpacity
              style={localStyles.compositionHeader}
              onPress={toggleCompositionExpanded}
              accessibilityRole="button"
              accessibilityState={{ expanded: compositionExpanded }}
              accessibilityLabel={compositionExpanded ? "Ocultar composición" : "Mostrar composición"}
            >
              <View style={localStyles.compositionHeaderLeft}>
                <PieChart size={16} color={COLORS.pine} strokeWidth={2} />
                <Text style={localStyles.compositionHeaderText}>Composición del patrimonio</Text>
              </View>
              {compositionExpanded ? (
                <ChevronUp size={18} color={COLORS.storm} />
              ) : (
                <ChevronDown size={18} color={COLORS.storm} />
              )}
            </TouchableOpacity>
            {compositionExpanded ? (
              <NetWorthCompositionChart composition={composition} currencyCode={activeCurrency} embedded />
            ) : null}
          </View>
          <View style={localStyles.sectionDivider} />
        </>
      ) : null}
    </>
  ) : null;

  return (
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
                  actions={[
                    {
                      // Un botón redondo sin etiqueta no se adivina. Si la acción es "ver
                      // archivadas", se dice con palabras.
                      key: "archived",
                      icon: Archive,
                      label: "Archivadas",
                      active: showArchived,
                      onPress: () => setShowArchived((v) => !v),
                      accessibilityLabel: "Mostrar cuentas archivadas",
                    },
                    {
                      key: "export",
                      icon: Download,
                      onPress: () => exportCSV(filtered),
                      accessibilityLabel: "Exportar CSV",
                    },
                  ]}
                />
              )
            }
          />
        }
        toolbar={
          showListControls ? (
            <FilterToolbar
              options={TYPE_FILTERS}
              selectedValues={typeFilters}
              onSelectedValuesChange={setTypeFilters}
              allValue="all"
              searchValue={searchText}
              onSearchChange={setSearchText}
              searchPlaceholder="Buscar cuentas..."
              actions={[
                {
                  key: "group-by-type",
                  icon: Layers,
                  onPress: toggleGroupByType,
                  active: groupByType,
                  accessibilityLabel: "Agrupar por tipo de cuenta",
                },
              ]}
            />
          ) : null
        }
        activeFilters={
          !selectMode && showListControls ? (
            <ActiveFilterBar items={activeFilterItems} onClear={clearAccountFilters} />
          ) : null
        }
        context={!selectMode && notificationReason ? <ResourceContextNote>{notificationReason}</ResourceContextNote> : null}
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
                <SkeletonList>
                  <SkeletonCard />
                  <SkeletonCard />
                  <SkeletonCard />
                </SkeletonList>
              ),
            }}
            empty={emptyConfig}
            refreshing={isRefetching}
            onRefresh={onRefresh}
            contentContainerStyle={localStyles.listContent}
            /* Un botón flotante sobre 500 px de vacío anuncia una lista larga que no existe.
               Al final de la lista, "Agregar cuenta" es una fila más y dice lo que hace. */
            listFooterComponent={
              !selectMode ? (
                <TouchableOpacity
                  style={localStyles.addRow}
                  onPress={() => { setEditAccount(null); setFormVisible(true); }}
                  activeOpacity={0.72}
                  accessibilityRole="button"
                  accessibilityLabel="Agregar cuenta"
                >
                  <Plus size={16} color={COLORS.storm} strokeWidth={1.8} />
                  <Text style={localStyles.addRowText}>Agregar cuenta</Text>
                </TouchableOpacity>
              ) : null
            }
          />
        }
        overlays={
          <>
            <AccountForm
              visible={formVisible}
              editAccount={editAccount ?? undefined}
              onClose={() => { setFormVisible(false); setEditAccount(null); }}
              onSuccess={() => { setFormVisible(false); setEditAccount(null); }}
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
  );
}

const localStyles = StyleSheet.create({
  compositionCard: {
    marginHorizontal: SPACING.lg,
    marginTop: SPACING.md,
    borderRadius: RADIUS.xl,
    borderWidth: 1,
    borderColor: SURFACE.cardBorder,
    backgroundColor: SURFACE.card,
    overflow: "hidden",
  },
  listContent: {
    paddingTop: SPACING.sm,
  },
  addRow: {
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.md,
    paddingHorizontal: SPACING.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: SURFACE.separator,
  },
  addRowText: {
    fontFamily: FONT_FAMILY.bodyMedium,
    fontSize: FONT_SIZE.sm,
    color: COLORS.fog,
  },
  compositionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
  },
  compositionHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
  },
  compositionHeaderText: {
    fontFamily: FONT_FAMILY.bodyMedium,
    fontSize: FONT_SIZE.sm,
    color: COLORS.ink,
  },
  sectionDivider: {
    height: 1,
    marginTop: SPACING.md,
    marginHorizontal: SPACING.lg,
    backgroundColor: SURFACE.separator,
  },
});

export default function AccountsScreenRoot() {
  return (
    <ErrorBoundary>
      <AccountsScreen />
    </ErrorBoundary>
  );
}
