import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { subscribeRealtimeChannel } from "../../../lib/realtime-channel";

type Input = {
  workspaceId: number | null;
};

/**
 * Subscribe the accounts module to realtime changes in the `accounts` and
 * `movements` tables for the active workspace. Whenever a row is inserted /
 * updated / deleted on either table, the workspace snapshot is invalidated so
 * the list and detail screens re-fetch transparently.
 *
 * Why both tables?
 *  - `accounts` changes obviously affect the list (rename, archive, balance).
 *  - `movements` changes mutate `currentBalance` for the involved accounts,
 *    so the list net-worth and per-card balance must refresh.
 *
 * La resiliencia (re-suscripción con backoff, logs deduplicados) vive en
 * subscribeRealtimeChannel. Cleanly unsubscribes on unmount / workspace change.
 */
export function useAccountsRealtimeSync({ workspaceId }: Input) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!workspaceId) return;
    return subscribeRealtimeChannel({
      source: "accounts",
      channelName: `accounts:ws-${workspaceId}`,
      bindings: [
        {
          table: "accounts",
          filter: `workspace_id=eq.${workspaceId}`,
          onChange: () => {
            void queryClient.invalidateQueries({ queryKey: ["workspace-snapshot"] });
          },
        },
        {
          table: "movements",
          filter: `workspace_id=eq.${workspaceId}`,
          onChange: () => {
            // Movements change the per-account balance and the net-worth aggregate.
            void queryClient.invalidateQueries({ queryKey: ["workspace-snapshot"] });
            // Account detail also paginates movements directly.
            void queryClient.invalidateQueries({ queryKey: ["movements"] });
          },
        },
      ],
    });
  }, [workspaceId, queryClient]);
}
