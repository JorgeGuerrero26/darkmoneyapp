import { useState } from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { ArrowRight, ChevronDown } from "lucide-react-native";

import { COLORS, FONT_FAMILY, FONT_SIZE, RADIUS, SPACING, SURFACE } from "../../constants/theme";
import { TextField } from "../ui/TextField";

type CurrencyPickerProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: string[];
  exclude?: string;
};

/**
 * La moneda, en una fila que abre la lista.
 *
 * Eran veinte cápsulas en una fila horizontal —con la séptima cortada por el borde— más un
 * botón "Otro" que descubría un campo de texto. Pasadas seis opciones el control correcto es
 * un selector.
 *
 * La lista se despliega **en su sitio**, no como capa flotante: este formulario se pasa como
 * `children` del sheet, no por su ranura `overlay`, así que una capa absoluta la recortaría el
 * ScrollView.
 */
function CurrencyPicker({ label, value, onChange, options, exclude }: CurrencyPickerProps) {
  const visible = options.filter((option) => option !== exclude);
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState(() => (visible.includes(value) ? "" : value));

  return (
    <View style={styles.pickerWrap}>
      <Text style={styles.inputLabel}>{label}</Text>
      <TouchableOpacity
        style={styles.selectTrigger}
        onPress={() => setOpen((prev) => !prev)}
        activeOpacity={0.78}
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${value || "elegir"}`}
      >
        <Text style={[styles.selectValue, !value && styles.selectPlaceholder]}>{value || "Elegir"}</Text>
        <ChevronDown size={16} color={COLORS.storm} />
      </TouchableOpacity>

      {open ? (
        <View style={styles.selectList}>
          <ScrollView style={styles.selectScroll} nestedScrollEnabled keyboardShouldPersistTaps="handled">
            {visible.map((option) => (
              <TouchableOpacity
                key={option}
                style={styles.selectOption}
                onPress={() => {
                  onChange(option);
                  setCustom("");
                  setOpen(false);
                }}
                activeOpacity={0.78}
              >
                <Text style={[styles.selectOptionText, option === value && styles.selectOptionActive]}>
                  {option}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
          <TextField
            style={styles.input}
            placeholder="Otra (ej. JPY)"
            placeholderTextColor={COLORS.storm}
            value={custom}
            onChangeText={(next) => {
              const upper = next.toUpperCase();
              setCustom(upper);
              onChange(upper);
            }}
            autoCapitalize="characters"
            maxLength={3}
          />
        </View>
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
      {/* Antes decía literalmente «1 [origen] = tasa [destino]»: una plantilla que nadie
          rellenó. Ahora se lee con las monedas elegidas, y mientras falten lo explica. */}
      <Text style={styles.hint}>
        {from && to
          ? `La tasa dice cuántos ${to} equivale 1 ${from}.`
          : "La tasa dice cuántas unidades de la moneda destino equivalen a 1 de la de origen."}
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
      <TextField
        style={styles.input}
        placeholder="3.72"
        placeholderTextColor={COLORS.storm}
        value={rate}
        onChangeText={setRate}
        keyboardType="decimal-pad"
      />

      <Text style={styles.inputLabel}>Notas (opcional)</Text>
      <TextField
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
  pairRow: { flexDirection: "row", alignItems: "flex-start", gap: SPACING.sm },
  pairInputWrap: { flex: 1 },
  arrowWrap: { paddingTop: SPACING.xxl + SPACING.xs / 2 },
  selectTrigger: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: SPACING.md,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: SURFACE.cardBorder,
    backgroundColor: SURFACE.card,
  },
  selectValue: { fontFamily: FONT_FAMILY.bodySemibold, fontSize: FONT_SIZE.md, color: COLORS.ink },
  selectPlaceholder: { color: COLORS.storm, fontFamily: FONT_FAMILY.body },
  selectList: { marginTop: SPACING.xs, gap: SPACING.xs },
  selectScroll: { maxHeight: 180 },
  selectOption: { minHeight: 40, justifyContent: "center", paddingHorizontal: SPACING.md },
  selectOptionText: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.sm, color: COLORS.fog },
  selectOptionActive: { color: COLORS.ink, fontFamily: FONT_FAMILY.bodySemibold },
  pickerWrap: { gap: SPACING.xs + 2 },
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
