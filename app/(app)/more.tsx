import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useState } from "react";
import {
  Bell, Users, BarChart3, RefreshCw, Sparkles, Tag, Settings, ArrowLeftRight, ChevronRight, TrendingUp, type LucideIcon,
} from "lucide-react-native";

import { useAuth } from "../../lib/auth-context";
import { useNotificationsQuery, useUserEntitlementQuery, useWorkspaceSnapshotQuery } from "../../services/queries/workspace-data";
import { useWorkspace } from "../../lib/workspace-context";
import { formatCurrency } from "../../components/ui/AmountDisplay";
import { getMonthlySubscriptionAmount } from "../../features/subscriptions/lib/subscriptionFilters";
import { getMonthlyRecurringIncomeAmount } from "../../features/recurring-income/lib/recurringIncomeFilters";
import { useHaptics } from "../../hooks/useHaptics";
import { ScreenHeader } from "../../components/layout/ScreenHeader";
import { Badge } from "../../components/ui/Badge";
import { COLORS, FONT_FAMILY, FONT_SIZE, SPACING, SURFACE } from "../../constants/theme";
import { IOS_FLOATING_TAB_BAR_SPACE } from "../../constants/floating-tab-bar";

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
  const { user, profile } = useAuth();
  const haptics = useHaptics();


  const { data: notifications } = useNotificationsQuery(user?.id ?? null);
  const unreadCount = (notifications ?? []).filter((n) => n.status !== "read").length;
  const { data: entitlement } = useUserEntitlementQuery(user?.id ?? null, user?.email ?? null);
  const { activeWorkspaceId } = useWorkspace();
  const { data: snapshot } = useWorkspaceSnapshotQuery(profile ?? null, activeWorkspaceId);

  // El menú dice el ESTADO de cada sección en vez de explicar su nombre. Todo sale del snapshot
  // que la app ya tiene cargado: ni una consulta nueva por esto.
  const subscriptions = snapshot?.subscriptions ?? [];
  const recurringIncome = snapshot?.recurringIncome ?? [];
  const activeSubs = subscriptions.filter((item) => item.status === "active");
  const activeIncome = recurringIncome.filter((item) => item.status === "active");
  const subsMonthly = activeSubs.reduce((sum, item) => sum + getMonthlySubscriptionAmount(item), 0);
  const incomeMonthly = activeIncome.reduce((sum, item) => sum + getMonthlyRecurringIncomeAmount(item), 0);
  const baseCurrency = profile?.baseCurrencyCode ?? "PEN";
  const contactCount = (snapshot?.counterparties ?? []).filter((c) => !c.isArchived).length;
  const categoryCount = (snapshot?.categories ?? []).length;
  const budgetCount = (snapshot?.budgets ?? []).length;
  const usdRate = (snapshot?.exchangeRates ?? []).find(
    (rate) => rate.fromCurrencyCode === "USD" && rate.toCurrencyCode === baseCurrency,
  );
  const isPro = entitlement?.proAccessEnabled === true;

  const menuItems: MenuItem[] = [
    // El asistente es Pro (consistente con el resto de la IA). Solo visible para Pro.
    ...(isPro
      ? [{
          Icon: Sparkles,
          title: "Asistente",
          subtitle: "Pregunta en lenguaje natural",
          route: "/assistant?from=more",
        } as MenuItem]
      : []),
    {
      Icon: Bell,
      title: "Notificaciones",
      subtitle: unreadCount > 0 ? `${unreadCount} sin leer` : "Sin notificaciones nuevas",
      route: "/(app)/notifications?from=more",
      badge: unreadCount,
    },
    {
      Icon: Users,
      title: "Contactos",
      subtitle: contactCount > 0 ? `${contactCount} contacto${contactCount === 1 ? "" : "s"}` : "Ninguno todavía",
      route: "/(app)/contacts?from=more",
    },
    {
      Icon: BarChart3,
      title: "Presupuestos",
      subtitle: budgetCount > 0 ? `${budgetCount} activo${budgetCount === 1 ? "" : "s"}` : "Ninguno todavía",
      route: "/budgets?from=more",
    },
    {
      Icon: RefreshCw,
      title: "Suscripciones",
      subtitle: activeSubs.length > 0 ? `${formatCurrency(subsMonthly, baseCurrency)} al mes` : "Ninguna todavía",
      route: "/(app)/subscriptions?from=more",
    },
    {
      Icon: TrendingUp,
      title: "Ingresos fijos",
      subtitle: activeIncome.length > 0 ? `${formatCurrency(incomeMonthly, baseCurrency)} al mes` : "Ninguno todavía",
      route: "/(app)/recurring-income?from=more",
    },
    {
      Icon: Tag,
      title: "Categorías",
      subtitle: `${categoryCount} categoría${categoryCount === 1 ? "" : "s"}`,
      route: "/(app)/categories?from=more",
    },
    {
      Icon: ArrowLeftRight,
      title: "Tipos de cambio",
      subtitle: usdRate ? `1 USD = ${usdRate.rate}` : "Sin tasas configuradas",
      route: "/(app)/exchange-rates?from=more",
    },
    {
      Icon: Settings,
      title: "Configuración",
      subtitle: "Perfil, seguridad y preferencias",
      route: "/(app)/settings?from=more",
    },
  ];

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <ScreenHeader title="Más" />

      <ScrollView
        contentContainerStyle={[
          styles.content,
          // La píldora flotante de iOS se dibuja sobre el contenido: hay que despejar el
          // safe area + su franja, o el botón de cerrar sesión queda debajo del vidrio.
          { paddingBottom: insets.bottom + IOS_FLOATING_TAB_BAR_SPACE + SPACING.lg },
        ]}
      >
        {menuItems.map((item) => (
          <Pressable
            key={item.route}
            onPress={() => { haptics.light(); router.push(item.route as any); }}
            style={({ pressed }) => [styles.menuRow, pressed && styles.menuRowPressed]}
            accessibilityRole="button"
          >
            <View style={styles.menuInfo}>
              <Text style={styles.menuTitle}>{item.title}</Text>
              <Text style={styles.menuSubtitle} numberOfLines={1}>{item.subtitle}</Text>
            </View>
            {item.badge ? <Badge count={item.badge} /> : null}
            <ChevronRight size={16} color={COLORS.textDisabled} />
          </Pressable>
        ))}

      </ScrollView>

    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.bg },
  content: { paddingVertical: SPACING.sm },
  menuRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.md,
    minHeight: 56,
    // 20 = margen lateral único de la app, el mismo de las filas de lista.
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: SURFACE.separator,
  },
  menuRowPressed: { backgroundColor: SURFACE.pressed },
  menuInfo: { flex: 1, minWidth: 0, gap: 2 },
  menuTitle: { fontSize: FONT_SIZE.md, fontFamily: FONT_FAMILY.bodyMedium, color: COLORS.ink },
  menuSubtitle: { fontSize: FONT_SIZE.xs, color: COLORS.storm },
});
