import { useState } from "react";
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { ArrowRight } from "lucide-react-native";

import { COLORS, FONT_FAMILY, FONT_SIZE, RADIUS, SPACING, SURFACE } from "../../constants/theme";

type CurrencyPickerProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: string[];
  exclude?: string;
};

function CurrencyPicker({ label, value, onChange, options, exclude }: CurrencyPickerProps) {
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

  function handleCustomChange(next: string) {
    const upper = next.toUpperCase();
    setCustom(upper);
    onChange(upper);
  }

  const showInput = mode === "other" || visible.length === 0;

  return (
    <View style={styles.pickerWrap}>
      <Text style={styles.inputLabel}>{label}</Text>
      {visible.length > 0 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pillRow}>
          {visible.map((option) => (
            <TouchableOpacity
              key={option}
              style={[styles.pill, mode === option && styles.pillActive]}
              onPress={() => pick(option)}
              activeOpacity={0.7}
            >
              <Text style={[styles.pillText, mode === option && styles.pillTextActive]}>{option}</Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity
            style={[styles.pill, styles.pillOther, mode === "other" && styles.pillOtherActive]}
            onPress={() => pick("other")}
            activeOpacity={0.7}
          >
            <Text style={[styles.pillText, mode === "other" && styles.pillTextActive]}>Otro</Text>
          </TouchableOpacity>
        </ScrollView>
      ) : null}
      {showInput ? (
        <TextInput
          style={[styles.input, visible.length > 0 && styles.inputStacked]}
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

type Props = {
  initialFrom?: string;
  initialTo?: string;
  initialRate?: string;
  initialNotes?: string;
  currencyOptions: string[];
  onSave: (from: string, to: string, rate: number, notes: string) => void;
  onCancel: () => void;
  loading: boolean;
};

export function ExchangeRateForm({
  initialFrom = "",
  initialTo = "",
  initialRate = "",
  initialNotes = "",
  currencyOptions,
  onSave,
  onCancel,
  loading,
}: Props) {
  const [from, setFrom] = useState(initialFrom);
  const [to, setTo] = useState(initialTo);
  const [rate, setRate] = useState(initialRate);
  const [notes, setNotes] = useState(initialNotes);
  const [error, setError] = useState<string | null>(null);

  function handleSave() {
    const fromTrim = from.trim().toUpperCase();
    const toTrim = to.trim().toUpperCase();
    const rateNum = parseFloat(rate.replace(",", "."));
    if (!fromTrim || fromTrim.length !== 3) {
      setError("Moneda origen inválida (ej. USD)");
      return;
    }
    if (!toTrim || toTrim.length !== 3) {
      setError("Moneda destino inválida (ej. PEN)");
      return;
    }
    if (Number.isNaN(rateNum) || rateNum <= 0) {
      setError("Tasa debe ser un número positivo");
      return;
    }
    if (fromTrim === toTrim) {
      setError("Las monedas no pueden ser iguales");
      return;
    }
    setError(null);
    onSave(fromTrim, toTrim, rateNum, notes.trim());
  }

  return (
    <View style={styles.body}>
      <Text style={styles.hint}>
        1 [origen] = tasa [destino]{"  "}
        <Text style={styles.hintExample}>ej. 1 USD = 3.72 PEN</Text>
      </Text>

      <View style={styles.pairRow}>
        <View style={styles.pairInputWrap}>
          <CurrencyPicker label="Moneda origen" value={from} onChange={setFrom} options={currencyOptions} exclude={to} />
        </View>
        <View style={styles.arrowWrap}>
          <ArrowRight size={18} color={COLORS.storm} />
        </View>
        <View style={styles.pairInputWrap}>
          <CurrencyPicker label="Moneda destino" value={to} onChange={setTo} options={currencyOptions} exclude={from} />
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

      <View style={styles.actions}>
        <TouchableOpacity style={styles.cancelBtn} onPress={onCancel}>
          <Text style={styles.cancelText}>Cancelar</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.saveBtn, loading && styles.disabled]}
          onPress={handleSave}
          disabled={loading}
        >
          <Text style={styles.saveText}>{loading ? "Guardando..." : "Guardar"}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  body: { gap: SPACING.md, paddingBottom: SPACING.lg },
  hint: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.sm, color: COLORS.storm },
  hintExample: { color: COLORS.pine, fontFamily: FONT_FAMILY.bodySemibold },
  pairRow: { flexDirection: "row", alignItems: "flex-start", gap: SPACING.sm },
  pairInputWrap: { flex: 1 },
  arrowWrap: { paddingTop: SPACING.xxl + SPACING.xs / 2 },
  pickerWrap: { gap: SPACING.xs + 2 },
  pillRow: { flexDirection: "row", gap: SPACING.xs, flexWrap: "nowrap" },
  pill: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs + 3,
    borderRadius: RADIUS.full,
    backgroundColor: SURFACE.card,
    borderWidth: 1,
    borderColor: SURFACE.cardBorder,
  },
  pillActive: { backgroundColor: COLORS.pine + "20", borderColor: COLORS.pine + "60" },
  pillOther: { borderStyle: "dashed" },
  pillOtherActive: {
    backgroundColor: COLORS.ember + "20",
    borderColor: COLORS.ember + "60",
    borderStyle: "solid",
  },
  pillText: { fontFamily: FONT_FAMILY.bodyMedium, fontSize: FONT_SIZE.xs, color: COLORS.storm },
  pillTextActive: { fontFamily: FONT_FAMILY.bodySemibold, color: COLORS.ink },
  inputLabel: {
    fontFamily: FONT_FAMILY.bodySemibold,
    fontSize: FONT_SIZE.xs,
    color: COLORS.storm,
    marginBottom: SPACING.xs,
  },
  input: {
    backgroundColor: SURFACE.input,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: SURFACE.inputBorder,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.md,
    color: COLORS.ink,
  },
  inputStacked: { marginTop: SPACING.xs },
  errorBanner: {
    backgroundColor: SURFACE.dangerBg,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderColor: SURFACE.dangerBorder,
    padding: SPACING.sm,
  },
  errorText: {
    fontFamily: FONT_FAMILY.bodyMedium,
    fontSize: FONT_SIZE.xs,
    color: COLORS.rosewood,
  },
  actions: { flexDirection: "row", gap: SPACING.sm, marginTop: SPACING.xs },
  cancelBtn: {
    flex: 1,
    paddingVertical: SPACING.sm + 2,
    borderRadius: RADIUS.md,
    backgroundColor: SURFACE.card,
    borderWidth: 1,
    borderColor: SURFACE.cardBorder,
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
    color: COLORS.textInverse,
  },
  disabled: { opacity: 0.6 },
});
