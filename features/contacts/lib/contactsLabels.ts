import { Building2, Circle, Landmark, Store, User, Wrench } from "lucide-react-native";
import type { CounterpartyType } from "../../../types/domain";

export type ActiveContactFilter = CounterpartyType | "pinned";
export type ContactTypeFilter = ActiveContactFilter | "all";
export type ContactStatusFilter = "active" | "archived" | "all";

export const CONTACT_STATUS_LABELS: Record<ContactStatusFilter, string> = {
  active: "Activos",
  archived: "Archivados",
  all: "Todos",
};

export const CONTACT_TYPE_ORDER: CounterpartyType[] = ["person", "company", "merchant", "service", "bank", "other"];

export const CONTACT_GROUP_LABELS: Record<CounterpartyType, string> = {
  person: "Personas",
  company: "Empresas",
  merchant: "Comercios",
  service: "Servicios",
  bank: "Bancos",
  other: "Otros",
};

export const TYPE_FILTERS: { label: string; value: ContactTypeFilter }[] = [
  { label: "Todos", value: "all" },
  { label: "Fijados", value: "pinned" },
  { label: "Personas", value: "person" },
  { label: "Empresas", value: "company" },
  { label: "Comercios", value: "merchant" },
  { label: "Servicios", value: "service" },
  { label: "Bancos", value: "bank" },
  { label: "Otros", value: "other" },
];

export const TYPE_LABELS: Record<CounterpartyType, string> = {
  person: "Persona",
  company: "Empresa",
  merchant: "Comercio",
  service: "Servicio",
  bank: "Banco",
  other: "Otro",
};

export const TYPE_ICON: Record<CounterpartyType, typeof Circle> = {
  person: User,
  company: Building2,
  merchant: Store,
  service: Wrench,
  bank: Landmark,
  other: Circle,
};
