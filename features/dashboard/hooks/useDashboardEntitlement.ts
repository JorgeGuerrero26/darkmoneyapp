import { useMemo } from "react";

import { useUserEntitlementQuery } from "../../../services/queries/workspace-data";
import { isAdvancedDashboardGiftEmail, isDashboardAiAdminEmail } from "../lib/constants";
import { resolveDashboardEntitlement, type DashboardEntitlement } from "../lib/entitlement-resolver";

export type { DashboardEntitlement, DashboardTier } from "../lib/entitlement-resolver";
export { resolveDashboardEntitlement } from "../lib/entitlement-resolver";

type Params = {
  userId: string | null | undefined;
  email: string | null | undefined;
};

/**
 * Hook unificado de entitlement para el dashboard. Centraliza la lógica de
 * gating que antes estaba dispersa entre el query de entitlement, el gift
 * email y el admin email. Permite tracear conversiones con un solo lugar
 * autoritativo.
 */
export function useDashboardEntitlement({ userId, email }: Params): DashboardEntitlement {
  const entitlementQuery = useUserEntitlementQuery(userId ?? null, email ?? null);
  const proAccessEnabled = entitlementQuery.data?.proAccessEnabled ?? false;
  const hasGift = isAdvancedDashboardGiftEmail(email);
  const isAdmin = isDashboardAiAdminEmail(email);
  const isLoading = entitlementQuery.isLoading;

  return useMemo<DashboardEntitlement>(
    () => resolveDashboardEntitlement({ proAccessEnabled, hasGift, isAdmin, isLoading }),
    [hasGift, isAdmin, isLoading, proAccessEnabled],
  );
}
