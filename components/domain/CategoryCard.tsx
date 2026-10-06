import { memo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { ResourceCard, ResourceCardBadge, ResourceCardMetaText } from "../ui/ResourceCard";
import { CategoryGlyph } from "./CategoryGlyph";
import { COLORS, FONT_FAMILY, FONT_SIZE, RADIUS } from "../../constants/theme";
import type { CategoryOverview } from "../../types/domain";

type Props = { category: CategoryOverview; kindLabel: string; onPress: () => void; onLongPress?: () => void; selected?: boolean };
export const CategoryCard = memo(function CategoryCard({ category, kindLabel, onPress, onLongPress, selected = false }: Props) {
  const color = category.color || COLORS.fog;
  return <ResourceCard variant="row" title={category.name} pinned={category.isPinned}
    archived={!category.isActive} selected={selected} onPress={onPress} onLongPress={onLongPress}
    leading={<View style={[styles.icon, { backgroundColor: color + "18" }]}>
      <CategoryGlyph icon={category.icon || "tag"} color={color} size={20} />
    </View>}
    meta={<>
      <ResourceCardBadge label={kindLabel} color={color} />
      {category.parentName ? <ResourceCardMetaText>{category.parentName}</ResourceCardMetaText> : null}
      {!category.isActive ? <ResourceCardMetaText>Inactiva</ResourceCardMetaText> : null}
    </>}
    trailing={<View style={styles.usage}>
      <Text style={styles.count}>{category.movementCount}</Text>
      <Text style={styles.caption}>{category.movementCount === 1 ? "movimiento" : "movimientos"}</Text>
    </View>} />;
});
const styles = StyleSheet.create({
  icon: { width: 44, height: 44, borderRadius: RADIUS.lg, alignItems: "center", justifyContent: "center" },
  usage: { alignItems: "flex-end" },
  count: { fontFamily: FONT_FAMILY.heading, fontSize: FONT_SIZE.lg, color: COLORS.ink },
  caption: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.xs, color: COLORS.storm },
});
