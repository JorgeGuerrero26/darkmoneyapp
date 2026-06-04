import type { CounterpartyOverview, CounterpartyType } from "../../../types/domain";

type FilterArgs = {
  search: string;
  typeFilters: CounterpartyType[];
  showArchived: boolean;
};

export function applyContactFilter(
  contacts: CounterpartyOverview[],
  { search, typeFilters, showArchived }: FilterArgs,
) {
  const query = search.trim().toLowerCase();
  return contacts.filter((contact) => {
    if (!showArchived && contact.isArchived) return false;
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
