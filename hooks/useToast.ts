import * as Haptics from "expo-haptics";
import { InteractionManager } from "react-native";
import { useUiStore } from "../store/ui-store";
import type { ToastVariant } from "../store/ui-store";
import { useDarkMoneyToast } from "../components/DarkMoneyToast";
import type { ToastConfig, ToastType } from "../components/DarkMoneyToast";

const VARIANT_TO_TYPE: Record<string, ToastType> = {
  success: "success",
  error: "delete",
  warning: "update",
  info: "transfer",
};

export function useToast() {
  const { dismissToast, triggerSuccessGlow } = useUiStore();
  const { show } = useDarkMoneyToast();

  function showToast(message: string, variant?: ToastVariant) {
    if (variant === "success") {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      triggerSuccessGlow();
    } else if (variant === "error") {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } else if (variant === "warning") {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    }
    InteractionManager.runAfterInteractions(() => {
      show({
        type: VARIANT_TO_TYPE[variant ?? "info"] ?? "success",
        title: message,
      });
    });
  }

  // Para casos ricos (delete con undo, transfer con amount, etc.)
  function showRichToast(config: ToastConfig) {
    if (config.type === "success") {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      triggerSuccessGlow();
    } else if (config.type === "delete") {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } else if (config.type === "update") {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    }
    InteractionManager.runAfterInteractions(() => {
      show(config);
    });
  }

  return { showToast, showRichToast, dismissToast };
}
