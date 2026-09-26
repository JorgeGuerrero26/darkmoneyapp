import { createContext, useCallback, useContext, useEffect, useMemo } from "react";
import { AppState } from "react-native";
import { NavigationContext } from "@react-navigation/native";
import { runOnUI, useSharedValue, type SharedValue } from "react-native-reanimated";

type SwipeRowScope = {
  owner: SharedValue<string | null>;
  revision: SharedValue<number>;
};

export const SwipeRowContext = createContext<SwipeRowScope | null>(null);

/** One owner per list. Invalidating also rejects late events from an interrupted drag. */
export function useSwipeRowScope() {
  const owner = useSharedValue<string | null>(null);
  const revision = useSharedValue(0);
  const navigation = useContext(NavigationContext);
  const reset = useCallback(() => {
    runOnUI(() => {
      "worklet";
      revision.value += 1;
      owner.value = null;
    })();
  }, [owner, revision]);

  useEffect(() => {
    const unsubscribe = navigation?.addListener("blur", reset);
    const subscription = AppState.addEventListener("change", (state) => {
      if (state !== "active") reset();
    });
    return () => {
      unsubscribe?.();
      subscription.remove();
    };
  }, [navigation, reset]);

  const scope = useMemo(() => ({ owner, revision }), [owner, revision]);
  return { scope, reset };
}
