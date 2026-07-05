import { NativeModules, Platform } from "react-native";

type NativeNotificationDetection = {
  isNotificationAccessEnabled(): Promise<boolean>;
  openNotificationAccessSettings(): void;
  canDrawOverlays(): Promise<boolean>;
  openOverlaySettings(): void;
  getDetectionEnabled(): Promise<boolean>;
  setDetectionEnabled(enabled: boolean): void;
  getDefaultAllowedPackages(): Promise<string[]>;
  getAllowedPackages(): Promise<string[]>;
  setAllowedPackages(packages: string[]): void;
  getSuggestions(): Promise<NotificationDetectionSuggestion[]>;
  discardSuggestion(suggestionId: string): void;
  markSuggestionRegistered(suggestionId: string, notificationId: number): void;
  setSuggestionAiCategoryRecommendation?(suggestionId: string, recommendationJson: string): void;
  setSuggestionDescriptionCleanup?(suggestionId: string, cleanupJson: string): void;
  setSuggestionCounterpartyRecommendation?(suggestionId: string, recommendationJson: string): void;
  setSuggestionRecurringRecommendation?(suggestionId: string, recommendationJson: string): void;
  setSuggestionRiskExplanation?(suggestionId: string, explanationJson: string): void;
  setSuggestionBudgetImpact?(suggestionId: string, impactJson: string): void;
  requestActiveNotificationScan(): void;
  showSuggestionNotification(suggestionId: string): void;
  setRuntimeContext?(contextJson: string): void;
  isIgnoringBatteryOptimizations?(): Promise<boolean>;
  requestIgnoreBatteryOptimizations?(): void;
  setLastSaveError?(suggestionId: string, message: string): void;
  getLastSaveError?(): Promise<string | null>;
  clearLastSaveError?(): void;
  requestCancelBankNotification?(suggestionId: string): void;
  enqueueSaveRetry?(suggestionId: string, payloadJson: string): void;
  getDueSaveRetries?(): Promise<string>;
  getAllSaveRetries?(): Promise<string>;
  clearSaveRetry?(suggestionId: string): void;
};

export type PendingSaveRetry = {
  suggestionId: string;
  payloadJson: string;
  attempts: number;
  nextAttemptAtMs: number;
};

export type DetectionLastSaveError = {
  suggestionId: string;
  message: string;
  ts: number;
};

export type NotificationDetectionSuggestion = {
  id: string;
  status: "pending" | "registered" | "discarded" | string;
  packageName: string;
  financialAppKey?: string;
  appName: string;
  title?: string;
  text?: string;
  subText?: string;
  postTime?: number;
  notificationKey?: string;
  amountLabel?: string;
  movementType?: "expense" | "income" | "unknown" | string;
  confidence?: "high" | "medium" | "low" | string;
  aiCategoryRecommendation?: unknown;
  descriptionCleanup?: unknown;
  counterpartyRecommendation?: unknown;
  recurringRecommendation?: unknown;
  riskExplanation?: unknown;
  budgetImpact?: unknown;
  createdAt?: number;
  updatedAt?: number;
  notificationId?: number;
};

const nativeModule = NativeModules.NotificationDetection as NativeNotificationDetection | undefined;

export const notificationDetection = {
  isAvailable() {
    return Platform.OS === "android" && Boolean(nativeModule);
  },
  async isNotificationAccessEnabled() {
    if (!nativeModule) return false;
    return nativeModule.isNotificationAccessEnabled();
  },
  openNotificationAccessSettings() {
    nativeModule?.openNotificationAccessSettings();
  },
  async canDrawOverlays() {
    if (!nativeModule) return false;
    return nativeModule.canDrawOverlays();
  },
  openOverlaySettings() {
    nativeModule?.openOverlaySettings();
  },
  async getDetectionEnabled() {
    if (!nativeModule) return false;
    return nativeModule.getDetectionEnabled();
  },
  setDetectionEnabled(enabled: boolean) {
    nativeModule?.setDetectionEnabled(enabled);
  },
  async getDefaultAllowedPackages() {
    if (!nativeModule) return [];
    return nativeModule.getDefaultAllowedPackages();
  },
  async getAllowedPackages() {
    if (!nativeModule) return [];
    return nativeModule.getAllowedPackages();
  },
  setAllowedPackages(packages: string[]) {
    nativeModule?.setAllowedPackages(packages);
  },
  async getSuggestions() {
    if (!nativeModule) return [];
    return nativeModule.getSuggestions();
  },
  discardSuggestion(suggestionId: string) {
    nativeModule?.discardSuggestion(suggestionId);
  },
  markSuggestionRegistered(suggestionId: string, notificationId?: number) {
    nativeModule?.markSuggestionRegistered(suggestionId, notificationId ?? 0);
  },
  setSuggestionAiCategoryRecommendation(suggestionId: string, recommendation: unknown) {
    nativeModule?.setSuggestionAiCategoryRecommendation?.(suggestionId, JSON.stringify(recommendation ?? null));
  },
  setSuggestionDescriptionCleanup(suggestionId: string, cleanup: unknown) {
    nativeModule?.setSuggestionDescriptionCleanup?.(suggestionId, JSON.stringify(cleanup ?? null));
  },
  setSuggestionCounterpartyRecommendation(suggestionId: string, recommendation: unknown) {
    nativeModule?.setSuggestionCounterpartyRecommendation?.(suggestionId, JSON.stringify(recommendation ?? null));
  },
  setSuggestionRecurringRecommendation(suggestionId: string, recommendation: unknown) {
    nativeModule?.setSuggestionRecurringRecommendation?.(suggestionId, JSON.stringify(recommendation ?? null));
  },
  setSuggestionRiskExplanation(suggestionId: string, explanation: unknown) {
    nativeModule?.setSuggestionRiskExplanation?.(suggestionId, JSON.stringify(explanation ?? null));
  },
  setSuggestionBudgetImpact(suggestionId: string, impact: unknown) {
    nativeModule?.setSuggestionBudgetImpact?.(suggestionId, JSON.stringify(impact ?? null));
  },
  requestActiveNotificationScan() {
    nativeModule?.requestActiveNotificationScan();
  },
  showSuggestionNotification(suggestionId: string) {
    nativeModule?.showSuggestionNotification(suggestionId);
  },
  setRuntimeContext(context: unknown) {
    nativeModule?.setRuntimeContext?.(JSON.stringify(context));
  },
  async isIgnoringBatteryOptimizations(): Promise<boolean> {
    if (!nativeModule?.isIgnoringBatteryOptimizations) return true;
    return nativeModule.isIgnoringBatteryOptimizations();
  },
  requestIgnoreBatteryOptimizations() {
    nativeModule?.requestIgnoreBatteryOptimizations?.();
  },
  setLastSaveError(suggestionId: string, message: string) {
    nativeModule?.setLastSaveError?.(suggestionId, message);
  },
  async getLastSaveError(): Promise<DetectionLastSaveError | null> {
    if (!nativeModule?.getLastSaveError) return null;
    try {
      const raw = await nativeModule.getLastSaveError();
      if (!raw) return null;
      const parsed = JSON.parse(raw) as DetectionLastSaveError;
      if (!parsed?.suggestionId || !parsed?.message) return null;
      return parsed;
    } catch {
      return null;
    }
  },
  clearLastSaveError() {
    nativeModule?.clearLastSaveError?.();
  },
  requestCancelBankNotification(suggestionId: string) {
    nativeModule?.requestCancelBankNotification?.(suggestionId);
  },
  /**
   * TODA la cola de reintentos de guardado headless (vencidos o no). Para mostrar al
   * usuario qué registros detectados siguen enviándose en segundo plano. Si el APK
   * instalado aún no expone getAllSaveRetries, cae a getDueSaveRetries (solo vencidos).
   */
  async getAllSaveRetries(): Promise<PendingSaveRetry[]> {
    const reader = nativeModule?.getAllSaveRetries ?? nativeModule?.getDueSaveRetries;
    if (!reader) return [];
    try {
      const raw = await reader.call(nativeModule);
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) return [];
      return parsed.filter(
        (entry): entry is PendingSaveRetry =>
          Boolean(entry) &&
          typeof (entry as PendingSaveRetry).suggestionId === "string" &&
          typeof (entry as PendingSaveRetry).payloadJson === "string",
      );
    } catch {
      return [];
    }
  },
  /** Reintentos de guardado headless pendientes cuyo backoff ya venció. */
  async getDueSaveRetries(): Promise<PendingSaveRetry[]> {
    if (!nativeModule?.getDueSaveRetries) return [];
    try {
      const raw = await nativeModule.getDueSaveRetries();
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) return [];
      return parsed.filter(
        (entry): entry is PendingSaveRetry =>
          Boolean(entry) &&
          typeof (entry as PendingSaveRetry).suggestionId === "string" &&
          typeof (entry as PendingSaveRetry).payloadJson === "string",
      );
    } catch {
      return [];
    }
  },
  enqueueSaveRetry(suggestionId: string, payloadJson: string) {
    nativeModule?.enqueueSaveRetry?.(suggestionId, payloadJson);
  },
  clearSaveRetry(suggestionId: string) {
    nativeModule?.clearSaveRetry?.(suggestionId);
  },
};
