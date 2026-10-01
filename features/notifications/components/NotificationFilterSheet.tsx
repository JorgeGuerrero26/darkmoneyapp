import { Pressable, StyleSheet, Text, View } from "react-native";
import { Check } from "lucide-react-native";

import { BottomSheet } from "../../../components/ui/BottomSheet";
import { COLORS, FONT_FAMILY, FONT_SIZE, SPACING, SURFACE } from "../../../constants/theme";
import {
  NOTIFICATION_FILTERS,
  NOTIFICATION_KIND_GROUPS,
  type NotificationFilter,
  type NotificationKindGroup,
} from "../lib/notificationSections";

type Props = {
  visible: boolean;
  onClose: () => void;
  priority: NotificationFilter;
  onPriorityChange: (value: NotificationFilter) => void;
  kind: NotificationKindGroup;
  onKindChange: (value: NotificationKindGroup) => void;
  unreadOnly: boolean;
  onUnreadOnlyChange: (value: boolean) => void;
};

export function NotificationFilterSheet({
  visible, onClose, priority, onPriorityChange, kind, onKindChange, unreadOnly, onUnreadOnlyChange,
}: Props) {
  return (
    <BottomSheet visible={visible} onClose={onClose} title="Filtrar notificaciones" snapHeight={0.75}>
      <View style={styles.content}>
        <Text style={styles.heading}>Estado</Text>
        <FilterOption label="Todas" selected={!unreadOnly} onPress={() => onUnreadOnlyChange(false)} />
        <FilterOption label="Solo sin leer" selected={unreadOnly} onPress={() => onUnreadOnlyChange(true)} />

        <Text style={styles.heading}>Prioridad</Text>
        {NOTIFICATION_FILTERS.map((option) => (
          <FilterOption key={option.value} label={option.label} selected={priority === option.value}
            onPress={() => onPriorityChange(option.value)} />
        ))}

        <Text style={styles.heading}>Tipo</Text>
        {NOTIFICATION_KIND_GROUPS.map((option) => (
          <FilterOption key={option.value} label={option.label} selected={kind === option.value}
            onPress={() => onKindChange(option.value)} />
        ))}
      </View>
    </BottomSheet>
  );
}

function FilterOption({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable style={styles.option} onPress={onPress} accessibilityRole="radio" accessibilityState={{ selected }}>
      <Text style={[styles.optionText, selected && styles.selectedText]}>{label}</Text>
      {selected ? <Check size={17} color={COLORS.ink} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: SPACING.xl, paddingBottom: SPACING.xxl },
  heading: {
    marginTop: SPACING.lg,
    marginBottom: SPACING.xs,
    fontFamily: FONT_FAMILY.bodyMedium,
    fontSize: FONT_SIZE.xs,
    color: COLORS.storm,
    textTransform: "uppercase",
  },
  option: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: SURFACE.separator,
  },
  optionText: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.md, color: COLORS.fog },
  selectedText: { fontFamily: FONT_FAMILY.bodySemibold, color: COLORS.ink },
});
