import { memo } from "react";
import { StyleSheet, View } from "react-native";

import { ResourceCard } from "../ui/ResourceCard";
import { CategoryGlyph } from "./CategoryGlyph";
import { COLORS, RADIUS, SURFACE } from "../../constants/theme";
import type { CategoryOverview } from "../../types/domain";

type Props = {
  category: CategoryOverview;
  kindLabel: string;
  onPress: () => void;
  onLongPress?: () => void;
  selected?: boolean;
};

function CategoryCardBase({
  category,
  kindLabel,
  onPress,
  onLongPress,
  selected = false,
}: Props) {
  return (
    <ResourceCard
      pinned={category.isPinned}
      variant="row"
      title={category.name}
      subtitle={`${category.parentName ?? kindLabel} · ${category.movementCount} mov.${!category.isActive ? " · Inactiva" : ""}`}
      archived={!category.isActive}
      disabled={false}
      selected={selected}
      onPress={onPress}
      onLongPress={onLongPress}
      /* Chrome neutro.
         El ícono y el punto iban del color de la categoría, y la etiqueta "Gasto" del mismo
         verde que en esta app significa dinero entrando: una categoría de GASTO pintada como un
         ingreso. Es la contradicción más directa posible de la regla de color.
         El color que elige el usuario no se pierde: sigue siendo el suyo en los gráficos, que es
         donde el color distingue datos. Aquí las categorías se distinguen por su nombre. */
      leading={
        <View style={styles.iconWrap}>
          {category.icon ? <CategoryGlyph icon={category.icon} color={COLORS.storm} size={20} /> : null}
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
    backgroundColor: SURFACE.card,
    alignItems: "center",
    justifyContent: "center",
  },

});

/** Memoizado: los cards se renderizan en listas largas; evita re-renders cuando las props son estables. */
export const CategoryCard = memo(CategoryCardBase);
