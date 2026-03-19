import { Tabs } from "expo-router";
import { View } from "react-native";
import { Home, ArrowLeftRight, WalletCards, BarChart3, LayoutGrid } from "lucide-react-native";

import { COLORS } from "../../constants/theme";
import { useNotificationsQuery } from "../../services/queries/workspace-data";
import { useAuth } from "../../lib/auth-context";
import { Badge } from "../../components/ui/Badge";

function MoreTabIcon({ color }: { color: string }) {
  const { user } = useAuth();
  const { data: notifications } = useNotificationsQuery(user?.id ?? null);
  const unreadCount = (notifications ?? []).filter((n) => n.status !== "read").length;

  return (
    <View style={{ alignItems: "center" }}>
      <View>
        <LayoutGrid size={22} color={color} />
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
          tabBarIcon: ({ color }) => <Home size={22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="movements"
        options={{
          title: "Movimientos",
          tabBarIcon: ({ color }) => <ArrowLeftRight size={22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="accounts"
        options={{
          title: "Cuentas",
          tabBarIcon: ({ color }) => <WalletCards size={22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="budgets"
        options={{
          title: "Presupuestos",
          tabBarIcon: ({ color }) => <BarChart3 size={22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="more"
        options={{
          title: "Más",
          tabBarIcon: ({ color }) => <MoreTabIcon color={color} />,
        }}
      />
    </Tabs>
  );
}
