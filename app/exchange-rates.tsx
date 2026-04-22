import { useEffect, useRef, useMemo, useState } from "react";
import { ErrorBoundary } from "../components/ui/ErrorBoundary";
import {
  Animated,
  PanResponder,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ArrowRight, RefreshCw, Search, Trash2, X } from "lucide-react-native";
import { format } from "date-fns";
import { es } from "date-fns/locale";

import {
  useExchangeRatesQuery,
  useCreateExchangeRateMutation,
  useUpdateExchangeRateMutation,
  useDeleteExchangeRateMutation,
  type ExchangeRateRecord,
} from "../services/queries/workspace-data";
import { ScreenHeader } from "../components/layout/ScreenHeader";
import { BottomSheet } from "../components/ui/BottomSheet";
import { EmptyState } from "../components/ui/EmptyState";
import { FAB } from "../components/ui/FAB";
import { UndoBanner } from "../components/ui/UndoBanner";
import { COLORS, FONT_FAMILY, FONT_SIZE, GLASS, RADIUS, SPACING } from "../constants/theme";
import { useToast } from "../hooks/useToast";

const REVEAL_W = 80;

// ─── Currency picker ──────────────────────────────────────────────────────────

function CurrencyPicker({
  label,
  value,
  onChange,
  options,
  exclude,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
  /** Currency to hide from pills (the "other side" of the pair) */
  exclude?: string;
}) {
  const visible = options.filter((o) => o !== exclude);
  const isKnown = visible.includes(value);

  // mode: one of the known options or "otro"
  const [mode, setMode] = useState<string>(() => {
    if (!value) return visible.length ? "" : "otro";
    return isKnown ? value : "otro";
  });
  const [custom, setCustom] = useState(() => (isKnown ? "" : value));

  function pick(opt: string) {
    setMode(opt);
    if (opt !== "otro") {
      onChange(opt);
    } else {
      onChange(custom);
    }
  }

  function handleCustom(v: string) {
    const upper = v.toUpperCase();
    setCustom(upper);
    onChange(upper);
  }

  // When no pills, auto-show text input
  const showInput = mode === "otro" || visible.length === 0;

  return (
    <View style={pickerStyles.wrap}>
      <Text style={styles.inputLabel}>{label}</Text>

      {visible.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={pickerStyles.pillRow}
        >
          {visible.map((opt) => (
            <TouchableOpacity
              key={opt}
              style={[pickerStyles.pill, mode === opt && pickerStyles.pillActive]}
              onPress={() => pick(opt)}
              activeOpacity={0.7}
            >
              <Text style={[pickerStyles.pillText, mode === opt && pickerStyles.pillTextActive]}>
                {opt}
              </Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity
            style={[pickerStyles.pill, pickerStyles.pillOtro, mode === "otro" && pickerStyles.pillOtroActive]}
            onPress={() => pick("otro")}
            activeOpacity={0.7}
          >
            <Text style={[pickerStyles.pillText, mode === "otro" && pickerStyles.pillTextActive]}>
              Otro
            </Text>
          </TouchableOpacity>
        </ScrollView>
      )}

      {showInput && (
        <TextInput
          style={[styles.input, visible.length > 0 && { marginTop: SPACING.xs }]}
          placeholder="ej. EUR"
          placeholderTextColor={COLORS.storm}
          value={custom}
          onChangeText={handleCustom}
          autoCapitalize="characters"
          maxLength={3}
          autoFocus={mode === "otro"}
        />
      )}
    </View>
  );
}

// ─── Add / Edit form ──────────────────────────────────────────────────────────

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
    if (isNaN(rateNum) || rateNum <= 0) { setError("Tasa debe ser un número positivo"); return; }
    if (fromTrim === toTrim) { setError("Las monedas no pueden ser iguales"); return; }
    setError(null);
    onSave(fromTrim, toTrim, rateNum, notes.trim());
  }

  return (
    <View style={styles.formBody}>
      <Text style={styles.formHint}>
        1 [origen] = tasa [destino]{"  "}
        <Text style={styles.formHintExample}>ej. 1 USD = 3.72 PEN</Text>
      </Text>

      <View style={styles.pairRow}>
        <View style={styles.pairInputWrap}>
          <CurrencyPicker
            label="Moneda origen"
            value={from}
            onChange={setFrom}
            options={currencyOptions}
            exclude={to}
          />
        </View>
        <View style={styles.arrowWrap}>
          <ArrowRight size={18} color={COLORS.storm} />
        </View>
        <View style={styles.pairInputWrap}>
          <CurrencyPicker
            label="Moneda destino"
            value={to}
            onChange={setTo}
            options={currencyOptions}
            exclude={from}
          />
        </View>
      </View>

      <Text style={styles.inputLabel}>Tasa de cambio</Text>
      <TextInput
        style={styles.input}
        placeholder="3.72"
        placeholderTextColor={COLORS.storm}
        value={rate}
        onChangeText={setRate}
        keyboardType="decimal-pad"
      />

      <Text style={styles.inputLabel}>Notas (opcional)</Text>
      <TextInput
        style={styles.input}
        placeholder="ej. Tipo de cambio BCP"
        placeholderTextColor={COLORS.storm}
        value={notes}
        onChangeText={setNotes}
      />

      {error ? (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}

      <View style={styles.formActions}>
        <TouchableOpacity style={styles.cancelBtn} onPress={onCancel}>
          <Text style={styles.cancelText}>Cancelar</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.saveBtn, loading && { opacity: 0.6 }]}
          onPress={handleSave}
          disabled={loading}
        >
          <Text style={styles.saveText}>{loading ? "Guardando..." : "Guardar"}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── Swipeable rate row ────────────────────────────────────────────────────────

function SwipeableRateRow({
  item,
  onEdit,
  onDelete,
}: {
  item: ExchangeRateRecord;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const translateX = useRef(new Animated.Value(0)).current;
  const openDir = useRef<"left" | null>(null);

  const deleteOpacity = translateX.interpolate({
    inputRange: [-REVEAL_W, -16, 0],
    outputRange: [1, 0.6, 0],
    extrapolate: "clamp",
  });

  const snapTo = (toValue: number, cb?: () => void) => {
    openDir.current = toValue < 0 ? "left" : null;
    Animated.spring(translateX, { toValue, useNativeDriver: true, tension: 80, friction: 11 }).start(cb);
  };

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, { dx, dy }) =>
        Math.abs(dx) > Math.abs(dy) * 1.5 && Math.abs(dx) > 10,
      onPanResponderGrant: () => { translateX.stopAnimation(); },
      onPanResponderMove: (_, { dx }) => {
        const base = openDir.current === "left" ? -REVEAL_W : 0;
        translateX.setValue(Math.min(0, Math.max(-REVEAL_W * 1.4, base + dx)));
      },
      onPanResponderRelease: (_, { dx, vx }) => {
        const base = openDir.current === "left" ? -REVEAL_W : 0;
        if (base + dx < -REVEAL_W / 2 || vx < -0.4) snapTo(-REVEAL_W);
        else snapTo(0);
      },
    })
  ).current;

  return (
    <View style={styles.swipeContainer}>
      <Animated.View style={[styles.deleteBg, { opacity: deleteOpacity }]}>
        <TouchableOpacity style={styles.deleteAction} onPress={() => snapTo(0, onDelete)} activeOpacity={0.8}>
          <Trash2 size={20} color={COLORS.danger} strokeWidth={2} />
          <Text style={styles.deleteActionLabel}>Eliminar</Text>
        </TouchableOpacity>
      </Animated.View>

      <Animated.View style={{ transform: [{ translateX }] }} {...panResponder.panHandlers}>
        <TouchableOpacity
          style={styles.rateRow}
          onPress={() => { if (openDir.current !== null) { snapTo(0); return; } onEdit(); }}
          activeOpacity={0.7}
        >
          <View style={styles.rateLeft}>
            <View style={styles.pairBadge}>
              <Text style={styles.pairFrom}>{item.fromCurrencyCode}</Text>
              <ArrowRight size={11} color={COLORS.pine} />
              <Text style={styles.pairTo}>{item.toCurrencyCode}</Text>
            </View>
            <Text style={styles.rateValue}>
              1 {item.fromCurrencyCode} = <Text style={styles.rateNum}>{item.rate.toFixed(4)}</Text> {item.toCurrencyCode}
            </Text>
            <Text style={styles.rateDate}>
              {format(new Date(item.effectiveAt), "d MMM yyyy, HH:mm", { locale: es })}
              {item.source === "manual" ? "  ·  manual" : ""}
            </Text>
            {item.notes ? <Text style={styles.rateNotes}>{item.notes}</Text> : null}
          </View>
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
}

// ─── Screen ────────────────────────────────────────────────────────────────────

function ExchangeRatesScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { showToast } = useToast();

  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState<ExchangeRateRecord | null>(null);
  const [search, setSearch] = useState("");
  const [currencyFilter, setCurrencyFilter] = useState("all");

  const { data: rates = [], isLoading, refetch } = useExchangeRatesQuery();
  const createRate = useCreateExchangeRateMutation();
  const updateRate = useUpdateExchangeRateMutation();
  const deleteRate = useDeleteExchangeRateMutation();

  const [pendingDeleteIds, setPendingDeleteIds] = useState<Set<number>>(new Set());
  const [pendingDeleteLabels, setPendingDeleteLabels] = useState<Record<number, string>>({});
  const deleteTimers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  function startUndoDelete(item: ExchangeRateRecord) {
    const label = `${item.fromCurrencyCode} → ${item.toCurrencyCode}`;
    setPendingDeleteIds((prev) => new Set(prev).add(item.id));
    setPendingDeleteLabels((prev) => ({ ...prev, [item.id]: label }));
    const timer = setTimeout(() => {
      deleteRate.mutate(item.id, {
        onError: (err: any) => showToast(err?.message ?? "No se pudo eliminar", "error"),
      });
      setPendingDeleteIds((prev) => { const n = new Set(prev); n.delete(item.id); return n; });
      deleteTimers.current.delete(item.id);
    }, 5000);
    deleteTimers.current.set(item.id, timer);
  }

  function undoDelete(id: number) {
    const timer = deleteTimers.current.get(id);
    if (timer) clearTimeout(timer);
    deleteTimers.current.delete(id);
    setPendingDeleteIds((prev) => { const n = new Set(prev); n.delete(id); return n; });
  }

  useEffect(() => () => { deleteTimers.current.forEach(clearTimeout); }, []);

  // Derive known currencies from existing rates
  const currencyOptions = useMemo(() => {
    const set = new Set<string>();
    for (const r of rates) {
      set.add(r.fromCurrencyCode.toUpperCase());
      set.add(r.toCurrencyCode.toUpperCase());
    }
    return Array.from(set).sort();
  }, [rates]);

  function openNew() { setEditItem(null); setShowForm(true); }
  function openEdit(item: ExchangeRateRecord) { setEditItem(item); setShowForm(true); }
  function closeForm() { setShowForm(false); setEditItem(null); }

  async function handleSave(from: string, to: string, rate: number, notes: string) {
    try {
      if (editItem) {
        await updateRate.mutateAsync({ id: editItem.id, fromCurrencyCode: from, toCurrencyCode: to, rate, notes });
        showToast("Tipo de cambio actualizado", "success");
      } else {
        await createRate.mutateAsync({ fromCurrencyCode: from, toCurrencyCode: to, rate, notes });
        showToast("Tipo de cambio creado", "success");
      }
      closeForm();
    } catch (err: any) {
      showToast(err?.message ?? "No se pudo guardar el tipo de cambio", "error");
    }
  }

  const activeRates = useMemo(
    () => rates.filter((r) => !pendingDeleteIds.has(r.id)),
    [pendingDeleteIds, rates],
  );

  const filteredRates = useMemo(() => {
    const q = search.trim().toLowerCase();
    return activeRates.filter((r) => {
      const from = r.fromCurrencyCode.toUpperCase();
      const to = r.toCurrencyCode.toUpperCase();
      if (currencyFilter !== "all" && from !== currencyFilter && to !== currencyFilter) return false;
      if (!q) return true;
      return (
        from.toLowerCase().includes(q) ||
        to.toLowerCase().includes(q) ||
        `${from} ${to}`.toLowerCase().includes(q) ||
        `${from}:${to}`.toLowerCase().includes(q) ||
        String(r.rate).includes(q) ||
        (r.notes ?? "").toLowerCase().includes(q)
      );
    });
  }, [activeRates, currencyFilter, search]);

  const pairMap = new Map<string, ExchangeRateRecord[]>();
  for (const r of filteredRates) {
    if (pendingDeleteIds.has(r.id)) continue;
    const key = `${r.fromCurrencyCode}:${r.toCurrencyCode}`;
    if (!pairMap.has(key)) pairMap.set(key, []);
    pairMap.get(key)!.push(r);
  }

  const pairCount = new Set(activeRates.map((r) => `${r.fromCurrencyCode}:${r.toCurrencyCode}`)).size;

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <ScreenHeader
        title="Tipos de cambio"
        onBack={() => router.back()}
        rightAction={
          <TouchableOpacity
            style={styles.filterBtn}
            onPress={() => void refetch()}
            accessibilityLabel="Actualizar tipos de cambio"
            activeOpacity={0.75}
          >
            <RefreshCw size={14} color={COLORS.storm} />
          </TouchableOpacity>
        }
      />

      <View style={styles.searchWrap}>
        <Search size={15} color={COLORS.storm} />
        <TextInput
          style={styles.searchInput}
          value={search}
          onChangeText={setSearch}
          placeholder="Buscar moneda, tasa o nota..."
          placeholderTextColor={COLORS.storm}
          returnKeyType="search"
          autoCapitalize="characters"
        />
        {search.length > 0 ? (
          <TouchableOpacity onPress={() => setSearch("")} hitSlop={8}>
            <X size={15} color={COLORS.storm} />
          </TouchableOpacity>
        ) : null}
      </View>

      <View style={styles.segmentedWrap}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.segmentedRow}>
          <TouchableOpacity
            style={[styles.pill, currencyFilter === "all" && styles.pillActive]}
            onPress={() => setCurrencyFilter("all")}
          >
            <Text style={[styles.pillText, currencyFilter === "all" && styles.pillTextActive]}>Todas</Text>
          </TouchableOpacity>
          {currencyOptions.map((currency) => (
            <TouchableOpacity
              key={currency}
              style={[styles.pill, currencyFilter === currency && styles.pillActive]}
              onPress={() => setCurrencyFilter(currency)}
            >
              <Text style={[styles.pillText, currencyFilter === currency && styles.pillTextActive]}>
                {currency}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={isLoading} onRefresh={() => void refetch()} tintColor={COLORS.primary} />
        }
      >
        <View style={styles.summaryCard}>
          <View style={styles.summaryTopRow}>
            <View style={styles.summaryMetric}>
              <Text style={styles.summaryLabel}>Pares</Text>
              <Text style={styles.summaryValue}>{pairCount}</Text>
            </View>
            <View style={styles.summaryDivider} />
            <View style={styles.summaryMetric}>
              <Text style={styles.summaryLabel}>Monedas</Text>
              <Text style={styles.summaryValue}>{currencyOptions.length}</Text>
            </View>
          </View>
          <Text style={styles.summaryHint}>
            Define cuántas unidades de la moneda destino equivalen a 1 unidad de la moneda origen.
            Ej: 1 USD = 3.72 PEN.
          </Text>
        </View>

        {isLoading ? (
          <Text style={styles.empty}>Cargando...</Text>
        ) : activeRates.length === 0 ? (
          <EmptyState
            title="Sin tipos de cambio"
            description="Agrega el primer par para convertir saldos entre monedas."
            action={{ label: "Nuevo tipo de cambio", onPress: openNew }}
          />
        ) : filteredRates.length === 0 ? (
          <EmptyState
            variant="no-results"
            title="Sin resultados"
            description="Prueba otra moneda o limpia la búsqueda."
          />
        ) : (
          Array.from(pairMap.entries()).map(([pair, items]) => (
            <View key={pair} style={styles.group}>
              <Text style={styles.groupLabel}>{pair.replace(":", " → ")}</Text>
              {items.map((item) => (
                <SwipeableRateRow
                  key={item.id}
                  item={item}
                  onEdit={() => openEdit(item)}
                  onDelete={() => startUndoDelete(item)}
                />
              ))}
            </View>
          ))
        )}
      </ScrollView>

      <FAB onPress={openNew} bottom={insets.bottom + 16} />

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
    </View>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────────

const pickerStyles = StyleSheet.create({
  wrap: { gap: 6 },
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
  pillOtro: {
    borderStyle: "dashed",
  },
  pillOtroActive: {
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
});

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.bg },
  content: { padding: SPACING.lg, gap: SPACING.lg, paddingBottom: 100 },

  filterBtn: {
    height: 34,
    paddingHorizontal: SPACING.md,
    borderRadius: RADIUS.full,
    backgroundColor: GLASS.card,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 5,
  },
  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: SPACING.lg,
    marginTop: SPACING.xs,
    marginBottom: SPACING.sm,
    backgroundColor: GLASS.card,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
    gap: SPACING.sm,
  },
  searchInput: {
    flex: 1,
    fontSize: FONT_SIZE.sm,
    color: COLORS.ink,
    fontFamily: FONT_FAMILY.body,
    paddingVertical: SPACING.md,
  },
  segmentedWrap: { height: 44, justifyContent: "center" },
  segmentedRow: { paddingHorizontal: SPACING.lg, gap: SPACING.xs, alignItems: "center" },
  pill: {
    height: 32,
    paddingHorizontal: SPACING.md,
    borderRadius: RADIUS.full,
    backgroundColor: GLASS.card,
    alignItems: "center",
    justifyContent: "center",
  },
  pillActive: { backgroundColor: COLORS.primary },
  pillText: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.storm,
    fontFamily: FONT_FAMILY.bodyMedium,
    includeFontPadding: false,
  },
  pillTextActive: { color: "#FFFFFF", fontFamily: FONT_FAMILY.bodySemibold },

  summaryCard: {
    backgroundColor: GLASS.card,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: GLASS.cardBorder,
    padding: SPACING.md,
    gap: SPACING.md,
  },
  summaryTopRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  summaryMetric: { flex: 1, gap: 2 },
  summaryLabel: {
    fontFamily: FONT_FAMILY.bodyMedium,
    fontSize: FONT_SIZE.xs,
    color: COLORS.storm,
    textTransform: "uppercase",
  },
  summaryValue: {
    fontFamily: FONT_FAMILY.heading,
    fontSize: FONT_SIZE.xl,
    color: COLORS.ink,
  },
  summaryDivider: {
    width: 1,
    height: 38,
    backgroundColor: GLASS.separator,
    marginHorizontal: SPACING.md,
  },
  summaryHint: {
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.sm,
    color: COLORS.storm,
    lineHeight: 20,
  },

  empty: { fontFamily: FONT_FAMILY.bodyMedium, fontSize: FONT_SIZE.sm, color: COLORS.storm, textAlign: "center" },

  group: { gap: SPACING.xs },
  groupLabel: {
    fontFamily: FONT_FAMILY.bodySemibold,
    fontSize: FONT_SIZE.xs,
    color: COLORS.storm,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 2,
  },

  // Swipeable
  swipeContainer: { position: "relative", overflow: "hidden", borderRadius: RADIUS.lg },
  deleteBg: {
    position: "absolute",
    right: 0, top: 0, bottom: 0,
    width: REVEAL_W,
    backgroundColor: COLORS.danger + "28",
    alignItems: "center",
    justifyContent: "center",
    borderTopLeftRadius: RADIUS.lg,
    borderBottomLeftRadius: RADIUS.lg,
  },
  deleteAction: {
    width: REVEAL_W,
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  deleteActionLabel: {
    fontFamily: FONT_FAMILY.bodyMedium,
    fontSize: FONT_SIZE.xs,
    color: COLORS.danger,
  },

  rateRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: GLASS.card,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: GLASS.cardBorder,
    padding: SPACING.md,
    gap: SPACING.sm,
  },
  rateLeft: { flex: 1, gap: 4 },
  pairBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    alignSelf: "flex-start",
    backgroundColor: GLASS.cardActive,
    borderRadius: RADIUS.full,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: GLASS.cardActiveBorder,
  },
  pairFrom: { fontFamily: FONT_FAMILY.bodySemibold, fontSize: FONT_SIZE.xs, color: COLORS.pine },
  pairTo: { fontFamily: FONT_FAMILY.bodySemibold, fontSize: FONT_SIZE.xs, color: COLORS.pine },
  rateValue: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.sm, color: COLORS.storm },
  rateNum: { fontFamily: FONT_FAMILY.heading, fontSize: FONT_SIZE.sm, color: COLORS.ink },
  rateDate: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.xs, color: COLORS.storm, opacity: 0.6 },
  rateNotes: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.xs, color: COLORS.storm, fontStyle: "italic" },

  // Form
  formBody: { gap: SPACING.md, paddingBottom: SPACING.lg },
  formHint: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.sm, color: COLORS.storm },
  formHintExample: { color: COLORS.pine, fontFamily: FONT_FAMILY.bodySemibold },
  pairRow: { flexDirection: "row", alignItems: "flex-start", gap: SPACING.sm },
  pairInputWrap: { flex: 1 },
  arrowWrap: { paddingTop: 26 },
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
  errorBanner: {
    backgroundColor: GLASS.dangerBg,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderColor: GLASS.dangerBorder,
    padding: SPACING.sm,
  },
  errorText: { fontFamily: FONT_FAMILY.bodyMedium, fontSize: FONT_SIZE.xs, color: COLORS.rosewood },
  formActions: { flexDirection: "row", gap: SPACING.sm, marginTop: SPACING.xs },
  cancelBtn: {
    flex: 1,
    paddingVertical: SPACING.sm + 2,
    borderRadius: RADIUS.md,
    backgroundColor: GLASS.card,
    borderWidth: 1,
    borderColor: GLASS.cardBorder,
    alignItems: "center",
  },
  cancelText: { fontFamily: FONT_FAMILY.bodySemibold, fontSize: FONT_SIZE.sm, color: COLORS.storm },
  saveBtn: {
    flex: 1,
    paddingVertical: SPACING.sm + 2,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.pine,
    alignItems: "center",
  },
  saveText: { fontFamily: FONT_FAMILY.bodySemibold, fontSize: FONT_SIZE.sm, color: "#05070B" },
});

export default function ExchangeRatesScreenRoot() {
  return (
    <ErrorBoundary>
      <ExchangeRatesScreen />
    </ErrorBoundary>
  );
}
