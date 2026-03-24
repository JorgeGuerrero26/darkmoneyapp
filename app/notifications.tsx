import { useCallback } from "react";
import {
  RefreshControl,
  SectionList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Mail } from "lucide-react-native";

import { useAuth } from "../lib/auth-context";
import { obligationShareHref } from "../lib/obligation-share-link";
import {
  useNotificationsQuery,
  useMarkNotificationReadMutation,
  useMarkAllNotificationsReadMutation,
  usePendingObligationShareInvitesQuery,
} from "../services/queries/workspace-data";
import { EmptyState } from "../components/ui/EmptyState";
import { SkeletonCard } from "../components/ui/Skeleton";
import { ScreenHeader } from "../components/layout/ScreenHeader";
import { Button } from "../components/ui/Button";
import { COLORS, FONT_SIZE, FONT_WEIGHT, RADIUS, SPACING } from "../constants/theme";
import type { NotificationItem, PendingObligationShareInviteItem } from "../types/domain";

type Section =
  | { title: string; data: PendingObligationShareInviteItem[]; type: "invites" }
  | { title: string; data: NotificationItem[]; type: "notifications" };

export default function NotificationsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, profile } = useAuth();

  const notificationsQuery = useNotificationsQuery(user?.id ?? null);
  const notificationList: NotificationItem[] = (notificationsQuery.data as NotificationItem[] | undefined) ?? [];
  const isLoading = notificationsQuery.isLoading;
  const refetch = notificationsQuery.refetch;
  const pendingInvitesQuery = usePendingObligationShareInvitesQuery(user?.id, profile?.email);
  const pendingInvites: PendingObligationShareInviteItem[] = pendingInvitesQuery.data ?? [];
  const refetchInvites = pendingInvitesQuery.refetch;
  const loadingPendingInvites = pendingInvitesQuery.isLoading;
  const markRead = useMarkNotificationReadMutation(user?.id ?? null);
  const markAllRead = useMarkAllNotificationsReadMutation(user?.id ?? null);

  const unreadCount = notificationList.filter((n) => n.status !== "read").length;

  function handleMarkAll() {
    if (unreadCount === 0) return;
    markAllRead.mutate();
  }

  function handleMarkOne(notification: NotificationItem) {
    if (notification.status === "read") return;
    markRead.mutate(notification.id);
  }

  function openInvite(token: string) {
    router.push(obligationShareHref(token));
  }

  const onRefresh = useCallback(() => {
    void refetch();
    void refetchInvites();
  }, [refetch, refetchInvites]);

  const sections: Section[] = [];
  if (pendingInvites.length > 0) {
    sections.push({ title: "Invitaciones pendientes", data: pendingInvites, type: "invites" });
  }
  if (notificationList.length > 0) {
    sections.push({ title: "Alertas", data: notificationList, type: "notifications" });
  }

  const showSkeleton =
    (isLoading && notificationList.length === 0 && pendingInvites.length === 0) ||
    (loadingPendingInvites && !pendingInvites.length && notificationList.length === 0);

  if (sections.length === 0 && !showSkeleton) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top }]}>
        <ScreenHeader
          title="Notificaciones"
          onBack={() => router.replace("/(app)/more")}
          rightAction={
            unreadCount > 0 ? (
              <TouchableOpacity onPress={handleMarkAll}>
                <Text style={styles.markAllText}>Marcar todas</Text>
              </TouchableOpacity>
            ) : undefined
          }
        />
        <EmptyState
          title="Sin notificaciones"
          description="Aquí verás invitaciones a obligaciones compartidas y alertas de la app."
        />
      </View>
    );
  }

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <ScreenHeader
        title="Notificaciones"
        onBack={() => router.replace("/(app)/more")}
        rightAction={
          unreadCount > 0 ? (
            <TouchableOpacity onPress={handleMarkAll}>
              <Text style={styles.markAllText}>Marcar todas</Text>
            </TouchableOpacity>
          ) : undefined
        }
      />

      {showSkeleton ? (
        <View style={styles.skeletonContainer}>
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </View>
      ) : (
        <SectionList<PendingObligationShareInviteItem | NotificationItem, Section>
          sections={sections}
          keyExtractor={(item, index) =>
            "token" in item ? `invite-${item.token}` : `notif-${(item as NotificationItem).id}-${index}`
          }
          refreshControl={
            <RefreshControl refreshing={isLoading} onRefresh={onRefresh} tintColor={COLORS.primary} />
          }
          renderSectionHeader={({ section }) => (
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>{section.title}</Text>
            </View>
          )}
          renderItem={({ item, section }) => {
            if (section.type === "invites") {
              const inv = item as PendingObligationShareInviteItem;
              return (
                <View style={styles.inviteCard}>
                  <View style={styles.inviteIconWrap}>
                    <Mail size={20} color={COLORS.pine} strokeWidth={2} />
                  </View>
                  <View style={styles.inviteBody}>
                    <Text style={styles.inviteTitle}>Obligación compartida</Text>
                    <Text style={styles.inviteSubtitle} numberOfLines={2}>
                      {inv.ownerDisplayName
                        ? `${inv.ownerDisplayName} te invitó a ver una obligación en solo lectura.`
                        : "Tienes una invitación pendiente para ver una obligación."}
                    </Text>
                    {inv.message ? (
                      <Text style={styles.inviteMessage} numberOfLines={2}>
                        “{inv.message}”
                      </Text>
                    ) : null}
                    <Text style={styles.inviteTime}>
                      {format(new Date(inv.updatedAt), "d MMM yyyy · HH:mm", { locale: es })}
                    </Text>
                  </View>
                  <Button
                    label="Abrir"
                    onPress={() => openInvite(inv.token)}
                    style={styles.inviteBtn}
                  />
                </View>
              );
            }
            const n = item as NotificationItem;
            return (
              <TouchableOpacity
                style={[styles.notifItem, n.status !== "read" && styles.notifUnread]}
                onPress={() => handleMarkOne(n)}
                activeOpacity={0.7}
              >
                <View style={[styles.dot, n.status !== "read" && styles.dotActive]} />
                <View style={styles.notifContent}>
                  <Text style={styles.notifTitle}>{n.title}</Text>
                  <Text style={styles.notifBody} numberOfLines={2}>
                    {n.body}
                  </Text>
                  <Text style={styles.notifTime}>
                    {format(new Date(n.scheduledFor), "d MMM · HH:mm", { locale: es })}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          }}
          contentContainerStyle={styles.listContent}
          stickySectionHeadersEnabled={false}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.bg },
  markAllText: { fontSize: FONT_SIZE.sm, color: COLORS.primary, fontWeight: FONT_WEIGHT.medium },
  listContent: { paddingBottom: 32 },
  sectionHeader: {
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.xs,
    backgroundColor: COLORS.bg,
  },
  sectionTitle: {
    fontSize: FONT_SIZE.xs,
    fontWeight: FONT_WEIGHT.semibold,
    color: COLORS.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  inviteCard: {
    marginHorizontal: SPACING.lg,
    marginBottom: SPACING.sm,
    padding: SPACING.md,
    borderRadius: RADIUS.lg,
    backgroundColor: COLORS.bgCard,
    borderWidth: 1,
    borderColor: COLORS.border,
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.md,
  },
  inviteIconWrap: {
    width: 44,
    height: 44,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.pine + "22",
    alignItems: "center",
    justifyContent: "center",
  },
  inviteBody: { flex: 1, minWidth: 0 },
  inviteTitle: { fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.semibold, color: COLORS.text },
  inviteSubtitle: { fontSize: FONT_SIZE.sm, color: COLORS.textMuted, marginTop: 4, lineHeight: 18 },
  inviteMessage: { fontSize: FONT_SIZE.xs, color: COLORS.storm, marginTop: 4, fontStyle: "italic" },
  inviteTime: { fontSize: FONT_SIZE.xs, color: COLORS.textDisabled, marginTop: 6 },
  inviteBtn: { minWidth: 88, paddingHorizontal: SPACING.sm },
  notifItem: {
    flexDirection: "row",
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    gap: SPACING.md,
    alignItems: "flex-start",
  },
  notifUnread: { backgroundColor: COLORS.bgCard },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "transparent", marginTop: 6 },
  dotActive: { backgroundColor: COLORS.primary },
  notifContent: { flex: 1, gap: 3 },
  notifTitle: { fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.semibold, color: COLORS.text },
  notifBody: { fontSize: FONT_SIZE.sm, color: COLORS.textMuted, lineHeight: 18 },
  notifTime: { fontSize: FONT_SIZE.xs, color: COLORS.textDisabled },
  skeletonContainer: { padding: 16, gap: 12 },
});
