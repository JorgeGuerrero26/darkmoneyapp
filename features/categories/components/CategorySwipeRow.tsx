import { Power, Trash2 } from "lucide-react-native";

import { CategoryCard } from "../../../components/domain/CategoryCard";
import { SwipeActionRow } from "../../../components/ui/SwipeActionRow";
import { COLORS } from "../../../constants/theme";
import type { CategoryOverview } from "../../../types/domain";

type Props = {
  category: CategoryOverview;
  kindLabel: string;
  canDelete: boolean;
  toggleDisabled?: boolean;
  onPress: () => void;
  onToggle: () => void;
  onDelete: () => void;
  onLongPress?: () => void;
  selected?: boolean;
  selectMode?: boolean;
};

export function CategorySwipeRow({
  category,
  kindLabel,
  canDelete,
  toggleDisabled,
  onPress,
  onToggle,
  onDelete,
  onLongPress,
  selected = false,
  selectMode = false,
}: Props) {
  const canToggle = !category.isSystem && !toggleDisabled;

  if (selectMode) {
    return (
      <CategoryCard
        category={category}
        kindLabel={kindLabel}
        onPress={onPress}
        onLongPress={onLongPress}
        selected={selected}
      />
    );
  }

  return (
    <SwipeActionRow
      revealWidth={92}
      borderRadius={0}
      leftAction={canToggle ? {
        label: category.isActive ? "Desactivar" : "Activar",
        icon: Power,
        onPress: onToggle,
        color: category.isActive ? COLORS.warning : COLORS.income,
        backgroundColor: (category.isActive ? COLORS.warning : COLORS.income) + "26",
      } : null}
      rightAction={canDelete ? {
        label: "Eliminar",
        icon: Trash2,
        onPress: onDelete,
        color: COLORS.danger,
        backgroundColor: COLORS.danger + "28",
        haptic: "warning",
      } : null}
    >
      {({ close, isOpen }) => (
        <CategoryCard
          category={category}
          kindLabel={kindLabel}
          onPress={() => {
            if (isOpen()) {
              close();
              return;
            }
            onPress();
          }}
          onLongPress={onLongPress}
        />
      )}
    </SwipeActionRow>
  );
}
