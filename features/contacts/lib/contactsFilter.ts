import type { CounterpartyOverview, CounterpartyType } from "../../../types/domain";
import type { ActiveContactFilter } from "./contactsLabels";

type FilterArgs = {
  search: string;
  filters: ActiveContactFilter[];
  showArchived: boolean;
};

export function applyContactFilter(
  contacts: CounterpartyOverview[],
  { search, filters, showArchived }: FilterArgs,
) {
  const query = search.trim().toLowerCase();
  const pinnedOnly = filters.includes("pinned");
  const typeFilters = filters.filter((filter): filter is CounterpartyType => filter !== "pinned");

  return contacts.filter((contact) => {
    if (!showArchived && contact.isArchived) return false;
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
