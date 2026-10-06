import { View } from "react-native";
import { DetailFieldRow } from "../../../components/ui/DetailFieldRow";
import type { CounterpartyOverview, CounterpartyRoleType } from "../../../types/domain";
import { TYPE_LABELS } from "../lib/contactsLabels";

const ROLE_LABELS: Record<CounterpartyRoleType, string> = {
  client: "Cliente", supplier: "Proveedor", lender: "Prestamista", borrower: "Prestatario",
  bank: "Banco", service_provider: "Proveedor de servicios", other: "Otro",
};

export function ContactDetailFacts({ contact, onPhone, onEmail }: {
  contact: CounterpartyOverview;
  onPhone: () => void;
  onEmail: () => void;
}) {
  return (
    <View>
      <DetailFieldRow label="Tipo" value={TYPE_LABELS[contact.type]} />
      <DetailFieldRow label="Estado" value={contact.isArchived ? "Archivado" : "Activo"} />
      <DetailFieldRow label="Teléfono" value={contact.phone?.trim() || "Sin teléfono"} muted={!contact.phone?.trim()} onPress={contact.phone?.trim() ? onPhone : undefined} />
      <DetailFieldRow label="Correo" value={contact.email?.trim() || "Sin correo"} muted={!contact.email?.trim()} onPress={contact.email?.trim() ? onEmail : undefined} />
      <DetailFieldRow label="DNI / RUC" value={contact.documentNumber?.trim() || "Sin documento"} muted={!contact.documentNumber?.trim()} />
      <DetailFieldRow label="Relación" value={contact.roles.map((role) => ROLE_LABELS[role]).join(" · ") || "Sin definir"} muted={contact.roles.length === 0} />
      <DetailFieldRow label="Fijado" value={contact.isPinned ? "Sí" : "No"} />
      <DetailFieldRow label="Notas" value={contact.notes?.trim() || "Sin notas"} muted={!contact.notes?.trim()} valueLines={0} last />
    </View>
  );
}
