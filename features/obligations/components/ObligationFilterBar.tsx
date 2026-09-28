import { FilterToolbar } from "../../../components/ui/FilterToolbar";
import {
  OBLIGATION_FILTER_CHIPS,
  type ObligationFilterValue,
} from "../lib/obligationFilters";

type Props = {
  activeFilters: ObligationFilterValue[];
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  onFiltersChange: (filters: ObligationFilterValue[]) => void;
  extraFiltersCount: number;
  onOpenFilters: () => void;
};

export function ObligationFilterBar({
  activeFilters,
  searchValue,
  onSearchChange,
  onFiltersChange,
  extraFiltersCount,
  onOpenFilters,
}: Props) {
  return (
    <FilterToolbar
      options={OBLIGATION_FILTER_CHIPS.map((chip) => ({ value: chip.id, label: chip.label }))}
      selectedValues={activeFilters}
      onSelectedValuesChange={(filters) => {
        onFiltersChange(filters.filter((filter) => filter !== "all"));
      }}
      allValue="all"
      searchValue={searchValue}
      onSearchChange={onSearchChange}
      searchPlaceholder="Buscar créditos o deudas..."
      extraAction={{
        label: extraFiltersCount > 0 ? `${extraFiltersCount} filtros` : "Filtros",
        active: extraFiltersCount > 0,
        onPress: onOpenFilters,
      }}
    />
  );
}
