import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export type ToastVariant = "success" | "error" | "info" | "warning";

export type Toast = {
  id: string;
  message: string;
  variant: ToastVariant;
};

type UiState = {
  toasts: Toast[];
  isBiometricLocked: boolean;
  biometricEnabled: boolean;
  lastMovementAccountId: number | null;
  lastMovementCategoryId: number | null;
  showToast: (message: string, variant?: ToastVariant) => void;
  dismissToast: (id: string) => void;
  setBiometricLocked: (locked: boolean) => void;
  setBiometricEnabled: (enabled: boolean) => void;
  setLastMovementDefaults: (accountId: number | null, categoryId: number | null) => void;
};

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      toasts: [],
      isBiometricLocked: false,
      biometricEnabled: false,
      lastMovementAccountId: null,
      lastMovementCategoryId: null,

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

      setBiometricLocked: (locked) => set({ isBiometricLocked: locked }),
      setBiometricEnabled: (enabled) => set({ biometricEnabled: enabled }),
      setLastMovementDefaults: (accountId, categoryId) =>
        set({ lastMovementAccountId: accountId, lastMovementCategoryId: categoryId }),
    }),
    {
      name: "darkmoney-ui",
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        lastMovementAccountId: state.lastMovementAccountId,
        lastMovementCategoryId: state.lastMovementCategoryId,
      }),
    },
  ),
);
