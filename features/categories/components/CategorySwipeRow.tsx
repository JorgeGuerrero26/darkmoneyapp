import { Power, Trash2 } from "lucide-react-native";

import { CategoryCard } from "../../../components/domain/CategoryCard";
import { SwipeActionRow } from "../../../components/ui/SwipeActionRow";
import { COLORS, RADIUS } from "../../../constants/theme";
import type { CategoryOverview } from "../../../types/domain";

type Props = {
  category: CategoryOverview;
  color: string;
  kindLabel: string;
  canDelete: boolean;
  toggleDisabled?: boolean;
  onPress: () => void;
  onToggle: () => void;
  onAnalytics: () => void;
  onDelete: () => void;
};

export function CategorySwipeRow({
  category,
  color,
  kindLabel,
  canDelete,
  toggleDisabled,
  onPress,
  onToggle,
  onAnalytics,
  onDelete,
}: Props) {
  const canToggle = !category.isSystem && !toggleDisabled;

  return (
    <SwipeActionRow
      revealWidth={92}
      borderRadius={RADIUS.xl}
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
          color={color}
          kindLabel={kindLabel}
          onPress={() => {
            if (isOpen()) {
              close();
              return;
            }
            onPress();
          }}
          onAnalytics={onAnalytics}
        />
      )}
    </SwipeActionRow>
  );
}
