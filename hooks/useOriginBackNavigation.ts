import { useCallback, useEffect } from "react";
import { BackHandler } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { useLocalSearchParams, useRouter } from "expo-router";

type OriginBackNavigationOptions = {
  defaultRoute?: string;
  originRoutes?: Record<string, string>;
};

function readParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export function useOriginBackNavigation({
  defaultRoute = "/(app)/more",
  originRoutes = {},
}: OriginBackNavigationOptions = {}) {
  const router = useRouter();
  const navigation = useNavigation();
  const params = useLocalSearchParams<{ from?: string | string[] }>();
  const from = readParam(params.from);
  const fallbackRoute = from ? originRoutes[from] ?? defaultRoute : defaultRoute;

  const handleBack = useCallback(() => {
    if (from) {
      router.replace(fallbackRoute as any);
      return;
    }

    if (navigation.canGoBack()) {
      router.back();
      return;
    }

    router.replace(defaultRoute as any);
  }, [defaultRoute, fallbackRoute, from, navigation, router]);

  // Intercept navigation back events (iOS swipe / RN navigation back) and
  // Android system back gesture/button so they respect the origin route
  // (e.g. "from=more") instead of navigating to the previous tab (dashboard).
  useEffect(() => {
    if (!from) return;

    // iOS swipe gesture & programmatic back
    const unsubBeforeRemove = navigation.addListener("beforeRemove", (e) => {
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
  }, [from, handleBack, navigation]);

  return { from, fallbackRoute, handleBack };
}
