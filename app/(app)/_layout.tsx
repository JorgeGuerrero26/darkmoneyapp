import { Tabs } from "expo-router";
import { memo, useEffect, useRef } from "react";
import { Animated, Platform, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Home, ArrowLeftRight, WalletCards, Scale, LayoutGrid } from "lucide-react-native";

import { COLORS, FONT_FAMILY, RADIUS, SPACING } from "../../constants/theme";
import { FLOATING_TAB_BAR_GAP, FLOATING_TAB_BAR_HEIGHT } from "../../constants/floating-tab-bar";
import { useNotificationsQuery } from "../../services/queries/workspace-data";
import { usePendingObligationShareInvitesQuery } from "../../services/queries/obligations";
import { useAuth } from "../../lib/auth-context";
import { Badge } from "../../components/ui/Badge";
import { SafeBlurView } from "../../components/ui/SafeBlurView";
import { useTabPersistence } from "../../hooks/useTabPersistence";
import { useNotificationDetectionRuntimeSync } from "../../hooks/useNotificationDetectionRuntimeSync";
import { useNotificationDetectionForegroundReconcile } from "../../hooks/useNotificationDetectionForegroundReconcile";

function TabBarBackground() {
  const insets = useSafeAreaInsets();

  // ANDROID: se mantiene tal cual (el usuario validó ese look). SafeBlurView no difumina en
  // Android, así que allá el velo opaco ES el fondo y ocupa todo el ancho.
  if (Platform.OS !== "ios") {
    return (
      <View style={StyleSheet.absoluteFillObject}>
        <SafeBlurView intensity={32} tint="dark" style={StyleSheet.absoluteFillObject} />
        <View style={[StyleSheet.absoluteFillObject, { backgroundColor: "rgba(7,11,20,0.82)" }]} />
        <View style={styles.topBorder} />
      </View>
    );
  }

  // iOS: la barra YA es la píldora flotante (tabBarStyle absolute), así que el fondo solo
  // tiene que rellenarla y recortar el blur a sus esquinas. El velo va tenue (antes 0.82
  // tapaba el blur y la barra se veía plana).
  return (
    <View style={styles.iosPillClip}>
      <SafeBlurView intensity={80} tint="systemChromeMaterialDark" style={StyleSheet.absoluteFillObject} />
      <View style={[StyleSheet.absoluteFillObject, { backgroundColor: "rgba(7,11,20,0.30)" }]} />
    </View>
  );
}

function TabIcon({ icon, color, focused }: { icon: React.ReactNode; color: string; focused: boolean }) {
  const scale = useRef(new Animated.Value(1)).current;
  const prevFocused = useRef(focused);

  useEffect(() => {
    if (focused && !prevFocused.current) {
      scale.setValue(0.82);
      Animated.spring(scale, {
        toValue: 1,
        tension: 200,
        friction: 8,
        useNativeDriver: true,
      }).start();
    }
    prevFocused.current = focused;
  }, [focused, scale]);

  return (
    <View style={styles.tabIconWrap}>
      <Animated.View style={[styles.tabIconPill, focused && styles.tabIconPillActive, { transform: [{ scale }] }]}>
        {icon}
      </Animated.View>
    </View>
  );
}

const MoreTabIcon = memo(function MoreTabIcon({ color, focused }: { color: string; focused: boolean }) {
  const badgeCount = useMoreBadgeCount();

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

/** Pantallas dentro de (app) que NO deben aparecer en la barra. */
const HIDDEN_ROUTES = [
  "notifications",
  "contacts",
  "budgets",
  "subscriptions",
  "recurring-income",
  "categories",
  "exchange-rates",
  "settings",
  "notification-detection",
  "notification-onboarding",
] as const;

/** Cuenta del badge de "Más": notificaciones sin leer + invitaciones pendientes. */
function useMoreBadgeCount() {
  const { user, profile } = useAuth();
  const { data: notifications } = useNotificationsQuery(user?.id ?? null);
  const { data: pendingInvites = [] } = usePendingObligationShareInvitesQuery(user?.id, profile?.email);
  const unreadCount = (notifications ?? []).filter((n) => n.status !== "read").length;
  return unreadCount + pendingInvites.length;
}

export default function AppLayout() {
  useTabPersistence();
  useNotificationDetectionRuntimeSync();
  useNotificationDetectionForegroundReconcile();
  const insets = useSafeAreaInsets();
  const isIOS = Platform.OS === "ios";
  // iOS: la barra es una píldora FLOTANTE absoluta, separada de los bordes, con el contenido
  // corriendo por detrás. Al ser absolute React Navigation no le reserva espacio: la franja
  // la dejan libre las listas (ResourceSectionList) y los FAB vía IOS_FLOATING_TAB_BAR_SPACE.
  // Sin paddings propios, los iconos quedan centrados por construcción.
  const iosTabBarStyle = {
    position: "absolute" as const,
    // MEDIDO: React Navigation ignora `left`/`right` aquí (impone los suyos). Lo que sí
    // respeta es el padding, y en RN los hijos absolutos (el fondo de la píldora) se
    // posicionan dentro del padding box — así que paddingHorizontal define el margen real
    // Y de paso mete los iconos dentro de la píldora.
    left: 0,
    right: 0,
    bottom: insets.bottom + FLOATING_TAB_BAR_GAP,
    height: FLOATING_TAB_BAR_HEIGHT,
    backgroundColor: "transparent",
    borderTopWidth: 0,
    elevation: 0,
    // Margen lateral REAL de la píldora (con 12pt quedaba pegada a los bordes de la pantalla).
    paddingHorizontal: SPACING.xxl,
    // React Navigation reserva el hueco de la etiqueta DEBAJO del icono aunque
    // tabBarShowLabel sea false, así que el icono queda alto; medido en simulador: 10pt
    // sobre el centro de la píldora. paddingTop lo compensa.
    paddingTop: 10,
    paddingBottom: 0,
  };
  return (
    <Tabs
      detachInactiveScreens={false}
      screenOptions={{
        headerShown: false,
        tabBarStyle: isIOS
          ? iosTabBarStyle
          : {
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
          lazy: false,
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
      {HIDDEN_ROUTES.map((name) => (
        <Tabs.Screen key={name} name={name} options={{ href: null }} />
      ))}
    </Tabs>
  );
}

const styles = StyleSheet.create({
  // Fondo de la píldora flotante de iOS. MEDIDO: React Navigation renderiza
  // tabBarBackground en un contenedor a sangre e ignora el left/right/padding del
  // tabBarStyle, así que el margen lateral se define ACÁ. (El paddingHorizontal del
  // tabBarStyle sí mueve los iconos, y se deja igual para que queden dentro.)
  iosPillClip: {
    position: "absolute",
    left: SPACING.xxl,
    right: SPACING.xxl,
    top: 0,
    bottom: 0,
    borderRadius: FLOATING_TAB_BAR_HEIGHT / 2,
    overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.16)",
  },
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
    // En iOS la píldora mide 60pt: con -4/-8 el badge se desbordaba por el borde superior.
    top: Platform.OS === "ios" ? 0 : -4,
    right: Platform.OS === "ios" ? -4 : -8,
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
