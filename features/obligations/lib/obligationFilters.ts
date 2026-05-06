import type { ObligationSummary, SharedObligationSummary } from "../../../types/domain";

export type ObligationFilterValue =
  | "all"
  | "receivable"
  | "payable"
  | "active"
  | "defaulted"
  | "draft"
  | "paid";

export type ObligationFilterChip = {
  id: ObligationFilterValue;
  label: string;
};

export const OBLIGATION_FILTER_CHIPS: ObligationFilterChip[] = [
  { id: "all", label: "Todas" },
  { id: "receivable", label: "Me deben" },
  { id: "payable", label: "Debo" },
  { id: "active", label: "Activa" },
  { id: "defaulted", label: "Incumplido" },
  { id: "draft", label: "Borrador" },
  { id: "paid", label: "Liquidada" },
];

export function filterObligations<T extends ObligationSummary | SharedObligationSummary>(
  obligations: T[],
  activeFilter: ObligationFilterValue | ObligationFilterValue[],
): T[] {
  const filters = Array.isArray(activeFilter)
    ? activeFilter.filter((filter) => filter !== "all")
    : activeFilter === "all"
      ? []
      : [activeFilter];
  if (filters.length === 0) return obligations;

  const directionFilters = filters.filter(
    (filter): filter is "receivable" | "payable" => filter === "receivable" || filter === "payable",
  );
  const statusFilters = filters.filter(
    (filter): filter is Extract<ObligationFilterValue, "active" | "defaulted" | "draft" | "paid"> =>
      filter !== "receivable" && filter !== "payable",
  );

  return obligations.filter((obligation) => {
    const matchesDirection =
      directionFilters.length === 0 || directionFilters.includes(obligation.direction);
    const matchesStatus =
      statusFilters.length === 0 || statusFilters.some((status) => status === obligation.status);
    return matchesDirection && matchesStatus;
  });
}

export function obligationFilterLabel(filter: ObligationFilterValue) {
  return OBLIGATION_FILTER_CHIPS.find((chip) => chip.id === filter)?.label ?? "Filtro";
}
