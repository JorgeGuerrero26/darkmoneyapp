import { useMutation, useQueryClient } from "@tanstack/react-query";

import { supabase } from "../../lib/supabase";
import { groupBudgetsIntoRules } from "../../features/budgets/lib/budgetRules";
import { nextBudgetPeriod, type BudgetRecurrence } from "../../features/budgets/lib/budgetRecurrence";
import { runBackgroundQueryRefresh } from "./_shared";
import { isCoreSnapshot } from "./snapshot-cache";
import type { WorkspaceDeferred } from "./workspace-data";
import { nextPeriodFor } from "../../features/budgets/lib/duplicateBudgetToNextPeriod";
import type { BudgetOverview } from "../../types/domain";

export type BudgetFormInput = {
  name: string;
  periodStart: string;
  periodEnd: string;
  /** Cada cuánto se renueva. `none` es un tramo suelto y no genera períodos nuevos. */
  recurrence?: BudgetRecurrence;
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
    mutationKey: ["create-budget"],
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
          recurrence: input.recurrence ?? "none",
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
    mutationKey: ["update-budget"],
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
      /* Faltaba: el formulario mandaba la cadencia al editar y aquí se tiraba en silencio, así
         que cambiar "Se renueva" de mensual a semanal no cambiaba nada. Se guardaba solo al
         crear, porque la fase 36 la añadió al insert y no al update. */
      if (input.recurrence !== undefined) payload.recurrence = input.recurrence;
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
    mutationKey: ["toggle-pin-budget"],
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
      const previousEntries = queryClient.getQueriesData({ queryKey: ["workspace-snapshot"] });
      // Los presupuestos viven en la entrada diferida del snapshot, no en el núcleo.
      queryClient.setQueriesData<unknown>({ queryKey: ["workspace-snapshot"] }, (old: unknown) => {
        if (!old || isCoreSnapshot(old)) return old;
        const deferred = old as WorkspaceDeferred;
        return {
          ...deferred,
          budgets: deferred.budgets.map((b) => (b.id === id ? { ...b, isPinned } : b)),
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
    mutationKey: ["duplicate-budget"],
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
    mutationKey: ["delete-budget"],
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
      const previousEntries = queryClient.getQueriesData({ queryKey: ["workspace-snapshot"] });
      // Los presupuestos viven en la entrada diferida del snapshot, no en el núcleo.
      queryClient.setQueriesData<unknown>({ queryKey: ["workspace-snapshot"] }, (old: unknown) => {
        if (!old || isCoreSnapshot(old)) return old;
        const deferred = old as WorkspaceDeferred;
        return { ...deferred, budgets: deferred.budgets.filter((b) => b.id !== id) };
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


/**
 * Abre el período que toca hoy en los presupuestos que se renuevan.
 *
 * **Es la promesa detrás de la cadencia.** Preguntar "cada cuánto se renueva" solo sirve si
 * alguien lo renueva: si no, el usuario vuelve a recrearlo el día 1 y estamos donde empezamos,
 * con un presupuesto por mes en la lista.
 *
 * **Solo abre el período que corre ahora, no rellena los meses que faltan.** Un presupuesto que
 * cerró en agosto y se mira en octubre no gana un septiembre inventado: en septiembre no había
 * presupuesto, y escribir uno a posteriori pondría en el historial un "te pasaste" de un límite
 * que nadie tenía puesto. La regla se reanuda hoy; el pasado se queda como fue.
 *
 * Repetirlo es inofensivo: el índice `budgets_rule_period_unique` hace que el segundo intento
 * choque en vez de escribir un gemelo, y un 23505 aquí significa "ya estaba", no un fallo.
 */
export function useEnsureBudgetPeriodsMutation(workspaceId: number | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: ["ensure-budget-periods"],
    mutationFn: async ({ budgets, todayYmd }: { budgets: BudgetOverview[]; todayYmd: string }) => {
      if (!supabase || !workspaceId) return 0;
      let creados = 0;
      for (const rule of groupBudgetsIntoRules(budgets, todayYmd)) {
        if (rule.current || rule.closed.length === 0) continue;
        const ultimo = rule.closed[0];
        const recurrence = (ultimo.recurrence ?? "none") as BudgetRecurrence;
        if (recurrence === "none") continue;

        // Se avanza período a período hasta alcanzar hoy, pero solo se ESCRIBE el que corre.
        let periodo = nextBudgetPeriod(ultimo, recurrence);
        let vueltas = 0;
        while (periodo && periodo.periodEnd < todayYmd && vueltas < 400) {
          periodo = nextBudgetPeriod(periodo, recurrence);
          vueltas += 1;
        }
        if (!periodo) continue;

        const { error } = await supabase.from("budgets").insert({
          workspace_id: workspaceId,
          name: ultimo.name,
          period_start: periodo.periodStart,
          period_end: periodo.periodEnd,
          limit_amount: ultimo.limitAmount,
          alert_percent: ultimo.alertPercent,
          currency_code: ultimo.currencyCode,
          category_id: ultimo.categoryId ?? null,
          account_id: ultimo.accountId ?? null,
          rollover_enabled: ultimo.rolloverEnabled,
          recurrence,
          notes: ultimo.notes ?? null,
        });
        // 23505 = ya lo creó otro dispositivo. No es un fallo: es el índice haciendo su trabajo.
        if (error && (error as { code?: string }).code !== "23505") {
          throw new Error(error.message ?? "Error de base de datos");
        }
        if (!error) creados += 1;
      }
      return creados;
    },
    onSuccess: (creados) => {
      if (creados > 0) runBackgroundQueryRefresh(queryClient, [["workspace-snapshot"]]);
    },
  });
}
