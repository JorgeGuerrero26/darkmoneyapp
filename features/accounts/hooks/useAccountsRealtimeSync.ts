import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { supabase } from "../../../lib/supabase";
import { logWarn } from "../../../lib/error-logger";

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
 * Use a channel name unique to this module (`accounts:ws-X`) so it doesn't
 * collide with the dashboard or movements module channels — Supabase allows
 * multiple channels per subscription as long as the names differ.
 *
 * Cleanly unsubscribes on unmount or when `workspaceId` changes.
 */
export function useAccountsRealtimeSync({ workspaceId }: Input) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!supabase || !workspaceId) return;

    const channel = supabase
      .channel(`accounts:ws-${workspaceId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "accounts",
          filter: `workspace_id=eq.${workspaceId}`,
        },
        () => {
          void queryClient.invalidateQueries({ queryKey: ["workspace-snapshot"] });
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "movements",
          filter: `workspace_id=eq.${workspaceId}`,
        },
        () => {
          // Movements change the per-account balance and the net-worth aggregate.
          void queryClient.invalidateQueries({ queryKey: ["workspace-snapshot"] });
          // Account detail also paginates movements directly.
          void queryClient.invalidateQueries({ queryKey: ["movements"] });
        },
      )
      .subscribe((status) => {
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          logWarn("realtime", `accounts channel ${status}`, { workspaceId });
        }
      });

    return () => {
      void supabase!.removeChannel(channel);
    };
  }, [workspaceId, queryClient]);
}
