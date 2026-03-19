import { Tabs } from "expo-router";
import { View } from "react-native";
import { Home, ArrowLeftRight, WalletCards, BarChart3, LayoutGrid } from "lucide-react-native";

import { COLORS, FONT_FAMILY, GLASS } from "../../constants/theme";
import { useNotificationsQuery } from "../../services/queries/workspace-data";
import { useAuth } from "../../lib/auth-context";
import { Badge } from "../../components/ui/Badge";

function TabIcon({ icon, color, focused }: { icon: React.ReactNode; color: string; focused: boolean }) {
  return (
    <View style={{ alignItems: "center", gap: 4 }}>
      {icon}
      {focused ? (
        <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: COLORS.pine }} />
      ) : (
        <View style={{ width: 4, height: 4 }} />
      )}
    </View>
  );
}

function MoreTabIcon({ color, focused }: { color: string; focused: boolean }) {
  const { user } = useAuth();
  const { data: notifications } = useNotificationsQuery(user?.id ?? null);
  const unreadCount = (notifications ?? []).filter((n) => n.status !== "read").length;

  return (
    <TabIcon
      focused={focused}
      color={color}
      icon={
        <View>
          <LayoutGrid size={22} color={color} />
          {unreadCount > 0 ? (
            <View style={{ position: "absolute", top: -4, right: -8 }}>
              <Badge count={unreadCount} />
            </View>
          ) : null}
        </View>
      }
    />
  );
}

export default function AppLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: COLORS.shell,
          borderTopColor: GLASS.tabBorder,
          borderTopWidth: 0.5,
          height: 60,
          paddingBottom: 8,
          paddingTop: 8,
        },
        tabBarActiveTintColor: COLORS.pine,
        tabBarInactiveTintColor: COLORS.storm,
        tabBarShowLabel: false,
      }}
    >
      <Tabs.Screen
        name="dashboard"
        options={{
          tabBarIcon: ({ color, focused }) => (
            <TabIcon focused={focused} color={color} icon={<Home size={22} color={color} />} />
          ),
        }}
      />
      <Tabs.Screen
        name="movements"
        options={{
          tabBarIcon: ({ color, focused }) => (
            <TabIcon focused={focused} color={color} icon={<ArrowLeftRight size={22} color={color} />} />
          ),
        }}
      />
      <Tabs.Screen
        name="accounts"
        options={{
          tabBarIcon: ({ color, focused }) => (
            <TabIcon focused={focused} color={color} icon={<WalletCards size={22} color={color} />} />
          ),
        }}
      />
      <Tabs.Screen
        name="budgets"
        options={{
          tabBarIcon: ({ color, focused }) => (
            <TabIcon focused={focused} color={color} icon={<BarChart3 size={22} color={color} />} />
          ),
        }}
      />
      <Tabs.Screen
        name="more"
        options={{
          tabBarIcon: ({ color, focused }) => <MoreTabIcon color={color} focused={focused} />,
        }}
      />
    </Tabs>
  );
}
