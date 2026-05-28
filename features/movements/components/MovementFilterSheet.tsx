import { format, endOfMonth, startOfMonth } from "date-fns";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { BottomSheet } from "../../../components/ui/BottomSheet";
import { DatePickerInput } from "../../../components/ui/DatePickerInput";
import { Input } from "../../../components/ui/Input";
import { PillSelector } from "../../../components/ui/PillSelector";
import { COLORS, FONT_FAMILY, FONT_SIZE, RADIUS, SPACING, SURFACE } from "../../../constants/theme";
import type { AccountSummary, CategorySummary, MovementStatus, MovementType } from "../../../types/domain";
import { MOVEMENT_LABELS } from "../lib/labels";

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
  /** Rango de monto opcional (montos en moneda base del workspace). */
  amountMin?: string;
  amountMax?: string;
  onAmountMinChange?: (value: string) => void;
  onAmountMaxChange?: (value: string) => void;
  /** Callback al pulsar "Limpiar todos" dentro del sheet. */
  onClearAll?: () => void;
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
  amountMin,
  amountMax,
  onAmountMinChange,
  onAmountMaxChange,
  onClearAll,
}: Props) {
  const supportsAmountRange = Boolean(onAmountMinChange && onAmountMaxChange);
  return (
    <BottomSheet visible={visible} onClose={onClose} title="Filtros" snapHeight={0.82}>
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

        {supportsAmountRange ? (
          <>
            <Text style={styles.sectionLabel}>{MOVEMENT_LABELS.list.filters.amountRange}</Text>
            <View style={styles.amountRow}>
              <View style={styles.amountField}>
                <Input
                  label={MOVEMENT_LABELS.list.filters.amountMin}
                  value={amountMin ?? ""}
                  onChangeText={(value) => onAmountMinChange!(value)}
                  keyboardType="decimal-pad"
                  placeholder="0.00"
                />
              </View>
              <View style={styles.amountField}>
                <Input
                  label={MOVEMENT_LABELS.list.filters.amountMax}
                  value={amountMax ?? ""}
                  onChangeText={(value) => onAmountMaxChange!(value)}
                  keyboardType="decimal-pad"
                  placeholder="0.00"
                />
              </View>
            </View>
          </>
        ) : null}

        <View style={styles.actionsRow}>
          {onClearAll ? (
            <TouchableOpacity
              style={styles.clearBtn}
              onPress={onClearAll}
              activeOpacity={0.84}
              accessibilityRole="button"
              accessibilityLabel={MOVEMENT_LABELS.list.filters.reset}
            >
              <Text style={styles.clearBtnText}>{MOVEMENT_LABELS.list.filters.reset}</Text>
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity
            style={[styles.applyBtn, onClearAll && styles.applyBtnFlex]}
            onPress={onClose}
            activeOpacity={0.84}
            accessibilityRole="button"
            accessibilityLabel={MOVEMENT_LABELS.list.filters.apply}
          >
            <Text style={styles.applyBtnText}>{MOVEMENT_LABELS.list.filters.apply}</Text>
          </TouchableOpacity>
        </View>
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
  applyBtnFlex: {
    flex: 1,
    marginTop: 0,
  },
  applyBtnText: {
    color: COLORS.textInverse,
    fontSize: FONT_SIZE.sm,
    fontFamily: FONT_FAMILY.bodySemibold,
  },
  actionsRow: {
    flexDirection: "row",
    gap: SPACING.sm,
    marginTop: SPACING.sm,
    alignItems: "center",
  },
  clearBtn: {
    borderRadius: RADIUS.md,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.lg,
    alignItems: "center",
    borderWidth: 1,
    borderColor: SURFACE.cardBorder,
    backgroundColor: SURFACE.card,
  },
  clearBtnText: {
    color: COLORS.storm,
    fontSize: FONT_SIZE.sm,
    fontFamily: FONT_FAMILY.bodyMedium,
  },
  amountRow: {
    flexDirection: "row",
    gap: SPACING.sm,
  },
  amountField: {
    flex: 1,
  },
});
