import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { subscribeRealtimeChannel } from "../lib/realtime-channel";
import { scheduleQueryInvalidation } from "../lib/query-refresh-coalescer";

export function useNotificationsRealtimeSync(userId: string | null) {
  const queryClient = useQueryClient();
  useEffect(() => {
    if (!userId) return;
    return subscribeRealtimeChannel({
      source: "notifications",
      channelName: `notifications:${userId}`,
      bindings: [
        {
          table: "notifications",
          filter: `user_id=eq.${userId}`,
          onChange: () => {
            scheduleQueryInvalidation(queryClient, ["notifications", userId]);
          },
        },
      ],
    });
  }, [userId, queryClient]);
}
