import { Pressable, StyleSheet, Text, View } from "react-native";

import { BottomSheet } from "../../../components/ui/BottomSheet";
import { PillSelector, type PillSelectorOption } from "../../../components/ui/PillSelector";
import { COLORS, FONT_FAMILY, FONT_SIZE, RADIUS, SPACING, SURFACE } from "../../../constants/theme";
import { BUDGET_SCOPE_LABELS, BUDGET_STATUS_LABELS, type BudgetScopeFilter, type BudgetStatusFilter } from "../lib/budgetFilters";

type Props = {
  visible: boolean;
  status: BudgetStatusFilter;
  scope: BudgetScopeFilter;
  pinnedOnly: boolean;
  onStatusChange: (value: BudgetStatusFilter) => void;
  onScopeChange: (value: BudgetScopeFilter) => void;
  onPinnedOnlyChange: (value: boolean) => void;
  onClose: () => void;
};

const STATUS_OPTIONS: PillSelectorOption<BudgetStatusFilter>[] = [
  { value: "all", label: BUDGET_STATUS_LABELS.all },
  { value: "current", label: BUDGET_STATUS_LABELS.current },
  { value: "over", label: BUDGET_STATUS_LABELS.over },
  { value: "closed", label: BUDGET_STATUS_LABELS.closed },
];

const SCOPE_OPTIONS: PillSelectorOption<BudgetScopeFilter>[] = [
  { value: "all", label: BUDGET_SCOPE_LABELS.all },
  { value: "general", label: BUDGET_SCOPE_LABELS.general },
  { value: "category", label: BUDGET_SCOPE_LABELS.category },
  { value: "account", label: BUDGET_SCOPE_LABELS.account },
  { value: "category_account", label: BUDGET_SCOPE_LABELS.category_account },
  { value: "spend_type", label: BUDGET_SCOPE_LABELS.spend_type },
  { value: "spend_type_account", label: BUDGET_SCOPE_LABELS.spend_type_account },
];

export function BudgetFilterSheet({
  visible,
  status,
  scope,
  pinnedOnly,
  onStatusChange,
  onScopeChange,
  onPinnedOnlyChange,
  onClose,
}: Props) {
  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title="Filtros"
      snapHeight={0.7}
      entranceAnimation="springFade"
      headerStyle={styles.header}
      contentStyle={styles.content}
    >
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Estado</Text>
        <PillSelector options={STATUS_OPTIONS} value={status} onChange={onStatusChange} horizontal={false} wrap />
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Qué limita</Text>
        <PillSelector options={SCOPE_OPTIONS} value={scope} onChange={onScopeChange} horizontal={false} wrap />
      </View>

      <Pressable
        style={({ pressed }) => [styles.toggleRow, pressed && styles.pressed]}
        onPress={() => onPinnedOnlyChange(!pinnedOnly)}
        accessibilityRole="switch"
        accessibilityState={{ checked: pinnedOnly }}
      >
        <Text style={styles.toggleLabel}>Solo fijados</Text>
        <Text style={[styles.toggleValue, pinnedOnly && styles.toggleValueActive]}>
          {pinnedOnly ? "Sí" : "No"}
        </Text>
      </Pressable>

      <Pressable style={({ pressed }) => [styles.apply, pressed && styles.pressed]} onPress={onClose} accessibilityRole="button">
        <Text style={styles.applyText}>Ver presupuestos</Text>
      </Pressable>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: SPACING.xl, borderBottomWidth: 0 },
  content: { paddingHorizontal: SPACING.xl, paddingTop: SPACING.md, paddingBottom: SPACING.xxxl, gap: SPACING.xl },
  section: { gap: SPACING.sm },
  sectionLabel: { fontFamily: FONT_FAMILY.bodyMedium, fontSize: FONT_SIZE.xs, letterSpacing: 0.5, color: COLORS.storm, textTransform: "uppercase" },
  toggleRow: { minHeight: 54, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: SPACING.md, borderRadius: RADIUS.md, backgroundColor: SURFACE.card },
  toggleLabel: { fontFamily: FONT_FAMILY.bodyMedium, fontSize: FONT_SIZE.md, color: COLORS.ink },
  toggleValue: { fontFamily: FONT_FAMILY.bodyMedium, fontSize: FONT_SIZE.sm, color: COLORS.storm },
  toggleValueActive: { color: COLORS.ink },
  apply: { minHeight: 48, alignItems: "center", justifyContent: "center", borderRadius: RADIUS.md, backgroundColor: COLORS.action },
  applyText: { fontFamily: FONT_FAMILY.bodySemibold, fontSize: FONT_SIZE.md, color: COLORS.actionText },
  pressed: { opacity: 0.8 },
});
