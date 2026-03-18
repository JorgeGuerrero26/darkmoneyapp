import { Tabs } from "expo-router";
import { Text, View } from "react-native";

import { COLORS } from "../../constants/theme";
import { useNotificationsQuery } from "../../services/queries/workspace-data";
import { useAuth } from "../../lib/auth-context";
import { Badge } from "../../components/ui/Badge";

function TabIcon({ emoji, label }: { emoji: string; label: string }) {
  return (
    <View style={{ alignItems: "center", gap: 1 }}>
      <Text style={{ fontSize: 22 }}>{emoji}</Text>
    </View>
  );
}

function MoreTabIcon({ emoji }: { emoji: string }) {
  const { user } = useAuth();
  const { data: notifications } = useNotificationsQuery(user?.id ?? null);
  const unreadCount = (notifications ?? []).filter((n) => n.status !== "read").length;

  return (
    <View style={{ alignItems: "center" }}>
      <View>
        <Text style={{ fontSize: 22 }}>{emoji}</Text>
        {unreadCount > 0 ? (
          <View style={{ position: "absolute", top: -4, right: -8 }}>
            <Badge count={unreadCount} />
          </View>
        ) : null}
      </View>
    </View>
  );
}

export default function AppLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: COLORS.tabBar,
          borderTopColor: COLORS.border,
          borderTopWidth: 1,
        },
        tabBarActiveTintColor: COLORS.tabActive,
        tabBarInactiveTintColor: COLORS.tabInactive,
        tabBarShowLabel: true,
        tabBarLabelStyle: { fontSize: 11, fontWeight: "500" },
      }}
    >
      <Tabs.Screen
        name="dashboard"
        options={{
          title: "Inicio",
          tabBarIcon: ({ focused }) => (
            <TabIcon emoji="🏠" label="Inicio" />
          ),
        }}
      />
      <Tabs.Screen
        name="movements"
        options={{
          title: "Movimientos",
          tabBarIcon: () => <TabIcon emoji="↕" label="Movimientos" />,
        }}
      />
      <Tabs.Screen
        name="accounts"
        options={{
          title: "Cuentas",
          tabBarIcon: () => <TabIcon emoji="💳" label="Cuentas" />,
        }}
      />
      <Tabs.Screen
        name="budgets"
        options={{
          title: "Presupuestos",
          tabBarIcon: () => <TabIcon emoji="📊" label="Presupuestos" />,
        }}
      />
      <Tabs.Screen
        name="more"
        options={{
          title: "Más",
          tabBarIcon: () => <MoreTabIcon emoji="⋯" />,
        }}
      />
    </Tabs>
  );
}
