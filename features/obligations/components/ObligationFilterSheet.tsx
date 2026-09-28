import { StyleSheet, Text, View } from "react-native";
import { BottomSheet } from "../../../components/ui/BottomSheet";
import { Button } from "../../../components/ui/Button";
import { PillSelector } from "../../../components/ui/PillSelector";
import { COLORS, FONT_FAMILY, FONT_SIZE, SPACING } from "../../../constants/theme";

export type ObligationArchiveView = "active" | "archived" | "all";

type Props = {
  visible: boolean;
  onClose: () => void;
  archiveView: ObligationArchiveView;
  onArchiveViewChange: (value: ObligationArchiveView) => void;
  onClear: () => void;
};

export function ObligationFilterSheet({ visible, onClose, archiveView, onArchiveViewChange, onClear }: Props) {
  return (
    <BottomSheet visible={visible} onClose={onClose} title="Filtros" snapHeight={0.5}>
      <View style={styles.content}>
        <Text style={styles.label}>Estado</Text>
        <PillSelector<ObligationArchiveView>
          options={[
            { label: "Activas", value: "active" },
            { label: "Archivadas", value: "archived" },
            { label: "Todas", value: "all" },
          ]}
          value={archiveView}
          onChange={onArchiveViewChange}
          horizontal={false}
          wrap
        />
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
  actions: { flexDirection: "row", gap: SPACING.sm, marginTop: SPACING.md },
  action: { flex: 1 },
});
