import { useCallback, useEffect, useRef } from "react";
import { BackHandler } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { useLocalSearchParams, useRouter } from "expo-router";

import { resolveOriginBackAction } from "../lib/origin-back-action";

type OriginBackNavigationOptions = {
  defaultRoute?: string;
  originRoutes?: Record<string, string>;
  /** When true, do not intercept navigation events. Useful for flows such as sign out. */
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

    const action = resolveOriginBackAction({
      hasOrigin: Boolean(from),
      canGoBack: navigation.canGoBack(),
    });

    if (action === "pop") {
      router.back();
      setTimeout(() => { navigatingRef.current = false; }, 300);
      return;
    }

    if (action === "replace-origin") {
      router.replace(fallbackRoute as any);
      setTimeout(() => { navigatingRef.current = false; }, 300);
      return;
    }

    navigation.setOptions({ animationEnabled: false } as any);
    router.replace(defaultRoute as any);
  }, [defaultRoute, fallbackRoute, from, navigation, router]);

  // Intercept back events only when the route declares an origin. Screens without
  // an origin keep the normal stack/back behavior.
  useEffect(() => {
    if (skipInterception) return;

    const unsubBeforeRemove = navigation.addListener("beforeRemove", (e) => {
      if (navigatingRef.current || !from) return;
      e.preventDefault();
      handleBack();
    });

    const backHandler = BackHandler.addEventListener("hardwareBackPress", () => {
      if (!from) return false;
      handleBack();
      return true;
    });

    return () => {
      unsubBeforeRemove();
      backHandler.remove();
    };
  }, [from, handleBack, navigation, skipInterception]);

  return { from, fallbackRoute, handleBack };
}
