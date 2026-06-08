import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "../../lib/supabase";
import { STALE } from "../../lib/query-client";
import { toNum, type NumericLike } from "./_shared";
import { markSubscriptionPaid } from "../../features/subscriptions/lib/markSubscriptionPaid";
import type {
  RecurringIncomeFrequency,
  RecurringIncomeStatus,
  RecurringIncomeOccurrenceSummary,
  SubscriptionSummary,
} from "../../types/domain";
import type { WorkspaceSnapshot } from "./workspace-data";

export type SubscriptionFormInput = {
  name: string;
  vendorPartyId?: number | null;
  accountId?: number | null;
  categoryId?: number | null;
  amount: number;
  currencyCode: string;
  frequency: "daily" | "weekly" | "monthly" | "quarterly" | "yearly" | "custom";
  intervalCount: number;
  dayOfMonth?: number | null;
  dayOfWeek?: number | null;
  startDate: string;
  /** Próximo vencimiento (YYYY-MM-DD). */
  nextDueDate: string;
  endDate?: string | null;
  remindDaysBefore: number;
  autoCreateMovement: boolean;
  description?: string | null;
  notes?: string | null;
};

export type RecurringIncomeFormInput = {
  name: string;
  payerPartyId?: number | null;
  accountId?: number | null;
  categoryId?: number | null;
  amount: number;
  currencyCode: string;
  frequency: RecurringIncomeFrequency;
  intervalCount: number;
  dayOfMonth?: number | null;
  dayOfWeek?: number | null;
  startDate: string;
  nextExpectedDate: string;
  endDate?: string | null;
  remindDaysBefore: number;
  description?: string | null;
  notes?: string | null;
};

export function useCreateRecurringIncomeMutation(workspaceId: number | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: RecurringIncomeFormInput) => {
      if (!supabase || !workspaceId) throw new Error("Workspace no disponible.");
      const { data: authData, error: authErr } = await supabase.auth.getUser();
      if (authErr) throw new Error(authErr.message ?? "No se pudo verificar la sesión");
      const uid = authData.user?.id;
      if (!uid) throw new Error("No hay sesión");

      const { data, error } = await supabase
        .from("recurring_income")
        .insert({
          workspace_id: workspaceId,
          created_by_user_id: uid,
          name: input.name,
          payer_party_id: input.payerPartyId ?? null,
          account_id: input.accountId ?? null,
          category_id: input.categoryId ?? null,
          amount: input.amount,
          currency_code: input.currencyCode.trim().toUpperCase(),
          frequency: input.frequency,
          interval_count: input.intervalCount,
          day_of_month: input.dayOfMonth ?? null,
          day_of_week: input.dayOfWeek ?? null,
          start_date: input.startDate,
          next_expected_date: input.nextExpectedDate,
          end_date: input.endDate ?? null,
          remind_days_before: input.remindDaysBefore,
          description: input.description ?? null,
          notes: input.notes ?? null,
          status: "active",
        })
        .select("id")
        .single();
      if (error) throw new Error(error.message ?? "Error de base de datos");
      return data as { id: number };
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["user-workspaces"] });
      void queryClient.invalidateQueries({ queryKey: ["workspace-snapshot"] });
    },
  });
}

export function useUpdateRecurringIncomeMutation(workspaceId: number | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, input }: { id: number; input: Partial<RecurringIncomeFormInput> & { status?: RecurringIncomeStatus } }) => {
      if (!supabase || !workspaceId) throw new Error("Workspace no disponible.");
      const payload: Record<string, unknown> = {};
      if (input.name !== undefined) payload.name = input.name;
      if (input.payerPartyId !== undefined) payload.payer_party_id = input.payerPartyId;
      if (input.accountId !== undefined) payload.account_id = input.accountId;
      if (input.categoryId !== undefined) payload.category_id = input.categoryId;
      if (input.amount !== undefined) payload.amount = input.amount;
      if (input.currencyCode !== undefined) payload.currency_code = input.currencyCode.trim().toUpperCase();
      if (input.frequency !== undefined) payload.frequency = input.frequency;
      if (input.intervalCount !== undefined) payload.interval_count = input.intervalCount;
      if (input.dayOfMonth !== undefined) payload.day_of_month = input.dayOfMonth;
      if (input.dayOfWeek !== undefined) payload.day_of_week = input.dayOfWeek;
      if (input.startDate !== undefined) payload.start_date = input.startDate;
      if (input.nextExpectedDate !== undefined) payload.next_expected_date = input.nextExpectedDate;
      if (input.endDate !== undefined) payload.end_date = input.endDate;
      if (input.remindDaysBefore !== undefined) payload.remind_days_before = input.remindDaysBefore;
      if (input.description !== undefined) payload.description = input.description;
      if (input.notes !== undefined) payload.notes = input.notes;
      if (input.status !== undefined) payload.status = input.status;
      const { error } = await supabase
        .from("recurring_income")
        .update(payload)
        .eq("id", id)
        .eq("workspace_id", workspaceId);
      if (error) throw new Error(error.message ?? "Error de base de datos");
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["user-workspaces"] });
      void queryClient.invalidateQueries({ queryKey: ["workspace-snapshot"] });
    },
  });
}

export function useDeleteRecurringIncomeMutation(workspaceId: number | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      if (!supabase || !workspaceId) throw new Error("Workspace no disponible.");
      const { error: occErr } = await supabase
        .from("recurring_income_occurrences")
        .delete()
        .eq("recurring_income_id", id);
      if (occErr) {
        const msg = occErr.message ?? "";
        const ignorable =
          /recurring_income_occurrences/i.test(msg) ||
          /does not exist/i.test(msg) ||
          /schema cache/i.test(msg) ||
          /could not find/i.test(msg);
        if (!ignorable) throw new Error(msg || "Error al limpiar ocurrencias");
      }

      const { error } = await supabase
        .from("recurring_income")
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
        return { ...old, recurringIncome: old.recurringIncome.filter((item) => item.id !== id) };
      });
      return { previousEntries };
    },
    onError: (_err, _id, context) => {
      for (const [key, value] of (context?.previousEntries ?? [])) {
        queryClient.setQueryData(key, value);
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["workspace-snapshot"] });
    },
  });
}

export function useRecurringIncomeOccurrencesQuery(
  workspaceId: number | null,
  recurringIncomeId: number | null | undefined,
) {
  return useQuery({
    queryKey: ["recurring-income-occurrences", workspaceId ?? null, recurringIncomeId ?? null],
    enabled: Boolean(supabase && workspaceId && recurringIncomeId),
    staleTime: STALE.short,
    queryFn: async (): Promise<RecurringIncomeOccurrenceSummary[]> => {
      if (!supabase || !workspaceId || !recurringIncomeId) return [];
      const { data, error } = await supabase
        .from("recurring_income_occurrences")
        .select("id, workspace_id, recurring_income_id, expected_date, actual_date, amount, currency_code, movement_id, status, notes, created_at")
        .eq("workspace_id", workspaceId)
        .eq("recurring_income_id", recurringIncomeId)
        .order("actual_date", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) throw new Error(error.message ?? "Error al cargar historial de llegadas");
      return ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
        id: Number(row.id),
        workspaceId: Number(row.workspace_id),
        recurringIncomeId: Number(row.recurring_income_id),
        expectedDate: String(row.expected_date ?? ""),
        actualDate: String(row.actual_date ?? ""),
        amount: toNum(row.amount as NumericLike),
        currencyCode: String(row.currency_code ?? ""),
        movementId: row.movement_id != null ? Number(row.movement_id) : null,
        status: row.status === "late" ? "late" : "on_time",
        notes: typeof row.notes === "string" ? row.notes : null,
        createdAt: typeof row.created_at === "string" ? row.created_at : null,
      }));
    },
  });
}

export function useCreateSubscriptionMutation(workspaceId: number | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: SubscriptionFormInput) => {
      if (!supabase || !workspaceId) throw new Error("Workspace no disponible.");
      const { data: authData, error: authErr } = await supabase.auth.getUser();
      if (authErr) throw new Error(authErr.message ?? "No se pudo verificar la sesión");
      const uid = authData.user?.id;
      if (!uid) throw new Error("No hay sesión");

      const { data, error } = await supabase
        .from("subscriptions")
        .insert({
          workspace_id: workspaceId,
          created_by_user_id: uid,
          name: input.name,
          vendor_party_id: input.vendorPartyId ?? null,
          account_id: input.accountId ?? null,
          category_id: input.categoryId ?? null,
          amount: input.amount,
          currency_code: input.currencyCode.trim().toUpperCase(),
          frequency: input.frequency,
          interval_count: input.intervalCount,
          day_of_month: input.dayOfMonth ?? null,
          day_of_week: input.dayOfWeek ?? null,
          start_date: input.startDate,
          next_due_date: input.nextDueDate,
          end_date: input.endDate ?? null,
          remind_days_before: input.remindDaysBefore,
          auto_create_movement: input.autoCreateMovement,
          description: input.description ?? null,
          notes: input.notes ?? null,
          status: "active",
        })
        .select("id")
        .single();
      if (error) throw new Error(error.message ?? "Error de base de datos");
      return data as { id: number };
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["workspace-snapshot"] });
    },
  });
}

export function useUpdateSubscriptionMutation(workspaceId: number | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, input }: { id: number; input: Partial<SubscriptionFormInput> & { status?: string } }) => {
      if (!supabase || !workspaceId) throw new Error("Workspace no disponible.");
      const payload: Record<string, unknown> = {};
      if (input.name !== undefined) payload.name = input.name;
      if (input.vendorPartyId !== undefined) payload.vendor_party_id = input.vendorPartyId;
      if (input.accountId !== undefined) payload.account_id = input.accountId;
      if (input.categoryId !== undefined) payload.category_id = input.categoryId;
      if (input.amount !== undefined) payload.amount = input.amount;
      if (input.currencyCode !== undefined) payload.currency_code = input.currencyCode.trim().toUpperCase();
      if (input.frequency !== undefined) payload.frequency = input.frequency;
      if (input.intervalCount !== undefined) payload.interval_count = input.intervalCount;
      if (input.dayOfMonth !== undefined) payload.day_of_month = input.dayOfMonth;
      if (input.dayOfWeek !== undefined) payload.day_of_week = input.dayOfWeek;
      if (input.startDate !== undefined) payload.start_date = input.startDate;
      if (input.nextDueDate !== undefined) payload.next_due_date = input.nextDueDate;
      if (input.endDate !== undefined) payload.end_date = input.endDate;
      if (input.remindDaysBefore !== undefined) payload.remind_days_before = input.remindDaysBefore;
      if (input.autoCreateMovement !== undefined) payload.auto_create_movement = input.autoCreateMovement;
      if (input.description !== undefined) payload.description = input.description;
      if (input.notes !== undefined) payload.notes = input.notes;
      if (input.status !== undefined) payload.status = input.status;
      const { error } = await supabase
        .from("subscriptions")
        .update(payload)
        .eq("id", id)
        .eq("workspace_id", workspaceId);
      if (error) throw new Error(error.message ?? "Error de base de datos");
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["workspace-snapshot"] });
    },
  });
}

export function useDeleteSubscriptionMutation(workspaceId: number | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      if (!supabase || !workspaceId) throw new Error("Workspace no disponible.");

      const { count, error: countErr } = await supabase
        .from("movements")
        .select("*", { count: "exact", head: true })
        .eq("workspace_id", workspaceId)
        .eq("subscription_id", id);
      if (countErr) throw new Error(countErr.message ?? "Error al comprobar movimientos");
      if ((count ?? 0) > 0) {
        throw new Error("No se puede eliminar: hay movimientos vinculados a esta suscripción.");
      }

      const { error: occErr } = await supabase
        .from("subscription_occurrences")
        .delete()
        .eq("subscription_id", id);
      if (occErr) {
        const msg = occErr.message ?? "";
        const ignorable =
          /subscription_occurrences/i.test(msg) ||
          /does not exist/i.test(msg) ||
          /schema cache/i.test(msg) ||
          /could not find/i.test(msg);
        if (!ignorable) throw new Error(msg || "Error al limpiar ocurrencias");
      }

      const { error } = await supabase
        .from("subscriptions")
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
        return { ...old, subscriptions: old.subscriptions.filter((s) => s.id !== id) };
      });
      return { previousEntries };
    },
    onError: (_err, _id, context) => {
      for (const [key, value] of (context?.previousEntries ?? [])) {
        queryClient.setQueryData(key, value);
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["workspace-snapshot"] });
    },
  });
}

export function useToggleSubscriptionPinMutation(workspaceId: number | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, isPinned }: { id: number; isPinned: boolean }) => {
      if (!supabase || !workspaceId) throw new Error("Workspace no disponible.");
      const { error } = await supabase
        .from("subscriptions")
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
          subscriptions: old.subscriptions.map((s) => (s.id === id ? { ...s, isPinned } : s)),
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
      void queryClient.invalidateQueries({ queryKey: ["workspace-snapshot"] });
    },
  });
}

type MarkPaidArgs = {
  subscription: SubscriptionSummary;
  paidDate: string;
  amount: number;
  accountId: number;
};

export function useMarkSubscriptionPaidMutation(workspaceId: number | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (args: MarkPaidArgs) => {
      if (!workspaceId) throw new Error("Workspace no disponible.");
      return await markSubscriptionPaid({
        subscription: args.subscription,
        workspaceId,
        paidDate: args.paidDate,
        amount: args.amount,
        accountId: args.accountId,
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["workspace-snapshot"] });
    },
  });
}

export function useToggleRecurringIncomePinMutation(workspaceId: number | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, isPinned }: { id: number; isPinned: boolean }) => {
      if (!supabase || !workspaceId) throw new Error("Workspace no disponible.");
      const { error } = await supabase
        .from("recurring_income")
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
          recurringIncome: old.recurringIncome.map((item) => (item.id === id ? { ...item, isPinned } : item)),
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
      void queryClient.invalidateQueries({ queryKey: ["workspace-snapshot"] });
    },
  });
}
