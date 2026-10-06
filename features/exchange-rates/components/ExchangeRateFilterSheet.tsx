import { StyleSheet, Text, View } from "react-native";
import { BottomSheet } from "../../../components/ui/BottomSheet";
import { Button } from "../../../components/ui/Button";
import { PillSelector } from "../../../components/ui/PillSelector";
import { COLORS, FONT_FAMILY, FONT_SIZE, SPACING } from "../../../constants/theme";
import type { ExchangeRateAdvancedFilter } from "../lib/exchangeRateFilters";

type Props = { visible: boolean; onClose: () => void; advancedFilter: ExchangeRateAdvancedFilter[]; onAdvancedFilterChange: (values: ExchangeRateAdvancedFilter[]) => void };
export function ExchangeRateFilterSheet({ visible, onClose, advancedFilter, onAdvancedFilterChange }: Props) {
  const choose = (keys: ExchangeRateAdvancedFilter[], value: ExchangeRateAdvancedFilter) => {
    onAdvancedFilterChange([...advancedFilter.filter((filter) => !keys.includes(filter)), ...(value === "all" ? [] : [value])]);
  };
  return <BottomSheet visible={visible} onClose={onClose} title="Filtros" snapHeight={0.6} entranceAnimation="springFade">
    <View style={styles.content}>
      <Text style={styles.label}>Fuente</Text>
      <PillSelector options={[{value: "all", label: "Todas"}, {value: "manual", label: "Manual"}, {value: "synced", label: "Sincronizada"}]}
        value={advancedFilter.find((filter) => filter === "manual" || filter === "synced") ?? "all"}
        onChange={(value) => choose(["manual", "synced"], value as ExchangeRateAdvancedFilter)} horizontal={false} wrap />
      <Text style={styles.label}>Actualización</Text>
      <PillSelector options={[{value: "all", label: "Todas"}, {value: "updated_today", label: "Hoy"}, {value: "stale", label: "Por actualizar"}]}
        value={advancedFilter.find((filter) => filter === "updated_today" || filter === "stale") ?? "all"}
        onChange={(value) => choose(["updated_today", "stale"], value as ExchangeRateAdvancedFilter)} horizontal={false} wrap />
      <Text style={styles.label}>Fijados</Text>
      <PillSelector options={[{value: "all", label: "Todos"}, {value: "pinned", label: "Solo fijados"}]}
        value={advancedFilter.includes("pinned") ? "pinned" : "all"}
        onChange={(value) => choose(["pinned"], value as ExchangeRateAdvancedFilter)} horizontal={false} wrap />
      <Button label="Ver tipos de cambio" onPress={onClose} />
    </View>
  </BottomSheet>;
}
const styles = StyleSheet.create({
  content: { gap: SPACING.md },
  label: { fontSize: FONT_SIZE.sm, fontFamily: FONT_FAMILY.bodyMedium, color: COLORS.storm },
});
