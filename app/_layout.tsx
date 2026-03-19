import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Slot, useRouter, useSegments } from "expo-router";
import { useFonts } from "expo-font";
import * as SplashScreen from "expo-splash-screen";
import { useEffect } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { Outfit_600SemiBold } from "@expo-google-fonts/outfit";
import {
  Manrope_400Regular,
  Manrope_500Medium,
  Manrope_600SemiBold,
} from "@expo-google-fonts/manrope";

import { AuthProvider, useAuth } from "../lib/auth-context";
import { WorkspaceProvider, useWorkspace } from "../lib/workspace-context";
import { useWorkspaceSnapshotQuery, useUserWorkspacesQuery } from "../services/queries/workspace-data";
import { OfflineBanner } from "../components/layout/OfflineBanner";
import { ToastContainer } from "../components/ui/Toast";
import { usePushNotifications, scheduleSubscriptionReminders } from "../hooks/usePushNotifications";
import { BiometricLock } from "../components/ui/BiometricLock";

SplashScreen.preventAutoHideAsync();

function FontLoader({ children }: { children: React.ReactNode }) {
  const [fontsLoaded] = useFonts({
    Outfit_600SemiBold,
    Manrope_400Regular,
    Manrope_500Medium,
    Manrope_600SemiBold,
  });
  if (!fontsLoaded) return null;
  return <>{children}</>;
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      retry: 1,
    },
  },
});

function NotificationSetup() {
  const { profile } = useAuth();
  const { activeWorkspaceId, setWorkspaces, setActiveWorkspaceId } = useWorkspace();

  // Bootstrap: load workspaces on login so activeWorkspaceId can be set
  const { data: workspaces } = useUserWorkspacesQuery(profile?.id);
  useEffect(() => {
    if (!workspaces?.length) return;
    setWorkspaces(workspaces);
    if (activeWorkspaceId === null) {
      const def = workspaces.find((w) => w.isDefaultWorkspace) ?? workspaces[0];
      if (def) setActiveWorkspaceId(def.id);
    }
  }, [workspaces, activeWorkspaceId, setWorkspaces, setActiveWorkspaceId]);

  const { data: snapshot } = useWorkspaceSnapshotQuery(profile, activeWorkspaceId);

  usePushNotifications(profile?.id);

  useEffect(() => {
    if (!snapshot?.subscriptions) return;
    void scheduleSubscriptionReminders(
      snapshot.subscriptions
        .filter((s) => s.status === "active" && s.remindDaysBefore > 0)
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
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;

    void SplashScreen.hideAsync();

    const inAuthGroup = segments[0] === "(auth)";
    const inOnboarding = segments[0] === "onboarding";

    if (!session) {
      if (!inAuthGroup) {
        router.replace("/(auth)/login");
      }
      return;
    }

    // Authenticated but profile not yet set up (no base currency)
    if (profile && !profile.baseCurrencyCode && !inOnboarding) {
      router.replace("/onboarding");
      return;
    }

    if (inAuthGroup) {
      router.replace("/(app)/dashboard");
    }
  }, [isLoading, session, profile, segments, router]);

  return <Slot />;
}

export default function RootLayout() {
  return (
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
  );
}
