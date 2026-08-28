import { Tabs } from "expo-router";
import { useAfterFirstPaint } from "../../hooks/useAfterFirstPaint";
import { memo, useEffect, useRef } from "react";
import { Animated, Platform, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Home, ArrowLeftRight, WalletCards, Scale, LayoutGrid } from "lucide-react-native";

import { COLORS, RADIUS, SPACING, SURFACE } from "../../constants/theme";
import { TAB_BAR_CONTENT_HEIGHT } from "../../constants/floating-tab-bar";
import { usePendingObligationShareInvitesQuery } from "../../services/queries/obligations";
import { useAuth } from "../../lib/auth-context";
import { Badge } from "../../components/ui/Badge";
import { SafeBlurView } from "../../components/ui/SafeBlurView";
import { useTabPersistence } from "../../hooks/useTabPersistence";
import { useNotificationDetectionRuntimeSync } from "../../hooks/useNotificationDetectionRuntimeSync";
import { useNotificationDetectionForegroundReconcile } from "../../hooks/useNotificationDetectionForegroundReconcile";

/**
 * Franja anclada a todo el ancho, con blur y filete superior. Igual en iOS y en Android.
 *
 * Antes en iOS era una píldora flotante: lo más bonito de la app y también lo más caro.
 * Al ser `position: absolute` React Navigation no le reservaba espacio, así que CADA lista y
 * CADA botón flotante tenía que dejar la franja libre a mano (8 sitios con
 * IOS_FLOATING_TAB_BAR_SPACE), y con la letra del sistema agrandada las cinco etiquetas se
 * cortaban. Anclada reserva su hueco sola.
 */
function TabBarBackground() {
  return (
    <View style={StyleSheet.absoluteFillObject}>
      <SafeBlurView blur intensity={20} tint="dark" style={StyleSheet.absoluteFillObject} />
      <View style={[StyleSheet.absoluteFillObject, { backgroundColor: "rgba(10,10,9,0.86)" }]} />
      <View style={styles.topBorder} />
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
  // Diferidas al primer pintado: es solo el contador del badge de "Más", no hace falta para
  // dibujar nada. Salía en 3 de los 4 episodios que disparaban el aviso de red lenta.
  const afterFirstPaint = useAfterFirstPaint();
  const { data: pendingInvites = [] } = usePendingObligationShareInvitesQuery(
    afterFirstPaint ? user?.id : null,
    profile?.email,
  );
  // Un solo aviso a la vez. El contador sumaba notificaciones sin leer + invitaciones, y con
  // 93 encima competía con todo lo demás: si todo llama, nada llama.
  //
  // Las notificaciones sin leer SALEN de aquí porque ya tienen su propia campana en el
  // encabezado, con su contador. Contarlas dos veces no añade información.
  //
  // Las invitaciones a espacios compartidos se QUEDAN, y por eso el badge no se borró del todo:
  // no tienen ningún otro sitio donde avisar. Sin esto, alguien te invita a un espacio y no te
  // enteras hasta que entras a Más por casualidad. Suelen ser 0 o 1, así que ya no grita.
  return pendingInvites.length;
}

export default function AppLayout() {
  useTabPersistence();
  useNotificationDetectionRuntimeSync();
  useNotificationDetectionForegroundReconcile();
  const insets = useSafeAreaInsets();
  // Franja anclada, en el flujo, igual en las dos plataformas. Ya no es absolute: React
  // Navigation vuelve a reservarle el hueco, así que ninguna lista ni ningún botón flotante
  // tiene que dejarlo libre a mano. El safe area va DENTRO del alto (no como margen inferior)
  // para que el fondo llegue hasta el borde de la pantalla y no quede una franja sin pintar.
  const tabBarStyle = {
    height: TAB_BAR_CONTENT_HEIGHT + insets.bottom,
    paddingBottom: insets.bottom + SPACING.sm,
    paddingTop: 6,
    backgroundColor: "transparent",
    borderTopWidth: 0,
    elevation: 0,
  };
  return (
    <Tabs
      detachInactiveScreens={false}
      screenOptions={{
        headerShown: false,
        tabBarStyle,
        tabBarBackground: TabBarBackground,
        tabBarActiveTintColor: COLORS.tabActive,
        tabBarInactiveTintColor: COLORS.tabInactive,
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
  topBorder: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 0.75,
    backgroundColor: SURFACE.tabBorder,
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
    // Era un resplandor de menta al 10% con borde y sombra: el "glow" que el rediseño saca de
    // toda la app. La pestaña activa se marca con superficie y filete, no con luz de color.
    backgroundColor: SURFACE.pressed,
    borderWidth: 1,
    borderColor: SURFACE.subtleBorder,
  },
});
