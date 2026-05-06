import { Archive } from "lucide-react-native";

import { FilterToolbar } from "../../../components/ui/FilterToolbar";
import {
  OBLIGATION_FILTER_CHIPS,
  type ObligationFilterValue,
} from "../lib/obligationFilters";

type Props = {
  activeFilters: ObligationFilterValue[];
  showArchived: boolean;
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  onFiltersChange: (filters: ObligationFilterValue[]) => void;
  onToggleArchived: () => void;
};

export function ObligationFilterBar({
  activeFilters,
  showArchived,
  searchValue,
  onSearchChange,
  onFiltersChange,
  onToggleArchived,
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
      actions={[
        {
          key: "archived",
          icon: Archive,
          active: showArchived,
          onPress: onToggleArchived,
          accessibilityLabel: showArchived ? "Ocultar archivadas" : "Mostrar archivadas",
        },
      ]}
    />
  );
}
