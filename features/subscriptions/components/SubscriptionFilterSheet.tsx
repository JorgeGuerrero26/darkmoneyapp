import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { BottomSheet } from "../../../components/ui/BottomSheet";
import { DatePickerInput } from "../../../components/ui/DatePickerInput";
import { PillSelector } from "../../../components/ui/PillSelector";
import { COLORS, FONT_FAMILY, FONT_SIZE, RADIUS, SPACING, SURFACE } from "../../../constants/theme";
import { parseDisplayDate, todayPeru } from "../../../lib/date";
import {
  SUBSCRIPTION_DUE_DATE_FILTERS,
  type SubscriptionDueDateFilter,
} from "../lib/subscriptionDueDateFilters";

type Props = {
  visible: boolean;
  onClose: () => void;
  /** Estado y frecuencia. Vivían fuera, en una fila de cápsulas que era la segunda puerta. */
  filterOptions: { label: string; value: string }[];
  activeFilters: string[];
  onToggleFilter: (value: string) => void;
  dueDateFilter: SubscriptionDueDateFilter;
  onDueDateFilterChange: (value: SubscriptionDueDateFilter) => void;
  customDueDateFrom: string;
  customDueDateTo: string;
  onCustomDueDateFromChange: (value: string) => void;
  onCustomDueDateToChange: (value: string) => void;
};

function ymdToDate(value: string) {
  return value ? parseDisplayDate(value) : undefined;
}

export function SubscriptionFilterSheet({
  visible,
  onClose,
  filterOptions,
  activeFilters,
  onToggleFilter,
  dueDateFilter,
  onDueDateFilterChange,
  customDueDateFrom,
  customDueDateTo,
  onCustomDueDateFromChange,
  onCustomDueDateToChange,
}: Props) {
  return (
    <BottomSheet visible={visible} onClose={onClose} title="Filtros" snapHeight={0.58}>
      <View style={styles.content}>
        {/* Estado y frecuencia entran aquí: eran once cápsulas en una fila que se desplazaba de
            lado, con un desplegable que anunciaba "Filtrar · 11 opciones" — la interfaz
            contándose a sí misma. */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionLabel}>Estado y frecuencia</Text>
        </View>
        <View style={styles.chipsWrap}>
          {filterOptions.map((option) => {
            const active = activeFilters.includes(option.value);
            return (
              <TouchableOpacity
                key={option.value}
                style={[styles.chip, active && styles.chipActive]}
                onPress={() => onToggleFilter(option.value)}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
              >
                <Text style={[styles.chipText, active && styles.chipTextActive]}>{option.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionLabel}>Próximo pago</Text>
          <Text style={styles.sectionHint}>Filtra por el día en que toca pagar la suscripción.</Text>
        </View>

        <PillSelector
          options={SUBSCRIPTION_DUE_DATE_FILTERS}
          value={dueDateFilter}
          onChange={(value) => {
            onDueDateFilterChange(value);
            if (value === "custom" && (!customDueDateFrom || !customDueDateTo)) {
              const today = todayPeru();
              onCustomDueDateFromChange(today);
              onCustomDueDateToChange(today);
            }
          }}
          horizontal={false}
          wrap
        />

        {dueDateFilter === "custom" ? (
          <View style={styles.customRangeRow}>
            <DatePickerInput
              label="Desde"
              value={customDueDateFrom}
              onChange={onCustomDueDateFromChange}
              hideLabel
              variant="formRow"
            />
            <DatePickerInput
              label="Hasta"
              value={customDueDateTo}
              onChange={onCustomDueDateToChange}
              hideLabel
              variant="formRow"
              minimumDate={ymdToDate(customDueDateFrom)}
            />
          </View>
        ) : null}

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
  customRangeRow: {
    gap: SPACING.sm,
  },
  chipsWrap: { flexDirection: "row", flexWrap: "wrap", gap: SPACING.sm },
  chip: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs + 2,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: SURFACE.cardBorder,
    backgroundColor: SURFACE.card,
  },
  chipActive: { borderColor: COLORS.ink, borderWidth: 1.5 },
  chipText: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.sm, color: COLORS.storm },
  chipTextActive: { fontFamily: FONT_FAMILY.bodySemibold, color: COLORS.ink },
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
