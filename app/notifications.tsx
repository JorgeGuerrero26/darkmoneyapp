import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ErrorBoundary } from "../components/ui/ErrorBoundary";
import {
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import {
  AlertTriangle,
  BarChart2,
  Bell,
  Calendar,
  Clock,
  CreditCard,
  Mail,
  Percent,
  RefreshCw,
  Scale,
  TrendingDown,
  TrendingUp,
  Wallet,
} from "lucide-react-native";

import { useAuth } from "../lib/auth-context";
import { obligationShareHref } from "../lib/obligation-share-link";
import { workspaceInviteHref } from "../lib/workspace-invite-link";
import {
  getNotificationPriority,
  getNotificationPriorityMeta,
  type NotificationPriority,
} from "../lib/notification-priority";
import {
  useNotificationsQuery,
  useMarkNotificationReadMutation,
  useMarkAllNotificationsReadMutation,
  useMarkAllNotificationsUnreadMutation,
  useMarkNotificationsReadMutation,
  useMarkNotificationsUnreadMutation,
  usePendingObligationShareInvitesQuery,
} from "../services/queries/workspace-data";
import { SkeletonCard } from "../components/ui/Skeleton";
import { ScreenHeader } from "../components/layout/ScreenHeader";
import {
  COLORS, FONT_FAMILY, FONT_SIZE, GLASS, RADIUS, SPACING,
} from "../constants/theme";
import type { NotificationItem, PendingObligationShareInviteItem } from "../types/domain";
import { getNotificationsModule } from "../lib/notifications-runtime";
import { useToast } from "../hooks/useToast";

const Notifications = getNotificationsModule();

// ─── Kind metadata ────────────────────────────────────────────────────────────

type KindMeta = {
  Icon: React.ComponentType<{ size: number; color: string; strokeWidth?: number }>;
  color: string;
  bg: string;
};

type NotificationSection = {
  key: NotificationPriority;
  title: string;
  subtitle: string;
  color: string;
  items: NotificationItem[];
};

type NotificationFilter = "all" | NotificationPriority;

const NOTIFICATION_FILTERS: Array<{
  key: NotificationFilter;
  label: string;
}> = [
  { key: "all", label: "Todas" },
  { key: "critical", label: "Críticas" },
  { key: "important", label: "Importantes" },
  { key: "informational", label: "Informativas" },
];

function getKindMeta(kind: string): KindMeta {
  switch (kind) {
    case "budget_alert":
      return { Icon: TrendingUp,     color: COLORS.warning, bg: COLORS.warning + "20" };
    case "budget_period_ending":
      return { Icon: Clock,          color: COLORS.warning, bg: COLORS.warning + "20" };
    case "subscription_reminder":
      return { Icon: RefreshCw,      color: COLORS.ember,   bg: COLORS.ember   + "20" };
    case "subscription_overdue":
      return { Icon: AlertTriangle,  color: COLORS.danger,  bg: COLORS.danger  + "20" };
    case "multiple_subscriptions_due":
      return { Icon: Calendar,       color: COLORS.ember,   bg: COLORS.ember   + "20" };
    case "obligation_due":
      return { Icon: Clock,          color: COLORS.warning, bg: COLORS.warning + "20" };
    case "obligation_overdue":
      return { Icon: AlertTriangle,  color: COLORS.danger,  bg: COLORS.danger  + "20" };
    case "obligation_no_payment":
      return { Icon: CreditCard,     color: COLORS.warning, bg: COLORS.warning + "20" };
    case "obligation_event_unlinked":
      return { Icon: CreditCard,     color: COLORS.warning, bg: COLORS.warning  + "20" };
    case "obligation_payment_request":
      return { Icon: CreditCard,     color: COLORS.primary, bg: COLORS.primary  + "20" };
    case "obligation_share_invite":
      return { Icon: Mail,           color: COLORS.pine,    bg: COLORS.pine     + "20" };
    case "workspace_invite":
      return { Icon: Mail,           color: COLORS.primary, bg: COLORS.primary  + "20" };
    case "obligation_request_accepted":
      return { Icon: CreditCard,     color: COLORS.income,  bg: COLORS.income   + "20" };
    case "obligation_request_rejected":
      return { Icon: CreditCard,     color: COLORS.danger,  bg: COLORS.danger   + "20" };
    case "obligation_event_delete_request":
      return { Icon: CreditCard,     color: COLORS.warning, bg: COLORS.warning  + "20" };
    case "obligation_event_delete_pending":
      return { Icon: Clock,          color: COLORS.warning, bg: COLORS.warning  + "20" };
    case "obligation_event_delete_accepted":
      return { Icon: CreditCard,     color: COLORS.income,  bg: COLORS.income   + "20" };
    case "obligation_event_delete_rejected":
      return { Icon: CreditCard,     color: COLORS.danger,  bg: COLORS.danger   + "20" };
    case "obligation_event_deleted":
      return { Icon: CreditCard,     color: COLORS.storm,   bg: COLORS.storm    + "20" };
    case "obligation_event_edit_request":
      return { Icon: CreditCard,     color: COLORS.primary, bg: COLORS.primary  + "20" };
    case "obligation_event_edit_pending":
      return { Icon: Clock,          color: COLORS.warning, bg: COLORS.warning  + "20" };
    case "obligation_event_edit_accepted":
      return { Icon: CreditCard,     color: COLORS.income,  bg: COLORS.income   + "20" };
    case "obligation_event_edit_rejected":
      return { Icon: CreditCard,     color: COLORS.danger,  bg: COLORS.danger   + "20" };
    case "obligation_event_updated":
      return { Icon: CreditCard,     color: COLORS.primary, bg: COLORS.primary  + "20" };
    case "multiple_obligations_overdue":
      return { Icon: AlertTriangle,  color: COLORS.danger,  bg: COLORS.danger  + "20" };
    case "high_interest_obligation":
      return { Icon: Percent,        color: COLORS.danger,  bg: COLORS.danger  + "20" };
    case "low_balance":
      return { Icon: Wallet,         color: COLORS.warning, bg: COLORS.warning + "20" };
    case "negative_balance":
      return { Icon: TrendingDown,   color: COLORS.danger,  bg: COLORS.danger  + "20" };
    case "account_dormant":
      return { Icon: Bell,           color: COLORS.storm,   bg: COLORS.storm   + "20" };
    case "no_income_month":
      return { Icon: TrendingDown,   color: COLORS.warning, bg: COLORS.warning + "20" };
    case "high_expense_month":
      return { Icon: TrendingUp,     color: COLORS.danger,  bg: COLORS.danger  + "20" };
    case "category_spending_spike":
      return { Icon: BarChart2,      color: COLORS.warning, bg: COLORS.warning + "20" };
    case "expense_income_imbalance":
      return { Icon: Scale,          color: COLORS.warning, bg: COLORS.warning + "20" };
    case "net_worth_negative":
      return { Icon: AlertTriangle,  color: COLORS.danger,  bg: COLORS.danger  + "20" };
    case "savings_rate_low":
      return { Icon: TrendingDown,   color: COLORS.warning, bg: COLORS.warning + "20" };
    case "subscription_cost_heavy":
      return { Icon: RefreshCw,      color: COLORS.warning, bg: COLORS.warning + "20" };
    case "upcoming_annual_subscription":
      return { Icon: Calendar,       color: COLORS.ember,   bg: COLORS.ember   + "20" };
    case "no_movements_week":
      return { Icon: Bell,           color: COLORS.storm,   bg: COLORS.storm   + "20" };
    default:
      return { Icon: Bell,           color: COLORS.storm,   bg: COLORS.storm   + "20" };
  }
}

function firstPayloadValue(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function payloadNumber(value: unknown, key: string): number | null {
  const payload = firstPayloadValue(value);
  if (!payload) return null;
  const raw = payload[key];
  const num = typeof raw === "number" ? raw : Number(raw ?? 0);
  return Number.isFinite(num) && num > 0 ? num : null;
}

function payloadString(value: unknown, key: string): string | null {
  const payload = firstPayloadValue(value);
  if (!payload) return null;
  const raw = payload[key];
  return typeof raw === "string" && raw.trim().length > 0 ? raw.trim() : null;
}

// ─── Notification card ────────────────────────────────────────────────────────

function NotifCard({
  item,
  onPress,
  onLongPress,
  selected = false,
  selectionMode = false,
}: {
  item: NotificationItem;
  onPress: () => void;
  onLongPress?: () => void;
  selected?: boolean;
  selectionMode?: boolean;
}) {
  const { Icon, color, bg } = getKindMeta(item.kind);
  const priority = getNotificationPriority(item.kind);
  const priorityMeta = getNotificationPriorityMeta(priority);
  const unread = item.status !== "read";
  const obligationTitle = payloadString(item.payload, "obligationTitle");

  return (
    <TouchableOpacity
      style={[
        styles.card,
        unread && styles.cardUnread,
        selected && styles.cardSelected,
        selectionMode && !selected && styles.cardSelectionMode,
      ]}
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={220}
      activeOpacity={0.75}
    >
      {unread && <View style={[styles.unreadBar, { backgroundColor: color }]} />}
      {selectionMode ? (
        <View style={[styles.selectedIndicator, selected && styles.selectedIndicatorActive]}>
          <Text style={[styles.selectedIndicatorText, selected && styles.selectedIndicatorTextActive]}>
            {selected ? "✓" : ""}
          </Text>
        </View>
      ) : null}

      <View style={[styles.iconWrap, { backgroundColor: bg }]}>
        <Icon size={18} color={color} strokeWidth={2} />
      </View>

      <View style={[styles.cardBody, selectionMode && styles.cardBodyWithSelection]}>
        <View style={styles.cardTop}>
          <Text style={[styles.cardTitle, unread && { color: COLORS.ink }]} numberOfLines={1}>
            {item.title}
          </Text>
          <Text style={styles.cardTime}>
            {format(new Date(item.scheduledFor), "d MMM · HH:mm", { locale: es })}
          </Text>
        </View>
        <View style={styles.metaRow}>
          <View
            style={[
              styles.priorityPill,
              {
                backgroundColor: priorityMeta.bg,
                borderColor: priorityMeta.border,
              },
            ]}
          >
            <Text style={[styles.priorityPillText, { color: priorityMeta.color }]}>
              {priorityMeta.label}
            </Text>
          </View>
          {obligationTitle ? (
            <Text style={styles.cardContext} numberOfLines={1}>
              {obligationTitle}
            </Text>
          ) : null}
        </View>
        <Text style={styles.cardText} numberOfLines={3}>
          {item.body}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

// ─── Invite card ──────────────────────────────────────────────────────────────

function InviteCard({
  item,
  onPress,
}: {
  item: PendingObligationShareInviteItem;
  onPress: () => void;
}) {
  const kindLabel = item.inviteKindLabel === "deuda"
    ? "deuda"
    : item.inviteKindLabel === "credito"
      ? "crédito"
      : "crédito o deuda";
  const title = item.obligationTitle ?? `Solicitud de ${kindLabel}`;
  return (
    <View style={[styles.card, styles.cardUnread]}>
      <View style={[styles.unreadBar, { backgroundColor: COLORS.pine }]} />

      <View style={[styles.iconWrap, { backgroundColor: COLORS.pine + "20" }]}>
        <Mail size={18} color={COLORS.pine} strokeWidth={2} />
      </View>

      <View style={styles.cardBody}>
        <View style={styles.cardTop}>
          <Text style={[styles.cardTitle, { color: COLORS.ink }]} numberOfLines={1}>
            Tienes una {kindLabel} compartida
          </Text>
          <Text style={styles.cardTime}>
            {format(new Date(item.updatedAt), "d MMM · HH:mm", { locale: es })}
          </Text>
        </View>
        <Text style={styles.cardContext} numberOfLines={1}>
          {title}
        </Text>
        <Text style={styles.cardText} numberOfLines={2}>
          {item.ownerDisplayName
            ? `${item.ownerDisplayName} te envió una solicitud. Acéptala o recházala para mantener tu información ordenada.`
            : "Tienes una solicitud pendiente. Acéptala o recházala para continuar."}
        </Text>
        {item.message ? (
          <Text style={styles.cardQuote} numberOfLines={1}>"{item.message}"</Text>
        ) : null}
        <TouchableOpacity style={styles.inviteBtn} onPress={onPress} activeOpacity={0.8}>
          <Text style={styles.inviteBtnText}>Revisar solicitud</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyNotifications() {
  return (
    <View style={styles.emptyWrap}>
      <View style={styles.emptyIconWrap}>
        <Bell size={28} color={COLORS.storm} strokeWidth={1.5} />
      </View>
      <Text style={styles.emptyTitle}>Sin notificaciones</Text>
      <Text style={styles.emptyBody}>
        Aquí verás alertas de presupuestos, suscripciones, obligaciones y salud financiera cuando corresponda.
      </Text>
    </View>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

function NotificationsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, profile } = useAuth();
  const { showToast } = useToast();
  const [selectedNotificationIds, setSelectedNotificationIds] = useState<number[]>([]);
  const [activeFilter, setActiveFilter] = useState<NotificationFilter>("all");
  const ignoreTapAfterLongPressRef = useRef(false);

  // Pedir permisos al entrar al módulo
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
  const notificationList: NotificationItem[] =
    (notificationsQuery.data as NotificationItem[] | undefined) ?? [];
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
  const unreadCount = notificationList.filter((n) => n.status !== "read").length;
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
    markSelectedUnread.isPending;

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

  function handleMarkAll() {
    if (unreadCount === 0) return;
    markAllRead.mutate(undefined, {
      onSuccess: () => {
        showToast("Todas quedaron como leídas", "success");
      },
      onError: (error: unknown) => {
        showToast(error instanceof Error ? error.message : "No se pudo actualizar", "error");
      },
    });
  }

  function handleMarkAllUnread() {
    if (readCount === 0) return;
    markAllUnread.mutate(undefined, {
      onSuccess: () => {
        showToast("Todas quedaron como no leídas", "success");
      },
      onError: (error: unknown) => {
        showToast(error instanceof Error ? error.message : "No se pudo actualizar", "error");
      },
    });
  }

  function handleNotificationLongPress(notification: NotificationItem) {
    ignoreTapAfterLongPressRef.current = true;
    setTimeout(() => {
      ignoreTapAfterLongPressRef.current = false;
    }, 250);
    toggleNotificationSelection(notification.id);
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

  function handleTap(n: NotificationItem) {
    if (ignoreTapAfterLongPressRef.current) {
      ignoreTapAfterLongPressRef.current = false;
      return;
    }
    if (selectionMode) {
      toggleNotificationSelection(n.id);
      return;
    }
    const deferReadUntilResolved =
      n.kind === "obligation_payment_request" ||
      n.kind === "obligation_event_delete_request" ||
      n.kind === "obligation_event_edit_request";
    if (n.status !== "read" && !deferReadUntilResolved) markRead.mutate(n.id);
    const id = n.relatedEntityId;
    const obligationIdFromPayload = payloadNumber(n.payload, "obligationId");
    const requestIdFromPayload = payloadNumber(n.payload, "requestId");
    const eventIdFromPayload = payloadNumber(n.payload, "eventId");
    const responseStatusFromPayload = payloadString(n.payload, "responseStatus");
    const obligationRouteId =
      obligationIdFromPayload ?? (n.relatedEntityType === "obligation" ? id : null);
    switch (n.kind) {
      case "budget_alert":
      case "budget_period_ending":
        router.push("/(app)/budgets?from=notifications"); break;
      case "subscription_reminder":
      case "subscription_overdue":
        if (id) router.push(`/subscription/${id}`); break;
      case "obligation_due":
      case "obligation_overdue":
      case "obligation_no_payment":
      case "high_interest_obligation":
        if (id) router.push(`/obligation/${id}`); break;
      case "obligation_event_unlinked":
        if (obligationRouteId) {
          router.push({
            pathname: "/obligation/[id]",
            params: {
              id: String(obligationRouteId),
              eventId: String(eventIdFromPayload ?? ""),
              notificationKind: n.kind,
            },
          });
        }
        break;
      case "obligation_payment_request":
        if (obligationRouteId) {
          if (responseStatusFromPayload === "accepted" || responseStatusFromPayload === "rejected") {
            router.push(`/obligation/${obligationRouteId}`);
          } else {
            router.push({
              pathname: "/obligation/[id]",
              params: {
                id: String(obligationRouteId),
                paymentRequestId: String(requestIdFromPayload ?? id ?? ""),
                notificationKind: n.kind,
              },
            });
          }
        }
        break;
      case "obligation_share_invite": {
        const token = payloadString(n.payload, "token");
        if (token) {
          router.push(obligationShareHref(token));
        } else {
          router.push("/(app)/obligations");
        }
        break;
      }
      case "workspace_invite": {
        const token = payloadString(n.payload, "token");
        if (token) {
          router.push(workspaceInviteHref(token));
        } else {
          router.push("/(app)/dashboard");
        }
        break;
      }
      case "obligation_request_accepted":
      case "obligation_request_rejected":
        if (obligationRouteId) {
          router.push(`/obligation/${obligationRouteId}`);
        }
        break;
      case "obligation_event_delete_request":
      case "obligation_event_delete_pending":
      case "obligation_event_delete_accepted":
      case "obligation_event_delete_rejected":
      case "obligation_event_deleted":
      case "obligation_event_edit_request":
      case "obligation_event_edit_pending":
      case "obligation_event_edit_accepted":
      case "obligation_event_edit_rejected":
      case "obligation_event_updated":
        if (obligationRouteId) {
          router.push({
            pathname: "/obligation/[id]",
            params: {
              id: String(obligationRouteId),
              eventId: String(eventIdFromPayload ?? id ?? ""),
              notificationKind: n.kind,
            },
          });
        }
        break;
      case "low_balance":
      case "negative_balance":
      case "account_dormant":
        if (id) router.push(`/account/${id}`); break;
      case "savings_rate_low":
      case "subscription_cost_heavy":
      case "no_movements_week":
        router.push("/(app)/dashboard"); break;
      case "upcoming_annual_subscription":
        if (id) router.push(`/subscription/${id}`);
        else router.push("/subscriptions"); break;
    }
  }

  const onRefresh = useCallback(() => {
    void refetch();
    void refetchInvites();
  }, [refetch, refetchInvites]);

  const showSkeleton =
    (isLoading && notificationList.length === 0 && pendingInvites.length === 0) ||
    (loadingPendingInvites && !pendingInvites.length && notificationList.length === 0);

  const hasContent = pendingInvites.length > 0 || notificationList.length > 0;
  const notificationSections = useMemo<NotificationSection[]>(() => {
    const grouped: Record<NotificationPriority, NotificationItem[]> = {
      critical: [],
      important: [],
      informational: [],
    };

    for (const item of notificationList) {
      grouped[getNotificationPriority(item.kind)].push(item);
    }

    return [
      {
        key: "critical" as const,
        title: "Críticas",
        subtitle: getNotificationPriorityMeta("critical").subtitle,
        color: getNotificationPriorityMeta("critical").color,
        items: grouped.critical,
      },
      {
        key: "important" as const,
        title: getNotificationPriorityMeta("important").title,
        subtitle: getNotificationPriorityMeta("important").subtitle,
        color: getNotificationPriorityMeta("important").color,
        items: grouped.important,
      },
      {
        key: "informational" as const,
        title: getNotificationPriorityMeta("informational").title,
        subtitle: getNotificationPriorityMeta("informational").subtitle,
        color: getNotificationPriorityMeta("informational").color,
        items: grouped.informational,
      },
    ].filter((section) => section.items.length > 0);
  }, [notificationList]);
  const visibleNotificationSections = useMemo(
    () =>
      activeFilter === "all"
        ? notificationSections
        : notificationSections.filter((section) => section.key === activeFilter),
    [activeFilter, notificationSections],
  );
  const filteredNotificationCount = useMemo(
    () => visibleNotificationSections.reduce((total, section) => total + section.items.length, 0),
    [visibleNotificationSections],
  );
  const filterUnreadCounts = useMemo(() => {
    const counts: Record<NotificationFilter, number> = {
      all: notificationList.filter((item) => item.status !== "read").length,
      critical: 0,
      important: 0,
      informational: 0,
    };
    for (const item of notificationList) {
      if (item.status === "read") continue;
      counts[getNotificationPriority(item.kind)] += 1;
    }
    return counts;
  }, [notificationList]);

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <ScreenHeader
        title={selectionMode ? `${selectedNotificationIds.length} seleccionadas` : "Notificaciones"}
        subtitle={selectionMode ? "Elige qué hacer con la selección" : undefined}
        showPlanBadge={!selectionMode}
        onBack={() => {
          if (selectionMode) {
            clearSelection();
            return;
          }
          router.replace("/(app)/more");
        }}
        rightAction={
          selectionMode ? (
            <TouchableOpacity onPress={clearSelection} style={styles.markAllBtn}>
              <Text style={styles.markAllText}>Cancelar</Text>
            </TouchableOpacity>
          ) : undefined
        }
      />

      {selectionMode ? (
        <View style={styles.bulkToolbar}>
          <Text style={styles.bulkToolbarLabel}>
            {selectedNotificationIds.length} seleccionada{selectedNotificationIds.length === 1 ? "" : "s"}
          </Text>
          <View style={styles.bulkToolbarActions}>
            <TouchableOpacity
              onPress={() => void handleSelectedReadState("read")}
              style={[
                styles.bulkActionBtn,
                selectedUnreadCount === 0 && styles.bulkActionBtnDisabled,
              ]}
              disabled={selectedUnreadCount === 0 || bulkActionLoading}
            >
              <Text style={styles.bulkActionText}>Marcar leído</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => void handleSelectedReadState("unread")}
              style={[
                styles.bulkActionBtn,
                selectedReadCount === 0 && styles.bulkActionBtnDisabled,
              ]}
              disabled={selectedReadCount === 0 || bulkActionLoading}
            >
              <Text style={styles.bulkActionText}>Marcar no leído</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : unreadCount > 0 || readCount > 0 ? (
        <View style={styles.bulkToolbar}>
          <Text style={styles.bulkToolbarLabel}>Acciones rápidas</Text>
          <View style={styles.bulkToolbarActions}>
            <TouchableOpacity
              onPress={handleMarkAll}
              style={[styles.bulkActionBtn, unreadCount === 0 && styles.bulkActionBtnDisabled]}
              disabled={unreadCount === 0 || bulkActionLoading}
            >
              <Text style={styles.bulkActionText}>Leer todas</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleMarkAllUnread}
              style={[styles.bulkActionBtn, readCount === 0 && styles.bulkActionBtnDisabled]}
              disabled={readCount === 0 || bulkActionLoading}
            >
              <Text style={styles.bulkActionText}>No leer todas</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : null}

      {notificationList.length > 0 && (
        <View style={styles.filterBar}>
          {NOTIFICATION_FILTERS.map((filter) => {
            const isActive = activeFilter === filter.key;
            const unread = filterUnreadCounts[filter.key];
            return (
              <TouchableOpacity
                key={filter.key}
                style={[
                  styles.filterChip,
                  isActive && styles.filterChipActive,
                ]}
                onPress={() => setActiveFilter(filter.key)}
                activeOpacity={0.85}
              >
                <Text style={[styles.filterChipText, isActive && styles.filterChipTextActive]}>
                  {filter.label}
                </Text>
                {unread > 0 && (
                  <View style={[styles.filterChipBadge, isActive && styles.filterChipBadgeActive]}>
                    <Text style={[styles.filterChipBadgeText, isActive && styles.filterChipBadgeTextActive]}>
                      {unread}
                    </Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      {showSkeleton ? (
        <View style={styles.listPad}>
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={isLoading}
              onRefresh={onRefresh}
              tintColor={COLORS.primary}
            />
          }
        >
          {!hasContent ? (
            <EmptyNotifications />
          ) : (
            <>
              {/* Invites section */}
              {pendingInvites.length > 0 && (
                <View style={styles.section}>
                  <Text style={styles.sectionLabel}>Invitaciones pendientes</Text>
                  {pendingInvites.map((inv) => (
                    <InviteCard
                      key={inv.token}
                      item={inv}
                      onPress={() => router.push(obligationShareHref(inv.token))}
                    />
                  ))}
                </View>
              )}

              {visibleNotificationSections.map((section) => {
                const sectionUnreadCount = section.items.filter((item) => item.status !== "read").length;
                return (
                  <View key={section.key} style={styles.section}>
                    <View style={styles.sectionHeader}>
                      <View style={styles.sectionHeading}>
                        <View style={[styles.sectionDot, { backgroundColor: section.color }]} />
                        <Text style={styles.sectionLabel}>{section.title}</Text>
                        {sectionUnreadCount > 0 && (
                          <View style={styles.badge}>
                            <Text style={styles.badgeText}>{sectionUnreadCount}</Text>
                          </View>
                        )}
                      </View>
                      <Text style={styles.sectionSubtitle}>{section.subtitle}</Text>
                    </View>
                    {section.items.map((n, i) => (
                      <NotifCard
                        key={`${section.key}-${n.id}-${i}`}
                        item={n}
                        onPress={() => handleTap(n)}
                        onLongPress={() => handleNotificationLongPress(n)}
                        selected={selectedNotificationIds.includes(n.id)}
                        selectionMode={selectionMode}
                      />
                    ))}
                  </View>
                );
              })}
              {notificationList.length > 0 && filteredNotificationCount === 0 && (
                <View style={styles.filteredEmptyState}>
                  <Text style={styles.filteredEmptyTitle}>Nada en esta vista</Text>
                  <Text style={styles.filteredEmptyBody}>
                    Cambia el filtro para ver otras prioridades o espera nuevas alertas.
                  </Text>
                </View>
              )}
            </>
          )}
        </ScrollView>
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.bg },

  listPad: { padding: SPACING.lg, gap: SPACING.md },
  listContent: { padding: SPACING.lg, gap: SPACING.md, paddingBottom: 48 },
  bulkToolbar: {
    marginHorizontal: SPACING.lg,
    marginTop: SPACING.md,
    marginBottom: SPACING.xs,
    padding: SPACING.sm,
    borderRadius: RADIUS.xl,
    borderWidth: 1,
    borderColor: GLASS.cardBorder,
    backgroundColor: GLASS.card,
    gap: SPACING.sm,
  },
  bulkToolbarLabel: {
    fontFamily: FONT_FAMILY.bodySemibold,
    fontSize: FONT_SIZE.xs,
    color: COLORS.storm,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  bulkToolbarActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: SPACING.xs,
  },
  bulkActionBtn: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: 6,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: COLORS.primary + "50",
    backgroundColor: COLORS.primary + "14",
  },
  bulkActionBtnDisabled: {
    opacity: 0.45,
  },
  bulkActionText: {
    fontFamily: FONT_FAMILY.bodyMedium,
    fontSize: FONT_SIZE.xs,
    color: COLORS.primary,
  },
  filterBar: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: SPACING.xs,
    paddingHorizontal: SPACING.lg,
    marginTop: SPACING.sm,
    marginBottom: SPACING.xs,
  },
  filterChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 7,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: GLASS.cardBorder,
    backgroundColor: GLASS.card,
  },
  filterChipActive: {
    borderColor: COLORS.primary + "70",
    backgroundColor: COLORS.primary + "14",
  },
  filterChipText: {
    fontFamily: FONT_FAMILY.bodyMedium,
    fontSize: FONT_SIZE.xs,
    color: COLORS.storm,
  },
  filterChipTextActive: {
    color: COLORS.primary,
  },
  filterChipBadge: {
    minWidth: 18,
    height: 18,
    paddingHorizontal: 5,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.primary + "24",
    alignItems: "center",
    justifyContent: "center",
  },
  filterChipBadgeActive: {
    backgroundColor: COLORS.primary,
  },
  filterChipBadgeText: {
    fontFamily: FONT_FAMILY.bodySemibold,
    fontSize: 10,
    color: COLORS.primary,
  },
  filterChipBadgeTextActive: {
    color: "#FFFFFF",
  },

  // Section
  section: { gap: SPACING.sm },
  sectionHeader: {
    gap: 4,
    marginBottom: SPACING.xs,
  },
  sectionHeading: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.xs,
  },
  sectionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.xs,
    marginBottom: SPACING.xs,
  },
  sectionDot: {
    width: 8,
    height: 8,
    borderRadius: RADIUS.full,
  },
  sectionLabel: {
    fontFamily: FONT_FAMILY.bodySemibold,
    fontSize: FONT_SIZE.xs,
    color: COLORS.storm,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  sectionSubtitle: {
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.xs,
    color: COLORS.textMuted,
    lineHeight: 16,
  },
  badge: {
    backgroundColor: COLORS.primary + "30",
    borderRadius: RADIUS.full,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  badgeText: {
    fontFamily: FONT_FAMILY.bodySemibold,
    fontSize: 10,
    color: COLORS.primary,
  },

  // Card
  card: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: SPACING.md,
    backgroundColor: GLASS.card,
    borderRadius: RADIUS.xl,
    borderWidth: 1,
    borderColor: GLASS.cardBorder,
    padding: SPACING.md,
    overflow: "hidden",
  },
  cardUnread: {
    backgroundColor: "rgba(14,19,27,0.85)",
    borderColor: "rgba(255,255,255,0.14)",
  },
  cardSelectionMode: {
    opacity: 0.92,
  },
  cardSelected: {
    borderColor: COLORS.primary + "70",
    backgroundColor: COLORS.primary + "14",
  },
  unreadBar: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: 3,
    borderTopLeftRadius: RADIUS.xl,
    borderBottomLeftRadius: RADIUS.xl,
  },
  selectedIndicator: {
    position: "absolute",
    top: SPACING.sm,
    right: SPACING.sm,
    width: 22,
    height: 22,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
    backgroundColor: "rgba(255,255,255,0.04)",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 2,
  },
  selectedIndicatorActive: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primary,
  },
  selectedIndicatorText: {
    fontFamily: FONT_FAMILY.bodySemibold,
    fontSize: 11,
    color: "transparent",
    lineHeight: 14,
  },
  selectedIndicatorTextActive: {
    color: "#FFFFFF",
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: RADIUS.lg,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    marginLeft: 6, // offset for unread bar
  },
  cardBody: { flex: 1, gap: 4, minWidth: 0 },
  cardBodyWithSelection: {
    paddingRight: 28,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.xs,
    minWidth: 0,
    flexWrap: "wrap",
  },
  cardTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: SPACING.xs,
  },
  cardTitle: {
    flex: 1,
    fontFamily: FONT_FAMILY.bodySemibold,
    fontSize: FONT_SIZE.sm,
    color: COLORS.storm,
  },
  cardTime: {
    fontFamily: FONT_FAMILY.body,
    fontSize: 10,
    color: COLORS.textDisabled,
    flexShrink: 0,
  },
  cardContext: {
    fontFamily: FONT_FAMILY.bodySemibold,
    fontSize: FONT_SIZE.xs,
    color: COLORS.primary,
    flexShrink: 1,
  },
  priorityPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: RADIUS.full,
    borderWidth: 1,
  },
  priorityPillText: {
    fontFamily: FONT_FAMILY.bodySemibold,
    fontSize: 10,
  },
  cardText: {
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.sm,
    color: COLORS.storm,
    lineHeight: 18,
  },
  cardQuote: {
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.xs,
    color: COLORS.storm,
    fontStyle: "italic",
    opacity: 0.7,
  },

  // Invite button
  inviteBtn: {
    marginTop: SPACING.sm,
    alignSelf: "flex-start",
    backgroundColor: COLORS.pine + "20",
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: COLORS.pine + "50",
    paddingHorizontal: SPACING.md,
    paddingVertical: 5,
  },
  inviteBtnText: {
    fontFamily: FONT_FAMILY.bodySemibold,
    fontSize: FONT_SIZE.xs,
    color: COLORS.pine,
  },

  // Header button
  markAllBtn: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: 4,
  },
  markAllText: {
    fontFamily: FONT_FAMILY.bodyMedium,
    fontSize: FONT_SIZE.sm,
    color: COLORS.primary,
  },

  // Empty
  emptyWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: SPACING.xxxl * 2,
    gap: SPACING.md,
    paddingHorizontal: SPACING.xxxl,
  },
  emptyIconWrap: {
    width: 64,
    height: 64,
    borderRadius: RADIUS.xl,
    backgroundColor: GLASS.card,
    borderWidth: 1,
    borderColor: GLASS.cardBorder,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: SPACING.xs,
  },
  emptyTitle: {
    fontFamily: FONT_FAMILY.heading,
    fontSize: FONT_SIZE.lg,
    color: COLORS.ink,
    textAlign: "center",
  },
  emptyBody: {
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.sm,
    color: COLORS.storm,
    textAlign: "center",
    lineHeight: 20,
  },
  filteredEmptyState: {
    paddingVertical: SPACING.xl,
    paddingHorizontal: SPACING.md,
    borderRadius: RADIUS.xl,
    borderWidth: 1,
    borderColor: GLASS.cardBorder,
    backgroundColor: GLASS.card,
    gap: SPACING.xs,
  },
  filteredEmptyTitle: {
    fontFamily: FONT_FAMILY.bodySemibold,
    fontSize: FONT_SIZE.sm,
    color: COLORS.ink,
  },
  filteredEmptyBody: {
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.xs,
    color: COLORS.textMuted,
    lineHeight: 18,
  },
});

export default function NotificationsScreenRoot() {
  return (
    <ErrorBoundary>
      <NotificationsScreen />
    </ErrorBoundary>
  );
}
