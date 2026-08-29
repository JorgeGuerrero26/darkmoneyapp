import { useCallback, useEffect, useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { HelpCircle, X } from "lucide-react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { COLORS, FONT_FAMILY, FONT_SIZE, RADIUS, SPACING, SURFACE } from "../../constants/theme";

/**
 * La explicación aparece **una vez** y después vive detrás del "?".
 *
 * Nueva suscripción traía ~900 px de prosa: un párrafo de intro a las fechas, otro dentro de
 * cada una de las tres tarjetas de fecha, y una tarjeta "Así lo hará el sistema" que redactaba
 * en cuatro frases lo que ya habías elegido arriba.
 *
 * Alguien los escribió porque el modelo de fechas confunde de verdad, así que borrarlos deja al
 * usuario adivinando; dejarlos fijos hace el formulario impasable. La primera vez que abres el
 * formulario se muestran; a partir de ahí se buscan a propósito.
 *
 * La frase que desambigua el campo obligatorio NO va aquí: esa se queda fija bajo su campo.
 */
export function useFormFirstRunHelp(storageKey: string, visible: boolean) {
  const [open, setOpen] = useState(false);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (!visible || checked) return;
    let cancelled = false;
    (async () => {
      try {
        const seen = await AsyncStorage.getItem(storageKey);
        if (!cancelled && !seen) setOpen(true);
      } catch {
        // Si el almacenamiento falla no se abre: molestar en cada apertura es peor que no explicar.
      } finally {
        if (!cancelled) setChecked(true);
      }
    })();
    return () => { cancelled = true; };
  }, [visible, checked, storageKey]);

  // Al cerrarse el formulario se rearma la comprobación para la próxima sesión.
  useEffect(() => {
    if (!visible) setChecked(false);
  }, [visible]);

  const dismiss = useCallback(() => {
    setOpen(false);
    void AsyncStorage.setItem(storageKey, "1").catch(() => {});
  }, [storageKey]);

  return { open, dismiss, show: () => setOpen(true) };
}

type Props = {
  open: boolean;
  onDismiss: () => void;
  onShow: () => void;
  title: string;
  lines: string[];
};

export function FormFirstRunHelp({ open, onDismiss, onShow, title, lines }: Props) {
  if (!open) {
    return (
      <TouchableOpacity
        style={styles.trigger}
        onPress={onShow}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        accessibilityRole="button"
        accessibilityLabel="Cómo funciona este formulario"
      >
        <HelpCircle size={16} color={COLORS.storm} />
        <Text style={styles.triggerText}>Cómo funciona</Text>
      </TouchableOpacity>
    );
  }

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.title}>{title}</Text>
        <TouchableOpacity onPress={onDismiss} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <X size={16} color={COLORS.storm} />
        </TouchableOpacity>
      </View>
      {lines.map((line) => (
        <Text key={line} style={styles.line}>{line}</Text>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  trigger: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.xs,
    alignSelf: "flex-start",
  },
  triggerText: {
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.xs,
    color: COLORS.storm,
  },
  card: {
    padding: SPACING.md,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: SURFACE.cardBorder,
    backgroundColor: SURFACE.card,
    gap: SPACING.xs,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  title: {
    fontFamily: FONT_FAMILY.bodySemibold,
    fontSize: FONT_SIZE.sm,
    color: COLORS.ink,
  },
  line: {
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.xs,
    color: COLORS.fog,
    lineHeight: 18,
  },
});
