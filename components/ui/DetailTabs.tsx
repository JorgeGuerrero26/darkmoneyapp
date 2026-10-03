import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { COLORS, FONT_FAMILY, FONT_SIZE, SPACING, SURFACE } from "../../constants/theme";

type Tab<T extends string> = { id: T; label: string };

type Props<T extends string> = {
  tabs: Tab<T>[];
  activeTab: T;
  onChange: (tab: T) => void;
};

/** Pestañas de los detalles de recursos, con la misma línea activa en todos los módulos. */
export function DetailTabs<T extends string>({ tabs, activeTab, onChange }: Props<T>) {
  return (
    <View style={styles.tabs} accessibilityRole="tablist">
      {tabs.map((tab) => (
        <TouchableOpacity
          key={tab.id}
          style={[styles.tab, activeTab === tab.id && styles.activeTab]}
          onPress={() => onChange(tab.id)}
          accessibilityRole="tab"
          accessibilityState={{ selected: activeTab === tab.id }}
        >
          <Text style={[styles.label, activeTab === tab.id && styles.activeLabel]} numberOfLines={1}>
            {tab.label}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  tabs: { flexDirection: "row", borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: SURFACE.separator, gap: SPACING.sm },
  tab: { flex: 1, minHeight: 48, alignItems: "center", justifyContent: "center", borderBottomWidth: 2, borderBottomColor: "transparent" },
  activeTab: { borderBottomColor: COLORS.ink },
  label: { fontFamily: FONT_FAMILY.bodyMedium, fontSize: FONT_SIZE.sm, color: COLORS.storm },
  activeLabel: { fontFamily: FONT_FAMILY.bodySemibold, color: COLORS.ink },
});
