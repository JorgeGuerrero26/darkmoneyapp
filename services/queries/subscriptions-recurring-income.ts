import { offlineRuntime } from "../../lib/offline/instance";
import { localCreate, localDelete, localReferences, localUpdate, useOfflineNetworkMode } from "./offline-writes";
import { useOfflineFlag } from "../../lib/offline/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "../../lib/supabase";
import { STALE } from "../../lib/query-client";
import { toNum, type NumericLike } from "./_shared";
import { toScheduledChangesRows } from "../../features/recurring-income/lib/scheduledChanges";
import { markSubscriptionPaid } from "../../features/subscriptions/lib/markSubscriptionPaid";
import {
  isCoreSnapshot,
  patchSnapshotSubscriptionNextDue,
  patchSnapshotWithCreatedMovement,
} from "./snapshot-cache";
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
  /** Bruto en planilla. Informativo: quien manda es `amount`, lo que LLEGA. */
  grossAmount?: number | null;
  /** Descuentos copiados de la boleta. La app no calcula retenciones. */
  deductions?: { name: string; amount: number }[];
  scheduledChanges?: { effectiveDate: string; amount: number }[];
};

export function useCreateRecurringIncomeMutation(workspaceId: number | null) {
  const queryClient = useQueryClient();
  const networkMode = useOfflineNetworkMode(workspaceId);
  return useMutation({
    mutationKey: ["create-recurring-income"],
    networkMode,
    mutationFn: async (input: RecurringIncomeFormInput) => {
      if (!supabase || !workspaceId) throw new Error("Workspace no disponible.");
      // Modo sin conexión (beta): solo la definición. Las ocurrencias y fechas las genera el servidor al sincronizar.
      const localCreated = await localCreate(workspaceId, "recurring_income", {
        workspace_id: workspaceId,
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
        gross_amount: input.grossAmount ?? null,
        deductions: input.deductions ?? [],
        scheduled_changes: toScheduledChangesRows(input.scheduledChanges),
        description: input.description ?? null,
        notes: input.notes ?? null,
        status: "active",
        is_pinned: false,
      });
      if (localCreated) return localCreated;
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
          gross_amount: input.grossAmount ?? null,
          deductions: input.deductions ?? [],
          scheduled_changes: toScheduledChangesRows(input.scheduledChanges),
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
  const networkMode = useOfflineNetworkMode(workspaceId);
  return useMutation({
    mutationKey: ["update-recurring-income"],
    networkMode,
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
      // El desglose se borra igual que se pone: `null` y `[]` son valores validos, no "sin dato".
      if (input.grossAmount !== undefined) payload.gross_amount = input.grossAmount;
      if (input.deductions !== undefined) payload.deductions = input.deductions;
      if (input.scheduledChanges !== undefined) payload.scheduled_changes = toScheduledChangesRows(input.scheduledChanges);
      if (input.description !== undefined) payload.description = input.description;
      if (input.notes !== undefined) payload.notes = input.notes;
      if (input.status !== undefined) payload.status = input.status;
      if (await localUpdate(workspaceId, "recurring_income", id, payload)) return;
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
  const networkMode = useOfflineNetworkMode(workspaceId);
  return useMutation({
    mutationKey: ["delete-recurring-income"],
    networkMode,
    mutationFn: async (id: number) => {
      if (!supabase || !workspaceId) throw new Error("Workspace no disponible.");
      if (await localDelete(workspaceId, "recurring_income", id)) return;
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
      const previousEntries = queryClient.getQueriesData({ queryKey: ["workspace-snapshot"] });
      // El prefijo también matchea la entrada diferida (sin `recurringIncome`).
      queryClient.setQueriesData<unknown>({ queryKey: ["workspace-snapshot"] }, (old: unknown) => {
        if (!isCoreSnapshot(old)) return old;
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
  const networkMode = useOfflineNetworkMode(workspaceId);
  return useQuery({
    queryKey: ["recurring-income-occurrences", workspaceId ?? null, recurringIncomeId ?? null],
    enabled: Boolean(supabase && workspaceId && recurringIncomeId),
    networkMode,
    staleTime: STALE.short,
    queryFn: async (): Promise<RecurringIncomeOccurrenceSummary[]> => {
      if (!supabase || !workspaceId || !recurringIncomeId) return [];
      // Modo sin conexión (beta): historial de solo lectura desde la copia local (mismo orden que abajo).
      const local = await offlineRuntime.listRows(workspaceId, "recurring_income_occurrences").catch(() => null);
      if (local) {
        return local
          .filter((row) => Number(row.recurring_income_id) === recurringIncomeId)
          .sort(
            (a, b) =>
              String(b.actual_date ?? "").localeCompare(String(a.actual_date ?? "")) ||
              String(b.created_at ?? "").localeCompare(String(a.created_at ?? "")),
          )
          .map((row) => ({
            id: Number(row.id),
            workspaceId: Number(row.workspace_id),
            recurringIncomeId: Number(row.recurring_income_id),
            expectedDate: String(row.expected_date ?? ""),
            actualDate: String(row.actual_date ?? ""),
            amount: toNum(row.amount as NumericLike),
            currencyCode: String(row.currency_code ?? ""),
            movementId: row.movement_id != null ? Number(row.movement_id) : null,
            status: row.status === "late" ? ("late" as const) : ("on_time" as const),
            notes: typeof row.notes === "string" ? row.notes : null,
            createdAt: typeof row.created_at === "string" ? row.created_at : null,
          }));
      }
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
  const networkMode = useOfflineNetworkMode(workspaceId);
  return useMutation({
    mutationKey: ["create-subscription"],
    networkMode,
    mutationFn: async (input: SubscriptionFormInput) => {
      if (!supabase || !workspaceId) throw new Error("Workspace no disponible.");
      // Modo sin conexión (beta): solo la definición. Los cargos pendientes los materializa el servidor al sincronizar.
      const localCreated = await localCreate(workspaceId, "subscriptions", {
        workspace_id: workspaceId,
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
        is_pinned: false,
      });
      if (localCreated) return localCreated;
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
  const networkMode = useOfflineNetworkMode(workspaceId);
  return useMutation({
    mutationKey: ["update-subscription"],
    networkMode,
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
      if (await localUpdate(workspaceId, "subscriptions", id, payload)) return;
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
  const networkMode = useOfflineNetworkMode(workspaceId);
  return useMutation({
    mutationKey: ["delete-subscription"],
    networkMode,
    mutationFn: async (id: number) => {
      if (!supabase || !workspaceId) throw new Error("Workspace no disponible.");

      // Modo sin conexión (beta): misma comprobación que abajo sobre la copia local; si no hay movimientos
      // vinculados se encola el borrado (las ocurrencias caen en cascada en el servidor).
      const localLinked = await localReferences(workspaceId, "movements", "subscription_id", id);
      if (localLinked != null) {
        if (localLinked > 0) throw new Error("No se puede eliminar: hay movimientos vinculados a esta suscripción.");
        if (await localDelete(workspaceId, "subscriptions", id)) return;
      }

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
      const previousEntries = queryClient.getQueriesData({ queryKey: ["workspace-snapshot"] });
      // El prefijo también matchea la entrada diferida (sin `subscriptions`).
      queryClient.setQueriesData<unknown>({ queryKey: ["workspace-snapshot"] }, (old: unknown) => {
        if (!isCoreSnapshot(old)) return old;
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
  const networkMode = useOfflineNetworkMode(workspaceId);
  return useMutation({
    mutationKey: ["toggle-subscription-pin"],
    networkMode,
    mutationFn: async ({ id, isPinned }: { id: number; isPinned: boolean }) => {
      if (!supabase || !workspaceId) throw new Error("Workspace no disponible.");
      if (await localUpdate(workspaceId, "subscriptions", id, { is_pinned: isPinned })) return;
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
      // Guardia de núcleo: el prefijo también alcanza la entrada diferida ({ budgets,
      // obligations }), que no tiene este campo. Sin esto: "Cannot read property 'map' of undefined".
      queryClient.setQueriesData<unknown>({ queryKey: ["workspace-snapshot"] }, (old: unknown) => {
        if (!isCoreSnapshot(old)) return old;
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
  const offline = useOfflineFlag();
  return useMutation({
    networkMode: offline.enabled ? "always" : undefined,
    mutationKey: ["mark-subscription-paid"],
    mutationFn: async (args: MarkPaidArgs) => {
      if (!workspaceId) throw new Error("Workspace no disponible.");
      offlineRuntime.assertCompoundOnline();
      return await markSubscriptionPaid({
        subscription: args.subscription,
        workspaceId,
        paidDate: args.paidDate,
        amount: args.amount,
        accountId: args.accountId,
      });
    },
    onSuccess: (result, variables) => {
      // Parche quirúrgico primero: saldo de la cuenta, historial de la
      // suscripción y próximo cobro cambian en este frame; el refetch de abajo
      // confirma/corrige en segundo plano.
      if (workspaceId) {
        if (result.movementId != null) {
          patchSnapshotWithCreatedMovement(queryClient, workspaceId, {
            id: result.movementId,
            status: "posted",
            categoryId: variables.subscription.categoryId ?? null,
            subscriptionId: variables.subscription.id,
            counterpartyId: variables.subscription.vendorPartyId ?? null,
            movementType: "subscription_payment",
            occurredAt: result.occurredAt,
            sourceAccountId: variables.accountId,
            sourceAmount: variables.amount,
          });
        }
        patchSnapshotSubscriptionNextDue(queryClient, workspaceId, variables.subscription.id, result.nextDueDate);
        // El historial mes a mes lo reescribe el trigger de la base al insertar el movimiento.
        void queryClient.invalidateQueries({
          queryKey: ["subscription-occurrences", variables.subscription.id],
        });
        // Fase 3: refetch selectivo de los dominios afectados (saldos exactos y
        // presupuestos) en vez del snapshot completo. Import dinámico: este
        // módulo es re-exportado por workspace-data y un import estático de
        // valor crearía un ciclo en la inicialización.
        void import("./workspace-data")
          .then(({ refreshSnapshotDomains }) =>
            refreshSnapshotDomains(queryClient, workspaceId, ["accounts", "budgets", "counterpartyMovements"]),
          )
          .catch(() => {
            void queryClient.invalidateQueries({ queryKey: ["workspace-snapshot"] });
          });
      } else {
        void queryClient.invalidateQueries({ queryKey: ["workspace-snapshot"] });
      }
    },
  });
}

export function useToggleRecurringIncomePinMutation(workspaceId: number | null) {
  const queryClient = useQueryClient();
  const networkMode = useOfflineNetworkMode(workspaceId);
  return useMutation({
    mutationKey: ["toggle-recurring-income-pin"],
    networkMode,
    mutationFn: async ({ id, isPinned }: { id: number; isPinned: boolean }) => {
      if (!supabase || !workspaceId) throw new Error("Workspace no disponible.");
      if (await localUpdate(workspaceId, "recurring_income", id, { is_pinned: isPinned })) return;
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
      // Guardia de núcleo: el prefijo también alcanza la entrada diferida ({ budgets,
      // obligations }), que no tiene este campo. Sin esto: "Cannot read property 'map' of undefined".
      queryClient.setQueriesData<unknown>({ queryKey: ["workspace-snapshot"] }, (old: unknown) => {
        if (!isCoreSnapshot(old)) return old;
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
