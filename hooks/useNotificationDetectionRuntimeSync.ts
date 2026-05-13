import { useEffect } from "react";

import { useAuth } from "../lib/auth-context";
import { useWorkspace } from "../lib/workspace-context";
import { notificationDetection } from "../lib/notification-detection-native";
import { packageNamesForEnabledApps } from "../lib/notification-detection-apps";
import { useNotificationDetectionSettingsQuery, syncNativeDetectedSuggestion } from "../services/queries/notification-detection";
import {
  requestMovementCategoryAiSuggestion,
  useUserEntitlementQuery,
  useWorkspaceSnapshotQuery,
} from "../services/queries/workspace-data";

function parseAmountLabel(amountLabel?: string | null): number | null {
  if (!amountLabel) return null;
  const match = amountLabel.match(/([0-9]+(?:[.,][0-9]{1,2})?)/);
  if (!match) return null;
  const amount = Number(match[1].replace(",", "."));
  return Number.isFinite(amount) && amount > 0 ? amount : null;
}

function currencyFromAmountLabel(amountLabel?: string | null) {
  return /usd|\$/i.test(amountLabel ?? "") && !/S\//i.test(amountLabel ?? "") ? "USD" : "PEN";
}

export function useNotificationDetectionRuntimeSync() {
  const { profile } = useAuth();
  const { activeWorkspaceId } = useWorkspace();
  const { data: snapshot } = useWorkspaceSnapshotQuery(profile, activeWorkspaceId);
  const entitlementQuery = useUserEntitlementQuery(profile?.id ?? null, profile?.email ?? null);
  const settingsQuery = useNotificationDetectionSettingsQuery(profile?.id, activeWorkspaceId);
  const settings = settingsQuery.data ?? [];

  useEffect(() => {
    if (!profile?.id || !activeWorkspaceId || !notificationDetection.isAvailable()) return;
    const activeAccounts = (snapshot?.accounts ?? []).filter((account) => !account.isArchived);
    const enabledKeys = settings.filter((setting) => setting.enabled).map((setting) => setting.financialAppKey);
    notificationDetection.setDetectionEnabled(enabledKeys.length > 0);
    notificationDetection.setAllowedPackages(packageNamesForEnabledApps(enabledKeys));
    notificationDetection.setRuntimeContext({
      userId: profile.id,
      workspaceId: activeWorkspaceId,
      accounts: activeAccounts.map((account) => ({
        id: account.id,
        name: account.name,
        currencyCode: account.currencyCode,
      })),
      categories: (snapshot?.categories ?? [])
        .filter((category) => category.isActive)
        .map((category) => ({ id: category.id, name: category.name, kind: category.kind })),
      settings,
    });
  }, [activeWorkspaceId, profile?.id, settings, snapshot?.accounts, snapshot?.categories]);

  useEffect(() => {
    if (!profile?.id || !activeWorkspaceId || !notificationDetection.isAvailable()) return;
    let cancelled = false;
    async function syncLocalSuggestions() {
      const suggestions = await notificationDetection.getSuggestions();
      for (const suggestion of suggestions) {
        if (cancelled || suggestion.status !== "pending") continue;
        await syncNativeDetectedSuggestion({
          userId: profile!.id,
          workspaceId: activeWorkspaceId!,
          nativeSuggestion: suggestion,
        }).catch(() => null);
        if (cancelled || !entitlementQuery.data?.proAccessEnabled || suggestion.aiCategoryRecommendation) continue;
        const movementType = suggestion.movementType === "income" ? "income" : "expense";
        const compatibleKind = movementType === "income" ? "income" : "expense";
        const categories = (snapshot?.categories ?? [])
          .filter((category) => category.isActive && (category.kind === "both" || category.kind === compatibleKind))
          .map((category) => ({ id: category.id, name: category.name, kind: category.kind }));
        const description = (suggestion.text || suggestion.title || suggestion.appName || "").trim();
        if (!description || categories.length === 0) continue;
        const response = await requestMovementCategoryAiSuggestion({
          workspaceId: activeWorkspaceId!,
          surface: "android_overlay",
          movementType,
          amount: parseAmountLabel(suggestion.amountLabel),
          currencyCode: currencyFromAmountLabel(suggestion.amountLabel),
          description,
          occurredAt: new Date(suggestion.postTime ?? suggestion.createdAt ?? Date.now()).toISOString(),
          categories,
          localSuggestion: null,
        }).catch(() => null);
        if (cancelled || !response?.ok || !response.recommendation) continue;
        notificationDetection.setSuggestionAiCategoryRecommendation(suggestion.id, response.recommendation);
      }
    }
    void syncLocalSuggestions();
    return () => {
      cancelled = true;
    };
  }, [activeWorkspaceId, entitlementQuery.data?.proAccessEnabled, profile?.id, snapshot?.categories]);
}
