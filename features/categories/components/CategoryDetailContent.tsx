import { StyleSheet, Text, View } from "react-native";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { CategoryGlyph } from "../../../components/domain/CategoryGlyph";
import { DetailFieldRow } from "../../../components/ui/DetailFieldRow";
import { COLORS, FONT_FAMILY, FONT_SIZE, SPACING, SURFACE } from "../../../constants/theme";
import type { CategoryOverview } from "../../../types/domain";
import { CATEGORY_KIND_LABELS } from "../lib/categoryFilters";

export function CategoryDetailContent({ category, spendTypeName }: { category: CategoryOverview; spendTypeName?: string }) {
  const date = category.lastActivityAt ? new Date(category.lastActivityAt) : null;
  return <>
    <View style={styles.hero}>
      <CategoryGlyph icon={category.icon || "tag"} color={category.color || COLORS.fog} size={30} />
      <Text style={styles.name}>{category.name}</Text>
      <Text style={styles.caption}>{CATEGORY_KIND_LABELS[category.kind]} · {category.isActive ? "Activa" : "Inactiva"}</Text>
    </View>
    <View>
      <DetailFieldRow label="Nombre" value={category.name} />
      <DetailFieldRow label="Tipo" value={CATEGORY_KIND_LABELS[category.kind]} />
      <DetailFieldRow label="Estado" value={category.isActive ? "Activa" : "Inactiva"} />
      <DetailFieldRow label="Origen" value={category.isSystem ? "Del sistema" : "Personalizada"} />
      <DetailFieldRow label="Categoría principal" value={category.parentName || "Ninguna"} muted={!category.parentName} />
      {category.kind !== "income" ? <DetailFieldRow label="Tipo de gasto" value={spendTypeName || "Sin asignar"} muted={!spendTypeName} /> : null}
      <DetailFieldRow label="Orden" value={String(category.sortOrder)} />
      <DetailFieldRow label="Apariencia" value={category.color || category.icon ? "Personalizada" : "Predeterminada"}
        valueAdornment={<CategoryGlyph icon={category.icon || "tag"} color={category.color || COLORS.fog} size={18} />} />
      <DetailFieldRow label="Fijada" value={category.isPinned ? "Sí" : "No"} />
      <DetailFieldRow label="Movimientos" value={String(category.movementCount)} />
      <DetailFieldRow label="Suscripciones" value={String(category.subscriptionCount)} />
      <DetailFieldRow label="Última actividad" value={date && !Number.isNaN(date.getTime()) ? format(date, "d MMM yyyy", { locale: es }) : "Sin actividad"} muted={!date} last />
    </View>
  </>;
}

const styles = StyleSheet.create({
  hero: { alignItems: "center", gap: SPACING.sm, paddingVertical: SPACING.lg, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: SURFACE.separator },
  name: { fontFamily: FONT_FAMILY.heading, fontSize: FONT_SIZE.xxl, color: COLORS.ink, textAlign: "center" },
  caption: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.sm, color: COLORS.storm },
});
