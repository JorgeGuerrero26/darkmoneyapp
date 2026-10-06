import { Tag, Trash2 } from "lucide-react-native";
import { ResourceCard, ResourceCardIcon } from "../../../components/ui/ResourceCard";
import { SwipeActionRow } from "../../../components/ui/SwipeActionRow";
import { COLORS } from "../../../constants/theme";
import type { SpendType } from "../../../services/queries/spend-types";

type Props = { item: SpendType; categoryCount: number; onPress: () => void; onDelete: () => void };
export function SpendTypeSwipeRow({ item, categoryCount, onPress, onDelete }: Props) {
  return <SwipeActionRow revealWidth={88} borderRadius={0} rightAction={{
    label: "Eliminar", icon: Trash2, onPress: onDelete, color: COLORS.danger,
    backgroundColor: COLORS.danger + "30", haptic: "warning",
  }}>{({ close, isOpen }) => <ResourceCard variant="row" title={item.name}
    subtitle={`${categoryCount} ${categoryCount === 1 ? "categoría" : "categorías"}${item.isActive ? "" : " · Inactivo"}`}
    archived={!item.isActive} leading={<ResourceCardIcon icon={Tag} color={COLORS.storm} />}
    onPress={() => { if (isOpen()) close(); else onPress(); }} />}</SwipeActionRow>;
}
