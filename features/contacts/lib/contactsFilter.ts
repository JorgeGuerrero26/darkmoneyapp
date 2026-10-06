import type { CounterpartyOverview, CounterpartyType } from "../../../types/domain";
import type { ActiveContactFilter, ContactStatusFilter } from "./contactsLabels";

type FilterArgs = {
  search: string;
  filters: ActiveContactFilter[];
  status: ContactStatusFilter;
};

export function applyContactFilter(
  contacts: CounterpartyOverview[],
  { search, filters, status }: FilterArgs,
) {
  const query = search.trim().toLowerCase();
  const pinnedOnly = filters.includes("pinned");
  const typeFilters = filters.filter((filter): filter is CounterpartyType => filter !== "pinned");

  return contacts.filter((contact) => {
    if (status === "active" && contact.isArchived) return false;
    if (status === "archived" && !contact.isArchived) return false;
    if (pinnedOnly && !contact.isPinned) return false;
    if (typeFilters.length > 0 && !typeFilters.includes(contact.type)) return false;
    if (query) {
      const haystack = [
        contact.name,
        contact.type,
        contact.phone,
        contact.email,
        contact.documentNumber,
        contact.notes,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      if (!haystack.includes(query)) return false;
    }
    return true;
  });
}
