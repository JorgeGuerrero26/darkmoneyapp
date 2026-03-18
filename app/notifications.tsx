import { useCallback } from "react";
import {
  Alert,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { format } from "date-fns";
import { es } from "date-fns/locale";

import { useAuth } from "../lib/auth-context";
import {
  useNotificationsQuery,
  useMarkNotificationReadMutation,
  useMarkAllNotificationsReadMutation,
} from "../services/queries/workspace-data";
import { EmptyState } from "../components/ui/EmptyState";
import { SkeletonCard } from "../components/ui/Skeleton";
import { ScreenHeader } from "../components/layout/ScreenHeader";
import { COLORS, FONT_SIZE, FONT_WEIGHT, RADIUS, SPACING } from "../constants/theme";
import type { NotificationItem } from "../types/domain";

export default function NotificationsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();

  const { data: notifications, isLoading, refetch } = useNotificationsQuery(user?.id ?? null);
  const markRead = useMarkNotificationReadMutation(user?.id ?? null);
  const markAllRead = useMarkAllNotificationsReadMutation(user?.id ?? null);

  const unreadCount = (notifications ?? []).filter((n) => n.status !== "read").length;

  function handleMarkAll() {
    if (unreadCount === 0) return;
    markAllRead.mutate();
  }

  function handleMarkOne(notification: NotificationItem) {
    if (notification.status === "read") return;
    markRead.mutate(notification.id);
  }

  const onRefresh = useCallback(() => {
    void refetch();
  }, [refetch]);

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <ScreenHeader
        title="Notificaciones"
        rightAction={
          unreadCount > 0 ? (
            <TouchableOpacity onPress={handleMarkAll}>
              <Text style={styles.markAllText}>Marcar todas</Text>
            </TouchableOpacity>
          ) : undefined
        }
      />

      <FlatList
        data={notifications ?? []}
        keyExtractor={(item) => String(item.id)}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={[styles.notifItem, item.status !== "read" && styles.notifUnread]}
            onPress={() => handleMarkOne(item)}
            activeOpacity={0.7}
          >
            <View style={[styles.dot, item.status !== "read" && styles.dotActive]} />
            <View style={styles.notifContent}>
              <Text style={styles.notifTitle}>{item.title}</Text>
              <Text style={styles.notifBody} numberOfLines={2}>{item.body}</Text>
              <Text style={styles.notifTime}>
                {format(new Date(item.scheduledFor), "d MMM · HH:mm", { locale: es })}
              </Text>
            </View>
          </TouchableOpacity>
        )}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        refreshControl={
          <RefreshControl refreshing={isLoading} onRefresh={onRefresh} tintColor={COLORS.primary} />
        }
        ListHeaderComponent={
          isLoading ? (
            <View style={styles.skeletonContainer}>
              <SkeletonCard />
              <SkeletonCard />
              <SkeletonCard />
            </View>
          ) : null
        }
        ListEmptyComponent={
          isLoading ? null : (
            <EmptyState
              title="Sin notificaciones"
              description="Aquí aparecerán tus alertas de presupuestos, vencimientos y más."
            />
          )
        }
        contentContainerStyle={!notifications?.length ? styles.emptyContainer : undefined}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.bg },
  markAllText: { fontSize: FONT_SIZE.sm, color: COLORS.primary, fontWeight: FONT_WEIGHT.medium },
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
  separator: { height: 1, backgroundColor: COLORS.border },
  emptyContainer: { flexGrow: 1 },
  skeletonContainer: { padding: 16, gap: 12 },
});
