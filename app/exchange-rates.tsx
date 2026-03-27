import { useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ArrowRight, Plus, Trash2, RefreshCw } from "lucide-react-native";
import { format } from "date-fns";
import { es } from "date-fns/locale";

import {
  useExchangeRatesQuery,
  useCreateExchangeRateMutation,
  useDeleteExchangeRateMutation,
  type ExchangeRateRecord,
} from "../services/queries/workspace-data";
import { ScreenHeader } from "../components/layout/ScreenHeader";
import { COLORS, FONT_FAMILY, FONT_SIZE, GLASS, RADIUS, SPACING } from "../constants/theme";

// ─── Add/Edit modal ────────────────────────────────────────────────────────────

function RateFormModal({
  visible,
  onClose,
  onSave,
  loading,
}: {
  visible: boolean;
  onClose: () => void;
  onSave: (from: string, to: string, rate: number, notes: string) => void;
  loading: boolean;
}) {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [rate, setRate] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setFrom(""); setTo(""); setRate(""); setNotes(""); setError(null);
  }

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
    reset();
  }

  if (!visible) return null;

  return (
    <View style={styles.modalOverlay}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={styles.modalCard}>
          <Text style={styles.modalTitle}>Nuevo tipo de cambio</Text>
          <Text style={styles.modalHint}>1 [moneda origen] = tasa [moneda destino]</Text>

          <View style={styles.pairRow}>
            <View style={styles.pairInputWrap}>
              <Text style={styles.inputLabel}>Moneda origen</Text>
              <TextInput
                style={styles.input}
                placeholder="USD"
                placeholderTextColor={COLORS.storm}
                value={from}
                onChangeText={(v) => setFrom(v.toUpperCase())}
                autoCapitalize="characters"
                maxLength={3}
              />
            </View>
            <ArrowRight size={18} color={COLORS.storm} style={{ marginTop: 24 }} />
            <View style={styles.pairInputWrap}>
              <Text style={styles.inputLabel}>Moneda destino</Text>
              <TextInput
                style={styles.input}
                placeholder="PEN"
                placeholderTextColor={COLORS.storm}
                value={to}
                onChangeText={(v) => setTo(v.toUpperCase())}
                autoCapitalize="characters"
                maxLength={3}
              />
            </View>
          </View>

          <Text style={styles.inputLabel}>Tasa</Text>
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

          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          <View style={styles.modalActions}>
            <TouchableOpacity style={styles.cancelBtn} onPress={() => { reset(); onClose(); }}>
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
      </KeyboardAvoidingView>
    </View>
  );
}

// ─── Rate row ──────────────────────────────────────────────────────────────────

function RateRow({ item, onDelete }: { item: ExchangeRateRecord; onDelete: () => void }) {
  function confirmDelete() {
    Alert.alert(
      "Eliminar tipo de cambio",
      `¿Eliminar ${item.fromCurrencyCode} → ${item.toCurrencyCode}?`,
      [
        { text: "Cancelar", style: "cancel" },
        { text: "Eliminar", style: "destructive", onPress: onDelete },
      ],
    );
  }

  return (
    <View style={styles.rateRow}>
      <View style={styles.rateLeft}>
        <View style={styles.pairBadge}>
          <Text style={styles.pairFrom}>{item.fromCurrencyCode}</Text>
          <ArrowRight size={12} color={COLORS.storm} />
          <Text style={styles.pairTo}>{item.toCurrencyCode}</Text>
        </View>
        <Text style={styles.rateValue}>
          1 {item.fromCurrencyCode} = <Text style={styles.rateNum}>{item.rate.toFixed(4)}</Text> {item.toCurrencyCode}
        </Text>
        <Text style={styles.rateDate}>
          {format(new Date(item.effectiveAt), "d MMM yyyy, HH:mm", { locale: es })}
          {item.source === "manual" ? "  •  manual" : ""}
        </Text>
        {item.notes ? <Text style={styles.rateNotes}>{item.notes}</Text> : null}
      </View>
      <TouchableOpacity style={styles.deleteBtn} onPress={confirmDelete} hitSlop={8}>
        <Trash2 size={16} color={COLORS.rosewood} />
      </TouchableOpacity>
    </View>
  );
}

// ─── Screen ────────────────────────────────────────────────────────────────────

export default function ExchangeRatesScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [showForm, setShowForm] = useState(false);

  const { data: rates = [], isLoading, refetch } = useExchangeRatesQuery();
  const createRate = useCreateExchangeRateMutation();
  const deleteRate = useDeleteExchangeRateMutation();

  async function handleSave(from: string, to: string, rate: number, notes: string) {
    try {
      await createRate.mutateAsync({ fromCurrencyCode: from, toCurrencyCode: to, rate, notes });
      setShowForm(false);
    } catch (err: any) {
      Alert.alert("Error", err?.message ?? "No se pudo guardar el tipo de cambio");
    }
  }

  async function handleDelete(id: number) {
    try {
      await deleteRate.mutateAsync(id);
    } catch (err: any) {
      Alert.alert("Error", err?.message ?? "No se pudo eliminar");
    }
  }

  // Group by pair to show latest prominently
  const pairMap = new Map<string, ExchangeRateRecord[]>();
  for (const r of rates) {
    const key = `${r.fromCurrencyCode}:${r.toCurrencyCode}`;
    if (!pairMap.has(key)) pairMap.set(key, []);
    pairMap.get(key)!.push(r);
  }

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <ScreenHeader
        title="Tipos de cambio"
        onBack={() => router.back()}
        rightAction={
          <TouchableOpacity onPress={() => void refetch()} hitSlop={8}>
            <RefreshCw size={18} color={COLORS.storm} />
          </TouchableOpacity>
        }
      />

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.hint}>
          Define cuántas unidades de la moneda destino equivalen a 1 unidad de la moneda origen.
          Por ejemplo: 1 USD = 3.72 PEN.
        </Text>

        {isLoading ? (
          <Text style={styles.empty}>Cargando...</Text>
        ) : rates.length === 0 ? (
          <View style={styles.emptyWrap}>
            <Text style={styles.empty}>No hay tipos de cambio registrados.</Text>
            <Text style={styles.emptySub}>Agrega uno con el botón +.</Text>
          </View>
        ) : (
          Array.from(pairMap.entries()).map(([pair, items]) => (
            <View key={pair} style={styles.group}>
              <Text style={styles.groupLabel}>{pair.replace(":", " → ")}</Text>
              {items.map((item) => (
                <RateRow key={item.id} item={item} onDelete={() => void handleDelete(item.id)} />
              ))}
            </View>
          ))
        )}
      </ScrollView>

      {/* FAB */}
      <TouchableOpacity
        style={[styles.fab, { bottom: insets.bottom + 16 }]}
        onPress={() => setShowForm(true)}
        activeOpacity={0.85}
      >
        <Plus size={24} color={COLORS.canvas} />
      </TouchableOpacity>

      <RateFormModal
        visible={showForm}
        onClose={() => setShowForm(false)}
        onSave={(from, to, rate, notes) => void handleSave(from, to, rate, notes)}
        loading={createRate.isPending}
      />
    </View>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#05070B" },
  content: { padding: SPACING.lg, gap: SPACING.lg, paddingBottom: 100 },

  hint: {
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.sm,
    color: COLORS.storm,
    lineHeight: 20,
    backgroundColor: GLASS.card,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: GLASS.cardBorder,
    padding: SPACING.md,
  },

  emptyWrap: { alignItems: "center", paddingVertical: SPACING.xxxl, gap: SPACING.sm },
  empty: { fontFamily: FONT_FAMILY.bodyMedium, fontSize: FONT_SIZE.sm, color: COLORS.storm, textAlign: "center" },
  emptySub: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.xs, color: COLORS.storm, opacity: 0.6, textAlign: "center" },

  group: { gap: SPACING.xs },
  groupLabel: {
    fontFamily: FONT_FAMILY.bodySemibold,
    fontSize: FONT_SIZE.xs,
    color: COLORS.storm,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 2,
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
  deleteBtn: {
    width: 36,
    height: 36,
    borderRadius: RADIUS.md,
    backgroundColor: GLASS.dangerBg,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: GLASS.dangerBorder,
  },

  fab: {
    position: "absolute",
    right: SPACING.lg,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: COLORS.pine,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: COLORS.pine,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 8,
  },

  // Modal
  modalOverlay: {
    position: "absolute",
    inset: 0,
    backgroundColor: "rgba(0,0,0,0.7)",
    justifyContent: "center",
    padding: SPACING.xl,
    zIndex: 100,
  },
  modalCard: {
    backgroundColor: "#0F141B",
    borderRadius: RADIUS.xl,
    borderWidth: 1,
    borderColor: GLASS.sheetBorder,
    padding: SPACING.xl,
    gap: SPACING.sm,
  },
  modalTitle: { fontFamily: FONT_FAMILY.heading, fontSize: FONT_SIZE.lg, color: COLORS.ink, marginBottom: 2 },
  modalHint: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.xs, color: COLORS.storm, marginBottom: SPACING.sm },
  pairRow: { flexDirection: "row", alignItems: "flex-end", gap: SPACING.sm },
  pairInputWrap: { flex: 1, gap: 4 },
  inputLabel: { fontFamily: FONT_FAMILY.bodySemibold, fontSize: FONT_SIZE.xs, color: COLORS.storm },
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
  errorText: { fontFamily: FONT_FAMILY.bodyMedium, fontSize: FONT_SIZE.xs, color: COLORS.rosewood },
  modalActions: { flexDirection: "row", gap: SPACING.sm, marginTop: SPACING.sm },
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
