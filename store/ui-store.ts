import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export type ToastVariant = "success" | "error" | "info" | "warning";

export type Toast = {
  id: string;
  message: string;
  variant: ToastVariant;
};

export type ActivityNotice = {
  id: string;
  message: string;
  description?: string;
};

export type DashboardMode = "simple" | "advanced";

type UiState = {
  toasts: Toast[];
  activityNotice: ActivityNotice | null;
  isBiometricLocked: boolean;
  biometricEnabled: boolean;
  /** Última cuenta usada al crear un movimiento (sigue la categoría sin persistir). */
  lastMovementAccountId: number | null;
  dashboardMode: DashboardMode;
  dashboardScrollY: number;
  /** Incrementing token — each new value triggers the SuccessGlow animation. */
  successGlowToken: number;
  showToast: (message: string, variant?: ToastVariant) => void;
  dismissToast: (id: string) => void;
  showActivityNotice: (message: string, description?: string) => string;
  dismissActivityNotice: (id?: string) => void;
  setBiometricLocked: (locked: boolean) => void;
  setBiometricEnabled: (enabled: boolean) => void;
  setLastMovementAccountId: (accountId: number | null) => void;
  setDashboardMode: (mode: DashboardMode) => void;
  setDashboardScrollY: (y: number) => void;
  triggerSuccessGlow: () => void;
};

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      toasts: [],
      activityNotice: null,
      isBiometricLocked: false,
      biometricEnabled: false,
      lastMovementAccountId: null,
      dashboardMode: "simple",
      dashboardScrollY: 0,
      successGlowToken: 0,

      showToast: (message, variant = "success") =>
        set((state) => ({
          toasts: [
            ...state.toasts,
            { id: Date.now().toString(), message, variant },
          ],
        })),

      dismissToast: (id) =>
        set((state) => ({
          toasts: state.toasts.filter((t) => t.id !== id),
        })),

      showActivityNotice: (message, description) => {
        const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        set({
          activityNotice: {
            id,
            message,
            description,
          },
        });
        return id;
      },

      dismissActivityNotice: (id) =>
        set((state) => {
          if (!state.activityNotice) return state;
          if (id && state.activityNotice.id !== id) return state;
          return { activityNotice: null };
        }),

      setBiometricLocked: (locked) => set({ isBiometricLocked: locked }),
      setBiometricEnabled: (enabled) => set({ biometricEnabled: enabled }),
      setLastMovementAccountId: (accountId) => set({ lastMovementAccountId: accountId }),
      setDashboardMode: (mode) => set({ dashboardMode: mode }),
      setDashboardScrollY: (y) => set({ dashboardScrollY: y }),
      triggerSuccessGlow: () => set((s) => ({ successGlowToken: s.successGlowToken + 1 })),
    }),
    {
      name: "darkmoney-ui",
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        lastMovementAccountId: state.lastMovementAccountId,
        dashboardMode: state.dashboardMode,
      }),
      /** Quita `lastMovementCategoryId` de almacenamientos antiguos (ya no se persiste). */
      merge: (persisted, current) => {
        const p =
          persisted && typeof persisted === "object"
            ? { ...(persisted as Record<string, unknown>) }
            : {};
        delete p.lastMovementCategoryId;
        return Object.assign({}, current, p) as UiState;
      },
    },
  ),
);
