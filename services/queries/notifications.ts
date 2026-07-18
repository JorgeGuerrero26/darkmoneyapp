import { Platform } from "react-native";
import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";

import { supabase } from "../../lib/supabase";
import { STALE } from "../../lib/query-client";
import type { JsonValue } from "../../types/domain";

type CachedNotification = { id: number; status: string; readAt: string | null; [key: string]: unknown };
type NotificationsRollbackCtx = { previous: CachedNotification[] | undefined };

/**
 * Aplica un cambio optimista a la caché de notificaciones: para cada notificación que cumpla
 * `predicate`, reemplaza por `apply(n)`. Devuelve el snapshot previo para poder revertir.
 * Las acciones masivas se sienten instantáneas sin esperar la red ni refetchear las 100.
 */
function optimisticUpdateNotifications(
  queryClient: QueryClient,
  userId: string | null,
  predicate: (n: CachedNotification) => boolean,
  apply: (n: CachedNotification) => CachedNotification,
): NotificationsRollbackCtx {
  const key = ["notifications", userId];
  const previous = queryClient.getQueryData<CachedNotification[]>(key);
  if (previous) {
    queryClient.setQueryData<CachedNotification[]>(key, previous.map((n) => (predicate(n) ? apply(n) : n)));
  }
  return { previous };
}

/** Variante para borrado: quita de la caché las notificaciones cuyo id está en `ids`. */
function optimisticRemoveNotifications(
  queryClient: QueryClient,
  userId: string | null,
  ids: number[],
): NotificationsRollbackCtx {
  const key = ["notifications", userId];
  const previous = queryClient.getQueryData<CachedNotification[]>(key);
  if (previous) {
    const idSet = new Set(ids);
    queryClient.setQueryData<CachedNotification[]>(key, previous.filter((n) => !idSet.has(n.id)));
  }
  return { previous };
}

function rollbackNotifications(queryClient: QueryClient, userId: string | null, ctx?: NotificationsRollbackCtx) {
  if (ctx?.previous) queryClient.setQueryData(["notifications", userId], ctx.previous);
}

export function useNotificationsQuery(userId: string | null) {
  return useQuery({
    queryKey: ["notifications", userId],
    queryFn: async () => {
      if (!supabase || !userId) return [];
      const { data, error } = await supabase
        .from("notifications")
        .select("id, title, body, status, scheduled_for, kind, channel, read_at, related_entity_type, related_entity_id, payload")
        .eq("user_id", userId)
        .order("scheduled_for", { ascending: false })
        .limit(100);
      if (error) throw new Error(error.message ?? "Error de base de datos");
      return (data ?? []).map((row: any) => ({
        id: row.id,
        title: row.title,
        body: row.body,
        status: row.status,
        scheduledFor: row.scheduled_for,
        kind: row.kind,
        channel: row.channel,
        readAt: row.read_at,
        relatedEntityType: row.related_entity_type,
        relatedEntityId: row.related_entity_id,
        payload: (row.payload as JsonValue | null) ?? null,
      }));
    },
    enabled: Boolean(userId),
    staleTime: STALE.short,
    refetchOnMount: "always",
    refetchOnReconnect: true,
    refetchOnWindowFocus: true,
    refetchInterval: userId ? 10_000 : false,
  });
}

export type NotificationPreferenceSummary = {
  userId: string;
  pushEnabled: boolean;
  dailyDigestEnabled: boolean;
  predictiveAlertsEnabled: boolean;
  pushToken: string | null;
  platform: string | null;
};

export function useNotificationPreferencesQuery(userId: string | null | undefined) {
  return useQuery({
    queryKey: ["notification-preferences", userId ?? null],
    enabled: Boolean(supabase && userId),
    staleTime: STALE.short,
    queryFn: async (): Promise<NotificationPreferenceSummary> => {
      if (!supabase || !userId) {
        return {
          userId: userId ?? "",
          pushEnabled: false,
          dailyDigestEnabled: true,
          predictiveAlertsEnabled: true,
          pushToken: null,
          platform: null,
        };
      }

      const { data, error } = await supabase
        .from("notification_preferences")
        .select("user_id, is_active, daily_digest_enabled, predictive_alerts_enabled, push_token, platform")
        .eq("user_id", userId)
        .maybeSingle();

      if (error) throw new Error(error.message ?? "Error al cargar preferencias de notificaciones");

      return {
        userId,
        pushEnabled: data?.is_active === true,
        dailyDigestEnabled: data?.daily_digest_enabled !== false,
        predictiveAlertsEnabled: data?.predictive_alerts_enabled !== false,
        pushToken: typeof data?.push_token === "string" ? data.push_token : null,
        platform: typeof data?.platform === "string" ? data.platform : null,
      };
    },
  });
}

export function useUpdateNotificationPreferencesMutation(userId: string | null | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { dailyDigestEnabled: boolean; predictiveAlertsEnabled?: boolean; pushEnabled?: boolean }) => {
      if (!supabase || !userId) throw new Error("Usuario no disponible.");

      const { data: existing, error: existingError } = await supabase
        .from("notification_preferences")
        .select("user_id")
        .eq("user_id", userId)
        .maybeSingle();

      if (existingError) {
        throw new Error(existingError.message ?? "Error al leer preferencias de notificaciones");
      }

      const operation = existing
        ? supabase
          .from("notification_preferences")
          .update({
            daily_digest_enabled: input.dailyDigestEnabled,
            predictive_alerts_enabled: input.predictiveAlertsEnabled,
            ...(input.pushEnabled !== undefined ? { is_active: input.pushEnabled } : {}),
          })
          .eq("user_id", userId)
        : supabase
          .from("notification_preferences")
          .insert({
            user_id: userId,
            platform: Platform.OS,
            is_active: input.pushEnabled ?? false,
            daily_digest_enabled: input.dailyDigestEnabled,
            predictive_alerts_enabled: input.predictiveAlertsEnabled,
          });

      const { error } = await operation;
      if (error) {
        throw new Error(error.message ?? "Error al guardar preferencias de notificaciones");
      }

      return input;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["notification-preferences", userId ?? null] });
    },
  });
}

export function useMarkNotificationReadMutation(userId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (notificationId: number) => {
      if (!supabase) throw new Error("Supabase no está configurado.");
      const { error } = await supabase
        .from("notifications")
        .update({ status: "read", read_at: new Date().toISOString() })
        .eq("id", notificationId);
      if (error) throw new Error(error.message ?? "Error de base de datos");
    },
    onMutate: (notificationId: number) => optimisticUpdateNotifications(queryClient, userId, (n) => n.id === notificationId,
      (n) => ({ ...n, status: "read", readAt: new Date().toISOString() })),
    onError: (_e, _v, ctx) => rollbackNotifications(queryClient, userId, ctx),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ["notifications", userId] });
    },
  });
}

export function useMarkAllNotificationsReadMutation(userId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      if (!supabase || !userId) throw new Error("Usuario no disponible.");
      const { error } = await supabase
        .from("notifications")
        .update({ status: "read", read_at: new Date().toISOString() })
        .eq("user_id", userId)
        .neq("status", "read");
      if (error) throw new Error(error.message ?? "Error de base de datos");
    },
    // Optimista: refleja el cambio en la UI al instante (sin esperar la red ni refetchear
    // las 100 notificaciones). El realtime/refetch reconcilia luego; onError revierte.
    onMutate: () => optimisticUpdateNotifications(queryClient, userId, () => true,
      (n) => ({ ...n, status: "read", readAt: new Date().toISOString() })),
    onError: (_e, _v, ctx) => rollbackNotifications(queryClient, userId, ctx),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ["notifications", userId] });
    },
  });
}

export function useMarkNotificationUnreadMutation(userId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (notificationId: number) => {
      if (!supabase) throw new Error("Supabase no está configurado.");
      const { error } = await supabase
        .from("notifications")
        .update({ status: "sent", read_at: null })
        .eq("id", notificationId);
      if (error) throw new Error(error.message ?? "Error de base de datos");
    },
    onMutate: (notificationId: number) => optimisticUpdateNotifications(queryClient, userId, (n) => n.id === notificationId,
      (n) => ({ ...n, status: "sent", readAt: null })),
    onError: (_e, _v, ctx) => rollbackNotifications(queryClient, userId, ctx),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ["notifications", userId] });
    },
  });
}

export function useMarkAllNotificationsUnreadMutation(userId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      if (!supabase || !userId) throw new Error("Usuario no disponible.");
      const { error } = await supabase
        .from("notifications")
        .update({ status: "sent", read_at: null })
        .eq("user_id", userId)
        .eq("status", "read");
      if (error) throw new Error(error.message ?? "Error de base de datos");
    },
    onMutate: () => optimisticUpdateNotifications(queryClient, userId, (n) => n.status === "read",
      (n) => ({ ...n, status: "sent", readAt: null })),
    onError: (_e, _v, ctx) => rollbackNotifications(queryClient, userId, ctx),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ["notifications", userId] });
    },
  });
}

export function useMarkNotificationsReadMutation(userId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (notificationIds: number[]) => {
      if (!supabase) throw new Error("Supabase no está configurado.");
      if (!notificationIds.length) return;
      const { error } = await supabase
        .from("notifications")
        .update({ status: "read", read_at: new Date().toISOString() })
        .in("id", notificationIds);
      if (error) throw new Error(error.message ?? "Error de base de datos");
    },
    onMutate: (notificationIds: number[]) => {
      const idSet = new Set(notificationIds);
      return optimisticUpdateNotifications(queryClient, userId, (n) => idSet.has(n.id),
        (n) => ({ ...n, status: "read", readAt: new Date().toISOString() }));
    },
    onError: (_e, _v, ctx) => rollbackNotifications(queryClient, userId, ctx),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ["notifications", userId] });
    },
  });
}

export function useMarkNotificationsUnreadMutation(userId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (notificationIds: number[]) => {
      if (!supabase) throw new Error("Supabase no está configurado.");
      if (!notificationIds.length) return;
      const { error } = await supabase
        .from("notifications")
        .update({ status: "sent", read_at: null })
        .in("id", notificationIds);
      if (error) throw new Error(error.message ?? "Error de base de datos");
    },
    onMutate: (notificationIds: number[]) => {
      const idSet = new Set(notificationIds);
      return optimisticUpdateNotifications(queryClient, userId, (n) => idSet.has(n.id),
        (n) => ({ ...n, status: "sent", readAt: null }));
    },
    onError: (_e, _v, ctx) => rollbackNotifications(queryClient, userId, ctx),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ["notifications", userId] });
    },
  });
}

export function useDeleteNotificationMutation(userId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (notificationId: number) => {
      if (!supabase) throw new Error("Supabase no está configurado.");
      const { error } = await supabase
        .from("notifications")
        .delete()
        .eq("id", notificationId);
      if (error) throw new Error(error.message ?? "Error de base de datos");
    },
    onMutate: (notificationId: number) => optimisticRemoveNotifications(queryClient, userId, [notificationId]),
    onError: (_e, _v, ctx) => rollbackNotifications(queryClient, userId, ctx),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ["notifications", userId] });
    },
  });
}

export function useDeleteNotificationsMutation(userId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (notificationIds: number[]) => {
      if (!supabase) throw new Error("Supabase no está configurado.");
      if (!notificationIds.length) return;
      const { error } = await supabase
        .from("notifications")
        .delete()
        .in("id", notificationIds);
      if (error) throw new Error(error.message ?? "Error de base de datos");
    },
    onMutate: (notificationIds: number[]) => optimisticRemoveNotifications(queryClient, userId, notificationIds),
    onError: (_e, _v, ctx) => rollbackNotifications(queryClient, userId, ctx),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ["notifications", userId] });
    },
  });
}
