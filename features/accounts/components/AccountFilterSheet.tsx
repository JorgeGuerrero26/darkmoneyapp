import { StyleSheet, Text, View } from "react-native";
import { BottomSheet } from "../../../components/ui/BottomSheet";
import { Button } from "../../../components/ui/Button";
import { PillSelector } from "../../../components/ui/PillSelector";
import { COLORS, FONT_FAMILY, FONT_SIZE, SPACING } from "../../../constants/theme";
import type { AccountInstitutionFilter, AccountStatusFilter } from "../lib/filters";

type Props = {
  visible: boolean;
  onClose: () => void;
  status: AccountStatusFilter;
  onStatusChange: (status: AccountStatusFilter) => void;
  institutionOptions: { value: AccountInstitutionFilter; label: string }[];
  institutions: AccountInstitutionFilter[];
  onInstitutionsChange: (values: AccountInstitutionFilter[]) => void;
  onClear: () => void;
};

export function AccountFilterSheet({
  visible, onClose, status, onStatusChange, institutionOptions,
  institutions, onInstitutionsChange, onClear,
}: Props) {
  return (
    <BottomSheet visible={visible} onClose={onClose} title="Filtros" snapHeight={0.72}>
      <View style={styles.content}>
        <Text style={styles.label}>Estado</Text>
        <PillSelector<AccountStatusFilter>
          options={[
            { label: "Activas", value: "active" },
            { label: "Archivadas", value: "archived" },
            { label: "Todas", value: "all" },
          ]}
          value={status}
          onChange={onStatusChange}
          horizontal={false}
          wrap
        />
        <Text style={styles.label}>Institución</Text>
        <View style={styles.options}>
          <Button
            label="Todas"
            size="sm"
            variant={institutions.length === 0 ? "primary" : "secondary"}
            accessibilityState={{ selected: institutions.length === 0 }}
            onPress={() => onInstitutionsChange([])}
          />
          {institutionOptions.map(({ value, label }) => {
            const selected = institutions.includes(value);
            return (
              <Button
                key={value ?? "__none__"}
                label={label}
                size="sm"
                variant={selected ? "primary" : "secondary"}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: selected }}
                onPress={() => onInstitutionsChange(
                  selected ? institutions.filter((item) => item !== value) : [...institutions, value],
                )}
              />
            );
          })}
        </View>
        <View style={styles.actions}>
          <Button label="Limpiar todos" variant="secondary" onPress={onClear} style={styles.action} />
          <Button label="Ver resultados" onPress={onClose} style={styles.action} />
        </View>
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  content: { gap: SPACING.md, paddingBottom: SPACING.lg },
  label: { color: COLORS.storm, fontFamily: FONT_FAMILY.bodyMedium, fontSize: FONT_SIZE.sm },
  options: { flexDirection: "row", flexWrap: "wrap", gap: SPACING.sm },
  actions: { flexDirection: "row", gap: SPACING.sm, marginTop: SPACING.md },
  action: { flex: 1 },
});
