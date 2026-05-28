/**
 * Lógica pura de resolución de entitlement del dashboard.
 * Separada del hook React para poder testearse sin dependencias de RN.
 */

export type DashboardTier = "free" | "pro";

export type DashboardEntitlement = {
  tier: DashboardTier;
  features: {
    advancedDashboard: boolean;
    aiInsights: boolean;
    unlimitedAiUsage: boolean;
  };
  reason: "pro_subscription" | "gift_email" | "admin_email" | "free_default";
  isLoading: boolean;
};

export function resolveDashboardEntitlement(args: {
  proAccessEnabled: boolean;
  hasGift: boolean;
  isAdmin: boolean;
  isLoading: boolean;
}): DashboardEntitlement {
  const { proAccessEnabled, hasGift, isAdmin, isLoading } = args;
  const hasAdvancedAccess = proAccessEnabled || hasGift || isAdmin;
  const tier: DashboardTier = hasAdvancedAccess ? "pro" : "free";

  let reason: DashboardEntitlement["reason"] = "free_default";
  if (proAccessEnabled) reason = "pro_subscription";
  else if (isAdmin) reason = "admin_email";
  else if (hasGift) reason = "gift_email";

  return {
    tier,
    features: {
      advancedDashboard: hasAdvancedAccess,
      aiInsights: hasAdvancedAccess,
      unlimitedAiUsage: isAdmin,
    },
    reason,
    isLoading,
  };
}
