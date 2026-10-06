import type { ResourceSection } from "../../../components/ui/ResourceSectionList";
import type { CounterpartyOverview, CounterpartyType } from "../../../types/domain";
import { CONTACT_GROUP_LABELS, CONTACT_TYPE_ORDER } from "./contactsLabels";

export type ContactListSection = ResourceSection<CounterpartyOverview, CounterpartyType | "pinned" | "archived">;

/** Each contact appears once. Pinned contacts precede types; archived contacts stay last. */
export function buildContactSections(contacts: CounterpartyOverview[]): ContactListSection[] {
  const sorted = [...contacts].sort((a, b) => a.name.localeCompare(b.name, "es") || a.id - b.id);
  const sections: ContactListSection[] = [];

  function add(key: ContactListSection["key"], label: string, data: CounterpartyOverview[]) {
    if (data.length === 0) return;
    sections.push({ key, label, data, headerVariant: "divider", trailing: String(data.length) });
  }

  add("pinned", "Fijados", sorted.filter((contact) => contact.isPinned && !contact.isArchived));
  for (const type of CONTACT_TYPE_ORDER) {
    add(type, CONTACT_GROUP_LABELS[type], sorted.filter((contact) => contact.type === type && !contact.isPinned && !contact.isArchived));
  }
  add("archived", "Archivados", sorted.filter((contact) => contact.isArchived));
  return sections;
}
