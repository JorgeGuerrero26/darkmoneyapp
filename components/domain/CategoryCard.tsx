import { StyleSheet, Text, View } from "react-native";
import { BarChart3 } from "lucide-react-native";
import { format } from "date-fns";
import { es } from "date-fns/locale";

import {
  ResourceCard,
  ResourceCardBadge,
  ResourceCardMetaText,
} from "../ui/ResourceCard";
import { CategoryGlyph } from "./CategoryGlyph";
import { COLORS, FONT_FAMILY, FONT_SIZE, RADIUS, SPACING } from "../../constants/theme";
import type { CategoryOverview } from "../../types/domain";

type Props = {
  category: CategoryOverview;
  color: string;
  kindLabel: string;
  onPress: () => void;
  onAnalytics: () => void;
};

function formatIsoLocal(iso: string | null | undefined): string {
  if (!iso) return "Sin actividad";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return format(date, "d MMM yyyy", { locale: es });
}

export function CategoryCard({
  category,
  color,
  kindLabel,
  onPress,
  onAnalytics,
}: Props) {
  return (
    <ResourceCard
      title={category.name}
      subtitle={category.parentName ? `${kindLabel} · ${category.parentName}` : kindLabel}
      archived={!category.isActive}
      disabled={false}
      onPress={onPress}
      leading={
        <View style={[styles.iconWrap, { backgroundColor: color + "18" }]}>
          <View style={[styles.colorDot, { backgroundColor: color }]} />
          {category.icon ? <CategoryGlyph icon={category.icon} color={color} size={20} /> : null}
        </View>
      }
      actions={[{
        key: "analytics",
        icon: BarChart3,
        onPress: onAnalytics,
        accessibilityLabel: "Ver análisis de la categoría",
      }]}
      meta={
        <>
          <ResourceCardBadge label={kindLabel} color={color} />
          {category.isSystem ? <ResourceCardBadge label="Sistema" color={COLORS.info} /> : null}
          {!category.isActive ? <ResourceCardBadge label="Inactiva" color={COLORS.warning} /> : null}
          <ResourceCardMetaText>{category.movementCount} mov. · {category.subscriptionCount} suscr.</ResourceCardMetaText>
        </>
      }
      footer={
        <View style={styles.footer}>
          <ResourceCardMetaText>Última act.: {formatIsoLocal(category.lastActivityAt)}</ResourceCardMetaText>
          <Text style={styles.origin}>{category.isSystem ? "Predefinida" : "Creada por ti"}</Text>
        </View>
      }
    />
  );
}

const styles = StyleSheet.create({
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: RADIUS.lg,
    alignItems: "center",
    justifyContent: "center",
  },
  colorDot: {
    position: "absolute",
    top: 7,
    right: 7,
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: SPACING.sm,
  },
  origin: {
    flexShrink: 0,
    fontSize: FONT_SIZE.xs,
    fontFamily: FONT_FAMILY.body,
    color: COLORS.textDisabled,
  },
});
