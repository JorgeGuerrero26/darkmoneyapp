import { useEffect, useMemo, useState } from "react";
import { Dimensions, FlatList, Keyboard, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Check, Search, X } from "lucide-react-native";

import { BottomSheet } from "./BottomSheet";
import { SafeBlurView } from "./SafeBlurView";
import { TextField } from "./TextField";
import { COLORS, FONT_FAMILY, FONT_SIZE, RADIUS, SPACING, SURFACE } from "../../constants/theme";
import { useKeyboardHeight } from "../../hooks/useKeyboardHeight";

const SCREEN_HEIGHT = Dimensions.get("window").height;

export type SelectOption<T = number | null> = {
  value: T;
  label: string;
  meta?: string;
};

type Props<T = number | null> = {
  visible: boolean;
  title: string;
  options: SelectOption<T>[];
  value: T;
  onChange: (value: T) => void;
  onClose: () => void;
  /**
   * Se pinta **dentro** del sheet que lo abrió, no como Modal hermano.
   *
   * iOS presenta un Modal a la vez: un selector hermano del formulario no llega a aparecer y el
   * usuario se queda mirando el formulario sin poder elegir (mismo fallo del 2026-08-13 con los
   * diálogos). Los siete formularios son sheets, así que sus selectores van en `inline` y se
   * pasan por la prop `overlay` de `BottomSheet`.
   */
  inline?: boolean;
};

export function SearchableSelectSheet<T = number | null>({
  visible,
  title,
  options,
  value,
  onChange,
  onClose,
  inline = false,
}: Props<T>) {
  const insets = useSafeAreaInsets();
  const keyboardHeight = useKeyboardHeight();
  const [query, setQuery] = useState("");

  /**
   * Al abrirse, se cierra el teclado que dejó abierto el campo anterior.
   *
   * Se reportaba en Movimientos: escribes el monto y tocas "seleccionar cuenta" sin cerrar el
   * teclado antes; el selector se abre DEBAJO del teclado y las cuentas no se ven. Tocar el
   * campo de búsqueda de aquí lo vuelve a abrir, que es cuando de verdad hace falta.
   */
  useEffect(() => {
    if (visible) Keyboard.dismiss();
  }, [visible]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((opt) => opt.label.toLowerCase().includes(q) || opt.meta?.toLowerCase().includes(q));
  }, [options, query]);

  function handleSelect(opt: SelectOption<T>) {
    onChange(opt.value);
    setQuery("");
    onClose();
  }

  function handleClose() {
    setQuery("");
    onClose();
  }

  // La búsqueda solo aparece cuando hay bastantes opciones: con ocho estorba más de lo que ayuda.
  const showSearch = options.length > 10;

  const body = (
    <>
      {showSearch ? (
        <View style={styles.searchRow}>
          <Search size={16} color={COLORS.storm} style={styles.searchIcon} />
          <TextField
            value={query}
            onChangeText={setQuery}
            placeholder="Buscar..."
            placeholderTextColor={COLORS.storm}
            style={styles.searchInput}
            containerStyle={styles.searchFieldWrap}
            autoCorrect={false}
            autoCapitalize="none"
          />
        </View>
      ) : null}
      <FlatList
        data={filtered}
        keyExtractor={(_, i) => String(i)}
        style={styles.list}
        keyboardShouldPersistTaps="handled"
        renderItem={({ item }) => {
          const active = item.value === value;
          return (
            <TouchableOpacity
              style={styles.option}
              onPress={() => handleSelect(item)}
              activeOpacity={0.78}
            >
              <View style={styles.optionCopy}>
                <Text style={[styles.optionLabel, active && styles.optionLabelActive]} numberOfLines={1}>
                  {item.label}
                </Text>
                {item.meta ? (
                  <Text style={styles.optionMeta} numberOfLines={1}>{item.meta}</Text>
                ) : null}
              </View>
              {active ? <Check size={16} color={COLORS.ink} /> : null}
            </TouchableOpacity>
          );
        }}
        ListEmptyComponent={<Text style={styles.empty}>Sin resultados para &quot;{query}&quot;</Text>}
      />
    </>
  );

  if (inline) {
    if (!visible) return null;
    return (
      <View style={styles.inlineRoot}>
        <SafeBlurView intensity={45} tint="dark" style={StyleSheet.absoluteFillObject} />
        <TouchableOpacity style={styles.inlineBackdrop} onPress={handleClose} activeOpacity={1} />
        {/* La capa sube con el teclado. Sin esto, al escribir para buscar una categoría el
            teclado tapaba el propio buscador y no se veía lo que se estaba escribiendo. */}
        <View
          style={[
            styles.inlineCard,
            {
              bottom: keyboardHeight,
              maxHeight: SCREEN_HEIGHT - keyboardHeight - insets.top - SPACING.xl,
              paddingBottom: keyboardHeight > 0 ? SPACING.lg : SPACING.xxxl,
            },
          ]}
        >
          <View style={styles.inlineHeader}>
            <Text style={styles.inlineTitle}>{title}</Text>
            <TouchableOpacity onPress={handleClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <X size={18} color={COLORS.storm} />
            </TouchableOpacity>
          </View>
          {body}
        </View>
      </View>
    );
  }

  return (
    <BottomSheet visible={visible} onClose={handleClose} title={title} snapHeight={0.6}>
      {body}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  inlineRoot: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 20,
    elevation: 20,
    justifyContent: "flex-end",
  },
  inlineBackdrop: { ...StyleSheet.absoluteFillObject },
  inlineCard: {
    // `bottom` se controla desde el render para subir la hoja con el teclado.
    position: "absolute",
    left: 0,
    right: 0,
    backgroundColor: SURFACE.sheet,
    borderTopLeftRadius: RADIUS.sheet,
    borderTopRightRadius: RADIUS.sheet,
    padding: SPACING.xl,
    paddingBottom: SPACING.xxxl,
    gap: SPACING.sm,
  },
  inlineHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: SPACING.xs,
  },
  inlineTitle: {
    fontFamily: FONT_FAMILY.heading,
    fontSize: FONT_SIZE.lg,
    color: COLORS.ink,
  },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: SURFACE.input,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: SPACING.md,
    marginBottom: SPACING.sm,
    height: 44,
    gap: SPACING.sm,
  },
  searchIcon: { flexShrink: 0 },
  searchFieldWrap: { alignSelf: "stretch" },
  searchInput: {
    flex: 1,
    color: COLORS.ink,
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.sm,
    height: "100%",
  },
  list: { maxHeight: 380 },
  option: {
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.md,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  optionCopy: { flex: 1, gap: 2 },
  optionLabel: {
    color: COLORS.fog,
    fontFamily: FONT_FAMILY.bodyMedium,
    fontSize: FONT_SIZE.md,
  },
  optionLabelActive: { color: COLORS.ink, fontFamily: FONT_FAMILY.bodySemibold },
  optionMeta: { color: COLORS.storm, fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.xs },
  empty: {
    color: COLORS.storm,
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.sm,
    textAlign: "center",
    paddingVertical: SPACING.xl,
  },
});
