import type { ObligationSummary, SharedObligationSummary } from "../../../types/domain";

export function searchObligations<T extends ObligationSummary | SharedObligationSummary>(
  obligations: T[],
  searchText: string,
): T[] {
  const query = searchText.trim().toLowerCase();
  if (!query) return obligations;

  return obligations.filter((obligation) => {
    const haystack = [
      obligation.title,
      obligation.counterparty,
      obligation.currencyCode,
      obligation.status,
      obligation.direction,
      obligation.description,
      obligation.notes,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return haystack.includes(query);
  });
}
