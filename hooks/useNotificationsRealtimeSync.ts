import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";
import { logWarn } from "../lib/error-logger";

export function useNotificationsRealtimeSync(userId: string | null) {
  const queryClient = useQueryClient();
  useEffect(() => {
    if (!supabase || !userId) return;
    const channel = supabase
      .channel(`notifications:${userId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${userId}`,
        },
        () => {
          void queryClient.invalidateQueries({ queryKey: ["notifications", userId] });
        },
      )
      .subscribe((status) => {
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          logWarn("realtime", `notifications channel ${status}`, { userId });
        }
      });
    return () => {
      void supabase!.removeChannel(channel);
    };
  }, [userId, queryClient]);
}
