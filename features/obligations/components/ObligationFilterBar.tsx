import { Archive, Layers } from "lucide-react-native";

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
  /** Separa la lista en "Me deben" y "Yo debo", como Cuentas separa por tipo. */
  groupByDirection: boolean;
  onToggleGrouping: () => void;
};

export function ObligationFilterBar({
  activeFilters,
  showArchived,
  searchValue,
  onSearchChange,
  onFiltersChange,
  onToggleArchived,
  groupByDirection,
  onToggleGrouping,
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
      /* Los mismos dos controles que en Cuentas y en el mismo sitio: agrupar y archivadas. */
      actions={[
        {
          key: "group-by-direction",
          icon: Layers,
          active: groupByDirection,
          onPress: onToggleGrouping,
          accessibilityLabel: groupByDirection ? "No agrupar" : "Agrupar por tipo",
        },
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
