import { Linking, Pressable, StyleSheet, Text, View } from "react-native";
import {
  Archive,
  ArchiveRestore,
  Mail,
  MessageCircle,
  Pencil,
  Phone,
} from "lucide-react-native";

import { COLORS, FONT_FAMILY, FONT_SIZE, RADIUS, SPACING } from "../../../constants/theme";
import type { CounterpartyOverview } from "../../../types/domain";

type Props = {
  contact: CounterpartyOverview;
  onEdit: () => void;
  onArchive: () => void;
  onRestore: () => void;
};

function sanitizePhone(raw: string) {
  return raw.replace(/[^\d+]/g, "");
}

export function ContactDetailQuickActions({
  contact,
  onEdit,
  onArchive,
  onRestore,
}: Props) {
  const phone = contact.phone?.trim() ?? "";
  const email = contact.email?.trim() ?? "";
  const phoneDigits = phone ? sanitizePhone(phone) : "";

  const actions = [
    phoneDigits
      ? {
          key: "call",
          label: "Llamar",
          icon: Phone,
          color: COLORS.primary,
          onPress: () => void Linking.openURL(`tel:${phoneDigits}`),
        }
      : null,
    phoneDigits
      ? {
          key: "whatsapp",
          label: "WhatsApp",
          icon: MessageCircle,
          color: COLORS.income,
          onPress: () => void Linking.openURL(`https://wa.me/${phoneDigits.replace(/^\+/, "")}`),
        }
      : null,
    email
      ? {
          key: "email",
          label: "Email",
          icon: Mail,
          color: COLORS.primary,
          onPress: () => void Linking.openURL(`mailto:${email}`),
        }
      : null,
    {
      key: "edit",
      label: "Editar",
      icon: Pencil,
      color: COLORS.primary,
      onPress: onEdit,
    },
    contact.isArchived
      ? {
          key: "restore",
          label: "Restaurar",
          icon: ArchiveRestore,
          color: COLORS.pine,
          onPress: onRestore,
        }
      : {
          key: "archive",
          label: "Archivar",
          icon: Archive,
          color: COLORS.ember,
          onPress: onArchive,
        },
  ].filter((a): a is NonNullable<typeof a> => a !== null);

  return (
    <View style={styles.row}>
      {actions.map((action) => {
        const Icon = action.icon;
        return (
          <Pressable
            key={action.key}
            onPress={action.onPress}
            style={({ pressed }) => [styles.btn, pressed && styles.btnPressed]}
            accessibilityRole="button"
            accessibilityLabel={action.label}
          >
            <Icon size={18} color={action.color} strokeWidth={2} />
            <Text style={[styles.btnLabel, { color: action.color }]} numberOfLines={1}>
              {action.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: SPACING.sm,
  },
  btn: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.xs,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.bgCard,
  },
  btnPressed: {
    opacity: 0.7,
  },
  btnLabel: {
    fontSize: FONT_SIZE.xs,
    fontFamily: FONT_FAMILY.bodySemibold,
  },
});
