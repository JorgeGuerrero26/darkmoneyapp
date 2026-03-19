import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  Bell, Users, Banknote, RefreshCw, Tag, Settings, ChevronRight, type LucideIcon,
} from "lucide-react-native";

import { useAuth } from "../../lib/auth-context";
import { useNotificationsQuery } from "../../services/queries/workspace-data";
import { ScreenHeader } from "../../components/layout/ScreenHeader";
import { Card } from "../../components/ui/Card";
import { Badge } from "../../components/ui/Badge";
import { COLORS, FONT_SIZE, FONT_WEIGHT, SPACING } from "../../constants/theme";

type MenuItem = {
  Icon: LucideIcon;
  title: string;
  subtitle: string;
  route: string;
  badge?: number;
};

export default function MoreScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, signOut } = useAuth();

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
      Icon: Banknote,
      title: "Créditos y Deudas",
      subtitle: "Obligaciones activas",
      route: "/obligations",
    },
    {
      Icon: RefreshCw,
      title: "Suscripciones",
      subtitle: "Pagos recurrentes",
      route: "/subscriptions",
    },
    {
      Icon: Tag,
      title: "Categorías",
      subtitle: "Organiza tus movimientos",
      route: "/categories",
    },
    {
      Icon: Settings,
      title: "Configuración",
      subtitle: "Perfil, workspace y preferencias",
      route: "/settings",
    },
  ];

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <ScreenHeader title="Más" />

      <ScrollView contentContainerStyle={styles.content}>
        {menuItems.map((item) => (
          <Card
            key={item.route}
            onPress={() => router.push(item.route as any)}
            style={styles.menuCard}
          >
            <View style={styles.menuRow}>
              <View style={styles.iconWrap}>
                <item.Icon size={18} color={COLORS.primary} />
              </View>
              <View style={styles.menuInfo}>
                <Text style={styles.menuTitle}>{item.title}</Text>
                <Text style={styles.menuSubtitle}>{item.subtitle}</Text>
              </View>
              {item.badge ? <Badge count={item.badge} /> : null}
              <ChevronRight size={16} color={COLORS.textMuted} />
            </View>
          </Card>
        ))}

        <TouchableOpacity
          style={styles.signOutButton}
          onPress={() => signOut()}
        >
          <Text style={styles.signOutText}>Cerrar sesión</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
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
    backgroundColor: COLORS.bgCard,
    alignItems: "center",
    justifyContent: "center",
  },
  menuInfo: { flex: 1, gap: 2 },
  menuTitle: { fontSize: FONT_SIZE.md, fontWeight: FONT_WEIGHT.medium, color: COLORS.text },
  menuSubtitle: { fontSize: FONT_SIZE.xs, color: COLORS.textMuted },
  signOutButton: {
    marginTop: SPACING.lg,
    paddingVertical: SPACING.md,
    alignItems: "center",
    backgroundColor: COLORS.dangerMuted,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.danger,
  },
  signOutText: { color: COLORS.danger, fontWeight: FONT_WEIGHT.semibold, fontSize: FONT_SIZE.md },
});
