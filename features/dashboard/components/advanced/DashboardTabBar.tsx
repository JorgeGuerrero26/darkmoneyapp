import { Pressable, StyleSheet, Text, View } from "react-native";

import { COLORS, FONT_FAMILY, FONT_SIZE, RADIUS, SPACING, SURFACE } from "../../../../constants/theme";

export type AdvancedTab = "Resumen" | "Patrones" | "Flujo" | "Historial" | "Salud";

export const ADVANCED_TABS: { id: AdvancedTab; label: string }[] = [
  { id: "Resumen", label: "Resumen" },
  { id: "Patrones", label: "Patrones" },
  { id: "Flujo", label: "Flujo" },
  { id: "Historial", label: "Historial" },
  { id: "Salud", label: "Salud" },
];

export type TabIndicator = { tab: AdvancedTab; count?: number; dot?: string };

/**
 * Pestañas del dashboard avanzado: **subrayado, no cápsula rellena**.
 *
 * Cinco cápsulas rellenas competían por atención con las tarjetas que hay justo debajo, que es
 * donde están las cifras. Un subrayado marca la posición sin pedir turno.
 *
 * También deja de haber scroll horizontal: con cápsulas de 14pt de padding las cinco no cabían
 * en 393px y "Salud" quedaba cortada a medias, que es peor que no verla. Sin relleno caben
 * repartidas, así que la fila se distribuye y todas se ven enteras.
 */
export function DashboardTabBar({
  activeTab,
  onTabChange,
  indicators = [],
}: {
  activeTab: AdvancedTab;
  onTabChange: (tab: AdvancedTab) => void;
  indicators?: TabIndicator[];
}) {
  return (
    <View style={tabBarStyles.container}>
      {ADVANCED_TABS.map((tab) => {
        const isActive = activeTab === tab.id;
        const ind = indicators.find((i) => i.tab === tab.id);
        return (
          <Pressable
            key={tab.id}
            onPress={() => onTabChange(tab.id)}
            style={tabBarStyles.tab}
            accessibilityRole="tab"
            accessibilityState={{ selected: isActive }}
          >
            <View style={tabBarStyles.labelRow}>
              <Text
                style={[tabBarStyles.label, isActive && tabBarStyles.labelActive]}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.85}
                maxFontSizeMultiplier={1.1}
              >
                {tab.label}
              </Text>
              {ind?.count != null && ind.count > 0 ? (
                <View style={tabBarStyles.badge}>
                  <Text style={tabBarStyles.badgeText}>{ind.count > 99 ? "99+" : ind.count}</Text>
                </View>
              ) : ind?.dot ? (
                <View style={[tabBarStyles.dot, { backgroundColor: ind.dot }]} />
              ) : null}
            </View>
            {/* El subrayado ocupa sitio SIEMPRE, aunque sea transparente: si apareciera solo en
                la activa, las etiquetas darían un salto de 2px al cambiar de pestaña. */}
            <View style={[tabBarStyles.underline, isActive && tabBarStyles.underlineActive]} />
          </Pressable>
        );
      })}
    </View>
  );
}

const tabBarStyles = StyleSheet.create({
  container: {
    flexDirection: "row",
    paddingHorizontal: SPACING.xl,
    marginBottom: SPACING.sm,
  },
  tab: {
    flex: 1,
    alignItems: "center",
    gap: 6,
    paddingTop: SPACING.sm,
  },
  labelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  label: {
    fontFamily: FONT_FAMILY.bodyMedium,
    fontSize: FONT_SIZE.sm,
    color: COLORS.storm,
  },
  labelActive: {
    color: COLORS.ink,
    fontFamily: FONT_FAMILY.bodySemibold,
  },
  underline: {
    height: 2,
    alignSelf: "stretch",
    marginHorizontal: SPACING.sm,
    borderRadius: RADIUS.full,
    backgroundColor: "transparent",
  },
  underlineActive: {
    backgroundColor: COLORS.ink,
  },
  badge: {
    minWidth: 16,
    height: 16,
    borderRadius: RADIUS.full,
    // Sin amarillo: en el dashboard sale del sistema (Decisión C). Superficie neutra con la
    // cifra en tinta — el contador ya destaca por existir, no necesita color encima.
    backgroundColor: SURFACE.subtle,
    borderWidth: 1,
    borderColor: SURFACE.cardBorder,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 3,
  },
  badgeText: {
    fontFamily: FONT_FAMILY.bodySemibold,
    fontSize: 9,
    color: COLORS.fog,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: RADIUS.full,
  },
});
