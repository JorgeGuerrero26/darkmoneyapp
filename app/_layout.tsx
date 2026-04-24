import { QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import * as Linking from "expo-linking";
import { Stack, usePathname, useRouter, useSegments } from "expo-router";
import { useFonts } from "expo-font";
import * as SplashScreen from "expo-splash-screen";
import { useCallback, useEffect, useRef, useState } from "react";
import { Animated, Easing, Image, ImageBackground, Platform, StyleSheet, Text, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { DarkTheme, ThemeProvider } from "@react-navigation/native";
import { Outfit_600SemiBold } from "@expo-google-fonts/outfit";
import {
  Manrope_400Regular,
  Manrope_500Medium,
  Manrope_600SemiBold,
} from "@expo-google-fonts/manrope";

import { AuthProvider, useAuth } from "../lib/auth-context";
import { queryClient } from "../lib/query-client";
import { supabase } from "../lib/supabase";
import { WorkspaceProvider, useWorkspace } from "../lib/workspace-context";
import {
  useNotificationsQuery,
  useSharedObligationsQuery,
  useWorkspaceSnapshotQuery,
  useUserWorkspacesQuery,
} from "../services/queries/workspace-data";
import { OfflineBanner } from "../components/layout/OfflineBanner";
import { ActivityNoticeContainer } from "../components/ui/ActivityNotice";
import { ToastProvider } from "../components/DarkMoneyToast";
import { SuccessGlow } from "../components/ui/SuccessGlow";
import { SafeBlurView } from "../components/ui/SafeBlurView";
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
import {
  clearPendingWorkspaceInviteToken,
  getPendingWorkspaceInviteToken,
  setPendingWorkspaceInviteToken,
} from "../lib/pending-workspace-invite";
import {
  parseWorkspaceInviteTokenFromPath,
  parseWorkspaceInviteTokenFromUrl,
  workspaceInviteHref,
} from "../lib/workspace-invite-link";
import {
  usePushNotifications,
  scheduleSubscriptionReminders,
  scheduleObligationReminders,
  scheduleRecurringIncomeReminders,
} from "../hooks/usePushNotifications";
import { useNotificationGenerator } from "../hooks/useNotificationGenerator";
import { BiometricLock } from "../components/ui/BiometricLock";
import { getNotificationsModule } from "../lib/notifications-runtime";
import { hasSavedAuthOnDevice } from "../lib/device-auth-state";

const Notifications = getNotificationsModule();

SplashScreen.preventAutoHideAsync();

const AppTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: "transparent",
  },
};

function readNotificationEventId(payload: unknown, fallbackRelatedEntityId: unknown): number | null {
  if (payload && typeof payload === "object" && !Array.isArray(payload)) {
    const rawEventId = (payload as Record<string, unknown>).eventId;
    const eventId = Number(rawEventId ?? 0);
    if (Number.isFinite(eventId) && eventId > 0) return eventId;
  }
  const fallback = Number(fallbackRelatedEntityId ?? 0);
  return Number.isFinite(fallback) && fallback > 0 ? fallback : null;
}

function readMovementMetadataNumber(payload: unknown, key: string): number | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const rawValue = (payload as Record<string, unknown>)[key];
  const value = Number(rawValue ?? 0);
  return Number.isFinite(value) && value > 0 ? value : null;
}

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
  const queryClient = useQueryClient();
  const { profile, session, isLoading: authLoading } = useAuth();
  const { activeWorkspaceId, activeWorkspace, setWorkspaces, setActiveWorkspaceId } = useWorkspace();
  const processedEventSyncNotificationsRef = useRef<Set<number>>(new Set());
  const processedEventRefreshNotificationsRef = useRef<Set<number>>(new Set());
  const eventSyncInFlightRef = useRef(false);
  const orphanViewerLinkInFlightRef = useRef<Set<number>>(new Set());
  const orphanViewerMovementInFlightRef = useRef<Set<number>>(new Set());

  // Bootstrap: load workspaces on login so activeWorkspaceId can be set
  const { data: workspaces, isLoading: workspacesLoading } = useUserWorkspacesQuery(profile?.id);
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

  const { data: snapshot, isLoading: snapshotLoading } = useWorkspaceSnapshotQuery(profile, activeWorkspaceId);
  const { data: notifications = [] } = useNotificationsQuery(profile?.id ?? null);
  const { data: sharedObligations = [] } = useSharedObligationsQuery(session?.user?.id ?? null);

  const resolvedActiveWorkspace =
    activeWorkspace ??
    workspaces?.find((workspace) => workspace.id === activeWorkspaceId) ??
    snapshot?.workspaces?.find((workspace) => workspace.id === activeWorkspaceId) ??
    null;

  const isCheckingSession = authLoading;

  const showWorkspaceBootstrapOverlay =
    isCheckingSession ||
    (
      Boolean(session?.user?.id && profile?.id) &&
      (
        workspacesLoading ||
        workspaces === undefined ||
        (
          (workspaces?.length ?? 0) > 0 &&
          (
            !activeWorkspaceId ||
            !resolvedActiveWorkspace ||
            snapshotLoading ||
            !snapshot
          )
        )
      )
    );

  const bootstrapTitle = isCheckingSession ? "Verificando sesión" : "Cargando workspace";
  const bootstrapBody = isCheckingSession
    ? "Estamos comprobando si tu sesión sigue activa antes de entrar a la aplicación."
    : resolvedActiveWorkspace?.name
      ? `Estamos preparando ${resolvedActiveWorkspace.name} para mostrar la información completa.`
      : "Estamos preparando tus cuentas, movimientos y módulos antes de dejarte navegar.";
  const workspaceBootstrapPulse = useRef(new Animated.Value(0)).current;
  const workspaceBootstrapLogoScale = workspaceBootstrapPulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.98, 1.04],
  });
  const workspaceBootstrapLogoOpacity = workspaceBootstrapPulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.92, 1],
  });

  useNotificationGenerator(profile?.id, snapshot);

  // Pedir permisos al iniciar la app (cuando el usuario ya está logueado)
  useEffect(() => {
    if (!profile?.id || !Notifications) return;
    void (async () => {
      try {
        const { status } = await Notifications.getPermissionsAsync();
        if (status !== "granted") {
          await Notifications.requestPermissionsAsync();
        }
      } catch (error) {
        console.warn("[NotificationSetup] permission bootstrap failed:", error);
      }
    })();
  }, [profile?.id]);

  useEffect(() => {
    if (!showWorkspaceBootstrapOverlay) {
      workspaceBootstrapPulse.stopAnimation();
      workspaceBootstrapPulse.setValue(0);
      return;
    }
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(workspaceBootstrapPulse, {
          toValue: 1,
          duration: 2400,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(workspaceBootstrapPulse, {
          toValue: 0,
          duration: 2400,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );
    animation.start();
    return () => {
      animation.stop();
      workspaceBootstrapPulse.stopAnimation();
    };
  }, [showWorkspaceBootstrapOverlay, workspaceBootstrapPulse]);

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
    ).catch((error) => {
      console.warn("[NotificationSetup] subscription reminders failed:", error);
    });
  }, [snapshot?.subscriptions]);

  useEffect(() => {
    if (!snapshot?.obligations) return;
    void scheduleObligationReminders(
      snapshot.obligations
        .filter((o) => o.status === "active" && o.dueDate)
        .map((o) => ({
          id: o.id,
          title: o.title,
          dueDate: o.dueDate!,
          pendingAmount: o.pendingAmount,
          currencyCode: o.currencyCode,
        })),
    ).catch((error) => {
      console.warn("[NotificationSetup] obligation reminders failed:", error);
    });
  }, [snapshot?.obligations]);

  useEffect(() => {
    if (!snapshot?.recurringIncome) return;
    void scheduleRecurringIncomeReminders(
      snapshot.recurringIncome
        .filter((income) => income.status === "active")
        .map((income) => ({
          id: income.id,
          name: income.name,
          nextExpectedDate: income.nextExpectedDate,
          remindDaysBefore: income.remindDaysBefore,
        })),
    ).catch((error) => {
      console.warn("[NotificationSetup] recurring income reminders failed:", error);
    });
  }, [snapshot?.recurringIncome]);

  useEffect(() => {
    if (!profile?.id || !supabase || !activeWorkspaceId || eventSyncInFlightRef.current) return;
    const target = notifications.find(
      (item) =>
        (item.kind === "obligation_event_delete_accepted" || item.kind === "obligation_event_deleted") &&
        !processedEventSyncNotificationsRef.current.has(item.id),
    );
    if (!target) return;

    const eventId = readNotificationEventId(target.payload, target.relatedEntityId);
    processedEventSyncNotificationsRef.current.add(target.id);
    eventSyncInFlightRef.current = true;

    void (async () => {
      try {
        if (eventId) {
          const { data: viewerMovements, error: movementFetchError } = await supabase
            .from("movements")
            .select("id, metadata")
            .eq("workspace_id", activeWorkspaceId)
            .eq("movement_type", "obligation_payment")
            .is("obligation_id", null);
          if (movementFetchError) {
            throw new Error(movementFetchError.message ?? "Error al cargar movimientos vinculados");
          }

          const mirroredMovementIds = ((viewerMovements ?? []) as Array<{ id: number; metadata: unknown }>)
            .filter((movement) => readMovementMetadataNumber(movement.metadata, "obligation_event_id") === eventId)
            .map((movement) => movement.id);

          for (const movementId of mirroredMovementIds) {
            const { error: movementDeleteError } = await supabase
              .from("movements")
              .delete()
              .eq("id", movementId);
            if (movementDeleteError) {
              throw new Error(movementDeleteError.message ?? "Error al eliminar movimiento espejo");
            }
          }

          const { data: links, error: linkFetchError } = await supabase
            .from("obligation_event_viewer_links")
            .select("id, movement_id")
            .eq("event_id", eventId);
          if (linkFetchError) {
            throw new Error(linkFetchError.message ?? "Error al cargar vinculos del evento eliminado");
          }

          for (const link of (links ?? []) as Array<{ id: number; movement_id: number | null }>) {
            if (link.movement_id) {
              const { error: movementDeleteError } = await supabase
                .from("movements")
                .delete()
                .eq("id", link.movement_id);
              if (movementDeleteError) {
                throw new Error(movementDeleteError.message ?? "Error al eliminar movimiento vinculado");
              }
            }

            const { error: linkDeleteError } = await supabase
              .from("obligation_event_viewer_links")
              .delete()
              .eq("id", link.id);
            if (linkDeleteError) {
              throw new Error(linkDeleteError.message ?? "Error al eliminar vinculo del evento");
            }
          }
        }
      } catch (error) {
        console.warn("[NotificationSetup] obligation event sync failed:", error);
        processedEventSyncNotificationsRef.current.delete(target.id);
      } finally {
        eventSyncInFlightRef.current = false;
        void queryClient.invalidateQueries({ queryKey: ["workspace-snapshot"] });
        void queryClient.invalidateQueries({ queryKey: ["movements"] });
        void queryClient.invalidateQueries({ queryKey: ["movement"] });
        void queryClient.invalidateQueries({ queryKey: ["obligation-event-viewer-links"] });
        void queryClient.invalidateQueries({ queryKey: ["notifications"] });
        void queryClient.invalidateQueries({ queryKey: ["shared-obligations"] });
      }
    })();
  }, [activeWorkspaceId, notifications, profile?.id, queryClient]);

  useEffect(() => {
    if (!profile?.id) return;
    const target = notifications.find(
      (item) =>
        (
          item.kind === "obligation_event_updated" ||
          item.kind === "obligation_event_edit_pending" ||
          item.kind === "obligation_event_edit_accepted" ||
          item.kind === "obligation_event_edit_rejected"
        ) &&
        !processedEventRefreshNotificationsRef.current.has(item.id),
    );
    if (!target) return;

    processedEventRefreshNotificationsRef.current.add(target.id);
    void queryClient.invalidateQueries({ queryKey: ["workspace-snapshot"] });
    void queryClient.invalidateQueries({ queryKey: ["movements"] });
    void queryClient.invalidateQueries({ queryKey: ["movement"] });
    void queryClient.invalidateQueries({ queryKey: ["obligation-event-viewer-links"] });
    void queryClient.invalidateQueries({ queryKey: ["notifications"] });
    void queryClient.invalidateQueries({ queryKey: ["shared-obligations"] });
  }, [notifications, profile?.id, queryClient]);

  useEffect(() => {
    if (!profile?.id || !supabase || sharedObligations.length === 0) return;

    const liveEventIdsByObligation = new Map<number, Set<number>>();
    for (const obligation of sharedObligations) {
      liveEventIdsByObligation.set(
        obligation.id,
        new Set((obligation.events ?? []).map((event) => event.id)),
      );
    }

    void (async () => {
      const { data, error } = await supabase
        .from("obligation_event_viewer_links")
        .select("id, obligation_id, event_id, movement_id")
        .eq("linked_by_user_id", profile.id);
      if (error) {
        console.warn("[NotificationSetup] viewer link reconciliation failed:", error);
        return;
      }

      const orphanLink = ((data ?? []) as Array<{
        id: number;
        obligation_id: number | null;
        event_id: number | null;
        movement_id: number | null;
      }>).find((link) => {
        const obligationId = Number(link.obligation_id ?? 0);
        const eventId = Number(link.event_id ?? 0);
        if (!obligationId || !eventId) return false;
        if (orphanViewerLinkInFlightRef.current.has(link.id)) return false;
        const liveEventIds = liveEventIdsByObligation.get(obligationId);
        return Boolean(liveEventIds && !liveEventIds.has(eventId));
      });

      if (!orphanLink) return;

      orphanViewerLinkInFlightRef.current.add(orphanLink.id);
      try {
        if (orphanLink.movement_id) {
          const { error: movementDeleteError } = await supabase
            .from("movements")
            .delete()
            .eq("id", orphanLink.movement_id);
          if (movementDeleteError) {
            throw movementDeleteError;
          }
        }

        const { error: linkDeleteError } = await supabase
          .from("obligation_event_viewer_links")
          .delete()
          .eq("id", orphanLink.id);
        if (linkDeleteError) {
          throw linkDeleteError;
        }

        void queryClient.invalidateQueries({ queryKey: ["workspace-snapshot"] });
        void queryClient.invalidateQueries({ queryKey: ["movements"] });
        void queryClient.invalidateQueries({ queryKey: ["movement"] });
        void queryClient.invalidateQueries({ queryKey: ["obligation-event-viewer-links"] });
        void queryClient.invalidateQueries({ queryKey: ["shared-obligations"] });
      } catch (reconcileError) {
        console.warn("[NotificationSetup] orphan viewer link cleanup failed:", reconcileError);
        orphanViewerLinkInFlightRef.current.delete(orphanLink.id);
      }
    })();
  }, [sharedObligations, profile?.id, queryClient]);

  useEffect(() => {
    if (!profile?.id || !supabase || !activeWorkspaceId || sharedObligations.length === 0) return;

    const liveEventIdsByObligation = new Map<number, Set<number>>();
    for (const obligation of sharedObligations) {
      liveEventIdsByObligation.set(
        obligation.id,
        new Set((obligation.events ?? []).map((event) => event.id)),
      );
    }

    void (async () => {
      const { data, error } = await supabase
        .from("movements")
        .select("id, metadata")
        .eq("workspace_id", activeWorkspaceId)
        .eq("movement_type", "obligation_payment")
        .is("obligation_id", null);
      if (error) {
        console.warn("[NotificationSetup] orphan viewer movement reconciliation failed:", error);
        return;
      }

      const orphanMovement = ((data ?? []) as Array<{ id: number; metadata: unknown }>).find((movement) => {
        if (orphanViewerMovementInFlightRef.current.has(movement.id)) return false;
        const obligationId = readMovementMetadataNumber(movement.metadata, "obligation_id");
        const eventId = readMovementMetadataNumber(movement.metadata, "obligation_event_id");
        if (!obligationId || !eventId) return false;
        const liveEventIds = liveEventIdsByObligation.get(obligationId);
        if (!liveEventIds) return true;
        return !liveEventIds.has(eventId);
      });

      if (!orphanMovement) return;

      orphanViewerMovementInFlightRef.current.add(orphanMovement.id);
      try {
        const eventId = readMovementMetadataNumber(orphanMovement.metadata, "obligation_event_id");

        const { error: movementDeleteError } = await supabase
          .from("movements")
          .delete()
          .eq("id", orphanMovement.id);
        if (movementDeleteError) {
          throw movementDeleteError;
        }

        let linkDeleteQuery = supabase
          .from("obligation_event_viewer_links")
          .delete()
          .eq("movement_id", orphanMovement.id);
        if (eventId) {
          linkDeleteQuery = linkDeleteQuery.eq("event_id", eventId);
        }
        const { error: linkDeleteError } = await linkDeleteQuery;
        if (linkDeleteError) {
          throw linkDeleteError;
        }

        void queryClient.invalidateQueries({ queryKey: ["workspace-snapshot"] });
        void queryClient.invalidateQueries({ queryKey: ["movements"] });
        void queryClient.invalidateQueries({ queryKey: ["movement"] });
        void queryClient.invalidateQueries({ queryKey: ["obligation-event-viewer-links"] });
        void queryClient.invalidateQueries({ queryKey: ["shared-obligations"] });
      } catch (reconcileError) {
        console.warn("[NotificationSetup] orphan viewer movement cleanup failed:", reconcileError);
        orphanViewerMovementInFlightRef.current.delete(orphanMovement.id);
      }
    })();
  }, [activeWorkspaceId, sharedObligations, profile?.id, queryClient]);

  if (!showWorkspaceBootstrapOverlay) return null;

  return (
    <View style={styles.workspaceBootstrapOverlay} pointerEvents="auto">
      <SafeBlurView
        intensity={60}
        tint="dark"
        fallbackColor="rgba(5,7,11,0.94)"
        style={StyleSheet.absoluteFillObject}
      />
      <View style={styles.workspaceBootstrapVeil} />
      <View style={styles.workspaceBootstrapCard}>
        <View style={styles.workspaceBootstrapLogoStage}>
          <Animated.View
            style={{ opacity: workspaceBootstrapLogoOpacity, transform: [{ scale: workspaceBootstrapLogoScale }] }}
          >
            <Image
              source={require("../assets/images/logo-sin-fondo.png")}
              style={styles.workspaceBootstrapFrontLogo}
              resizeMode="contain"
            />
          </Animated.View>
        </View>
        <Text style={styles.workspaceBootstrapTitle}>{bootstrapTitle}</Text>
        <Text style={styles.workspaceBootstrapBody}>{bootstrapBody}</Text>
      </View>
    </View>
  );
}

function NavigationGuard() {
  const { isLoading, session, profile } = useAuth();
  const segments = useSegments();
  const pathname = usePathname();
  const router = useRouter();
  const [preferredAuthEntry, setPreferredAuthEntry] = useState<"/(auth)/login" | "/(auth)/welcome" | null>(null);
  const onObligationInviteFromPush = useCallback(
    (token: string) => {
      router.push(obligationShareHref(token));
    },
    [router],
  );
  const onWorkspaceInviteFromPush = useCallback(
    (token: string) => {
      router.push(workspaceInviteHref(token));
    },
    [router],
  );

  const onSubscriptionReminderTap = useCallback(
    (subscriptionId: number) => {
      router.push(`/subscription/${subscriptionId}`);
    },
    [router],
  );

  const onObligationReminderTap = useCallback(
    (obligationId: number) => {
      router.push(`/obligation/${obligationId}`);
    },
    [router],
  );
  const onRecurringIncomeReminderTap = useCallback(
    (_recurringIncomeId: number) => {
      router.push("/recurring-income");
    },
    [router],
  );

  usePushNotifications(profile?.id, {
    onObligationShareInviteTap: onObligationInviteFromPush,
    onWorkspaceInviteTap: onWorkspaceInviteFromPush,
    onSubscriptionReminderTap,
    onObligationReminderTap,
    onRecurringIncomeReminderTap,
  });

  useEffect(() => {
    if (session) {
      setPreferredAuthEntry(null);
      return;
    }

    let cancelled = false;
    setPreferredAuthEntry(null);
    void hasSavedAuthOnDevice().then((hasSavedAuth) => {
      if (cancelled) return;
      setPreferredAuthEntry(hasSavedAuth ? "/(auth)/login" : "/(auth)/welcome");
    });

    return () => {
      cancelled = true;
    };
  }, [session]);

  // Universal link / cold start: asegurar token en cola si el pathname aún no llegó
  useEffect(() => {
    void Linking.getInitialURL()
      .then((url) => {
        const obligationToken = parseObligationShareTokenFromUrl(url);
        const workspaceToken = parseWorkspaceInviteTokenFromUrl(url);
        if (obligationToken && !session) void setPendingObligationInviteToken(obligationToken);
        if (workspaceToken && !session) void setPendingWorkspaceInviteToken(workspaceToken);
      })
      .catch((error) => {
        console.warn("[NavigationGuard] initial URL failed:", error);
      });
  }, [session]);

  useEffect(() => {
    if (isLoading) return;

    void SplashScreen.hideAsync().catch(() => {});

    const inAuthGroup = segments[0] === "(auth)";
    const inOnboarding = segments[0] === "onboarding";
    const obligationPathToken = parseObligationShareTokenFromPath(pathname);
    const workspacePathToken = parseWorkspaceInviteTokenFromPath(pathname);

    if (!session) {
      if (!inAuthGroup) {
        if (obligationPathToken) void setPendingObligationInviteToken(obligationPathToken);
        if (workspacePathToken) void setPendingWorkspaceInviteToken(workspacePathToken);
        const hasPendingInvite = Boolean(obligationPathToken || workspacePathToken);
        const target = hasPendingInvite ? "/(auth)/login" : preferredAuthEntry;
        if (!target) return;
        router.replace(target);
      }
      return;
    }

    if (profile && !profile.baseCurrencyCode && !inOnboarding) {
      if (obligationPathToken) void setPendingObligationInviteToken(obligationPathToken);
      if (workspacePathToken) void setPendingWorkspaceInviteToken(workspacePathToken);
      router.replace("/onboarding");
      return;
    }

    if (inAuthGroup) {
      router.replace("/(app)/dashboard");
    }
  }, [isLoading, session, profile, segments, pathname, router, preferredAuthEntry]);

  // Tras login + onboarding: abrir invitación pendiente (misma URL que el correo / web)
  useEffect(() => {
    if (isLoading || !session || !profile?.baseCurrencyCode) return;
    if (pathname.includes("/share/obligations/")) return;
    if (pathname.includes("/workspace-invite/")) return;

    let cancelled = false;
    void (async () => {
      const workspaceToken = await getPendingWorkspaceInviteToken();
      if (workspaceToken && !cancelled) {
        await clearPendingWorkspaceInviteToken();
        if (!cancelled) {
          router.replace(workspaceInviteHref(workspaceToken));
          return;
        }
      }

      const obligationToken = await getPendingObligationInviteToken();
      if (!obligationToken || cancelled) return;
      await clearPendingObligationInviteToken();
      if (cancelled) return;
      router.replace(obligationShareHref(obligationToken));
    })();
    return () => {
      cancelled = true;
    };
  }, [isLoading, session?.user?.id, profile?.baseCurrencyCode, pathname, router]);

  return (
    <ThemeProvider value={AppTheme}>
      <Stack
        screenOptions={{
          headerShown: false,
          animation: Platform.OS === "android" ? "slide_from_right" : "default",
          contentStyle: { backgroundColor: "transparent" },
          freezeOnBlur: true,
        }}
      />
    </ThemeProvider>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
    <ImageBackground
      source={require("../assets/images/background-darkmoney.png")}
      style={styles.background}
      resizeMode="cover"
      blurRadius={0}
      imageStyle={{ backgroundColor: "#05070B" }}
    >
      <View style={styles.overlay} />
      <SafeAreaProvider>
        <FontLoader>
          <QueryClientProvider client={queryClient}>
            <AuthProvider>
              <WorkspaceProvider>
                <ToastProvider>
                  <OfflineBanner />
                  <NotificationSetup />
                  <NavigationGuard />
                  <BiometricLock />
                  <SuccessGlow />
                  <ActivityNoticeContainer />
                </ToastProvider>
              </WorkspaceProvider>
            </AuthProvider>
          </QueryClientProvider>
        </FontLoader>
      </SafeAreaProvider>
    </ImageBackground>
    </GestureHandlerRootView>
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
  workspaceBootstrapOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    zIndex: 50,
  },
  workspaceBootstrapVeil: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(5,7,11,0.42)",
  },
  workspaceBootstrapCard: {
    width: "100%",
    maxWidth: 360,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingHorizontal: 24,
    paddingVertical: 30,
    borderRadius: 24,
    backgroundColor: "rgba(9,13,18,0.90)",
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderTopColor: "rgba(255,255,255,0.18)",
    borderLeftColor: "rgba(255,255,255,0.10)",
    borderRightColor: "rgba(255,255,255,0.08)",
    borderBottomColor: "rgba(255,255,255,0.05)",
  },
  workspaceBootstrapLogoStage: {
    width: 140,
    height: 140,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 6,
  },
  workspaceBootstrapFrontLogo: {
    width: 108,
    height: 108,
  },
  workspaceBootstrapTitle: {
    color: "#F5F7FB",
    fontSize: 22,
    fontFamily: "Outfit_600SemiBold",
    textAlign: "center",
  },
  workspaceBootstrapBody: {
    color: "#96A2B5",
    fontSize: 14,
    fontFamily: "Manrope_400Regular",
    textAlign: "center",
    lineHeight: 20,
  },
});
