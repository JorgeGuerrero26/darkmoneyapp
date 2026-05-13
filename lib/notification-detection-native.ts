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
  requestActiveNotificationScan(): void;
  showSuggestionNotification(suggestionId: string): void;
  setRuntimeContext?(contextJson: string): void;
  isIgnoringBatteryOptimizations?(): Promise<boolean>;
  requestIgnoreBatteryOptimizations?(): void;
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
};
