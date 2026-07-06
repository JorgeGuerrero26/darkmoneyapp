import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { subscribeRealtimeChannel } from "../lib/realtime-channel";

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
            void queryClient.invalidateQueries({ queryKey: ["notifications", userId] });
          },
        },
      ],
    });
  }, [userId, queryClient]);
}
