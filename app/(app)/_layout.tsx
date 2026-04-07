import { Tabs } from "expo-router";
import { memo } from "react";
import { StyleSheet, View } from "react-native";
import { Home, ArrowLeftRight, WalletCards, Scale, LayoutGrid } from "lucide-react-native";

import { COLORS, FONT_FAMILY, GLASS, RADIUS, SPACING } from "../../constants/theme";
import { useNotificationsQuery, usePendingObligationShareInvitesQuery } from "../../services/queries/workspace-data";
import { useAuth } from "../../lib/auth-context";
import { Badge } from "../../components/ui/Badge";
import { SafeBlurView } from "../../components/ui/SafeBlurView";

function TabBarBackground() {
  return (
    <View style={StyleSheet.absoluteFillObject}>
      <SafeBlurView intensity={32} tint="dark" style={StyleSheet.absoluteFillObject} />
      {/* Dark overlay */}
      <View style={[StyleSheet.absoluteFillObject, { backgroundColor: "rgba(7,11,20,0.82)" }]} />
      {/* Top specular line */}
      <View style={styles.topBorder} />
    </View>
  );
}

function TabIcon({ icon, color, focused }: { icon: React.ReactNode; color: string; focused: boolean }) {
  return (
    <View style={styles.tabIconWrap}>
      <View style={[styles.tabIconPill, focused && styles.tabIconPillActive]}>
        {icon}
      </View>
    </View>
  );
}

const MoreTabIcon = memo(function MoreTabIcon({ color, focused }: { color: string; focused: boolean }) {
  const { user, profile } = useAuth();
  const { data: notifications } = useNotificationsQuery(user?.id ?? null);
  const { data: pendingInvites = [] } = usePendingObligationShareInvitesQuery(user?.id, profile?.email);
  const unreadCount = (notifications ?? []).filter((n) => n.status !== "read").length;
  const badgeCount = unreadCount + pendingInvites.length;

  return (
    <TabIcon
      focused={focused}
      color={color}
      icon={
        <View>
          <LayoutGrid size={22} color={color} />
          {badgeCount > 0 ? (
            <View style={styles.badgeAnchor}>
              <Badge count={badgeCount} />
            </View>
          ) : null}
        </View>
      }
    />
  );
});

export default function AppLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        freezeOnBlur: true,
        tabBarStyle: {
          backgroundColor: "transparent",
          borderTopWidth: 0,
          elevation: 0,
          height: 64,
          paddingBottom: 8,
          paddingTop: 6,
        },
        tabBarBackground: TabBarBackground,
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
        name="obligations"
        options={{
          tabBarIcon: ({ color, focused }) => (
            <TabIcon focused={focused} color={color} icon={<Scale size={22} color={color} />} />
          ),
        }}
      />
      <Tabs.Screen
        name="more"
        options={{
          tabBarIcon: ({ color, focused }) => <MoreTabIcon color={color} focused={focused} />,
        }}
      />
      {/* Screens inside (app) that should NOT appear in the tab bar */}
      <Tabs.Screen name="budgets" options={{ href: null }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  topBorder: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 0.75,
    backgroundColor: "rgba(255,255,255,0.14)",
  },
  tabIconWrap: {
    alignItems: "center",
    justifyContent: "center",
  },
  tabIconPill: {
    width: 48,
    height: 36,
    borderRadius: RADIUS.lg,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "transparent",
  },
  badgeAnchor: {
    position: "absolute",
    top: -4,
    right: -8,
  },
  tabIconPillActive: {
    backgroundColor: COLORS.pine + "1A",   // 10% mint
    borderWidth: 1,
    borderColor: COLORS.pine + "33",       // 20% mint border
    shadowColor: COLORS.pine,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.30,
    shadowRadius: 8,
    elevation: 4,
  },
});
