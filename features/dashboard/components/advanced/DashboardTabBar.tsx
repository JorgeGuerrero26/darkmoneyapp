import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { COLORS, FONT_FAMILY, SPACING, SURFACE } from "../../../../constants/theme";

export type AdvancedTab = "Resumen" | "Patrones" | "Flujo" | "Historial" | "Salud";

export const ADVANCED_TABS: { id: AdvancedTab; label: string }[] = [
  { id: "Resumen", label: "Resumen" },
  { id: "Patrones", label: "Patrones" },
  { id: "Flujo", label: "Flujo" },
  { id: "Historial", label: "Historial" },
  { id: "Salud", label: "Salud" },
];

export type TabIndicator = { tab: AdvancedTab; count?: number; dot?: string };

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
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={tabBarStyles.row} style={tabBarStyles.container}>
      {ADVANCED_TABS.map((tab) => {
        const ind = indicators.find((i) => i.tab === tab.id);
        return (
          <Pressable
            key={tab.id}
            onPress={() => onTabChange(tab.id)}
            style={[tabBarStyles.chip, activeTab === tab.id && tabBarStyles.chipActive]}
          >
            <Text style={[tabBarStyles.chipText, activeTab === tab.id && tabBarStyles.chipTextActive]}>{tab.label}</Text>
            {ind?.count != null && ind.count > 0 ? (
              <View style={tabBarStyles.badge}>
                <Text style={tabBarStyles.badgeText}>{ind.count > 99 ? "99+" : ind.count}</Text>
              </View>
            ) : ind?.dot ? (
              <View style={[tabBarStyles.dot, { backgroundColor: ind.dot }]} />
            ) : null}
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const tabBarStyles = StyleSheet.create({
  container: { marginBottom: 4 },
  row: { paddingHorizontal: SPACING.md, gap: 8, paddingVertical: 6 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: SURFACE.separator,
    borderWidth: 1,
    borderColor: SURFACE.cardBorder,
    position: "relative",
  },
  chipActive: {
    backgroundColor: COLORS.successMuted,
    borderColor: COLORS.primary + "45",
  },
  chipText: {
    fontFamily: FONT_FAMILY.bodyMedium,
    fontSize: 13,
    color: COLORS.storm,
  },
  chipTextActive: {
    color: COLORS.primary,
    fontFamily: FONT_FAMILY.bodySemibold,
  },
  badge: {
    position: "absolute",
    top: -4,
    right: -6,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: COLORS.gold,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 3,
  },
  badgeText: {
    fontFamily: FONT_FAMILY.bodySemibold,
    fontSize: 9,
    color: COLORS.textInverse,
  },
  dot: {
    position: "absolute",
    top: -2,
    right: -2,
    width: 7,
    height: 7,
    borderRadius: 4,
  },
});
