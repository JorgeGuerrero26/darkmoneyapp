import { useCallback, useEffect, useRef } from "react";
import { BackHandler } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { useLocalSearchParams, useRouter } from "expo-router";

type OriginBackNavigationOptions = {
  defaultRoute?: string;
  originRoutes?: Record<string, string>;
  /** Cuando es true no se instala el listener beforeRemove, permitiendo
   *  que navegaciones programáticas (ej. sign-out redirect) no sean
   *  interceptadas ni redirigidas al origen. */
  skipInterception?: boolean;
};

function readParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export function useOriginBackNavigation({
  defaultRoute = "/(app)/more",
  originRoutes = {},
  skipInterception = false,
}: OriginBackNavigationOptions = {}) {
  const router = useRouter();
  const navigation = useNavigation();
  const params = useLocalSearchParams<{ from?: string | string[] }>();
  const from = readParam(params.from);
  const fallbackRoute = from ? originRoutes[from] ?? defaultRoute : defaultRoute;
  const navigatingRef = useRef(false);

  const handleBack = useCallback(() => {
    if (navigatingRef.current) return;
    navigatingRef.current = true;
    if (from) {
      // Tabs navigator exposes jumpTo; Stack navigator does not.
      const tabName = fallbackRoute.split("/").pop() ?? "more";
      if (typeof (navigation as any).jumpTo === "function") {
        // Tabs context: switch to the target tab.
        // Reset guard because Tab screens stay mounted (detachInactiveScreens=false).
        (navigation as any).jumpTo(tabName);
        setTimeout(() => { navigatingRef.current = false; }, 300);
      } else {
        // Stack context: pop back — animation is already suppressed via
        // animation:"none" on the screen entry in app/_layout.tsx.
        router.back();
      }
      return;
    }

    if (navigation.canGoBack()) {
      router.back();
      return;
    }

    navigation.setOptions({ animationEnabled: false } as any);
    router.replace(defaultRoute as any);
  }, [defaultRoute, fallbackRoute, from, navigation, router]);

  // Intercept navigation back events (iOS swipe / RN navigation back) and
  // Android system back gesture/button so they respect the origin route
  // (e.g. "from=more") instead of navigating to the previous tab (dashboard).
  // When skipInterception is true (e.g. during sign-out) the interception is
  // disabled so that NavigationGuard redirects are not blocked.
  useEffect(() => {
    if (skipInterception) return;

    // iOS swipe gesture & programmatic back
    const unsubBeforeRemove = navigation.addListener("beforeRemove", (e) => {
      if (navigatingRef.current) return; // allow programmatic navigation
      // Si handleBack() llama a router.back() igual que el pop por defecto, no interceptar
      if (navigation.canGoBack()) return;
      e.preventDefault();
      handleBack();
    });

    // Android system back gesture / hardware button
    const backHandler = BackHandler.addEventListener("hardwareBackPress", () => {
      handleBack();
      return true; // we handled it, prevent default
    });

    return () => {
      unsubBeforeRemove();
      backHandler.remove();
    };
  }, [from, handleBack, navigation, skipInterception]);

  return { from, fallbackRoute, handleBack };
}
