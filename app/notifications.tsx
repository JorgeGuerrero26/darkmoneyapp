import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SectionListRenderItem } from "react-native";
import { Platform } from "react-native";
import { X } from "lucide-react-native";
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
import { getNotificationsModule } from "../lib/notifications-runtime";
import { useToast } from "../hooks/useToast";
import { useOriginBackNavigation } from "../hooks/useOriginBackNavigation";

const Notifications = getNotificationsModule();

function payloadNumber(payload: unknown, key: string): number | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const parsed = Number((payload as Record<string, unknown>)[key]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function NotificationsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { handleBack } = useOriginBackNavigation();
  const { user, profile } = useAuth();
  const { showToast } = useToast();
  const [selectedNotificationIds, setSelectedNotificationIds] = useState<number[]>([]);
  const [activeFilter, setActiveFilter] = useState<NotificationFilter>("all");
  const [quickEntry, setQuickEntry] = useState<{ suggestionId: number; notificationId: number } | null>(null);
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
    () => buildNotificationSections(notificationList, pendingInvites, activeFilter),
    [activeFilter, notificationList, pendingInvites],
  );

  const activeFilterItems = useMemo<ActiveFilterItem[]>(() => {
    if (activeFilter === "all") return [];
    return [{
      key: "priority",
      label: getNotificationFilterLabel(activeFilter),
      onRemove: () => setActiveFilter("all"),
    }];
  }, [activeFilter]);

  const filteredNotificationCount = useMemo(
    () => sections.reduce((total, section) => total + section.data.filter((item) => item.kind === "notification").length, 0),
    [sections],
  );
  const hasContent = pendingInvites.length > 0 || notificationList.length > 0;
  const showSkeleton =
    (isLoading && notificationList.length === 0 && pendingInvites.length === 0) ||
    (loadingPendingInvites && !pendingInvites.length && notificationList.length === 0);
  const contextNote = selectionMode
    ? "Elige qué hacer con la selección."
    : activeFilter === "all"
      ? "Mantén presionada una notificación para seleccionar varias."
      : `Mostrando ${filteredNotificationCount} notificaciones de prioridad ${getNotificationFilterLabel(activeFilter).toLowerCase()}.`;

  useEffect(() => {
    setSelectedNotificationIds((current) =>
      current.filter((id) => notificationList.some((item) => item.id === id)),
    );
  }, [notificationList]);

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
            <FilterToolbar
              options={NOTIFICATION_FILTERS}
              value={activeFilter}
              onChange={setActiveFilter}
            />
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
            empty={{
              title: hasContent ? "Nada en esta vista" : "Sin notificaciones",
              description: hasContent
                ? "Cambia el filtro para ver otras prioridades o espera nuevas alertas."
                : "Aquí verás alertas de presupuestos, suscripciones, obligaciones y salud financiera cuando corresponda.",
            }}
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

export default function NotificationsScreenRoot() {
  return (
    <ErrorBoundary>
      <NotificationsScreen />
    </ErrorBoundary>
  );
}
