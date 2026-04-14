import { GestureDetector } from "react-native-gesture-handler";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  Bell, Users, BarChart3, RefreshCw, Tag, Settings, ArrowLeftRight, ChevronRight, TrendingUp, type LucideIcon,
} from "lucide-react-native";

import { useAuth } from "../../lib/auth-context";
import { useNotificationsQuery } from "../../services/queries/workspace-data";
import { useHaptics } from "../../hooks/useHaptics";
import { ScreenHeader } from "../../components/layout/ScreenHeader";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { Badge } from "../../components/ui/Badge";
import { COLORS, FONT_FAMILY, FONT_SIZE, GLASS, SPACING } from "../../constants/theme";
import { useSwipeTab } from "../../hooks/useSwipeTab";

type MenuItem = {
  Icon: LucideIcon;
  title: string;
  subtitle: string;
  route: string;
  badge?: number;
};

export default function MoreScreen() {
  const swipeGesture = useSwipeTab();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, signOut } = useAuth();
  const haptics = useHaptics();

  const { data: notifications } = useNotificationsQuery(user?.id ?? null);
  const unreadCount = (notifications ?? []).filter((n) => n.status !== "read").length;

  const menuItems: MenuItem[] = [
    {
      Icon: Bell,
      title: "Notificaciones",
      subtitle: unreadCount > 0 ? `${unreadCount} sin leer` : "Sin notificaciones nuevas",
      route: "/notifications",
      badge: unreadCount,
    },
    {
      Icon: Users,
      title: "Contactos",
      subtitle: "Clientes, proveedores y más",
      route: "/contacts/",
    },
    {
      Icon: BarChart3,
      title: "Presupuestos",
      subtitle: "Controla tus gastos por categoría",
      route: "/(app)/budgets?from=more",
    },
    {
      Icon: RefreshCw,
      title: "Suscripciones",
      subtitle: "Pagos recurrentes",
      route: "/subscriptions",
    },
    {
      Icon: TrendingUp,
      title: "Ingresos fijos",
      subtitle: "Sueldos, rentas y cobros recurrentes",
      route: "/recurring-income",
    },
    {
      Icon: Tag,
      title: "Categorías",
      subtitle: "Organiza tus movimientos",
      route: "/categories",
    },
    {
      Icon: ArrowLeftRight,
      title: "Tipos de cambio",
      subtitle: "Tasas para conversión de monedas",
      route: "/exchange-rates",
    },
    {
      Icon: Settings,
      title: "Configuración",
      subtitle: "Perfil, workspace y preferencias",
      route: "/settings",
    },
  ];

  return (
    <GestureDetector gesture={swipeGesture}>
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <ScreenHeader title="Más" />

      <ScrollView contentContainerStyle={styles.content}>
        {menuItems.map((item) => (
          <Card
            key={item.route}
            onPress={() => { haptics.light(); router.push(item.route as any); }}
            style={styles.menuCard}
          >
            <View style={styles.menuRow}>
              <View style={styles.iconWrap}>
                <item.Icon size={18} color={COLORS.primary} />
              </View>
              <View style={styles.menuInfo}>
                <Text style={styles.menuTitle}>{item.title}</Text>
                <Text style={styles.menuSubtitle} numberOfLines={1}>{item.subtitle}</Text>
              </View>
              {item.badge ? <Badge count={item.badge} /> : null}
              <ChevronRight size={16} color={COLORS.storm} />
            </View>
          </Card>
        ))}

        <Button
          label="Cerrar sesión"
          variant="danger"
          size="lg"
          style={styles.signOutButton}
          onPress={() => { haptics.warning(); void signOut(); }}
        />
      </ScrollView>
    </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.bg },
  content: { padding: SPACING.lg, gap: SPACING.sm },
  menuCard: { padding: SPACING.md },
  menuRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.md,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: GLASS.card,
    alignItems: "center",
    justifyContent: "center",
  },
  menuInfo: { flex: 1, gap: 2 },
  menuTitle: { fontSize: FONT_SIZE.md, fontFamily: FONT_FAMILY.bodyMedium, color: COLORS.ink },
  menuSubtitle: { fontSize: FONT_SIZE.xs, color: COLORS.storm },
  signOutButton: {
    marginTop: SPACING.lg,
  },
});
