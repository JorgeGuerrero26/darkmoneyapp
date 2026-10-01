import { Pressable, StyleSheet, Text, View } from "react-native";
import { CheckCheck, MailOpen, Trash2 } from "lucide-react-native";

import { BottomSheet } from "../../../components/ui/BottomSheet";
import { COLORS, FONT_FAMILY, FONT_SIZE, SPACING, SURFACE } from "../../../constants/theme";

type Props = {
  visible: boolean;
  onClose: () => void;
  unreadCount: number;
  readCount: number;
  disabled: boolean;
  onMarkAllRead: () => void;
  onMarkAllUnread: () => void;
  onDeleteAllRead: () => void;
};

export function NotificationActionsSheet({
  visible, onClose, unreadCount, readCount, disabled, onMarkAllRead, onMarkAllUnread, onDeleteAllRead,
}: Props) {
  const actions = [
    { key: "read", label: "Marcar todas como leídas", icon: CheckCheck, enabled: unreadCount > 0, onPress: onMarkAllRead },
    { key: "unread", label: "Marcar todas como no leídas", icon: MailOpen, enabled: readCount > 0, onPress: onMarkAllUnread },
    { key: "delete", label: "Eliminar las leídas", icon: Trash2, enabled: readCount > 0, onPress: onDeleteAllRead },
  ];

  return (
    <BottomSheet visible={visible} onClose={onClose} title="Más acciones" snapHeight={0.42}>
      <View style={styles.content}>
        {actions.map((action) => {
          const Icon = action.icon;
          return (
            <Pressable
              key={action.key}
              style={[styles.row, (!action.enabled || disabled) && styles.disabled]}
              disabled={!action.enabled || disabled}
              accessibilityRole="button"
              onPress={() => { onClose(); action.onPress(); }}
            >
              <Icon size={18} color={action.key === "delete" ? COLORS.danger : COLORS.fog} />
              <Text style={[styles.label, action.key === "delete" && styles.danger]}>{action.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: SPACING.xl, paddingBottom: SPACING.xxl },
  row: {
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: SURFACE.separator,
  },
  disabled: { opacity: 0.4 },
  label: { fontFamily: FONT_FAMILY.bodyMedium, fontSize: FONT_SIZE.md, color: COLORS.fog },
  danger: { color: COLORS.danger },
});
