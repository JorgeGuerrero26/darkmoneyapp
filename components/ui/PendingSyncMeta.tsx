import { format } from "date-fns";
import { Clock } from "lucide-react-native";
import { StyleSheet, Text, View } from "react-native";

import { COLORS, FONT_FAMILY } from "../../constants/theme";

/** Indica que una fila sigue guardada en el dispositivo y espera envío. */
export function PendingSyncMeta({ at }: { at?: string | null }) {
  if (!at) return null;
  const date = new Date(at);
  const time = Number.isNaN(date.getTime()) ? "" : format(date, "H:mm");
  return (
    <View style={styles.row}>
      <Clock size={10} color={COLORS.gold} />
      <Text style={styles.text} maxFontSizeMultiplier={1.3}>{time ? `Por enviar · ${time}` : "Por enviar"}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 3 },
  text: { fontFamily: FONT_FAMILY.bodyMedium, fontSize: 10, color: COLORS.gold },
});
