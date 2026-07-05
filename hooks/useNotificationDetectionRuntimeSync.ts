import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { useAuth } from "../lib/auth-context";
import { useWorkspace } from "../lib/workspace-context";
import { notificationDetection } from "../lib/notification-detection-native";
import { packageNamesForEnabledApps } from "../lib/notification-detection-apps";
import { useNotificationDetectionSettingsQuery, syncNativeDetectedSuggestion, getFrequentTransferPair, recordDetectionEvent } from "../services/queries/notification-detection";
import { cleanupMovementDescriptionLocally, shouldShowDescriptionCleanup } from "../lib/movement-description-cleanup";
import { suggestCounterpartyLocally } from "../lib/movement-counterparty-suggestions";
import { suggestRecurringLocally, type MovementRecurringHistoryItem } from "../lib/movement-recurring-suggestions";
import { analyzeMovementRiskLocally, type MovementRiskItem } from "../lib/movement-risk-analysis";
import { analyzeMovementBudgetImpactLocally } from "../lib/movement-budget-impact";
import { buildPatternMaps, scoreCategoryFromDescription, type PatternMaps } from "../lib/movement-patterns";
import { filterCategoriesForMovementType, orchestrateCategoryAiRecommendation } from "../lib/movement-ai-orchestrator";
import { normalizeCurrencyCode, sortAccountsForDetectedCurrency } from "../features/movements/lib/movement-creation-rules";
import { patternMovementAmount } from "../features/movements/lib/pattern-heuristics";
import { useMovementPatternsQuery } from "../services/queries/movement-patterns";
import {
  requestMovementDescriptionCleanup,
  requestMovementCounterpartyAiSuggestion,
  requestMovementRecurringAiSuggestion,
  requestMovementRiskAiExplanation,
  requestMovementBudgetAiRecommendation,
  requestNotificationMovementAiClassification,
  useUserEntitlementQuery,
  useWorkspaceSnapshotQuery,
} from "../services/queries/workspace-data";
import type { AccountSummary } from "../types/domain";

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

function serializeNumericKeyedMap(map: Map<number, { id: number; count: number }[]>) {
  return Object.fromEntries(
    Array.from(map.entries()).map(([id, entries]) => [String(id), entries]),
  );
}

function buildAccountCurrencyPreferences(
  accounts: Pick<AccountSummary, "id" | "name" | "currencyCode" | "isArchived">[],
  currencies: string[],
) {
  return Object.fromEntries(
    currencies.map((currencyCode) => [
      currencyCode,
      sortAccountsForDetectedCurrency(accounts, currencyCode).map((account) => account.id),
    ]),
  );
}

const AI_NOTIFICATION_DISCARD_THRESHOLD = 0.65;

const PROCESSED_SUGGESTIONS_TTL_MS = 24 * 60 * 60 * 1000;
const PROCESSED_SUGGESTIONS_FLUSH_DEBOUNCE_MS = 800;

function processedSuggestionsStorageKey(workspaceId: number | null | undefined): string | null {
  if (!workspaceId) return null;
  return `darkmoney/notif-detection/processed-suggestions/${workspaceId}`;
}

export function useNotificationDetectionRuntimeSync() {
  const { profile } = useAuth();
  const { activeWorkspaceId, activeWorkspace } = useWorkspace();
  const queryClient = useQueryClient();
  // Track suggestion IDs that have been processed (with timestamp) to avoid
  // re-calling AI APIs when the effect re-runs or the app reopens within 24h.
  const processedSuggestionIdsRef = useRef(new Map<string, number>());
  const [processedHydrated, setProcessedHydrated] = useState(false);
  const flushTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Serializa el procesamiento de sugerencias: el efecto depende de ~15 valores (snapshot,
  // patrones, historiales) y cada cambio lo re-disparaba CANCELANDO la corrida en vuelo a
  // mitad de la cadena de IA — la sugerencia ya estaba marcada como procesada, así que el
  // enriquecimiento se perdía para siempre. Ahora: una corrida a la vez; si las deps cambian
  // mientras corre, se agenda UNA re-corrida al terminar (con closures frescos vía syncTick).
  const syncRunningRef = useRef(false);
  const syncRerunRef = useRef(false);
  const [syncTick, setSyncTick] = useState(0);
  const unmountedRef = useRef(false);
  useEffect(() => {
    unmountedRef.current = false;
    return () => {
      unmountedRef.current = true;
    };
  }, []);
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
    // No empujar contexto al nativo mientras snapshot/settings siguen cargando: un sync temprano
    // con accounts/categorías vacíos PISA el runtime context bueno ya persistido (overlay queda
    // "Sin cuenta asignada" y la IA sin categorías), y settings vacíos transitorios apagarían la
    // detección (setDetectionEnabled(false)) si la app muere antes del segundo sync.
    if (!snapshot || !settingsQuery.data) return;
    const activeAccounts = (snapshot?.accounts ?? []).filter((account) => !account.isArchived);
    const workspaceBaseCurrencyCode = normalizeCurrencyCode(activeWorkspace?.baseCurrencyCode, "PEN");
    const exchangeRates = (snapshot?.exchangeRates ?? [])
      .filter((rate) => Number.isFinite(rate.rate) && rate.rate > 0)
      .map((rate) => ({
        fromCurrencyCode: normalizeCurrencyCode(rate.fromCurrencyCode),
        toCurrencyCode: normalizeCurrencyCode(rate.toCurrencyCode),
        rate: rate.rate,
        effectiveAt: rate.effectiveAt,
      }));
    const runtimeCurrencies = Array.from(new Set([
      workspaceBaseCurrencyCode,
      "PEN",
      "USD",
      ...activeAccounts.map((account) => normalizeCurrencyCode(account.currencyCode, workspaceBaseCurrencyCode)),
      ...exchangeRates.flatMap((rate) => [rate.fromCurrencyCode, rate.toCurrencyCode]),
    ]));
    const enabledKeys = settings.filter((setting) => setting.enabled).map((setting) => setting.financialAppKey);
    notificationDetection.setDetectionEnabled(enabledKeys.length > 0);
    notificationDetection.setAllowedPackages(packageNamesForEnabledApps(enabledKeys));
    const userId = profile.id;
    async function applyRuntimeContext() {
      const frequentTransferPair = await getFrequentTransferPair(activeWorkspaceId);
      notificationDetection.setRuntimeContext({
        // Bump this key (YYYY-MM-DD-vN) when you want every device to clear stale
        // movement_detection notifications on the next app open. Avoids needing a Kotlin
        // rebuild just to trigger a one-time cleanup.
        // 2026-07-04-v1: purga fingerprints de descarte creados por el "Descartar" del
        // banner (usaba discardSuggestion con fingerprint y bloqueó la detección).
        notifCleanupKey: "2026-07-04-v1",
        userId,
        workspaceId: activeWorkspaceId,
        workspaceBaseCurrencyCode,
        accounts: activeAccounts.map((account) => ({
          id: account.id,
          name: account.name,
          currencyCode: normalizeCurrencyCode(account.currencyCode, workspaceBaseCurrencyCode),
        })),
        accountCurrencyPreferences: buildAccountCurrencyPreferences(activeAccounts, runtimeCurrencies),
        exchangeRates,
        categories: (snapshot?.categories ?? [])
          .filter((category) => category.isActive)
          .map((category) => ({ id: category.id, name: category.name, kind: category.kind })),
        counterparties: (snapshot?.counterparties ?? [])
          .filter((counterparty) => !counterparty.isArchived)
          .map((counterparty) => ({ id: counterparty.id, name: counterparty.name, type: counterparty.type })),
        wordToCategory: serializeWordToCategory(patternMaps),
        counterpartyToCategory: serializeNumericKeyedMap(patternMaps.counterpartyToCategory),
        categoryToCounterparty: serializeNumericKeyedMap(patternMaps.categoryToCounterparty),
        counterpartyToAccount: serializeNumericKeyedMap(patternMaps.counterpartyToAccount),
        settings,
        frequentTransferPair: frequentTransferPair ?? undefined,
      });
    }
    applyRuntimeContext();
  }, [
    activeWorkspace?.baseCurrencyCode,
    activeWorkspaceId,
    patternMaps,
    profile?.id,
    settings,
    snapshot?.accounts,
    snapshot?.categories,
    snapshot?.counterparties,
    snapshot?.exchangeRates,
  ]);

  // Hidrata el set persistido al cambiar de workspace y limpia entradas >24h.
  useEffect(() => {
    let cancelled = false;
    setProcessedHydrated(false);
    processedSuggestionIdsRef.current = new Map<string, number>();
    const storageKey = processedSuggestionsStorageKey(activeWorkspaceId);
    if (!storageKey) {
      setProcessedHydrated(true);
      return () => {
        cancelled = true;
      };
    }
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(storageKey);
        if (cancelled) return;
        if (raw) {
          const parsed = JSON.parse(raw) as Record<string, number> | null;
          if (parsed && typeof parsed === "object") {
            const now = Date.now();
            const fresh = new Map<string, number>();
            for (const [id, ts] of Object.entries(parsed)) {
              if (typeof ts === "number" && now - ts < PROCESSED_SUGGESTIONS_TTL_MS) {
                fresh.set(id, ts);
              }
            }
            processedSuggestionIdsRef.current = fresh;
          }
        }
      } catch {
        // Corrupted entry, ignore.
      } finally {
        if (!cancelled) setProcessedHydrated(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeWorkspaceId]);

  // Flush diferido del set persistido (evita escribir por cada notificacion).
  function scheduleProcessedFlush() {
    if (flushTimeoutRef.current) clearTimeout(flushTimeoutRef.current);
    flushTimeoutRef.current = setTimeout(async () => {
      const storageKey = processedSuggestionsStorageKey(activeWorkspaceId);
      if (!storageKey) return;
      try {
        const now = Date.now();
        const payload: Record<string, number> = {};
        for (const [id, ts] of processedSuggestionIdsRef.current.entries()) {
          if (now - ts < PROCESSED_SUGGESTIONS_TTL_MS) payload[id] = ts;
        }
        await AsyncStorage.setItem(storageKey, JSON.stringify(payload));
      } catch {
        // Persistence failure must not break detection.
      }
    }, PROCESSED_SUGGESTIONS_FLUSH_DEBOUNCE_MS);
  }

  // Limpia el timer al desmontar.
  useEffect(() => {
    return () => {
      if (flushTimeoutRef.current) clearTimeout(flushTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    if (!profile?.id || !activeWorkspaceId || !notificationDetection.isAvailable()) return;
    // Espera a que la hidratacion del set persistido termine; evita reprocesar
    // sugerencias ya vistas en sesiones previas (dentro de 24h).
    if (!processedHydrated) return;
    if (syncRunningRef.current) {
      // Ya hay una corrida en vuelo: no cancelarla ni superponer otra; re-correr al terminar.
      syncRerunRef.current = true;
      return;
    }
    async function syncLocalSuggestions() {
      const suggestions = await notificationDetection.getSuggestions();
      for (const suggestion of suggestions) {
        if (unmountedRef.current || suggestion.status !== "pending") continue;
        if (processedSuggestionIdsRef.current.has(suggestion.id)) continue;
        processedSuggestionIdsRef.current.set(suggestion.id, Date.now());
        scheduleProcessedFlush();
        void recordDetectionEvent({
          userId: profile?.id ?? null,
          workspaceId: activeWorkspaceId,
          event: "suggestion_received",
          nativeSuggestionId: suggestion.id,
          financialAppKey: suggestion.financialAppKey ?? null,
          surface: "runtime_sync",
          metadata: {
            movementType: suggestion.movementType ?? null,
            confidence: suggestion.confidence ?? null,
            packageName: suggestion.packageName,
          },
        });
        if (suggestion.movementType === "transfer") {
          // Transferencias entre cuentas propias: sin comercio/categoría/contraparte.
          // Solo sincronizar y omitir toda la IA (clasificación, limpieza, contraparte, recurrente).
          await syncNativeDetectedSuggestion({
            userId: profile!.id,
            workspaceId: activeWorkspaceId!,
            nativeSuggestion: suggestion,
          }).catch(() => null);
          continue;
        }
        if (entitlementQuery.data?.proAccessEnabled && suggestion.confidence !== "high") {
          void recordDetectionEvent({
            userId: profile?.id ?? null,
            workspaceId: activeWorkspaceId,
            event: "ai_classifier_called",
            nativeSuggestionId: suggestion.id,
            financialAppKey: suggestion.financialAppKey ?? null,
            surface: "runtime_sync",
          });
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
            void recordDetectionEvent({
              userId: profile?.id ?? null,
              workspaceId: activeWorkspaceId,
              event: "ai_classifier_discarded",
              nativeSuggestionId: suggestion.id,
              financialAppKey: suggestion.financialAppKey ?? null,
              surface: "runtime_sync",
              metadata: {
                confidence: classification.classification.confidence,
                reason: classification.classification.reason ?? null,
              },
            });
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
            notificationDetection.setSuggestionAiCategoryRecommendation(suggestion.id, { status: "unavailable" });
          }
          continue;
        }
        // Only skip if there is already a real AI result (existing_category or new_category).
        // "pending", "unavailable", or null all mean the headless task did not produce a usable
        // suggestion — retry here with the full snapshot (categories, patternMaps, counterparties).
        const existingAiCategory = suggestion.aiCategoryRecommendation as { type?: unknown; status?: unknown } | undefined;
        const hasRealAiCategory =
          existingAiCategory?.type === "existing_category" || existingAiCategory?.type === "new_category";
        if (unmountedRef.current || !entitlementQuery.data?.proAccessEnabled || hasRealAiCategory) continue;
        const movementType = suggestion.movementType === "income" ? "income" : "expense";
        const categories = filterCategoriesForMovementType(snapshot?.categories ?? [], movementType);
        if (!description || categories.length === 0) continue;
        notificationDetection.setSuggestionAiCategoryRecommendation(suggestion.id, { status: "pending" });
        void recordDetectionEvent({
          userId: profile?.id ?? null,
          workspaceId: activeWorkspaceId,
          event: "ai_category_pending",
          nativeSuggestionId: suggestion.id,
          financialAppKey: suggestion.financialAppKey ?? null,
          surface: "runtime_sync",
        });
        const result = await orchestrateCategoryAiRecommendation({
          workspaceId: activeWorkspaceId!,
          surface: "android_overlay",
          movementType,
          description,
          amount: parseAmountLabel(suggestion.amountLabel),
          currencyCode: currencyFromAmountLabel(suggestion.amountLabel),
          occurredAt: new Date(suggestion.postTime ?? suggestion.createdAt ?? Date.now()).toISOString(),
          categories,
          patternMaps,
          canCallAi: true,
        });
        if (unmountedRef.current) continue;
        if (result.status === "ai_resolved" && result.recommendation) {
          notificationDetection.setSuggestionAiCategoryRecommendation(suggestion.id, result.recommendation);
          void recordDetectionEvent({
            userId: profile?.id ?? null,
            workspaceId: activeWorkspaceId,
            event: "ai_category_resolved",
            nativeSuggestionId: suggestion.id,
            financialAppKey: suggestion.financialAppKey ?? null,
            surface: "runtime_sync",
            metadata: {
              recommendationType: (result.recommendation as { type?: unknown })?.type ?? null,
              confidence: (result.recommendation as { confidence?: unknown })?.confidence ?? null,
            },
          });
        } else if (result.status === "local_confident") {
          // Local score is strong enough; clear "pending" to free the overlay.
          notificationDetection.setSuggestionAiCategoryRecommendation(suggestion.id, { status: "unavailable" });
          void recordDetectionEvent({
            userId: profile?.id ?? null,
            workspaceId: activeWorkspaceId,
            event: "ai_category_unavailable",
            nativeSuggestionId: suggestion.id,
            financialAppKey: suggestion.financialAppKey ?? null,
            surface: "runtime_sync",
            metadata: { reason: "local_confident" },
          });
        } else {
          notificationDetection.setSuggestionAiCategoryRecommendation(suggestion.id, { status: "unavailable" });
          void recordDetectionEvent({
            userId: profile?.id ?? null,
            workspaceId: activeWorkspaceId,
            event: "ai_category_unavailable",
            nativeSuggestionId: suggestion.id,
            financialAppKey: suggestion.financialAppKey ?? null,
            surface: "runtime_sync",
            metadata: { reason: result.status ?? "unknown" },
          });
        }
      }
      if (!unmountedRef.current) {
        void queryClient.invalidateQueries({ queryKey: ["notifications"] });
      }
    }
    syncRunningRef.current = true;
    void syncLocalSuggestions()
      .catch(() => null)
      .finally(() => {
        syncRunningRef.current = false;
        if (syncRerunRef.current && !unmountedRef.current) {
          syncRerunRef.current = false;
          // Bump del tick: re-dispara el efecto con closures FRESCOS (snapshot/patrones al día).
          setSyncTick((tick) => tick + 1);
        }
      });
  }, [
    syncTick,
    activeWorkspaceId,
    activeWorkspace?.baseCurrencyCode,
    entitlementQuery.data?.proAccessEnabled,
    patternMaps,
    processedHydrated,
    profile?.id,
    queryClient,
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
