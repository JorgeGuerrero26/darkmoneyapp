import { Text, View } from "react-native";
import {
  getLucideIconForCategory,
  looksLikeLucideIconKey,
} from "../../lib/category-icons";

type Props = {
  icon: string | null | undefined;
  color: string;
  size?: number;
};

/**
 * Icono de categoría en listas: Lucide si la clave es conocida; si no, emoji/texto tal cual (datos antiguos).
 */
export function CategoryGlyph({ icon, color, size = 18 }: Props) {
  if (!icon?.trim()) return null;
  const raw = icon.trim();
  if (!looksLikeLucideIconKey(raw)) {
    return (
      <Text style={{ fontSize: size }} allowFontScaling>
        {raw}
      </Text>
    );
  }
  const Lucide = getLucideIconForCategory(raw);
  return (
    <View style={{ width: size + 4, height: size + 4, alignItems: "center", justifyContent: "center" }}>
      <Lucide size={size} color={color} strokeWidth={2} />
    </View>
  );
}
