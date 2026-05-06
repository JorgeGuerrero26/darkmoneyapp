import { format, endOfMonth, startOfMonth } from "date-fns";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { BottomSheet } from "../../../components/ui/BottomSheet";
import { DatePickerInput } from "../../../components/ui/DatePickerInput";
import { PillSelector } from "../../../components/ui/PillSelector";
import { COLORS, FONT_FAMILY, FONT_SIZE, RADIUS, SPACING } from "../../../constants/theme";
import type { AccountSummary, CategorySummary, MovementStatus, MovementType } from "../../../types/domain";

type FilterType = MovementType | "all";
type FilterStatus = MovementStatus | "all";

type DatePreset = {
  label: string;
  from: string;
  to: string;
};

type Props = {
  visible: boolean;
  onClose: () => void;
  statusOptions: { label: string; value: FilterStatus }[];
  statusFilter: FilterStatus;
  onStatusFilterChange: (value: FilterStatus) => void;
  datePresets: DatePreset[];
  activeDatePreset: string | null;
  onDatePresetChange: (value: string | null) => void;
  customDateFrom: string;
  customDateTo: string;
  onCustomDateFromChange: (value: string) => void;
  onCustomDateToChange: (value: string) => void;
  categories: CategorySummary[];
  activeCategoryId: number | null;
  activeCategoryScope: "uncategorized" | null;
  onCategoryIdChange: (value: number | null) => void;
  onCategoryScopeChange: (value: "uncategorized" | null) => void;
  accounts: AccountSummary[];
  activeAccountId: number | null;
  onAccountIdChange: (value: number | null) => void;
};

export function MovementFilterSheet({
  visible,
  onClose,
  statusOptions,
  statusFilter,
  onStatusFilterChange,
  datePresets,
  activeDatePreset,
  onDatePresetChange,
  customDateFrom,
  customDateTo,
  onCustomDateFromChange,
  onCustomDateToChange,
  categories,
  activeCategoryId,
  activeCategoryScope,
  onCategoryIdChange,
  onCategoryScopeChange,
  accounts,
  activeAccountId,
  onAccountIdChange,
}: Props) {
  return (
    <BottomSheet visible={visible} onClose={onClose} title="Filtros" snapHeight={0.78}>
      <View style={styles.content}>
        <Text style={styles.sectionLabel}>Estado</Text>
        <PillSelector
          options={statusOptions}
          value={statusFilter}
          onChange={onStatusFilterChange}
          horizontal={false}
          wrap
        />

        <Text style={styles.sectionLabel}>Período</Text>
        <PillSelector
          options={[
            { label: "Todo", value: "Todo" },
            ...datePresets.map((preset) => ({ label: preset.label, value: preset.label })),
            { label: "Rango...", value: "Rango…" },
          ]}
          value={activeDatePreset ?? "Todo"}
          onChange={(value) => {
            if (value === "Todo") {
              onDatePresetChange(null);
              return;
            }
            onDatePresetChange(value);
            if (value === "Rango…" && (!customDateFrom || !customDateTo)) {
              const now = new Date();
              onCustomDateFromChange(format(startOfMonth(now), "yyyy-MM-dd"));
              onCustomDateToChange(format(endOfMonth(now), "yyyy-MM-dd"));
            }
          }}
          horizontal={false}
          wrap
        />
        {activeDatePreset === "Rango…" ? (
          <View style={styles.customRangeRow}>
            <DatePickerInput
              label="Desde"
              value={customDateFrom}
              onChange={onCustomDateFromChange}
              hideLabel
              variant="formRow"
            />
            <DatePickerInput
              label="Hasta"
              value={customDateTo}
              onChange={onCustomDateToChange}
              hideLabel
              variant="formRow"
              minimumDate={
                customDateFrom
                  ? (() => {
                      const [year, month, day] = customDateFrom.split("-").map(Number);
                      return new Date(year, month - 1, day);
                    })()
                  : undefined
              }
            />
          </View>
        ) : null}

        {categories.length > 0 ? (
          <>
            <Text style={styles.sectionLabel}>Categoría</Text>
            <PillSelector
              options={[
                { label: "Todas", value: -1 },
                { label: "Sin categoría", value: -2 },
                ...categories.map((category) => ({ label: category.name, value: category.id })),
              ]}
              value={activeCategoryScope === "uncategorized" ? -2 : activeCategoryId ?? -1}
              onChange={(value) => {
                if (value === -1) {
                  onCategoryIdChange(null);
                  onCategoryScopeChange(null);
                } else if (value === -2) {
                  onCategoryIdChange(null);
                  onCategoryScopeChange("uncategorized");
                } else {
                  onCategoryScopeChange(null);
                  onCategoryIdChange(value);
                }
              }}
            />
          </>
        ) : null}

        {accounts.length > 0 ? (
          <>
            <Text style={styles.sectionLabel}>Cuenta</Text>
            <PillSelector
              options={[
                { label: "Todas", value: -1 },
                ...accounts.map((account) => ({ label: account.name, value: account.id })),
              ]}
              value={activeAccountId ?? -1}
              onChange={(value) => onAccountIdChange(value === -1 ? null : value)}
            />
          </>
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
  sectionLabel: {
    fontSize: FONT_SIZE.xs,
    fontFamily: FONT_FAMILY.bodyMedium,
    color: COLORS.storm,
    letterSpacing: 0.2,
  },
  customRangeRow: {
    flexDirection: "row",
    gap: SPACING.sm,
    marginTop: SPACING.xs,
  },
  applyBtn: {
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.md,
    paddingVertical: SPACING.md,
    alignItems: "center",
    marginTop: SPACING.sm,
  },
  applyBtnText: {
    color: "#FFF",
    fontSize: FONT_SIZE.sm,
    fontFamily: FONT_FAMILY.bodySemibold,
  },
});
