import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SectionListRenderItem } from "react-native";
import { Platform, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Bell, CheckCheck, X } from "lucide-react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ErrorBoundary } from "../components/ui/ErrorBoundary";
import { ScreenHeader } from "../components/layout/ScreenHeader";
import { HeaderActionGroup } from "../components/ui/HeaderActionGroup";
import { FilterToolbar } from "../components/ui/FilterToolbar";
import { ActiveFilterBar, type ActiveFilterItem } from "../components/ui/ActiveFilterBar";
import { ResourceContextNote } from "../components/ui/ResourceContextNote";
import { ResourceModuleTemplate } from "../components/ui/ResourceModuleTemplate";
import { ResourceSectionList } from "../components/ui/ResourceSectionList";
import { SkeletonCard, SkeletonList } from "../components/ui/Skeleton";
import { BulkActionBar } from "../components/ui/BulkActionBar";
import { NotificationCard } from "../components/domain/NotificationCard";
import { NotificationInviteCard } from "../components/domain/NotificationInviteCard";
import { QuickDetectedMovementEntry } from "../components/domain/QuickDetectedMovementEntry";
import { NotificationSummaryBar } from "../features/notifications/components/NotificationSummaryBar";
import {
  buildNotificationSections,
  getNotificationFilterLabel,
  NOTIFICATION_FILTERS,
  type NotificationFilter,
  type NotificationListItem,
  type NotificationListSection,
} from "../features/notifications/lib/notificationSections";
import { useAuth } from "../lib/auth-context";
import { obligationShareHref } from "../lib/obligation-share-link";
import { resolveNotificationNavigationTarget } from "../lib/notification-navigation";
import {
  useDeleteNotificationMutation,
  useDeleteNotificationsMutation,
  useMarkAllNotificationsReadMutation,
  useMarkAllNotificationsUnreadMutation,
  useMarkNotificationReadMutation,
  useMarkNotificationsReadMutation,
  useMarkNotificationsUnreadMutation,
  useNotificationsQuery,
  usePendingObligationShareInvitesQuery,
} from "../services/queries/workspace-data";
import type { NotificationItem, PendingObligationShareInviteItem } from "../types/domain";
import { payloadString } from "../features/notifications/lib/notificationPresentation";
import { getNotificationsModule } from "../lib/notifications-runtime";
import { useToast } from "../hooks/useToast";
import { useOriginBackNavigation } from "../hooks/useOriginBackNavigation";
import { useNotificationsRealtimeSync } from "../hooks/useNotificationsRealtimeSync";
import { COLORS, FONT_FAMILY, FONT_SIZE, RADIUS, SPACING } from "../constants/theme";

const Notifications = getNotificationsModule();

function payloadNumber(payload: unknown, key: string): number | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const parsed = Number((payload as Record<string, unknown>)[key]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

const STALE_THRESHOLD_MS = 5 * 24 * 60 * 60 * 1000;

function NotificationsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { handleBack } = useOriginBackNavigation();
  const { user, profile } = useAuth();
  const { showToast } = useToast();
  const [selectedNotificationIds, setSelectedNotificationIds] = useState<number[]>([]);
  const [activeFilter, setActiveFilter] = useState<NotificationFilter>("all");
  const [showUnreadOnly, setShowUnreadOnly] = useState(false);
  const [quickEntry, setQuickEntry] = useState<{ suggestionId: number; notificationId: number } | null>(null);

  useNotificationsRealtimeSync(user?.id ?? null);
  const ignoreTapAfterLongPressRef = useRef(false);
  const { suggestionId: suggestionIdParam } = useLocalSearchParams<{ suggestionId?: string }>();

  useEffect(() => {
    const parsed = Number(suggestionIdParam);
    if (Number.isFinite(parsed) && parsed > 0) {
      setQuickEntry({ suggestionId: parsed, notificationId: 0 });
    }
  }, [suggestionIdParam]);

  useEffect(() => {
    if (!Notifications) return;
    void (async () => {
      const { status } = await Notifications.getPermissionsAsync();
      if (status !== "granted") await Notifications.requestPermissionsAsync();
      if (Platform.OS === "android") {
        await Notifications.setNotificationChannelAsync("default", {
          name: "default",
          importance: Notifications.AndroidImportance.MAX,
          vibrationPattern: [0, 250, 250, 250],
        });
      }
    })();
  }, []);

  const notificationsQuery = useNotificationsQuery(user?.id ?? null);
  const notificationList: NotificationItem[] = notificationsQuery.data ?? [];
  const isLoading = notificationsQuery.isLoading;
  const refetch = notificationsQuery.refetch;

  const pendingInvitesQuery = usePendingObligationShareInvitesQuery(user?.id, profile?.email);
  const pendingInvites: PendingObligationShareInviteItem[] = pendingInvitesQuery.data ?? [];
  const refetchInvites = pendingInvitesQuery.refetch;
  const loadingPendingInvites = pendingInvitesQuery.isLoading;

  const markRead = useMarkNotificationReadMutation(user?.id ?? null);
  const markAllRead = useMarkAllNotificationsReadMutation(user?.id ?? null);
  const markAllUnread = useMarkAllNotificationsUnreadMutation(user?.id ?? null);
  const markSelectedRead = useMarkNotificationsReadMutation(user?.id ?? null);
  const markSelectedUnread = useMarkNotificationsUnreadMutation(user?.id ?? null);
  const deleteNotification = useDeleteNotificationMutation(user?.id ?? null);
  const deleteSelectedNotifications = useDeleteNotificationsMutation(user?.id ?? null);

  const unreadCount = notificationList.filter((notification) => notification.status !== "read").length;
  const readCount = notificationList.length - unreadCount;
  const selectionMode = selectedNotificationIds.length > 0;
  const selectedNotifications = useMemo(
    () => notificationList.filter((item) => selectedNotificationIds.includes(item.id)),
    [notificationList, selectedNotificationIds],
  );
  const selectedUnreadCount = selectedNotifications.filter((item) => item.status !== "read").length;
  const selectedReadCount = selectedNotifications.length - selectedUnreadCount;
  const bulkActionLoading =
    markAllRead.isPending ||
    markAllUnread.isPending ||
    markSelectedRead.isPending ||
    markSelectedUnread.isPending ||
    deleteSelectedNotifications.isPending;

  const sections = useMemo(
    () => buildNotificationSections(notificationList, pendingInvites, activeFilter, showUnreadOnly),
    [activeFilter, notificationList, pendingInvites, showUnreadOnly],
  );

  const activeFilterItems = useMemo<ActiveFilterItem[]>(() => {
    const items: ActiveFilterItem[] = [];
    if (showUnreadOnly) {
      items.push({ key: "unread", label: "No leídas", onRemove: () => setShowUnreadOnly(false) });
    }
    if (activeFilter !== "all") {
      items.push({ key: "priority", label: getNotificationFilterLabel(activeFilter), onRemove: () => setActiveFilter("all") });
    }
    return items;
  }, [activeFilter, showUnreadOnly]);

  const filteredNotificationCount = useMemo(
    () => sections.reduce((total, section) => total + section.data.filter((item) => item.kind === "notification").length, 0),
    [sections],
  );
  const hasContent = pendingInvites.length > 0 || notificationList.length > 0;
  const showSkeleton =
    (isLoading && notificationList.length === 0 && pendingInvites.length === 0) ||
    (loadingPendingInvites && !pendingInvites.length && notificationList.length === 0);

  const emptyConfig = useMemo(() => {
    const resetFilters = () => { setActiveFilter("all"); setShowUnreadOnly(false); };
    if (notificationList.length === 0 && pendingInvites.length === 0) {
      return {
        icon: Bell,
        variant: "empty" as const,
        title: "Sin notificaciones",
        description: "Aquí verás alertas de presupuestos, suscripciones, obligaciones y movimientos detectados.",
      };
    }
    if (showUnreadOnly && unreadCount === 0) {
      return {
        icon: CheckCheck,
        variant: "empty" as const,
        title: "Todo al día",
        description: "No tienes notificaciones sin leer.",
        action: { label: "Ver todas", onPress: () => setShowUnreadOnly(false) },
      };
    }
    if (activeFilter !== "all" && showUnreadOnly) {
      return {
        variant: "no-results" as const,
        title: `Sin ${getNotificationFilterLabel(activeFilter).toLowerCase()} sin leer`,
        description: "No hay notificaciones que coincidan con los filtros activos.",
        action: { label: "Quitar filtros", onPress: resetFilters },
      };
    }
    if (activeFilter !== "all") {
      return {
        variant: "no-results" as const,
        title: `Sin ${getNotificationFilterLabel(activeFilter).toLowerCase()}`,
        description: "No hay notificaciones de esta prioridad.",
        action: { label: "Ver todas", onPress: () => setActiveFilter("all") },
      };
    }
    return {
      variant: "no-results" as const,
      title: "Sin resultados",
      description: "No hay notificaciones que coincidan con el filtro activo.",
      action: { label: "Quitar filtros", onPress: resetFilters },
    };
  }, [notificationList.length, pendingInvites.length, showUnreadOnly, unreadCount, activeFilter]);

  const contextNote = selectionMode
    ? "Elige qué hacer con la selección."
    : activeFilter === "all" && !showUnreadOnly
      ? "Mantén presionada una notificación para seleccionar varias."
      : `Mostrando ${filteredNotificationCount} notificación${filteredNotificationCount !== 1 ? "es" : ""}${showUnreadOnly ? " sin leer" : ""}${activeFilter !== "all" ? ` · ${getNotificationFilterLabel(activeFilter).toLowerCase()}` : ""}.`;

  useEffect(() => {
    setSelectedNotificationIds((current) =>
      current.filter((id) => notificationList.some((item) => item.id === id)),
    );
  }, [notificationList]);

  useEffect(() => {
    if (isLoading || notificationList.length === 0) return;
    const now = Date.now();
    const staleIds = notificationList
      .filter((n) => {
        if (n.status === "read" || n.kind !== "detected_movement_suggestion") return false;
        const suggStatus = payloadString(n.payload, "status");
        if (suggStatus === "registered" || suggStatus === "discarded") return true;
        return now - new Date(n.scheduledFor).getTime() > STALE_THRESHOLD_MS;
      })
      .map((n) => n.id);
    if (staleIds.length === 0) return;
    void markSelectedRead.mutateAsync(staleIds).catch(() => null);
  }, [isLoading, notificationList, markSelectedRead]);

  function clearSelection() {
    setSelectedNotificationIds([]);
  }

  function toggleNotificationSelection(notificationId: number) {
    setSelectedNotificationIds((current) =>
      current.includes(notificationId)
        ? current.filter((id) => id !== notificationId)
        : [...current, notificationId],
    );
  }

  function handleNotificationLongPress(notification: NotificationItem) {
    ignoreTapAfterLongPressRef.current = true;
    setTimeout(() => {
      ignoreTapAfterLongPressRef.current = false;
    }, 250);
    toggleNotificationSelection(notification.id);
  }

  function handleMarkAll() {
    if (unreadCount === 0) return;
    markAllRead.mutate(undefined, {
      onSuccess: () => showToast("Todas quedaron como leídas", "success"),
      onError: (error: unknown) => showToast(error instanceof Error ? error.message : "No se pudo actualizar", "error"),
    });
  }

  function handleMarkAllUnread() {
    if (readCount === 0) return;
    markAllUnread.mutate(undefined, {
      onSuccess: () => showToast("Todas quedaron como no leídas", "success"),
      onError: (error: unknown) => showToast(error instanceof Error ? error.message : "No se pudo actualizar", "error"),
    });
  }

  async function handleDeleteAllRead() {
    const readIds = notificationList.filter((n) => n.status === "read").map((n) => n.id);
    if (readIds.length === 0) return;
    try {
      await deleteSelectedNotifications.mutateAsync(readIds);
      showToast(`${readIds.length} notificación${readIds.length !== 1 ? "es" : ""} eliminada${readIds.length !== 1 ? "s" : ""}`, "success");
    } catch (error: unknown) {
      showToast(error instanceof Error ? error.message : "No se pudo eliminar", "error");
    }
  }

  async function handleSelectedReadState(nextState: "read" | "unread") {
    if (!selectedNotificationIds.length) return;
    try {
      if (nextState === "read") {
        await markSelectedRead.mutateAsync(selectedNotificationIds);
        showToast("Notificaciones marcadas como leídas", "success");
      } else {
        await markSelectedUnread.mutateAsync(selectedNotificationIds);
        showToast("Notificaciones marcadas como no leídas", "success");
      }
      clearSelection();
    } catch (error: unknown) {
      showToast(error instanceof Error ? error.message : "No se pudo actualizar", "error");
    }
  }

  async function handleSelectedArchive() {
    if (!selectedNotificationIds.length) return;
    try {
      await markSelectedRead.mutateAsync(selectedNotificationIds);
      showToast("Notificaciones archivadas", "success");
      clearSelection();
    } catch (error: unknown) {
      showToast(error instanceof Error ? error.message : "No se pudo archivar", "error");
    }
  }

  async function handleSelectedDelete() {
    if (!selectedNotificationIds.length) return;
    try {
      await deleteSelectedNotifications.mutateAsync(selectedNotificationIds);
      showToast("Notificaciones eliminadas", "success");
      clearSelection();
    } catch (error: unknown) {
      showToast(error instanceof Error ? error.message : "No se pudo eliminar", "error");
    }
  }

  function handleArchiveSingle(notificationId: number) {
    markRead.mutate(notificationId, {
      onSuccess: () => showToast("Notificación archivada", "success"),
      onError: (error: unknown) => showToast(error instanceof Error ? error.message : "No se pudo archivar", "error"),
    });
  }

  function handleDeleteSingle(notificationId: number) {
    deleteNotification.mutate(notificationId, {
      onSuccess: () => showToast("Notificación eliminada", "success"),
      onError: (error: unknown) => showToast(error instanceof Error ? error.message : "No se pudo eliminar", "error"),
    });
  }

  function handleTap(notification: NotificationItem) {
    if (ignoreTapAfterLongPressRef.current) {
      ignoreTapAfterLongPressRef.current = false;
      return;
    }
    if (selectionMode) {
      toggleNotificationSelection(notification.id);
      return;
    }
    const deferReadUntilResolved =
      notification.kind === "obligation_payment_request" ||
      notification.kind === "obligation_event_delete_request" ||
      notification.kind === "obligation_event_edit_request" ||
      notification.kind === "detected_movement_suggestion";
    if (notification.kind === "detected_movement_suggestion") {
      const suggStatus = payloadString(notification.payload, "status");
      if (suggStatus === "registered" || suggStatus === "discarded") {
        if (notification.status !== "read") markRead.mutate(notification.id);
        return;
      }
      const suggestionId =
        payloadNumber(notification.payload, "suggestionId") ??
        (notification.relatedEntityType === "detected_movement_suggestion" ? notification.relatedEntityId ?? null : null);
      if (suggestionId) {
        setQuickEntry({ suggestionId, notificationId: notification.id });
        return;
      }
    }
    if (notification.status !== "read" && !deferReadUntilResolved) markRead.mutate(notification.id);
    const target = resolveNotificationNavigationTarget({
      kind: notification.kind,
      relatedEntityType: notification.relatedEntityType,
      relatedEntityId: notification.relatedEntityId,
      payload: notification.payload as Record<string, unknown> | null | undefined,
    });
    router.push(target as never);
  }

  const onRefresh = useCallback(() => {
    void refetch();
    void refetchInvites();
  }, [refetch, refetchInvites]);

  const clearFilters = useCallback(() => {
    setActiveFilter("all");
    setShowUnreadOnly(false);
  }, []);

  const renderItem: SectionListRenderItem<NotificationListItem, NotificationListSection> = useCallback(({ item }) => {
    if (item.kind === "invite") {
      return (
        <NotificationInviteCard
          invite={item.invite}
          onPress={() => router.push(obligationShareHref(item.invite.token))}
        />
      );
    }

    return (
      <NotificationCard
        notification={item.notification}
        onPress={() => handleTap(item.notification)}
        onLongPress={() => handleNotificationLongPress(item.notification)}
        onArchive={() => handleArchiveSingle(item.notification.id)}
        onDelete={() => handleDeleteSingle(item.notification.id)}
        selected={selectedNotificationIds.includes(item.notification.id)}
        selectionMode={selectionMode}
      />
    );
  }, [router, selectedNotificationIds, selectionMode]);

  return (
    <>
      <ResourceModuleTemplate
        topInset={insets.top}
        header={
          <ScreenHeader
            title={selectionMode ? `${selectedNotificationIds.length} seleccionadas` : "Notificaciones"}
            onBack={() => {
              if (selectionMode) {
                clearSelection();
                return;
              }
              handleBack();
            }}
            rightAction={
              selectionMode ? (
                <HeaderActionGroup
                  actions={[{
                    key: "cancel",
                    icon: X,
                    label: "Cancelar",
                    onPress: clearSelection,
                    accessibilityLabel: "Cancelar selección",
                  }]}
                />
              ) : null
            }
          />
        }
        toolbar={
          !selectionMode && notificationList.length > 0 ? (
            <View>
              <FilterToolbar
                options={NOTIFICATION_FILTERS}
                value={activeFilter}
                onChange={setActiveFilter}
              />
              {unreadCount > 0 ? (
                <View style={notifStyles.unreadRow}>
                  <TouchableOpacity
                    onPress={() => setShowUnreadOnly((prev) => !prev)}
                    style={[notifStyles.unreadChip, showUnreadOnly && notifStyles.unreadChipActive]}
                    accessibilityLabel="Filtrar por no leídas"
                  >
                    <Text style={[notifStyles.unreadChipText, showUnreadOnly && notifStyles.unreadChipTextActive]}>
                      {`No leídas (${unreadCount})`}
                    </Text>
                  </TouchableOpacity>
                </View>
              ) : null}
            </View>
          ) : null
        }
        activeFilters={!selectionMode ? <ActiveFilterBar items={activeFilterItems} onClear={clearFilters} /> : null}
        context={hasContent ? <ResourceContextNote>{contextNote}</ResourceContextNote> : null}
        summary={
          !selectionMode && hasContent ? (
            <NotificationSummaryBar
              unreadCount={unreadCount}
              readCount={readCount}
              inviteCount={pendingInvites.length}
              onMarkAllRead={handleMarkAll}
              onMarkAllUnread={handleMarkAllUnread}
              onDeleteAllRead={handleDeleteAllRead}
              actionsDisabled={bulkActionLoading}
            />
          ) : null
        }
        bulkActions={
          selectionMode ? (
            <BulkActionBar
              selectedCount={selectedNotificationIds.length}
              onClear={clearSelection}
              actions={[
                {
                  key: "archive",
                  label: "Archivar",
                  disabled: selectedUnreadCount === 0 || bulkActionLoading,
                  onPress: () => void handleSelectedArchive(),
                },
                {
                  key: "unread",
                  label: "No leído",
                  disabled: selectedReadCount === 0 || bulkActionLoading,
                  onPress: () => void handleSelectedReadState("unread"),
                },
                {
                  key: "delete",
                  label: "Eliminar",
                  tone: "danger",
                  disabled: bulkActionLoading,
                  onPress: () => void handleSelectedDelete(),
                },
              ]}
            />
          ) : null
        }
        list={
          <ResourceSectionList
            sections={sections}
            keyExtractor={(item) => item.key}
            renderItem={renderItem}
            loading={{
              isLoading: showSkeleton,
              skeleton: (
                <SkeletonList>
                  <SkeletonCard />
                  <SkeletonCard />
                  <SkeletonCard />
                </SkeletonList>
              ),
            }}
            empty={emptyConfig}
            refreshing={isLoading || loadingPendingInvites}
            onRefresh={onRefresh}
          />
        }
      />
      <QuickDetectedMovementEntry
        visible={Boolean(quickEntry)}
        suggestionId={quickEntry?.suggestionId ?? null}
        notificationId={quickEntry?.notificationId ?? null}
        onClose={() => setQuickEntry(null)}
      />
    </>
  );
}

const notifStyles = StyleSheet.create({
  unreadRow: {
    flexDirection: "row",
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.xs,
    paddingBottom: SPACING.xs,
  },
  unreadChip: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: 4,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: "transparent",
  },
  unreadChipActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  unreadChipText: {
    fontSize: FONT_SIZE.xs,
    fontFamily: FONT_FAMILY.bodyMedium,
    color: COLORS.storm,
  },
  unreadChipTextActive: {
    color: COLORS.ink,
  },
});

export default function NotificationsScreenRoot() {
  return (
    <ErrorBoundary>
      <NotificationsScreen />
    </ErrorBoundary>
  );
}
