import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "../../lib/supabase";
import { displayCategoryName } from "../../lib/category-display-name";
import { withTimeout } from "../../lib/promise-utils";
import { formatSupabaseError, runBackgroundQueryRefresh } from "./_shared";
import { localCreate, localDelete, localUpdate, useOfflineNetworkMode } from "./offline-writes";
import { isCoreSnapshot } from "./snapshot-cache";
import type { WorkspaceSnapshot } from "./workspace-data";

// Timeout para escrituras de cuenta: tras horas en foreground el socket puede
// quedar stale y la respuesta HTTP nunca vuelve aunque el write se commitee
// server-side → el spinner giraba para siempre (incidente 2026-07-20: cambio de
// tipo de cuenta "cargando" 5 min). 15 s corta y deja reintentar (UPDATE idempotente).
const ACCOUNT_WRITE_TIMEOUT_MS = 15_000;

export type AccountFormInput = {
  name: string;
  type: string;
  currencyCode: string;
  openingBalance: number;
  includeInNetWorth: boolean;
  color: string;
  icon: string;
  /** Optional institution slug (`bcp`, `interbank`, ...). Null/undefined clears it. */
  institutionCode?: string | null;
  /** Ciclo de la tarjeta. Solo tiene sentido en `type = "credit_card"`; el formulario lo limpia
   *  al dejar de serlo y estos tres viajan como null para el resto de tipos. */
  statementDay?: number | null;
  paymentDay?: number | null;
  creditLimit?: number | null;
};

export function useCreateAccountMutation(workspaceId: number | null) {
  const queryClient = useQueryClient();
  const networkMode = useOfflineNetworkMode(workspaceId);
  return useMutation({
    mutationKey: ["create-account"],
    networkMode,
    mutationFn: async (input: AccountFormInput) => {
      if (!supabase || !workspaceId) throw new Error("Workspace no disponible.");
      const payload = {
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
        institution_code: input.institutionCode ?? null,
        statement_day: input.statementDay ?? null,
        payment_day: input.paymentDay ?? null,
        credit_limit: input.creditLimit ?? null,
      };
      // Modo sin conexión (beta): se guarda en el teléfono al instante; si no está listo, camino de siempre.
      const local = await localCreate(workspaceId, "accounts", payload);
      if (local) return local;
      const { data, error } = await withTimeout(
        supabase
          .from("accounts")
          .insert(payload)
          .select("id")
          .single(),
        ACCOUNT_WRITE_TIMEOUT_MS,
        "create-account",
      );
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
  const networkMode = useOfflineNetworkMode(workspaceId);
  return useMutation({
    mutationKey: ["update-account"],
    networkMode,
    mutationFn: async ({ id, input }: { id: number; input: Partial<AccountFormInput> }) => {
      if (!supabase || !workspaceId) throw new Error("Workspace no disponible.");
      const payload = {
        name: input.name,
        type: input.type,
        currency_code: input.currencyCode,
        opening_balance: input.openingBalance,
        include_in_net_worth: input.includeInNetWorth,
        color: input.color,
        icon: input.icon,
        ...("institutionCode" in input ? { institution_code: input.institutionCode ?? null } : {}),
        // Cada uno con su propia condicion: `null` es un valor valido —limpiar el ciclo al
        // dejar de ser tarjeta— y no puede confundirse con "no lo mandes".
        ...("statementDay" in input ? { statement_day: input.statementDay ?? null } : {}),
        ...("paymentDay" in input ? { payment_day: input.paymentDay ?? null } : {}),
        ...("creditLimit" in input ? { credit_limit: input.creditLimit ?? null } : {}),
      };
      if (await localUpdate(workspaceId, "accounts", id, payload)) return;
      const { error } = await withTimeout(
        supabase
          .from("accounts")
          .update(payload)
          .eq("id", id)
          .eq("workspace_id", workspaceId),
        ACCOUNT_WRITE_TIMEOUT_MS,
        "update-account",
      );
      if (error) throw new Error(error.message ?? "Error de base de datos");
    },
    onSuccess: () => {
      runBackgroundQueryRefresh(queryClient, [["workspace-snapshot"]]);
    },
  });
}

export function useArchiveAccountMutation(workspaceId: number | null) {
  const queryClient = useQueryClient();
  const networkMode = useOfflineNetworkMode(workspaceId);
  return useMutation({
    mutationKey: ["archive-account"],
    networkMode,
    mutationFn: async ({ id, archived }: { id: number; archived: boolean }) => {
      if (!supabase || !workspaceId) throw new Error("Workspace no disponible.");
      if (await localUpdate(workspaceId, "accounts", id, { is_archived: archived })) return;
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
      // Guardia de núcleo: el prefijo también alcanza la entrada diferida ({ budgets,
      // obligations }), que no tiene este campo. Sin esto: "Cannot read property 'map' of undefined".
      queryClient.setQueriesData<unknown>({ queryKey: ["workspace-snapshot"] }, (old: unknown) => {
        if (!isCoreSnapshot(old)) return old;
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
  const networkMode = useOfflineNetworkMode(workspaceId);
  return useMutation({
    mutationKey: ["delete-account"],
    networkMode,
    mutationFn: async (id: number) => {
      if (!supabase || !workspaceId) throw new Error("Workspace no disponible.");
      if (await localDelete(workspaceId, "accounts", id)) return;
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
      // Guardia de núcleo: el prefijo también alcanza la entrada diferida ({ budgets,
      // obligations }), que no tiene este campo. Sin esto: "Cannot read property 'map' of undefined".
      queryClient.setQueriesData<unknown>({ queryKey: ["workspace-snapshot"] }, (old: unknown) => {
        if (!isCoreSnapshot(old)) return old;
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

/**
 * Tope de movimientos que entran al analisis de una cuenta.
 *
 * Lo exporta el modal para poder DECIR que topo. Un analisis que promete un periodo en el
 * encabezado y por dentro sumo solo las ultimas N filas es el mismo defecto que tenia el neto
 * de Movimientos: un rotulo que no describe lo que hay debajo.
 */
export const ACCOUNT_ANALYTICS_LIMIT = 300;

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
        .limit(ACCOUNT_ANALYTICS_LIMIT);
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
        categoryName: r.categories?.name == null ? null : displayCategoryName(r.categories.name),
      })) as AccountMovementAnalytics[];
    },
  });
}
