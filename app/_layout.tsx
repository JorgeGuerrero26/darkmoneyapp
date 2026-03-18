import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Slot, useRouter, useSegments } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { AuthProvider, useAuth } from "../lib/auth-context";
import { WorkspaceProvider, useWorkspace } from "../lib/workspace-context";
import { useWorkspaceSnapshotQuery } from "../services/queries/workspace-data";
import { OfflineBanner } from "../components/layout/OfflineBanner";
import { ToastContainer } from "../components/ui/Toast";
import { usePushNotifications, scheduleSubscriptionReminders } from "../hooks/usePushNotifications";
import { BiometricLock } from "../components/ui/BiometricLock";

SplashScreen.preventAutoHideAsync();

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
  const { activeWorkspaceId } = useWorkspace();
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
    </SafeAreaProvider>
  );
}
