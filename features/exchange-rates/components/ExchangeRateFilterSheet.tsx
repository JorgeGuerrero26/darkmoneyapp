import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { BottomSheet } from "../../../components/ui/BottomSheet";
import { PillSelector } from "../../../components/ui/PillSelector";
import { COLORS, FONT_FAMILY, FONT_SIZE, RADIUS, SPACING } from "../../../constants/theme";
import {
  EXCHANGE_RATE_ADVANCED_FILTERS,
  type ExchangeRateAdvancedFilter,
} from "../lib/exchangeRateFilters";

type Props = {
  visible: boolean;
  onClose: () => void;
  advancedFilter: ExchangeRateAdvancedFilter;
  onAdvancedFilterChange: (value: ExchangeRateAdvancedFilter) => void;
};

export function ExchangeRateFilterSheet({
  visible,
  onClose,
  advancedFilter,
  onAdvancedFilterChange,
}: Props) {
  return (
    <BottomSheet visible={visible} onClose={onClose} title="Filtros" snapHeight={0.48}>
      <View style={styles.content}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionLabel}>Actualización</Text>
          <Text style={styles.sectionHint}>Filtra por fuente o por tipos de cambio pendientes de sincronizar.</Text>
        </View>

        <PillSelector
          options={EXCHANGE_RATE_ADVANCED_FILTERS}
          value={advancedFilter}
          onChange={onAdvancedFilterChange}
          horizontal={false}
          wrap
        />

        <TouchableOpacity style={styles.applyBtn} onPress={onClose} activeOpacity={0.84}>
          <Text style={styles.applyBtnText}>Aplicar</Text>
        </TouchableOpacity>
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: SPACING.md,
  },
  sectionHeader: {
    gap: SPACING.xs,
  },
  sectionLabel: {
    fontSize: FONT_SIZE.xs,
    fontFamily: FONT_FAMILY.bodyMedium,
    color: COLORS.storm,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  sectionHint: {
    fontSize: FONT_SIZE.xs,
    fontFamily: FONT_FAMILY.body,
    color: COLORS.textMuted,
  },
  applyBtn: {
    marginTop: SPACING.sm,
    minHeight: 46,
    borderRadius: RADIUS.md,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.primary,
  },
  applyBtnText: {
    fontSize: FONT_SIZE.sm,
    fontFamily: FONT_FAMILY.bodyMedium,
    color: COLORS.textInverse,
  },
});
