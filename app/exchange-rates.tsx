import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SectionListRenderItem } from "react-native";
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { ArrowRight, RefreshCw, SlidersHorizontal } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ErrorBoundary } from "../components/ui/ErrorBoundary";
import { UndoBanner } from "../components/ui/UndoBanner";
import { ScreenHeader } from "../components/layout/ScreenHeader";
import { HeaderActionGroup } from "../components/ui/HeaderActionGroup";
import { FilterToolbar } from "../components/ui/FilterToolbar";
import { ActiveFilterBar, type ActiveFilterItem } from "../components/ui/ActiveFilterBar";
import { ResourceContextNote } from "../components/ui/ResourceContextNote";
import { ResourceModuleTemplate } from "../components/ui/ResourceModuleTemplate";
import { ResourceSectionList } from "../components/ui/ResourceSectionList";
import { BottomSheet } from "../components/ui/BottomSheet";
import { FAB } from "../components/ui/FAB";
import { SkeletonCard } from "../components/ui/Skeleton";
import { ExchangeRateFilterSheet } from "../features/exchange-rates/components/ExchangeRateFilterSheet";
import { ExchangeRateSwipeRow } from "../features/exchange-rates/components/ExchangeRateSwipeRow";
import { ExchangeRatesSummaryBar } from "../features/exchange-rates/components/ExchangeRatesSummaryBar";
import {
  buildExchangeRateSections,
  exchangeRateAdvancedFilterLabel,
  filterExchangeRates,
  getExchangeRatePairCount,
  isExchangeRateSameLocalDay,
  type ExchangeRateAdvancedFilter,
  type ExchangeRateListSection,
} from "../features/exchange-rates/lib/exchangeRateFilters";
import {
  useCreateExchangeRateMutation,
  useDeleteExchangeRateMutation,
  useExchangeRatesQuery,
  useSyncExchangeRatePairMutation,
  useUpdateExchangeRateMutation,
  type ExchangeRateRecord,
} from "../services/queries/workspace-data";
import { COLORS, FONT_FAMILY, FONT_SIZE, GLASS, RADIUS, SPACING } from "../constants/theme";
import { SUPPORTED_CURRENCY_CODES } from "../constants/currencies";
import { useToast } from "../hooks/useToast";
import { useOriginBackNavigation } from "../hooks/useOriginBackNavigation";

type CurrencyFilter = string;

function CurrencyPicker({
  label,
  value,
  onChange,
  options,
  exclude,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: string[];
  exclude?: string;
}) {
  const visible = options.filter((option) => option !== exclude);
  const isKnown = visible.includes(value);
  const [mode, setMode] = useState<string>(() => {
    if (!value) return visible.length ? "" : "other";
    return isKnown ? value : "other";
  });
  const [custom, setCustom] = useState(() => (isKnown ? "" : value));

  function pick(option: string) {
    setMode(option);
    onChange(option === "other" ? custom : option);
  }

  function handleCustomChange(value: string) {
    const upper = value.toUpperCase();
    setCustom(upper);
    onChange(upper);
  }

  const showInput = mode === "other" || visible.length === 0;

  return (
    <View style={formStyles.pickerWrap}>
      <Text style={formStyles.inputLabel}>{label}</Text>
      {visible.length > 0 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={formStyles.pillRow}>
          {visible.map((option) => (
            <TouchableOpacity
              key={option}
              style={[formStyles.pill, mode === option && formStyles.pillActive]}
              onPress={() => pick(option)}
              activeOpacity={0.7}
            >
              <Text style={[formStyles.pillText, mode === option && formStyles.pillTextActive]}>{option}</Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity
            style={[formStyles.pill, formStyles.pillOther, mode === "other" && formStyles.pillOtherActive]}
            onPress={() => pick("other")}
            activeOpacity={0.7}
          >
            <Text style={[formStyles.pillText, mode === "other" && formStyles.pillTextActive]}>Otro</Text>
          </TouchableOpacity>
        </ScrollView>
      ) : null}
      {showInput ? (
        <TextInput
          style={[formStyles.input, visible.length > 0 && formStyles.inputStacked]}
          placeholder="ej. EUR"
          placeholderTextColor={COLORS.storm}
          value={custom}
          onChangeText={handleCustomChange}
          autoCapitalize="characters"
          maxLength={3}
          autoFocus={mode === "other"}
        />
      ) : null}
    </View>
  );
}

function RateForm({
  initialFrom = "",
  initialTo = "",
  initialRate = "",
  initialNotes = "",
  currencyOptions,
  onSave,
  onCancel,
  loading,
}: {
  initialFrom?: string;
  initialTo?: string;
  initialRate?: string;
  initialNotes?: string;
  currencyOptions: string[];
  onSave: (from: string, to: string, rate: number, notes: string) => void;
  onCancel: () => void;
  loading: boolean;
}) {
  const [from, setFrom] = useState(initialFrom);
  const [to, setTo] = useState(initialTo);
  const [rate, setRate] = useState(initialRate);
  const [notes, setNotes] = useState(initialNotes);
  const [error, setError] = useState<string | null>(null);

  function handleSave() {
    const fromTrim = from.trim().toUpperCase();
    const toTrim = to.trim().toUpperCase();
    const rateNum = parseFloat(rate.replace(",", "."));
    if (!fromTrim || fromTrim.length !== 3) { setError("Moneda origen inválida (ej. USD)"); return; }
    if (!toTrim || toTrim.length !== 3) { setError("Moneda destino inválida (ej. PEN)"); return; }
    if (Number.isNaN(rateNum) || rateNum <= 0) { setError("Tasa debe ser un número positivo"); return; }
    if (fromTrim === toTrim) { setError("Las monedas no pueden ser iguales"); return; }
    setError(null);
    onSave(fromTrim, toTrim, rateNum, notes.trim());
  }

  return (
    <View style={formStyles.body}>
      <Text style={formStyles.hint}>
        1 [origen] = tasa [destino]{"  "}
        <Text style={formStyles.hintExample}>ej. 1 USD = 3.72 PEN</Text>
      </Text>

      <View style={formStyles.pairRow}>
        <View style={formStyles.pairInputWrap}>
          <CurrencyPicker label="Moneda origen" value={from} onChange={setFrom} options={currencyOptions} exclude={to} />
        </View>
        <View style={formStyles.arrowWrap}>
          <ArrowRight size={18} color={COLORS.storm} />
        </View>
        <View style={formStyles.pairInputWrap}>
          <CurrencyPicker label="Moneda destino" value={to} onChange={setTo} options={currencyOptions} exclude={from} />
        </View>
      </View>

      <Text style={formStyles.inputLabel}>Tasa de cambio</Text>
      <TextInput
        style={formStyles.input}
        placeholder="3.72"
        placeholderTextColor={COLORS.storm}
        value={rate}
        onChangeText={setRate}
        keyboardType="decimal-pad"
      />

      <Text style={formStyles.inputLabel}>Notas (opcional)</Text>
      <TextInput
        style={formStyles.input}
        placeholder="ej. Tipo de cambio BCP"
        placeholderTextColor={COLORS.storm}
        value={notes}
        onChangeText={setNotes}
      />

      {error ? (
        <View style={formStyles.errorBanner}>
          <Text style={formStyles.errorText}>{error}</Text>
        </View>
      ) : null}

      <View style={formStyles.actions}>
        <TouchableOpacity style={formStyles.cancelBtn} onPress={onCancel}>
          <Text style={formStyles.cancelText}>Cancelar</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[formStyles.saveBtn, loading && formStyles.disabled]}
          onPress={handleSave}
          disabled={loading}
        >
          <Text style={formStyles.saveText}>{loading ? "Guardando..." : "Guardar"}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function ExchangeRatesScreen() {
  const insets = useSafeAreaInsets();
  const { handleBack } = useOriginBackNavigation();
  const { showToast } = useToast();

  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState<ExchangeRateRecord | null>(null);
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [currencyFilter, setCurrencyFilter] = useState<CurrencyFilter>("all");
  const [advancedFilter, setAdvancedFilter] = useState<ExchangeRateAdvancedFilter>("all");
  const [pendingDeleteIds, setPendingDeleteIds] = useState<Set<number>>(new Set());
  const [pendingDeleteLabels, setPendingDeleteLabels] = useState<Record<number, string>>({});
  const deleteTimers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  const { data: rates = [], isLoading, refetch } = useExchangeRatesQuery();
  const createRate = useCreateExchangeRateMutation();
  const updateRate = useUpdateExchangeRateMutation();
  const deleteRate = useDeleteExchangeRateMutation();
  const syncRatePair = useSyncExchangeRatePairMutation();

  const activeRates = useMemo(
    () => rates.filter((rate) => !pendingDeleteIds.has(rate.id)),
    [pendingDeleteIds, rates],
  );
  const currencyOptions = useMemo(() => {
    const set = new Set<string>(SUPPORTED_CURRENCY_CODES);
    for (const rate of rates) {
      set.add(rate.fromCurrencyCode.toUpperCase());
      set.add(rate.toCurrencyCode.toUpperCase());
    }
    return Array.from(set).sort();
  }, [rates]);
  const filterOptions = useMemo(
    () => [{ label: "Todas", value: "all" }, ...currencyOptions.map((currency) => ({ label: currency, value: currency }))],
    [currencyOptions],
  );
  const filteredRates = useMemo(
    () => filterExchangeRates(activeRates, currencyFilter, searchText, advancedFilter),
    [activeRates, advancedFilter, currencyFilter, searchText],
  );
  const sections = useMemo(() => buildExchangeRateSections(filteredRates), [filteredRates]);
  const pairCount = useMemo(() => getExchangeRatePairCount(activeRates), [activeRates]);

  const activeFilterItems = useMemo<ActiveFilterItem[]>(() => {
    const items: ActiveFilterItem[] = [];
    if (currencyFilter !== "all") {
      items.push({
        key: "currency",
        label: `Moneda: ${currencyFilter}`,
        onRemove: () => setCurrencyFilter("all"),
      });
    }
    if (advancedFilter !== "all") {
      items.push({
        key: "advanced",
        label: exchangeRateAdvancedFilterLabel(advancedFilter),
        onRemove: () => setAdvancedFilter("all"),
      });
    }
    if (searchText.trim()) {
      items.push({
        key: "search",
        label: `Búsqueda: ${searchText.trim()}`,
        onRemove: () => setSearchText(""),
      });
    }
    return items;
  }, [advancedFilter, currencyFilter, searchText]);

  const extraFiltersCount = advancedFilter !== "all" ? 1 : 0;
  const hasFilters = currencyFilter !== "all" || advancedFilter !== "all" || Boolean(searchText.trim());
  const contextNote = hasFilters
    ? `Mostrando ${filteredRates.length} de ${activeRates.length} tipos de cambio.`
    : "Define cuántas unidades de la moneda destino equivalen a 1 unidad de la moneda origen.";

  useEffect(() => () => {
    deleteTimers.current.forEach(clearTimeout);
  }, []);

  function openNew() {
    setEditItem(null);
    setShowForm(true);
  }

  function openEdit(item: ExchangeRateRecord) {
    setEditItem(item);
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setEditItem(null);
  }

  const clearFilters = useCallback(() => {
    setCurrencyFilter("all");
    setAdvancedFilter("all");
    setSearchText("");
  }, []);

  const startUndoDelete = useCallback((item: ExchangeRateRecord) => {
    const label = `${item.fromCurrencyCode} → ${item.toCurrencyCode}`;
    setPendingDeleteIds((prev) => new Set(prev).add(item.id));
    setPendingDeleteLabels((prev) => ({ ...prev, [item.id]: label }));
    const timer = setTimeout(() => {
      deleteRate.mutate(item.id, {
        onError: (error: Error) => showToast(error.message, "error"),
      });
      setPendingDeleteIds((prev) => {
        const next = new Set(prev);
        next.delete(item.id);
        return next;
      });
      deleteTimers.current.delete(item.id);
    }, 5000);
    deleteTimers.current.set(item.id, timer);
  }, [deleteRate, showToast]);

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

  const handleSave = useCallback(async (from: string, to: string, rate: number, notes: string) => {
    try {
      if (editItem) {
        await updateRate.mutateAsync({ id: editItem.id, fromCurrencyCode: from, toCurrencyCode: to, rate, notes });
        showToast("Tipo de cambio actualizado", "success");
      } else {
        await createRate.mutateAsync({ fromCurrencyCode: from, toCurrencyCode: to, rate, notes });
        showToast("Tipo de cambio creado", "success");
      }
      closeForm();
    } catch (error: unknown) {
      showToast(error instanceof Error ? error.message : "No se pudo guardar el tipo de cambio", "error");
    }
  }, [createRate, editItem, showToast, updateRate]);

  const handleRefreshRates = useCallback(async (silent = false) => {
    if (activeRates.length === 0) {
      await refetch();
      return;
    }

    const pairs = new Map<string, string>();
    for (const rate of activeRates) {
      const from = rate.fromCurrencyCode.toUpperCase();
      const to = rate.toCurrencyCode.toUpperCase();
      const canonical = [from, to].sort().join(":");
      if (!pairs.has(canonical)) pairs.set(canonical, `${from}:${to}`);
    }

    try {
      await Promise.all(Array.from(pairs.values()).map((pair) => {
        const [fromCurrencyCode, toCurrencyCode] = pair.split(":");
        return syncRatePair.mutateAsync({ fromCurrencyCode, toCurrencyCode });
      }));
      if (!silent) showToast("Tipos de cambio actualizados", "success");
    } catch (error: unknown) {
      if (!silent) showToast(error instanceof Error ? error.message : "No se pudo actualizar tipos de cambio", "error");
    }
  }, [activeRates, refetch, showToast, syncRatePair]);

  const dailySyncStartedRef = useRef(false);
  useEffect(() => {
    if (dailySyncStartedRef.current || isLoading || activeRates.length === 0) return;
    const today = new Date();
    const needsSync = activeRates.some((rate) => !isExchangeRateSameLocalDay(rate.effectiveAt, today));
    if (!needsSync) return;
    dailySyncStartedRef.current = true;
    void handleRefreshRates(true);
  }, [activeRates, handleRefreshRates, isLoading]);

  const renderRate: SectionListRenderItem<ExchangeRateRecord, ExchangeRateListSection> = useCallback(({ item }) => (
    <ExchangeRateSwipeRow
      rate={item}
      onEdit={() => openEdit(item)}
      onDelete={() => startUndoDelete(item)}
    />
  ), [startUndoDelete]);

  return (
    <ResourceModuleTemplate
      topInset={insets.top}
      header={
        <ScreenHeader
          title="Tipos de cambio"
          onBack={handleBack}
          rightAction={
            <HeaderActionGroup
              actions={[{
                key: "refresh",
                icon: RefreshCw,
                onPress: () => void handleRefreshRates(),
                disabled: syncRatePair.isPending,
                accessibilityLabel: "Actualizar tipos de cambio",
              }, {
                key: "filters",
                icon: SlidersHorizontal,
                label: extraFiltersCount > 0 ? `Filtros (${extraFiltersCount})` : "Filtros",
                active: extraFiltersCount > 0,
                onPress: () => setFilterSheetOpen(true),
                accessibilityLabel: "Abrir filtros avanzados de tipos de cambio",
              }]}
            />
          }
        />
      }
      toolbar={
        <FilterToolbar
          options={filterOptions}
          value={currencyFilter}
          onChange={setCurrencyFilter}
          searchValue={searchText}
          onSearchChange={setSearchText}
          searchPlaceholder="Buscar moneda, tasa o nota..."
        />
      }
      activeFilters={<ActiveFilterBar items={activeFilterItems} onClear={clearFilters} />}
      context={activeRates.length > 0 ? <ResourceContextNote>{contextNote}</ResourceContextNote> : null}
      summary={
        activeRates.length > 0 ? (
          <ExchangeRatesSummaryBar pairCount={pairCount} currencyCount={currencyOptions.length} />
        ) : null
      }
      list={
        <ResourceSectionList
          sections={sections}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderRate}
          loading={{
            isLoading,
            secondaryLoading: syncRatePair.isPending && sections.length === 0,
            secondaryMessage: "Sincronizando tipos de cambio...",
            skeleton: (
              <>
                <SkeletonCard />
                <SkeletonCard />
                <SkeletonCard />
              </>
            ),
          }}
          empty={{
            title: hasFilters ? "Sin resultados" : "Sin tipos de cambio",
            description: hasFilters
              ? "Prueba otra moneda o limpia la búsqueda."
              : "Agrega el primer par para convertir saldos entre monedas.",
            action: !hasFilters ? { label: "Nuevo tipo de cambio", onPress: openNew } : undefined,
          }}
          refreshing={isLoading || syncRatePair.isPending}
          onRefresh={() => void handleRefreshRates()}
        />
      }
      fab={<FAB onPress={openNew} bottom={insets.bottom + 16} />}
      overlays={
        <>
          <ExchangeRateFilterSheet
            visible={filterSheetOpen}
            onClose={() => setFilterSheetOpen(false)}
            advancedFilter={advancedFilter}
            onAdvancedFilterChange={setAdvancedFilter}
          />
          <BottomSheet
            visible={showForm}
            onClose={closeForm}
            title={editItem ? `Editar ${editItem.fromCurrencyCode} → ${editItem.toCurrencyCode}` : "Nuevo tipo de cambio"}
            snapHeight={0.75}
          >
            <RateForm
              key={editItem?.id ?? "new"}
              initialFrom={editItem?.fromCurrencyCode ?? ""}
              initialTo={editItem?.toCurrencyCode ?? ""}
              initialRate={editItem ? String(editItem.rate) : ""}
              initialNotes={editItem?.notes ?? ""}
              currencyOptions={currencyOptions}
              onSave={(from, to, rate, notes) => void handleSave(from, to, rate, notes)}
              onCancel={closeForm}
              loading={createRate.isPending || updateRate.isPending}
            />
          </BottomSheet>
          <UndoBanner
            visible={pendingDeleteIds.size > 0}
            message={pendingDeleteIds.size === 1
              ? `Tipo de cambio "${Object.values(pendingDeleteLabels).at(-1) ?? ""}" eliminado`
              : `${pendingDeleteIds.size} tipos de cambio eliminados`}
            onUndo={() => pendingDeleteIds.forEach((id) => undoDelete(id))}
            durationMs={5000}
            bottomOffset={insets.bottom + 80}
          />
        </>
      }
    />
  );
}

const formStyles = StyleSheet.create({
  body: {
    gap: SPACING.md,
    paddingBottom: SPACING.lg,
  },
  hint: {
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.sm,
    color: COLORS.storm,
  },
  hintExample: {
    color: COLORS.pine,
    fontFamily: FONT_FAMILY.bodySemibold,
  },
  pairRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: SPACING.sm,
  },
  pairInputWrap: {
    flex: 1,
  },
  arrowWrap: {
    paddingTop: 26,
  },
  pickerWrap: {
    gap: 6,
  },
  pillRow: {
    flexDirection: "row",
    gap: SPACING.xs,
    flexWrap: "nowrap",
  },
  pill: {
    paddingHorizontal: SPACING.md,
    paddingVertical: 7,
    borderRadius: RADIUS.full,
    backgroundColor: GLASS.card,
    borderWidth: 1,
    borderColor: GLASS.cardBorder,
  },
  pillActive: {
    backgroundColor: COLORS.pine + "20",
    borderColor: COLORS.pine + "60",
  },
  pillOther: {
    borderStyle: "dashed",
  },
  pillOtherActive: {
    backgroundColor: COLORS.ember + "20",
    borderColor: COLORS.ember + "60",
    borderStyle: "solid",
  },
  pillText: {
    fontFamily: FONT_FAMILY.bodyMedium,
    fontSize: FONT_SIZE.xs,
    color: COLORS.storm,
  },
  pillTextActive: {
    fontFamily: FONT_FAMILY.bodySemibold,
    color: COLORS.ink,
  },
  inputLabel: {
    fontFamily: FONT_FAMILY.bodySemibold,
    fontSize: FONT_SIZE.xs,
    color: COLORS.storm,
    marginBottom: 4,
  },
  input: {
    backgroundColor: GLASS.input,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: GLASS.inputBorder,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.md,
    color: COLORS.ink,
  },
  inputStacked: {
    marginTop: SPACING.xs,
  },
  errorBanner: {
    backgroundColor: GLASS.dangerBg,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderColor: GLASS.dangerBorder,
    padding: SPACING.sm,
  },
  errorText: {
    fontFamily: FONT_FAMILY.bodyMedium,
    fontSize: FONT_SIZE.xs,
    color: COLORS.rosewood,
  },
  actions: {
    flexDirection: "row",
    gap: SPACING.sm,
    marginTop: SPACING.xs,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: SPACING.sm + 2,
    borderRadius: RADIUS.md,
    backgroundColor: GLASS.card,
    borderWidth: 1,
    borderColor: GLASS.cardBorder,
    alignItems: "center",
  },
  cancelText: {
    fontFamily: FONT_FAMILY.bodySemibold,
    fontSize: FONT_SIZE.sm,
    color: COLORS.storm,
  },
  saveBtn: {
    flex: 1,
    paddingVertical: SPACING.sm + 2,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.pine,
    alignItems: "center",
  },
  saveText: {
    fontFamily: FONT_FAMILY.bodySemibold,
    fontSize: FONT_SIZE.sm,
    color: "#05070B",
  },
  disabled: {
    opacity: 0.6,
  },
});

export default function ExchangeRatesScreenRoot() {
  return (
    <ErrorBoundary>
      <ExchangeRatesScreen />
    </ErrorBoundary>
  );
}
