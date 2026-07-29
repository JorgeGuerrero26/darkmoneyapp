import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { subscribeRealtimeChannel } from "../../../lib/realtime-channel";
import {
  scheduleCoalescedTask,
  scheduleQueryInvalidation,
} from "../../../lib/query-refresh-coalescer";
import { refreshSnapshotDomains } from "../../../services/queries/workspace-data";

type Input = {
  workspaceId: number | null;
};

/**
 * Subscribe the accounts module to realtime changes in the `accounts` and
 * `movements` tables for the active workspace. Duplicate events are coalesced;
 * movement changes refresh only the snapshot domains that affect balances.
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
            scheduleQueryInvalidation(queryClient, ["workspace-snapshot"]);
          },
        },
        {
          table: "movements",
          filter: `workspace_id=eq.${workspaceId}`,
          onChange: () => {
            // Movements change the per-account balance and the net-worth aggregate.
            scheduleCoalescedTask(
              queryClient,
              `movement-snapshot:${workspaceId}`,
              () => refreshSnapshotDomains(
                queryClient,
                workspaceId,
                ["accounts", "budgets", "categoryMovements", "subscriptionMovements"],
              ),
            );
            // Account detail also paginates movements directly.
            scheduleQueryInvalidation(queryClient, ["movements"]);
          },
        },
      ],
    });
  }, [workspaceId, queryClient]);
}
