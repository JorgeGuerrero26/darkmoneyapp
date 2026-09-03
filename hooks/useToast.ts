import * as Haptics from "expo-haptics";
import { InteractionManager } from "react-native";
import { useUiStore } from "../store/ui-store";
import type { ToastVariant } from "../store/ui-store";
import { useDarkMoneyToast } from "../components/DarkMoneyToast";
import type { ToastConfig, ToastType } from "../components/DarkMoneyToast";

/* "error" ya no se mapea a "delete": borrar es algo que el usuario pidió y sale neutro; el
   color queda para lo que falló, que es lo único a lo que hay que reaccionar. */
const VARIANT_TO_TYPE: Record<string, ToastType> = {
  success: "success",
  error: "error",
  warning: "update",
  info: "info",
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
    /* El mismo argumento que el color, en el tacto: borrar lo pidió el usuario y no es un
       error, así que no vibra como uno. El aviso de fallo es el único que lo hace. */
    if (config.type === "error") {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } else if (config.type === "success") {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      triggerSuccessGlow();
    } else {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    InteractionManager.runAfterInteractions(() => {
      show(config);
    });
  }

  return { showToast, showRichToast, dismissToast };
}
