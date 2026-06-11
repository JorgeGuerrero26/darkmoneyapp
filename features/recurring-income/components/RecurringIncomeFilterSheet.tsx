import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { BottomSheet } from "../../../components/ui/BottomSheet";
import { PillSelector, type PillSelectorOption } from "../../../components/ui/PillSelector";
import { COLORS, FONT_FAMILY, FONT_SIZE, GLASS, RADIUS, SPACING } from "../../../constants/theme";
import type {
  AccountSummary,
  CategorySummary,
  CounterpartySummary,
  RecurringIncomeFrequency,
} from "../../../types/domain";

type Props = {
  visible: boolean;
  onClose: () => void;
  frequencyFilter: "all" | RecurringIncomeFrequency;
  onFrequencyFilterChange: (value: "all" | RecurringIncomeFrequency) => void;
  payerFilter: number | null;
  onPayerFilterChange: (value: number | null) => void;
  accountFilter: number | null;
  onAccountFilterChange: (value: number | null) => void;
  categoryFilter: number | null;
  onCategoryFilterChange: (value: number | null) => void;
  upcomingOnly: boolean;
  onUpcomingOnlyChange: (value: boolean) => void;
  accounts: AccountSummary[];
  categories: CategorySummary[];
  counterparties: CounterpartySummary[];
  onClear: () => void;
};

const FREQUENCY_OPTIONS: Array<PillSelectorOption<"all" | RecurringIncomeFrequency>> = [
  { label: "Todas", value: "all" },
  { label: "Diario", value: "daily" },
  { label: "Semanal", value: "weekly" },
  { label: "Mensual", value: "monthly" },
  { label: "Trimestral", value: "quarterly" },
  { label: "Anual", value: "yearly" },
  { label: "Personalizado", value: "custom" },
];

function idOptions<T extends { id: number; name: string }>(
  allLabel: string,
  items: T[],
): Array<PillSelectorOption<number>> {
  return [
    { label: allLabel, value: 0 },
    ...items.map((item) => ({ label: item.name, value: item.id })),
  ];
}

export function RecurringIncomeFilterSheet({
  visible,
  onClose,
  frequencyFilter,
  onFrequencyFilterChange,
  payerFilter,
  onPayerFilterChange,
  accountFilter,
  onAccountFilterChange,
  categoryFilter,
  onCategoryFilterChange,
  upcomingOnly,
  onUpcomingOnlyChange,
  accounts,
  categories,
  counterparties,
  onClear,
}: Props) {
  return (
    <BottomSheet visible={visible} onClose={onClose} title="Filtros" snapHeight={0.72}>
      <View style={styles.content}>
        <FilterSection
          label="Frecuencia"
          hint="Filtra por la periodicidad configurada del ingreso fijo."
        >
          <PillSelector
            options={FREQUENCY_OPTIONS}
            value={frequencyFilter}
            onChange={onFrequencyFilterChange}
            horizontal={false}
            wrap
          />
        </FilterSection>

        <FilterSection label="Pagador">
          <PillSelector
            options={idOptions("Todos", counterparties)}
            value={payerFilter ?? 0}
            onChange={(value) => onPayerFilterChange(value === 0 ? null : value)}
            horizontal={false}
            wrap
          />
        </FilterSection>

        <FilterSection label="Cuenta destino">
          <PillSelector
            options={idOptions("Todas", accounts)}
            value={accountFilter ?? 0}
            onChange={(value) => onAccountFilterChange(value === 0 ? null : value)}
            horizontal={false}
            wrap
          />
        </FilterSection>

        <FilterSection label="Categoría">
          <PillSelector
            options={idOptions("Todas", categories)}
            value={categoryFilter ?? 0}
            onChange={(value) => onCategoryFilterChange(value === 0 ? null : value)}
            horizontal={false}
            wrap
          />
        </FilterSection>

        <TouchableOpacity
          style={[styles.toggleRow, upcomingOnly && styles.toggleRowActive]}
          onPress={() => onUpcomingOnlyChange(!upcomingOnly)}
          activeOpacity={0.84}
        >
          <View style={styles.toggleCopy}>
            <Text style={styles.toggleTitle}>Próximas llegadas</Text>
            <Text style={styles.toggleHint}>Mostrar solo ingresos esperados dentro de 30 días.</Text>
          </View>
          <Text style={[styles.toggleValue, upcomingOnly && styles.toggleValueActive]}>
            {upcomingOnly ? "Sí" : "No"}
          </Text>
        </TouchableOpacity>

        <View style={styles.actions}>
          <TouchableOpacity style={styles.clearBtn} onPress={onClear} activeOpacity={0.84}>
            <Text style={styles.clearText}>Limpiar</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.applyBtn} onPress={onClose} activeOpacity={0.84}>
            <Text style={styles.applyText}>Aplicar</Text>
          </TouchableOpacity>
        </View>
      </View>
    </BottomSheet>
  );
}

function FilterSection({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionLabel}>{label}</Text>
        {hint ? <Text style={styles.sectionHint}>{hint}</Text> : null}
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: SPACING.lg,
  },
  section: {
    gap: SPACING.sm,
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
  toggleRow: {
    minHeight: 58,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderWidth: 1,
    borderColor: GLASS.separator,
    backgroundColor: GLASS.input,
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.md,
  },
  toggleRowActive: {
    borderColor: GLASS.cardActiveBorder,
    backgroundColor: GLASS.cardActive,
  },
  toggleCopy: {
    flex: 1,
    gap: 2,
  },
  toggleTitle: {
    fontSize: FONT_SIZE.sm,
    fontFamily: FONT_FAMILY.bodySemibold,
    color: COLORS.ink,
  },
  toggleHint: {
    fontSize: FONT_SIZE.xs,
    fontFamily: FONT_FAMILY.body,
    color: COLORS.textMuted,
  },
  toggleValue: {
    fontSize: FONT_SIZE.sm,
    fontFamily: FONT_FAMILY.bodySemibold,
    color: COLORS.storm,
  },
  toggleValueActive: {
    color: COLORS.pine,
  },
  actions: {
    flexDirection: "row",
    gap: SPACING.sm,
    marginTop: SPACING.xs,
  },
  clearBtn: {
    flex: 1,
    minHeight: 46,
    borderRadius: RADIUS.md,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: GLASS.sheetBorder,
    backgroundColor: GLASS.input,
  },
  applyBtn: {
    flex: 1,
    minHeight: 46,
    borderRadius: RADIUS.md,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.primary,
  },
  clearText: {
    fontSize: FONT_SIZE.sm,
    fontFamily: FONT_FAMILY.bodyMedium,
    color: COLORS.ink,
  },
  applyText: {
    fontSize: FONT_SIZE.sm,
    fontFamily: FONT_FAMILY.bodyMedium,
    color: COLORS.textInverse,
  },
});
