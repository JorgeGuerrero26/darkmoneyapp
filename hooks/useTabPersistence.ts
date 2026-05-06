import AsyncStorage from "@react-native-async-storage/async-storage";
import { usePathname } from "expo-router";
import { useEffect, useRef } from "react";
import { AppState } from "react-native";

const TAB_PERSISTENCE_KEY = "darkmoney-last-tab";

const TAB_ROUTES = [
  "/dashboard",
  "/movements",
  "/accounts",
  "/obligations",
  "/more",
];

function isTabRoute(pathname: string): boolean {
  const normalized = pathname.replace(/^\/\(app\)/, "");
  return TAB_ROUTES.includes(normalized);
}

/**
 * Persists the current tab route to AsyncStorage whenever it changes,
 * including when the app goes to background (AppState → "background").
 * This ensures the last active tab is saved even if focus effects fail
 * on rehydrate after background.
 */
async function persistTab(pathname: string) {
  if (!isTabRoute(pathname)) return;
  const normalized = pathname.replace(/^\/\(app\)/, "");
  try {
    await AsyncStorage.setItem(TAB_PERSISTENCE_KEY, normalized);
  } catch {
    // Silently fail – persistence is best-effort
  }
}

/**
 * Returns the last persisted tab route, or null if none.
 */
export async function getLastTabRoute(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(TAB_PERSISTENCE_KEY);
  } catch {
    return null;
  }
}

/**
 * Clears the persisted tab route. Useful on logout.
 */
export async function clearLastTabRoute() {
  try {
    await AsyncStorage.removeItem(TAB_PERSISTENCE_KEY);
  } catch {
    // Silently fail
  }
}

/**
 * Hook to persist the current tab route.
 * - Persists on every pathname change (tab switch).
 * - Also persists when the app goes to background (AppState).
 * - Uses useEffect (not useFocusEffect) to avoid focus-rehydration issues.
 * Should be used once in the Tab navigator layout.
 */
export function useTabPersistence() {
  const pathname = usePathname();
  const lastPathnameRef = useRef(pathname);

  // Persist every time pathname changes (tab switch)
  useEffect(() => {
    lastPathnameRef.current = pathname;
    persistTab(pathname);
  }, [pathname]);

  // Also persist when app goes to background
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "background") {
        persistTab(lastPathnameRef.current);
      }
    });
    return () => subscription.remove();
  }, []);
}
