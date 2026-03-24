import { QueryClientProvider } from "@tanstack/react-query";
import * as Linking from "expo-linking";
import { Slot, usePathname, useRouter, useSegments } from "expo-router";
import { useFonts } from "expo-font";
import * as SplashScreen from "expo-splash-screen";
import { useCallback, useEffect } from "react";
import { ImageBackground, StyleSheet, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { DarkTheme, ThemeProvider } from "@react-navigation/native";
import { Outfit_600SemiBold } from "@expo-google-fonts/outfit";
import {
  Manrope_400Regular,
  Manrope_500Medium,
  Manrope_600SemiBold,
} from "@expo-google-fonts/manrope";

import { AuthProvider, useAuth } from "../lib/auth-context";
import { queryClient } from "../lib/query-client";
import { WorkspaceProvider, useWorkspace } from "../lib/workspace-context";
import { useWorkspaceSnapshotQuery, useUserWorkspacesQuery } from "../services/queries/workspace-data";
import { OfflineBanner } from "../components/layout/OfflineBanner";
import { ToastContainer } from "../components/ui/Toast";
import {
  obligationShareHref,
  parseObligationShareTokenFromPath,
  parseObligationShareTokenFromUrl,
} from "../lib/obligation-share-link";
import {
  clearPendingObligationInviteToken,
  getPendingObligationInviteToken,
  setPendingObligationInviteToken,
} from "../lib/pending-obligation-invite";
import { usePushNotifications, scheduleSubscriptionReminders } from "../hooks/usePushNotifications";
import { BiometricLock } from "../components/ui/BiometricLock";

SplashScreen.preventAutoHideAsync();

const AppTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: "transparent",
  },
};

function FontLoader({ children }: { children: React.ReactNode }) {
  const [fontsLoaded] = useFonts({
    Outfit_600SemiBold,
    Manrope_400Regular,
    Manrope_500Medium,
    Manrope_600SemiBold,
  });
  if (!fontsLoaded) return <View style={{ flex: 1, backgroundColor: "#05070B" }} />;
  return <>{children}</>;
}

function NotificationSetup() {
  const { profile } = useAuth();
  const { activeWorkspaceId, setWorkspaces, setActiveWorkspaceId } = useWorkspace();

  // Bootstrap: load workspaces on login so activeWorkspaceId can be set
  const { data: workspaces } = useUserWorkspacesQuery(profile?.id);
  useEffect(() => {
    if (workspaces === undefined) return;
    if (workspaces.length === 0) {
      setWorkspaces([]);
      if (activeWorkspaceId !== null) setActiveWorkspaceId(null);
      return;
    }
    setWorkspaces(workspaces);
    const ids = new Set(workspaces.map((w) => w.id));
    if (activeWorkspaceId !== null && !ids.has(activeWorkspaceId)) {
      setActiveWorkspaceId(null);
      return;
    }
    if (activeWorkspaceId === null) {
      const def = workspaces.find((w) => w.isDefaultWorkspace) ?? workspaces[0];
      if (def) setActiveWorkspaceId(def.id);
    }
  }, [workspaces, activeWorkspaceId, setWorkspaces, setActiveWorkspaceId]);

  const { data: snapshot } = useWorkspaceSnapshotQuery(profile, activeWorkspaceId);

  useEffect(() => {
    if (!snapshot?.subscriptions) return;
    void scheduleSubscriptionReminders(
      snapshot.subscriptions
        .filter((s) => s.status === "active")
        .map((s) => ({
          id: s.id,
          name: s.name,
          nextDueDate: s.nextDueDate,
          remindDaysBefore: s.remindDaysBefore,
        })),
    );
  }, [snapshot?.subscriptions]);

  return null;
}

function NavigationGuard() {
  const { isLoading, session, profile } = useAuth();
  const segments = useSegments();
  const pathname = usePathname();
  const router = useRouter();
  const onObligationInviteFromPush = useCallback(
    (token: string) => {
      router.push(obligationShareHref(token));
    },
    [router],
  );

  usePushNotifications(profile?.id, {
    onObligationShareInviteTap: onObligationInviteFromPush,
  });

  // Universal link / cold start: asegurar token en cola si el pathname aún no llegó
  useEffect(() => {
    void Linking.getInitialURL().then((url) => {
      const t = parseObligationShareTokenFromUrl(url);
      if (t && !session) void setPendingObligationInviteToken(t);
    });
  }, [session]);

  useEffect(() => {
    if (isLoading) return;

    void SplashScreen.hideAsync();

    const inAuthGroup = segments[0] === "(auth)";
    const inOnboarding = segments[0] === "onboarding";
    const pathToken = parseObligationShareTokenFromPath(pathname);

    if (!session) {
      if (!inAuthGroup) {
        if (pathToken) void setPendingObligationInviteToken(pathToken);
        router.replace("/(auth)/login");
      }
      return;
    }

    if (profile && !profile.baseCurrencyCode && !inOnboarding) {
      if (pathToken) void setPendingObligationInviteToken(pathToken);
      router.replace("/onboarding");
      return;
    }

    if (inAuthGroup) {
      router.replace("/(app)/dashboard");
    }
  }, [isLoading, session, profile, segments, pathname, router]);

  // Tras login + onboarding: abrir invitación pendiente (misma URL que el correo / web)
  useEffect(() => {
    if (isLoading || !session || !profile?.baseCurrencyCode) return;
    if (pathname.includes("/share/obligations/")) return;

    let cancelled = false;
    void (async () => {
      const t = await getPendingObligationInviteToken();
      if (!t || cancelled) return;
      await clearPendingObligationInviteToken();
      if (cancelled) return;
      router.replace(obligationShareHref(t));
    })();
    return () => {
      cancelled = true;
    };
  }, [isLoading, session?.user?.id, profile?.baseCurrencyCode, pathname, router]);

  return (
    <ThemeProvider value={AppTheme}>
      <Slot />
    </ThemeProvider>
  );
}

export default function RootLayout() {
  return (
    <ImageBackground
      source={require("../assets/images/background-darkmoney.png")}
      style={styles.background}
      resizeMode="cover"
      blurRadius={4}
      imageStyle={{ backgroundColor: "#05070B" }}
    >
      <View style={styles.overlay} />
      <SafeAreaProvider>
        <FontLoader>
          <QueryClientProvider client={queryClient}>
            <AuthProvider>
              <WorkspaceProvider>
                <OfflineBanner />
                <NotificationSetup />
                <NavigationGuard />
                <BiometricLock />
                <ToastContainer />
              </WorkspaceProvider>
            </AuthProvider>
          </QueryClientProvider>
        </FontLoader>
      </SafeAreaProvider>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  background: {
    flex: 1,
    backgroundColor: "#05070B",
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(5, 7, 11, 0.72)",
  },
});
