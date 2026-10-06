import { StyleSheet, Text, View } from "react-native";

import { BottomSheet } from "../../../components/ui/BottomSheet";
import { Button } from "../../../components/ui/Button";
import { PillSelector } from "../../../components/ui/PillSelector";
import { COLORS, FONT_FAMILY, FONT_SIZE, SPACING } from "../../../constants/theme";
import { CONTACT_STATUS_LABELS, type ContactStatusFilter } from "../lib/contactsLabels";

type Props = {
  visible: boolean;
  status: ContactStatusFilter;
  pinnedOnly: boolean;
  onStatusChange: (value: ContactStatusFilter) => void;
  onPinnedOnlyChange: (value: boolean) => void;
  onClear: () => void;
  onClose: () => void;
};

export function ContactFilterSheet({ visible, status, pinnedOnly, onStatusChange, onPinnedOnlyChange, onClear, onClose }: Props) {
  return (
    <BottomSheet visible={visible} onClose={onClose} title="Filtros" snapHeight={0.5} entranceAnimation="springFade">
      <View style={styles.content}>
        <Text style={styles.label}>Estado</Text>
        <PillSelector<ContactStatusFilter>
          options={(["active", "archived", "all"] as const).map((value) => ({ value, label: CONTACT_STATUS_LABELS[value] }))}
          value={status}
          onChange={onStatusChange}
          horizontal={false}
          wrap
        />
        <Text style={styles.label}>Fijados</Text>
        <PillSelector
          options={[{ value: "all", label: "Todos" }, { value: "pinned", label: "Solo fijados" }]}
          value={pinnedOnly ? "pinned" : "all"}
          onChange={(value) => onPinnedOnlyChange(value === "pinned")}
          horizontal={false}
          wrap
        />
        <View style={styles.actions}>
          <Button label="Limpiar todos" variant="secondary" onPress={onClear} style={styles.action} />
          <Button label="Ver contactos" onPress={onClose} style={styles.action} />
        </View>
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  content: { gap: SPACING.md, paddingBottom: SPACING.lg },
  label: { color: COLORS.storm, fontFamily: FONT_FAMILY.bodyMedium, fontSize: FONT_SIZE.sm },
  actions: { flexDirection: "row", gap: SPACING.sm, marginTop: SPACING.md },
  action: { flex: 1 },
});
