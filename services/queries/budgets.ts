import { useMutation, useQueryClient } from "@tanstack/react-query";

import { supabase } from "../../lib/supabase";
import { runBackgroundQueryRefresh } from "./_shared";
import type { WorkspaceSnapshot } from "./workspace-data";
import { nextPeriodFor } from "../../features/budgets/lib/duplicateBudgetToNextPeriod";
import type { BudgetOverview } from "../../types/domain";

export type BudgetFormInput = {
  name: string;
  periodStart: string;
  periodEnd: string;
  limitAmount: number;
  alertPercent: number;
  currencyCode: string;
  categoryId?: number | null;
  accountId?: number | null;
  rolloverEnabled?: boolean;
  notes?: string | null;
};

export type BudgetUpdateInput = Partial<BudgetFormInput>;

export function useCreateBudgetMutation(workspaceId: number | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: BudgetFormInput) => {
      if (!supabase || !workspaceId) throw new Error("Workspace no disponible.");
      const { data, error } = await supabase
        .from("budgets")
        .insert({
          workspace_id: workspaceId,
          name: input.name,
          period_start: input.periodStart,
          period_end: input.periodEnd,
          limit_amount: input.limitAmount,
          alert_percent: input.alertPercent,
          currency_code: input.currencyCode,
          category_id: input.categoryId ?? null,
          account_id: input.accountId ?? null,
          rollover_enabled: input.rolloverEnabled ?? false,
          notes: input.notes ?? null,
        })
        .select("id")
        .single();
      if (error) throw new Error(error.message ?? "Error de base de datos");
      return data as { id: number };
    },
    onSuccess: () => {
      runBackgroundQueryRefresh(queryClient, [["workspace-snapshot"]]);
    },
  });
}

export function useUpdateBudgetMutation(workspaceId: number | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, input }: { id: number; input: BudgetUpdateInput }) => {
      if (!supabase || !workspaceId) throw new Error("Workspace no disponible.");
      const payload: Record<string, unknown> = {};
      if (input.name !== undefined) payload.name = input.name;
      if (input.limitAmount !== undefined) payload.limit_amount = input.limitAmount;
      if (input.alertPercent !== undefined) payload.alert_percent = input.alertPercent;
      if (input.periodStart !== undefined) payload.period_start = input.periodStart;
      if (input.periodEnd !== undefined) payload.period_end = input.periodEnd;
      if (input.currencyCode !== undefined) payload.currency_code = input.currencyCode;
      if (input.categoryId !== undefined) payload.category_id = input.categoryId;
      if (input.accountId !== undefined) payload.account_id = input.accountId;
      if (input.rolloverEnabled !== undefined) payload.rollover_enabled = input.rolloverEnabled;
      if (input.notes !== undefined) payload.notes = input.notes;
      const { error } = await supabase
        .from("budgets")
        .update(payload)
        .eq("id", id)
        .eq("workspace_id", workspaceId);
      if (error) throw new Error(error.message ?? "Error de base de datos");
    },
    onSuccess: () => {
      runBackgroundQueryRefresh(queryClient, [["workspace-snapshot"]]);
    },
  });
}

export function useTogglePinBudgetMutation(workspaceId: number | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, isPinned }: { id: number; isPinned: boolean }) => {
      if (!supabase || !workspaceId) throw new Error("Workspace no disponible.");
      const { error } = await supabase
        .from("budgets")
        .update({ is_pinned: isPinned })
        .eq("id", id)
        .eq("workspace_id", workspaceId);
      if (error) throw new Error(error.message ?? "Error de base de datos");
    },
    onMutate: async ({ id, isPinned }) => {
      await queryClient.cancelQueries({ queryKey: ["workspace-snapshot"] });
      const previousEntries = queryClient.getQueriesData<WorkspaceSnapshot>({ queryKey: ["workspace-snapshot"] });
      queryClient.setQueriesData<WorkspaceSnapshot>({ queryKey: ["workspace-snapshot"] }, (old) => {
        if (!old) return old;
        return {
          ...old,
          budgets: old.budgets.map((b) => (b.id === id ? { ...b, isPinned } : b)),
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

export function useDuplicateBudgetMutation(workspaceId: number | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (source: BudgetOverview) => {
      if (!supabase || !workspaceId) throw new Error("Workspace no disponible.");
      const { periodStart, periodEnd } = nextPeriodFor(source.periodStart, source.periodEnd);
      const { data, error } = await supabase
        .from("budgets")
        .insert({
          workspace_id: workspaceId,
          name: source.name,
          period_start: periodStart,
          period_end: periodEnd,
          limit_amount: source.limitAmount,
          alert_percent: source.alertPercent,
          currency_code: source.currencyCode,
          category_id: source.categoryId ?? null,
          account_id: source.accountId ?? null,
          rollover_enabled: source.rolloverEnabled,
          notes: source.notes ?? null,
        })
        .select("id")
        .single();
      if (error) throw new Error(error.message ?? "Error de base de datos");
      return data as { id: number };
    },
    onSuccess: () => {
      runBackgroundQueryRefresh(queryClient, [["workspace-snapshot"]]);
    },
  });
}

export function useDeleteBudgetMutation(workspaceId: number | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      if (!supabase || !workspaceId) throw new Error("Workspace no disponible.");
      const { error } = await supabase
        .from("budgets")
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
        return { ...old, budgets: old.budgets.filter((b) => b.id !== id) };
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
