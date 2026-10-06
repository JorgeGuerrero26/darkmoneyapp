import { List, Pencil } from "lucide-react-native";
import { View } from "react-native";
import { CategoryGlyph } from "../../../components/domain/CategoryGlyph";
import { COLORS, RADIUS, SPACING } from "../../../constants/theme";
import { ResourceDetailSheet } from "../../../components/ui/ResourceDetailSheet";
import type { SpendType } from "../../../services/queries/spend-types";

type Props = {
  item: SpendType | null; categoryCount: number; onClose: () => void; onEdit: () => void;
  onClassify: () => void; onDelete: () => void; onToggle: () => void; togglePending: boolean;
};
export function SpendTypeDetailSheet({ item, categoryCount, onClose, onEdit, onClassify, onDelete, onToggle, togglePending }: Props) {
  if (!item) return null;
  return <ResourceDetailSheet visible onClose={onClose} title="Tipo de gasto" name={item.name}
    caption={item.isActive ? "Activo" : "Inactivo"} fields={[
      { label: "Nombre", value: item.name },
      { label: "Estado", value: item.isActive ? "Activo" : "Inactivo" },
      { label: "Categorías asignadas", value: String(categoryCount) },
      { label: "Orden", value: String(item.sortOrder) },
      { label: "Color", value: item.color ? "Personalizado" : "Sin color", valueAdornment: item.color ? <View style={{ width: SPACING.md, height: SPACING.md, borderRadius: RADIUS.sm, backgroundColor: item.color }} /> : undefined },
      { label: "Ícono", value: item.icon ? "Personalizado" : "Predeterminado", valueAdornment: <CategoryGlyph icon={item.icon} color={COLORS.storm} size={20} /> },
    ]} secondary={{ label: "Editar", icon: Pencil, accessibilityLabel: "Editar", onPress: onEdit }}
    primary={{ label: "Clasificar", icon: List, accessibilityLabel: "Clasificar categorías", onPress: onClassify }} actions={[
      { key: "state", label: item.isActive ? "Desactivar" : "Activar", onPress: onToggle, disabled: togglePending },
      { key: "delete", label: "Eliminar", onPress: onDelete },
    ]} />;
}
