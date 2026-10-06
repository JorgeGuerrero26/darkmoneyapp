import { StyleSheet, Text, View } from "react-native";
import { CategoryGlyph } from "../../../components/domain/CategoryGlyph";
import { DetailFieldRow } from "../../../components/ui/DetailFieldRow";
import { COLORS, FONT_FAMILY, FONT_SIZE, RADIUS, SPACING, SURFACE } from "../../../constants/theme";
import type { SpendType } from "../../../services/queries/spend-types";

export function SpendTypeDetailContent({ item, categoryCount }: { item: SpendType; categoryCount: number | null }) {
  return <>
    <View style={styles.hero}>
      <CategoryGlyph icon={item.icon} color={item.color || COLORS.fog} size={30} />
      <Text style={styles.name}>{item.name}</Text>
      <Text style={styles.caption}>{item.isActive ? "Activo" : "Inactivo"}</Text>
    </View>
    <View>
      <DetailFieldRow label="Nombre" value={item.name} />
      <DetailFieldRow label="Estado" value={item.isActive ? "Activo" : "Inactivo"} />
      <DetailFieldRow label="Categorías asignadas" value={categoryCount === null ? "Sin datos" : String(categoryCount)} muted={categoryCount === null} />
      <DetailFieldRow label="Orden" value={String(item.sortOrder)} />
      <DetailFieldRow label="Color" value={item.color ? "Personalizado" : "Sin color"}
        valueAdornment={item.color ? <View style={[styles.swatch, { backgroundColor: item.color }]} /> : undefined} />
      <DetailFieldRow label="Ícono" value={item.icon ? "Personalizado" : "Predeterminado"}
        valueAdornment={<CategoryGlyph icon={item.icon} color={COLORS.storm} size={20} />} last />
    </View>
  </>;
}

const styles = StyleSheet.create({
  hero: { alignItems: "center", gap: SPACING.sm, paddingVertical: SPACING.lg, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: SURFACE.separator },
  name: { fontFamily: FONT_FAMILY.heading, fontSize: FONT_SIZE.xxl, color: COLORS.ink, textAlign: "center" },
  caption: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.sm, color: COLORS.storm },
  swatch: { width: SPACING.md, height: SPACING.md, borderRadius: RADIUS.sm },
});
