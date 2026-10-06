import { StyleSheet, Text, View } from "react-native";
import { BottomSheet } from "../../../components/ui/BottomSheet";
import { Button } from "../../../components/ui/Button";
import { PillSelector } from "../../../components/ui/PillSelector";
import { COLORS, FONT_FAMILY, FONT_SIZE, SPACING } from "../../../constants/theme";
import type { CategoryOriginFilter, CategoryStatusFilter } from "../lib/categoryFilters";

type Props = {
  visible: boolean; onClose: () => void; onClear: () => void;
  status: CategoryStatusFilter; onStatusChange: (value: CategoryStatusFilter) => void;
  origin: CategoryOriginFilter; onOriginChange: (value: CategoryOriginFilter) => void;
  pinnedOnly: boolean; onPinnedOnlyChange: (value: boolean) => void;
};
export function CategoryFilterSheet({ visible, onClose, onClear, status, onStatusChange, origin, onOriginChange, pinnedOnly, onPinnedOnlyChange }: Props) {
  return <BottomSheet visible={visible} onClose={onClose} title="Filtros" entranceAnimation="springFade" snapHeight={0.62}>
    <View style={styles.content}>
      <Text style={styles.label}>Estado</Text>
      <PillSelector<CategoryStatusFilter> options={[{ value: "active", label: "Activas" }, { value: "inactive", label: "Inactivas" }, { value: "all", label: "Todas" }]}
        value={status} onChange={onStatusChange} horizontal={false} wrap />
      <Text style={styles.label}>Origen</Text>
      <PillSelector<CategoryOriginFilter> options={[{ value: "all", label: "Todas" }, { value: "custom", label: "Personalizadas" }, { value: "system", label: "Del sistema" }]}
        value={origin} onChange={onOriginChange} horizontal={false} wrap />
      <Text style={styles.label}>Fijadas</Text>
      <PillSelector options={[{ value: "all", label: "Todas" }, { value: "pinned", label: "Solo fijadas" }]}
        value={pinnedOnly ? "pinned" : "all"} onChange={(value) => onPinnedOnlyChange(value === "pinned")} horizontal={false} wrap />
      <View style={styles.actions}>
        <Button label="Limpiar todos" variant="secondary" onPress={onClear} style={styles.button} />
        <Button label="Ver categorías" onPress={onClose} style={styles.button} />
      </View>
    </View>
  </BottomSheet>;
}
const styles = StyleSheet.create({
  content: { gap: SPACING.md, paddingBottom: SPACING.lg },
  label: { color: COLORS.storm, fontFamily: FONT_FAMILY.bodyMedium, fontSize: FONT_SIZE.sm },
  actions: { flexDirection: "row", gap: SPACING.sm, marginTop: SPACING.md },
  button: { flex: 1 },
});
