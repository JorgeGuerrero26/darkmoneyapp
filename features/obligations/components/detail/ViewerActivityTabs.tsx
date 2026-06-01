import {
  Text,
  TouchableOpacity,
  View,
  type StyleProp,
  type ViewStyle,
  type TextStyle,
} from "react-native";

export type ViewerActivityTabId = "history" | "requests";

export type ViewerActivityTabsStyles = {
  section: StyleProp<ViewStyle>;
  sectionTitle: StyleProp<TextStyle>;
  viewerTabsRow: StyleProp<ViewStyle>;
  viewerTabChip: StyleProp<ViewStyle>;
  viewerTabChipActive: StyleProp<ViewStyle>;
  viewerTabChipText: StyleProp<TextStyle>;
  viewerTabChipTextActive: StyleProp<TextStyle>;
};

type Props = {
  styles: ViewerActivityTabsStyles;
  activeTab: ViewerActivityTabId;
  historyCount: number;
  requestsCount: number;
  onChangeTab: (tab: ViewerActivityTabId) => void;
};

export function ViewerActivityTabs({
  styles,
  activeTab,
  historyCount,
  requestsCount,
  onChangeTab,
}: Props) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Actividad</Text>
      <View style={styles.viewerTabsRow}>
        <TouchableOpacity
          style={[
            styles.viewerTabChip,
            activeTab === "history" && styles.viewerTabChipActive,
          ]}
          onPress={() => onChangeTab("history")}
          activeOpacity={0.86}
        >
          <Text
            style={[
              styles.viewerTabChipText,
              activeTab === "history" && styles.viewerTabChipTextActive,
            ]}
          >
            Historial ({historyCount})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.viewerTabChip,
            activeTab === "requests" && styles.viewerTabChipActive,
          ]}
          onPress={() => onChangeTab("requests")}
          activeOpacity={0.86}
        >
          <Text
            style={[
              styles.viewerTabChipText,
              activeTab === "requests" && styles.viewerTabChipTextActive,
            ]}
          >
            Mis solicitudes ({requestsCount})
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
