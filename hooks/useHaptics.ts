import * as Haptics from "expo-haptics";

export function useHaptics() {
  function success() {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }

  function error() {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
  }

  function warning() {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
  }

  function light() {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }

  function medium() {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  }

  function selection() {
    void Haptics.selectionAsync();
  }

  return { success, error, warning, light, medium, selection };
}
