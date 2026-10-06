import { BarChart3, Pencil } from "lucide-react-native";
import { View } from "react-native";
import { CategoryGlyph } from "../../../components/domain/CategoryGlyph";
import { COLORS, RADIUS, SPACING } from "../../../constants/theme";
import { ResourceDetailSheet } from "../../../components/ui/ResourceDetailSheet";
import type { CategoryOverview } from "../../../types/domain";
import { CATEGORY_KIND_LABELS } from "../lib/categoryFilters";

type Props = {
  category: CategoryOverview | null; onClose: () => void; onEdit: () => void;
  onAnalytics: () => void; onToggle: () => void; onPin: () => void; onDelete: () => void;
  canDelete: boolean; togglePending: boolean; pinPending: boolean;
  spendTypeName?: string;
};

export function CategoryDetailSheet({ category, onClose, onEdit, onAnalytics, onToggle, onPin, onDelete, canDelete, togglePending, pinPending, spendTypeName }: Props) {
  if (!category) return null;
  return <ResourceDetailSheet visible onClose={onClose} title="Categoría" name={category.name}
    caption={`${CATEGORY_KIND_LABELS[category.kind]} · ${category.isActive ? "Activa" : "Inactiva"}`}
    fields={[
      { label: "Tipo", value: CATEGORY_KIND_LABELS[category.kind] },
      { label: "Estado", value: category.isActive ? "Activa" : "Inactiva" },
      { label: "Origen", value: category.isSystem ? "Del sistema" : "Personalizada" },
      { label: "Categoría principal", value: category.parentName ?? "Sin categoría principal", muted: !category.parentName },
      ...(category.kind !== "income" ? [{ label: "Tipo de gasto", value: spendTypeName ?? "Sin asignar", muted: !spendTypeName }] : []),
      { label: "Orden", value: String(category.sortOrder) },
      { label: "Color", value: category.color ? "Personalizado" : "Predeterminado", valueAdornment: category.color ? <View style={{ width: SPACING.md, height: SPACING.md, borderRadius: RADIUS.sm, backgroundColor: category.color }} /> : undefined },
      { label: "Ícono", value: category.icon ? "Personalizado" : "Predeterminado", valueAdornment: <CategoryGlyph icon={category.icon} color={COLORS.storm} size={20} /> },
      { label: "Movimientos", value: String(category.movementCount) },
      { label: "Suscripciones", value: String(category.subscriptionCount) },
      { label: "Fijada", value: category.isPinned ? "Sí" : "No" },
    ]}
    secondary={category.isSystem ? undefined : { label: "Editar", icon: Pencil, accessibilityLabel: "Editar", onPress: onEdit }}
    primary={{ label: "Ver analítica", icon: BarChart3, accessibilityLabel: "Ver analítica", onPress: onAnalytics }}
    actions={[
      { key: "pin", label: category.isPinned ? "Desfijar" : "Fijar", onPress: onPin, disabled: pinPending },
      ...(!category.isSystem ? [{ key: "state", label: category.isActive ? "Desactivar" : "Activar", onPress: onToggle, disabled: togglePending }] : []),
      ...(canDelete ? [{ key: "delete", label: "Eliminar", onPress: onDelete }] : []),
    ]} />;
}
