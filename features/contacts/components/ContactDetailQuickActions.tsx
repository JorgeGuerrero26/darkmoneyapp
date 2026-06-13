import { Linking } from "react-native";
import {
  Archive,
  ArchiveRestore,
  Mail,
  MessageCircle,
  Pencil,
  Pin,
  PinOff,
  Phone,
} from "lucide-react-native";

import { DetailQuickActions, type DetailQuickAction } from "../../../components/ui/DetailQuickActions";
import { COLORS } from "../../../constants/theme";
import type { CounterpartyOverview } from "../../../types/domain";

type Props = {
  contact: CounterpartyOverview;
  onEdit: () => void;
  onArchive: () => void;
  onRestore: () => void;
  onTogglePin: () => void;
};

function sanitizePhone(raw: string) {
  return raw.replace(/[^\d+]/g, "");
}

export function ContactDetailQuickActions({
  contact,
  onEdit,
  onArchive,
  onRestore,
  onTogglePin,
}: Props) {
  const phone = contact.phone?.trim() ?? "";
  const email = contact.email?.trim() ?? "";
  const phoneDigits = phone ? sanitizePhone(phone) : "";

  const maybeActions: Array<DetailQuickAction | null> = [
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
    {
      key: "pin",
      label: contact.isPinned ? "Desfijar" : "Fijar",
      icon: contact.isPinned ? PinOff : Pin,
      color: contact.isPinned ? COLORS.primary : COLORS.storm,
      onPress: onTogglePin,
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
  ];
  const actions = maybeActions.filter((action): action is DetailQuickAction => action !== null);

  return <DetailQuickActions actions={actions} />;
}
