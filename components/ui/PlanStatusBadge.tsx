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

  const isLoading = entitlementQuery.isLoading && !entitlementQuery.data;
  const isPro = entitlementQuery.data?.proAccessEnabled ?? false;
  const label = isLoading
    ? compact
      ? "Plan..."
      : "Comprobando plan"
    : isPro
      ? compact
        ? "Pro"
        : "Usuario Pro"
      : compact
        ? "Free"
        : "Usuario Free";

  return (
    <View
      style={[
        styles.badge,
        isLoading
          ? styles.badgeLoading
          : isPro
            ? styles.badgePro
            : styles.badgeFree,
      ]}
    >
      <Text
        style={[
          styles.label,
          isLoading
            ? styles.labelLoading
            : isPro
              ? styles.labelPro
              : styles.labelFree,
        ]}
        numberOfLines={1}
      >
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
  badgeLoading: {
    backgroundColor: "rgba(255,255,255,0.05)",
    borderColor: "rgba(255,255,255,0.12)",
  },
  badgePro: {
    backgroundColor: COLORS.primary + "18",
    borderColor: COLORS.primary + "44",
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
  labelLoading: {
    color: COLORS.storm,
  },
  labelPro: {
    color: COLORS.primary,
  },
  labelFree: {
    color: COLORS.gold,
  },
});
