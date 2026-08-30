import { StyleSheet, Text, View } from "react-native";

import { useAuth } from "../../lib/auth-context";
import { useUserEntitlementQuery } from "../../services/queries/workspace-data";
import { COLORS, FONT_FAMILY, FONT_SIZE, RADIUS } from "../../constants/theme";

type Props = {
  compact?: boolean;
};

export function PlanStatusBadge({ compact = false }: Props) {
  const { user, profile } = useAuth();
  const entitlementQuery = useUserEntitlementQuery(
    user?.id ?? profile?.id ?? null,
    profile?.email ?? user?.email ?? null,
  );

  if (!user?.id && !profile?.id) return null;

  // Mientras se comprueba no se pinta nada. "Comprobando plan" era lo primero que leía el
  // usuario debajo de su nombre al abrir la app: anunciar que el sistema está preguntando no
  // es información, y el que abre su app de finanzas no viene a saber eso.
  if (entitlementQuery.isLoading && !entitlementQuery.data) return null;

  const isPro = entitlementQuery.data?.proAccessEnabled ?? false;
  const label = isPro
    ? compact ? "Pro" : "Usuario Pro"
    : compact ? "Free" : "Usuario Free";

  return (
    <View style={[styles.badge, isPro ? styles.badgePro : styles.badgeFree]}>
      <Text style={[styles.label, isPro ? styles.labelPro : styles.labelFree]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: "flex-start",
    minHeight: 22,
    borderRadius: RADIUS.full,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    justifyContent: "center",
  },
  badgePro: {
    backgroundColor: COLORS.pro + "18",
    borderColor: COLORS.pro + "44",
  },
  badgeFree: {
    backgroundColor: COLORS.gold + "14",
    borderColor: COLORS.gold + "3A",
  },
  label: {
    fontFamily: FONT_FAMILY.bodySemibold,
    fontSize: FONT_SIZE.xs - 1,
    letterSpacing: 0.3,
  },
  labelPro: {
    color: COLORS.pro,
  },
  labelFree: {
    color: COLORS.gold,
  },
});
