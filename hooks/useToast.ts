import * as Haptics from "expo-haptics";
import { InteractionManager } from "react-native";
import { useUiStore } from "../store/ui-store";
import type { ToastVariant } from "../store/ui-store";

export function useToast() {
  const { showToast: storeShowToast, dismissToast, triggerSuccessGlow } = useUiStore();

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
      storeShowToast(message, variant);
    });
  }

  return { showToast, dismissToast };
}
