import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "../../lib/supabase";
import { formatSupabaseError, runBackgroundQueryRefresh } from "./_shared";
import type { WorkspaceSnapshot } from "./workspace-data";

export type AccountFormInput = {
  name: string;
  type: string;
  currencyCode: string;
  openingBalance: number;
  includeInNetWorth: boolean;
  color: string;
  icon: string;
};

export function useCreateAccountMutation(workspaceId: number | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: AccountFormInput) => {
      if (!supabase || !workspaceId) throw new Error("Workspace no disponible.");
      const { data, error } = await supabase
        .from("accounts")
        .insert({
          workspace_id: workspaceId,
          name: input.name,
          type: input.type,
          currency_code: input.currencyCode,
          opening_balance: input.openingBalance,
          include_in_net_worth: input.includeInNetWorth,
          color: input.color,
          icon: input.icon,
          sort_order: 0,
          is_archived: false,
        })
        .select("id")
        .single();
      if (error) throw new Error(formatSupabaseError(error) || "Error de base de datos");
      return data as { id: number };
    },
    onSuccess: () => {
      runBackgroundQueryRefresh(queryClient, [["workspace-snapshot"]]);
    },
  });
}

export function useUpdateAccountMutation(workspaceId: number | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, input }: { id: number; input: Partial<AccountFormInput> }) => {
      if (!supabase || !workspaceId) throw new Error("Workspace no disponible.");
      const { error } = await supabase
        .from("accounts")
        .update({
          name: input.name,
          type: input.type,
          currency_code: input.currencyCode,
          opening_balance: input.openingBalance,
          include_in_net_worth: input.includeInNetWorth,
          color: input.color,
          icon: input.icon,
        })
        .eq("id", id)
        .eq("workspace_id", workspaceId);
      if (error) throw new Error(error.message ?? "Error de base de datos");
    },
    onSuccess: () => {
      runBackgroundQueryRefresh(queryClient, [["workspace-snapshot"]]);
    },
  });
}

export function useArchiveAccountMutation(workspaceId: number | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, archived }: { id: number; archived: boolean }) => {
      if (!supabase || !workspaceId) throw new Error("Workspace no disponible.");
      const { error } = await supabase
        .from("accounts")
        .update({ is_archived: archived })
        .eq("id", id)
        .eq("workspace_id", workspaceId);
      if (error) throw new Error(error.message ?? "Error de base de datos");
    },
    onMutate: async ({ id, archived }) => {
      await queryClient.cancelQueries({ queryKey: ["workspace-snapshot"] });
      const previousEntries = queryClient.getQueriesData<WorkspaceSnapshot>({ queryKey: ["workspace-snapshot"] });
      queryClient.setQueriesData<WorkspaceSnapshot>({ queryKey: ["workspace-snapshot"] }, (old) => {
        if (!old) return old;
        return {
          ...old,
          accounts: old.accounts.map((a) => a.id === id ? { ...a, isArchived: archived } : a),
        };
      });
      return { previousEntries };
    },
    onError: (_err, _vars, context) => {
      for (const [key, value] of (context?.previousEntries ?? [])) {
        queryClient.setQueryData(key, value);
      }
    },
    onSuccess: () => {
      runBackgroundQueryRefresh(queryClient, [["workspace-snapshot"]]);
    },
  });
}

export function useDeleteAccountMutation(workspaceId: number | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      if (!supabase || !workspaceId) throw new Error("Workspace no disponible.");
      const { error } = await supabase
        .from("accounts")
        .delete()
        .eq("id", id)
        .eq("workspace_id", workspaceId);
      if (error) throw new Error(error.message ?? "Error de base de datos");
    },
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ["workspace-snapshot"] });
      const previousEntries = queryClient.getQueriesData<WorkspaceSnapshot>({ queryKey: ["workspace-snapshot"] });
      queryClient.setQueriesData<WorkspaceSnapshot>({ queryKey: ["workspace-snapshot"] }, (old) => {
        if (!old) return old;
        return { ...old, accounts: old.accounts.filter((a) => a.id !== id) };
      });
      return { previousEntries };
    },
    onError: (_err, _id, context) => {
      for (const [key, value] of (context?.previousEntries ?? [])) {
        queryClient.setQueryData(key, value);
      }
    },
    onSuccess: () => {
      runBackgroundQueryRefresh(queryClient, [["workspace-snapshot"]]);
    },
  });
}

export type AccountMovementAnalytics = {
  id: number;
  movementType: string;
  status: string;
  occurredAt: string;
  description: string | null;
  sourceAccountId: number | null;
  sourceAmount: number | null;
  destinationAccountId: number | null;
  destinationAmount: number | null;
  categoryId: number | null;
  categoryName: string | null;
};

export function useAccountAnalyticsQuery(
  workspaceId: number | null,
  accountId: number | null,
) {
  return useQuery({
    queryKey: ["account-analytics", workspaceId, accountId],
    enabled: Boolean(workspaceId && accountId),
    queryFn: async () => {
      if (!supabase || !workspaceId || !accountId) return [];
      const { data, error } = await supabase
        .from("movements")
        .select(
          "id, movement_type, status, occurred_at, description, source_account_id, source_amount, destination_account_id, destination_amount, category_id, categories(name)",
        )
        .eq("workspace_id", workspaceId)
        .or(`source_account_id.eq.${accountId},destination_account_id.eq.${accountId}`)
        .eq("status", "posted")
        .order("occurred_at", { ascending: false })
        .limit(300);
      if (error) throw error;
      return ((data ?? []) as any[]).map((r) => ({
        id: r.id,
        movementType: r.movement_type,
        status: r.status,
        occurredAt: r.occurred_at,
        description: r.description,
        sourceAccountId: r.source_account_id,
        sourceAmount: r.source_amount ? Number(r.source_amount) : null,
        destinationAccountId: r.destination_account_id,
        destinationAmount: r.destination_amount ? Number(r.destination_amount) : null,
        categoryId: r.category_id,
        categoryName: r.categories?.name ?? null,
      })) as AccountMovementAnalytics[];
    },
  });
}
