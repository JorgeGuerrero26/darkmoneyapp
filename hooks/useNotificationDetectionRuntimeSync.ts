import { useEffect, useMemo, useRef } from "react";

import { useAuth } from "../lib/auth-context";
import { useWorkspace } from "../lib/workspace-context";
import { notificationDetection } from "../lib/notification-detection-native";
import { packageNamesForEnabledApps } from "../lib/notification-detection-apps";
import { useNotificationDetectionSettingsQuery, syncNativeDetectedSuggestion } from "../services/queries/notification-detection";
import { cleanupMovementDescriptionLocally, shouldShowDescriptionCleanup } from "../lib/movement-description-cleanup";
import { suggestCounterpartyLocally } from "../lib/movement-counterparty-suggestions";
import { suggestRecurringLocally, type MovementRecurringHistoryItem } from "../lib/movement-recurring-suggestions";
import { analyzeMovementRiskLocally, type MovementRiskItem } from "../lib/movement-risk-analysis";
import { analyzeMovementBudgetImpactLocally } from "../lib/movement-budget-impact";
import { buildPatternMaps, scoreCategoryFromDescription, type PatternMaps } from "../lib/movement-patterns";
import { useMovementPatternsQuery } from "../services/queries/movement-patterns";
import {
  requestMovementDescriptionCleanup,
  requestMovementCounterpartyAiSuggestion,
  requestMovementRecurringAiSuggestion,
  requestMovementCategoryAiSuggestion,
  requestMovementRiskAiExplanation,
  requestMovementBudgetAiRecommendation,
  requestNotificationMovementAiClassification,
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

function serializeWordToCategory(maps: PatternMaps) {
  return Object.fromEntries(
    Array.from(maps.wordToCategory.entries()).map(([word, entries]) => [word, entries]),
  );
}

const LOCAL_CATEGORY_AI_CONFIDENCE_THRESHOLD = 0.6;
const AI_NOTIFICATION_DISCARD_THRESHOLD = 0.65;

function patternMovementAmount(movement: {
  movement_type: string;
  source_amount: number | null;
  destination_amount: number | null;
}) {
  const source = Math.abs(Number(movement.source_amount ?? 0));
  const destination = Math.abs(Number(movement.destination_amount ?? 0));
  if (movement.movement_type === "income" || movement.movement_type === "refund") return destination || source;
  return source || destination;
}

export function useNotificationDetectionRuntimeSync() {
  const { profile } = useAuth();
  const { activeWorkspaceId, activeWorkspace } = useWorkspace();
  // Track suggestion IDs that have been processed in this session to avoid
  // re-calling AI APIs when the effect re-runs due to reference changes.
  const processedSuggestionIdsRef = useRef(new Set<string>());
  const { data: snapshot } = useWorkspaceSnapshotQuery(profile, activeWorkspaceId);
  const entitlementQuery = useUserEntitlementQuery(profile?.id ?? null, profile?.email ?? null);
  const settingsQuery = useNotificationDetectionSettingsQuery(profile?.id, activeWorkspaceId);
  const patternMovementsQuery = useMovementPatternsQuery(activeWorkspaceId);
  const patternMaps = useMemo(() => buildPatternMaps(patternMovementsQuery.data ?? []), [patternMovementsQuery.data]);
  const recurringHistory = useMemo<MovementRecurringHistoryItem[]>(() => {
    return (patternMovementsQuery.data ?? []).map((movement) => ({
      id: movement.id,
      movementType: movement.movement_type,
      occurredAt: movement.occurred_at,
      description: movement.description ?? "",
      amount: patternMovementAmount(movement),
      categoryId: movement.category_id ?? null,
      counterpartyId: movement.counterparty_id ?? null,
    }));
  }, [patternMovementsQuery.data]);
  const riskHistory = useMemo<MovementRiskItem[]>(() => {
    return (patternMovementsQuery.data ?? []).map((movement) => {
      const category = (snapshot?.categories ?? []).find((item) => item.id === movement.category_id) ?? null;
      const counterparty = (snapshot?.counterparties ?? []).find((item) => item.id === movement.counterparty_id) ?? null;
      const accountId = movement.destination_account_id ?? movement.source_account_id ?? null;
      const account = (snapshot?.accounts ?? []).find((item) => item.id === accountId) ?? null;
      return {
        id: movement.id,
        movementType: movement.movement_type,
        occurredAt: movement.occurred_at,
        description: movement.description ?? "",
        amount: patternMovementAmount(movement),
        categoryId: movement.category_id ?? null,
        categoryName: category?.name ?? null,
        counterpartyId: movement.counterparty_id ?? null,
        counterpartyName: counterparty?.name ?? null,
        accountId,
        accountName: account?.name ?? null,
      };
    });
  }, [patternMovementsQuery.data, snapshot?.accounts, snapshot?.categories, snapshot?.counterparties]);
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
      counterparties: (snapshot?.counterparties ?? [])
        .filter((counterparty) => !counterparty.isArchived)
        .map((counterparty) => ({ id: counterparty.id, name: counterparty.name, type: counterparty.type })),
      wordToCategory: serializeWordToCategory(patternMaps),
      settings,
    });
  }, [activeWorkspaceId, patternMaps, profile?.id, settings, snapshot?.accounts, snapshot?.categories, snapshot?.counterparties]);

  useEffect(() => {
    if (!profile?.id || !activeWorkspaceId || !notificationDetection.isAvailable()) return;
    let cancelled = false;
    async function syncLocalSuggestions() {
      const suggestions = await notificationDetection.getSuggestions();
      for (const suggestion of suggestions) {
        if (cancelled || suggestion.status !== "pending") continue;
        if (processedSuggestionIdsRef.current.has(suggestion.id)) continue;
        processedSuggestionIdsRef.current.add(suggestion.id);
        if (entitlementQuery.data?.proAccessEnabled && suggestion.confidence !== "high") {
          const classification = await requestNotificationMovementAiClassification({
            workspaceId: activeWorkspaceId!,
            packageName: suggestion.packageName,
            appLabel: suggestion.appName,
            financialAppKey: suggestion.financialAppKey ?? null,
            title: suggestion.title ?? null,
            text: suggestion.text ?? null,
            subText: suggestion.subText ?? null,
            amountLabel: suggestion.amountLabel ?? null,
            movementType: suggestion.movementType ?? null,
            localConfidence: suggestion.confidence ?? null,
          }).catch(() => null);
          if (
            classification?.ok &&
            classification.classification &&
            !classification.classification.isMovement &&
            classification.classification.confidence >= AI_NOTIFICATION_DISCARD_THRESHOLD
          ) {
            notificationDetection.discardSuggestion(suggestion.id);
            await syncNativeDetectedSuggestion({
              userId: profile!.id,
              workspaceId: activeWorkspaceId!,
              nativeSuggestion: { ...suggestion, status: "discarded" },
            }).catch(() => null);
            continue;
          }
        }
        await syncNativeDetectedSuggestion({
          userId: profile!.id,
          workspaceId: activeWorkspaceId!,
          nativeSuggestion: suggestion,
        }).catch(() => null);
        const description = (suggestion.text || suggestion.title || suggestion.appName || "").trim();
        if (!suggestion.descriptionCleanup && description) {
          const localDescriptionCleanup = cleanupMovementDescriptionLocally({
            rawDescription: description,
            appLabel: suggestion.appName,
            financialAppKey: suggestion.financialAppKey,
          });
          if (
            localDescriptionCleanup &&
            localDescriptionCleanup.confidence >= 0.7 &&
            shouldShowDescriptionCleanup(description, localDescriptionCleanup.cleanedDescription)
          ) {
            notificationDetection.setSuggestionDescriptionCleanup(suggestion.id, localDescriptionCleanup);
          } else if (entitlementQuery.data?.proAccessEnabled) {
            const response = await requestMovementDescriptionCleanup({
              workspaceId: activeWorkspaceId!,
              surface: "android_overlay",
              rawDescription: description,
              appLabel: suggestion.appName,
              financialAppKey: suggestion.financialAppKey ?? null,
              amount: parseAmountLabel(suggestion.amountLabel),
              currencyCode: currencyFromAmountLabel(suggestion.amountLabel),
              localCleanup: localDescriptionCleanup
                ? {
                  cleanedDescription: localDescriptionCleanup.cleanedDescription,
                  confidence: localDescriptionCleanup.confidence,
                  reasons: localDescriptionCleanup.reasons,
                }
                : null,
            }).catch(() => null);
            if (
              response?.ok &&
              response.cleanedDescription &&
              shouldShowDescriptionCleanup(description, response.cleanedDescription)
            ) {
              notificationDetection.setSuggestionDescriptionCleanup(suggestion.id, {
                cleanedDescription: response.cleanedDescription,
                confidence: response.confidence,
                reasons: response.reasons,
                source: "deepseek",
              });
            }
          }
        }
        if (!suggestion.counterpartyRecommendation && description) {
          const cleanedDescription = (suggestion.descriptionCleanup as { cleanedDescription?: unknown } | undefined)?.cleanedDescription;
          const effectiveDescription = typeof cleanedDescription === "string" && cleanedDescription.trim()
            ? cleanedDescription.trim()
            : description;
          const localCounterparty = suggestCounterpartyLocally({
            description: effectiveDescription,
            counterparties: snapshot?.counterparties ?? [],
          });
          if (localCounterparty && localCounterparty.confidence >= 0.7) {
            notificationDetection.setSuggestionCounterpartyRecommendation(suggestion.id, localCounterparty);
          } else if (entitlementQuery.data?.proAccessEnabled) {
            const response = await requestMovementCounterpartyAiSuggestion({
              workspaceId: activeWorkspaceId!,
              surface: "android_overlay",
              description: effectiveDescription,
              movementType: suggestion.movementType === "income" ? "income" : "expense",
              amount: parseAmountLabel(suggestion.amountLabel),
              currencyCode: currencyFromAmountLabel(suggestion.amountLabel),
              counterparties: (snapshot?.counterparties ?? [])
                .filter((counterparty) => !counterparty.isArchived)
                .map((counterparty) => ({ id: counterparty.id, name: counterparty.name, type: counterparty.type })),
              localSuggestion: localCounterparty,
            }).catch(() => null);
            if (response?.ok && response.recommendation) {
              notificationDetection.setSuggestionCounterpartyRecommendation(suggestion.id, {
                ...response.recommendation,
                source: "deepseek",
              });
            }
          }
        }
        if (!suggestion.recurringRecommendation && description) {
          const cleanedDescription = (suggestion.descriptionCleanup as { cleanedDescription?: unknown } | undefined)?.cleanedDescription;
          const effectiveDescription = typeof cleanedDescription === "string" && cleanedDescription.trim()
            ? cleanedDescription.trim()
            : description;
          const amount = parseAmountLabel(suggestion.amountLabel);
          const currencyCode = currencyFromAmountLabel(suggestion.amountLabel);
          const movementType = suggestion.movementType === "income" ? "income" : "expense";
          const counterpartyRecommendation = suggestion.counterpartyRecommendation as { counterpartyId?: unknown; counterpartyName?: unknown } | undefined;
          const categoryRecommendation = suggestion.aiCategoryRecommendation as { categoryId?: unknown; categoryName?: unknown } | undefined;
          const counterpartyId = Number(counterpartyRecommendation?.counterpartyId ?? 0);
          const categoryId = Number(categoryRecommendation?.categoryId ?? 0);
          const counterparty = counterpartyId > 0
            ? (snapshot?.counterparties ?? []).find((item) => item.id === counterpartyId) ?? null
            : null;
          const category = categoryId > 0
            ? (snapshot?.categories ?? []).find((item) => item.id === categoryId) ?? null
            : null;
          const localRecurring = suggestRecurringLocally({
            movementType,
            description: effectiveDescription,
            amount,
            currencyCode,
            occurredAt: new Date(suggestion.postTime ?? suggestion.createdAt ?? Date.now()).toISOString(),
            category,
            counterparty,
            recentMovements: recurringHistory,
            subscriptions: snapshot?.subscriptions ?? [],
            recurringIncome: snapshot?.recurringIncome ?? [],
          });
          if (localRecurring && localRecurring.confidence >= 0.7) {
            notificationDetection.setSuggestionRecurringRecommendation(suggestion.id, localRecurring);
          } else if (entitlementQuery.data?.proAccessEnabled) {
            const response = await requestMovementRecurringAiSuggestion({
              workspaceId: activeWorkspaceId!,
              surface: "android_overlay",
              movementType,
              description: effectiveDescription,
              amount,
              currencyCode,
              occurredAt: new Date(suggestion.postTime ?? suggestion.createdAt ?? Date.now()).toISOString(),
              category: category ? { id: category.id, name: category.name } : null,
              counterparty: counterparty ? { id: counterparty.id, name: counterparty.name } : null,
              recentMovements: recurringHistory.slice(0, 30),
              subscriptions: (snapshot?.subscriptions ?? []).filter((item) => item.status === "active").map((item) => ({
                id: item.id,
                name: item.name,
                amount: item.amount,
                currencyCode: item.currencyCode,
                frequency: item.frequency,
                intervalCount: item.intervalCount,
                vendorPartyId: item.vendorPartyId ?? null,
                categoryId: item.categoryId ?? null,
              })),
              recurringIncome: (snapshot?.recurringIncome ?? []).filter((item) => item.status === "active").map((item) => ({
                id: item.id,
                name: item.name,
                amount: item.amount,
                currencyCode: item.currencyCode,
                frequency: item.frequency,
                intervalCount: item.intervalCount,
                payerPartyId: item.payerPartyId ?? null,
                categoryId: item.categoryId ?? null,
              })),
              localSuggestion: localRecurring,
            }).catch(() => null);
            if (response?.ok && response.recommendation) {
              notificationDetection.setSuggestionRecurringRecommendation(suggestion.id, {
                ...response.recommendation,
                source: "deepseek",
              });
            }
          }
        }
        if (!suggestion.riskExplanation && description) {
          const amount = parseAmountLabel(suggestion.amountLabel);
          const movementType = suggestion.movementType === "income" ? "income" : "expense";
          const counterpartyRecommendation = suggestion.counterpartyRecommendation as { counterpartyId?: unknown } | undefined;
          const categoryRecommendation = suggestion.aiCategoryRecommendation as { categoryId?: unknown } | undefined;
          const counterpartyId = Number(counterpartyRecommendation?.counterpartyId ?? 0);
          const categoryId = Number(categoryRecommendation?.categoryId ?? 0);
          const category = categoryId > 0
            ? (snapshot?.categories ?? []).find((item) => item.id === categoryId) ?? null
            : null;
          const counterparty = counterpartyId > 0
            ? (snapshot?.counterparties ?? []).find((item) => item.id === counterpartyId) ?? null
            : null;
          const currentRisk: MovementRiskItem | null = amount
            ? {
              id: -1,
              movementType,
              occurredAt: new Date(suggestion.postTime ?? suggestion.createdAt ?? Date.now()).toISOString(),
              description,
              amount,
              categoryId: category?.id ?? null,
              categoryName: category?.name ?? null,
              counterpartyId: counterparty?.id ?? null,
              counterpartyName: counterparty?.name ?? null,
              accountId: null,
              accountName: null,
            }
            : null;
          const localRisk = analyzeMovementRiskLocally(currentRisk, riskHistory);
          if (localRisk && localRisk.confidence >= 0.75) {
            notificationDetection.setSuggestionRiskExplanation(suggestion.id, localRisk);
          } else if (localRisk && entitlementQuery.data?.proAccessEnabled) {
            const related = riskHistory.filter((movement) => localRisk.relatedMovementIds.includes(movement.id)).slice(0, 5);
            const response = await requestMovementRiskAiExplanation({
              workspaceId: activeWorkspaceId!,
              surface: "android_overlay",
              currentMovement: {
                movementType: currentRisk!.movementType,
                occurredAt: currentRisk!.occurredAt,
                description: currentRisk!.description,
                amount: currentRisk!.amount,
                categoryName: currentRisk!.categoryName,
                counterpartyName: currentRisk!.counterpartyName,
              },
              relatedMovements: related.map((movement) => ({
                id: movement.id,
                movementType: movement.movementType,
                occurredAt: movement.occurredAt,
                description: movement.description,
                amount: movement.amount,
                categoryName: movement.categoryName,
                counterpartyName: movement.counterpartyName,
              })),
              localRisk,
            }).catch(() => null);
            if (response?.ok && response.explanation) {
              notificationDetection.setSuggestionRiskExplanation(suggestion.id, {
                ...response.explanation,
                source: "deepseek",
              });
            }
          }
        }
        if (!suggestion.budgetImpact && description) {
          const amount = parseAmountLabel(suggestion.amountLabel);
          const movementType = suggestion.movementType === "income" ? "income" : "expense";
          if (amount && movementType === "expense") {
            const categories = (snapshot?.categories ?? [])
              .filter((category) => category.isActive && (category.kind === "expense" || category.kind === "both"));
            const aiCategory = suggestion.aiCategoryRecommendation as { categoryId?: unknown } | undefined;
            const aiCategoryId = Number(aiCategory?.categoryId ?? 0);
            const scoredLocal = scoreCategoryFromDescription(description, patternMaps);
            const categoryId = aiCategoryId > 0 ? aiCategoryId : scoredLocal?.categoryId ?? null;
            const category = categoryId ? categories.find((item) => item.id === categoryId) ?? null : null;
            const defaultAccountId = settings.find(
              (setting) => setting.financialAppKey === suggestion.financialAppKey && setting.enabled,
            )?.defaultAccountId ?? null;
            const account = defaultAccountId
              ? (snapshot?.accounts ?? []).find((item) => item.id === defaultAccountId) ?? null
              : null;
            const localImpact = analyzeMovementBudgetImpactLocally({
              movement: {
                movementType,
                occurredAt: new Date(suggestion.postTime ?? suggestion.createdAt ?? Date.now()).toISOString(),
                description,
                amount,
                currencyCode: account?.currencyCode ?? currencyFromAmountLabel(suggestion.amountLabel),
                categoryId: category?.id ?? null,
                accountId: account?.id ?? null,
              },
              budgets: snapshot?.budgets ?? [],
              exchangeRates: snapshot?.exchangeRates ?? [],
              workspaceBaseCurrencyCode: activeWorkspace?.baseCurrencyCode ?? "PEN",
            });
            if (localImpact && localImpact.confidence >= 0.75 && localImpact.severity !== "high") {
              notificationDetection.setSuggestionBudgetImpact(suggestion.id, localImpact);
            } else if (localImpact && entitlementQuery.data?.proAccessEnabled) {
              const response = await requestMovementBudgetAiRecommendation({
                workspaceId: activeWorkspaceId!,
                surface: "android_overlay",
                movement: {
                  movementType,
                  occurredAt: new Date(suggestion.postTime ?? suggestion.createdAt ?? Date.now()).toISOString(),
                  description,
                  amount,
                  currencyCode: account?.currencyCode ?? currencyFromAmountLabel(suggestion.amountLabel),
                  categoryName: category?.name ?? null,
                  accountName: account?.name ?? null,
                },
                budgetImpact: {
                  budgetId: localImpact.budgetId,
                  budgetName: localImpact.budgetName,
                  currencyCode: localImpact.currencyCode,
                  impactAmount: localImpact.impactAmount,
                  previousSpentAmount: localImpact.previousSpentAmount,
                  projectedSpentAmount: localImpact.projectedSpentAmount,
                  limitAmount: localImpact.limitAmount,
                  previousUsedPercent: localImpact.previousUsedPercent,
                  projectedUsedPercent: localImpact.projectedUsedPercent,
                  overAmount: localImpact.overAmount,
                  severity: localImpact.severity,
                  confidence: localImpact.confidence,
                  reasons: localImpact.reasons,
                },
              }).catch(() => null);
              if (response?.ok && response.recommendation) {
                notificationDetection.setSuggestionBudgetImpact(suggestion.id, {
                  ...localImpact,
                  severity: response.recommendation.severity,
                  confidence: response.recommendation.confidence,
                  title: response.recommendation.title,
                  recommendation: response.recommendation.recommendation,
                  reasons: response.recommendation.reasons,
                  source: "deepseek",
                });
              }
            }
          }
        }
        const aiCategoryStatus = (suggestion.aiCategoryRecommendation as { status?: unknown } | undefined)?.status;
        if (aiCategoryStatus === "pending") {
          const updatedAt = Number(suggestion.updatedAt ?? suggestion.createdAt ?? 0);
          if (updatedAt > 0 && Date.now() - updatedAt > 12_000) {
            notificationDetection.setSuggestionAiCategoryRecommendation(suggestion.id, null);
          }
          continue;
        }
        if (cancelled || !entitlementQuery.data?.proAccessEnabled || suggestion.aiCategoryRecommendation) continue;
        const movementType = suggestion.movementType === "income" ? "income" : "expense";
        const compatibleKind = movementType === "income" ? "income" : "expense";
        const categories = (snapshot?.categories ?? [])
          .filter((category) => category.isActive && (category.kind === "both" || category.kind === compatibleKind))
          .map((category) => ({ id: category.id, name: category.name, kind: category.kind }));
        if (!description || categories.length === 0) continue;
        const scoredLocal = scoreCategoryFromDescription(description, patternMaps);
        const localCategory = scoredLocal ? categories.find((category) => category.id === scoredLocal.categoryId) : null;
        const localSuggestion = scoredLocal && localCategory
          ? {
            categoryId: localCategory.id,
            categoryName: localCategory.name,
            confidence: scoredLocal.confidence,
            reasons: scoredLocal.reasons,
          }
          : null;
        if (localSuggestion && localSuggestion.confidence >= LOCAL_CATEGORY_AI_CONFIDENCE_THRESHOLD) continue;
        notificationDetection.setSuggestionAiCategoryRecommendation(suggestion.id, { status: "pending" });
        const response = await requestMovementCategoryAiSuggestion({
          workspaceId: activeWorkspaceId!,
          surface: "android_overlay",
          movementType,
          amount: parseAmountLabel(suggestion.amountLabel),
          currencyCode: currencyFromAmountLabel(suggestion.amountLabel),
          description,
          occurredAt: new Date(suggestion.postTime ?? suggestion.createdAt ?? Date.now()).toISOString(),
          categories,
          localSuggestion,
        }).catch(() => null);
        if (cancelled) continue;
        if (!response?.ok || !response.recommendation) {
          notificationDetection.setSuggestionAiCategoryRecommendation(suggestion.id, null);
          continue;
        }
        notificationDetection.setSuggestionAiCategoryRecommendation(suggestion.id, response.recommendation);
      }
    }
    void syncLocalSuggestions();
    return () => {
      cancelled = true;
    };
  }, [
    activeWorkspaceId,
    activeWorkspace?.baseCurrencyCode,
    entitlementQuery.data?.proAccessEnabled,
    patternMaps,
    profile?.id,
    recurringHistory,
    riskHistory,
    settings,
    snapshot?.accounts,
    snapshot?.budgets,
    snapshot?.categories,
    snapshot?.counterparties,
    snapshot?.exchangeRates,
    snapshot?.recurringIncome,
    snapshot?.subscriptions,
  ]);
}
