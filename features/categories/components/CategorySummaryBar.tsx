import { Layers3, Power, Tag } from "lucide-react-native";

import { MetricSummaryBar } from "../../../components/ui/MetricSummaryBar";
import { COLORS } from "../../../constants/theme";

type Props = {
  totalCount: number;
  activeCount: number;
  systemCount: number;
};

export function CategorySummaryBar({ totalCount, activeCount, systemCount }: Props) {
  return (
    <MetricSummaryBar
      items={[
        {
          key: "total",
          icon: Tag,
          value: String(totalCount),
          label: "categorías",
          color: COLORS.primary,
          strong: true,
          helpTitle: "Total de categorías",
          helpDescription: "Cantidad de categorías visibles con los filtros actuales. Incluye categorías creadas por ti y categorías predefinidas del sistema.",
        },
        {
          key: "active",
          icon: Power,
          value: String(activeCount),
          label: "activas",
          color: COLORS.income,
          helpTitle: "Categorías activas",
          helpDescription: "Categorías disponibles para clasificar movimientos, suscripciones, presupuestos u otros registros.",
        },
        {
          key: "system",
          icon: Layers3,
          value: String(systemCount),
          label: "sistema",
          color: COLORS.info,
          helpTitle: "Categorías del sistema",
          helpDescription: "Categorías predefinidas que vienen con la app. Sirven como base inicial y no se editan igual que las categorías creadas por ti.",
        },
      ]}
    />
  );
}
