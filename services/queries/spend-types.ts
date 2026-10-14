import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { STALE } from "../../lib/query-client";
import { supabase } from "../../lib/supabase";
import { runBackgroundQueryRefresh } from "./_shared";
import { offlineRuntime } from "../../lib/offline/instance";
import { localCreate, localDelete, localUpdate, useOfflineNetworkMode } from "./offline-writes";

export type SpendType = {
  id: number;
  workspaceId: number;
  name: string;
  color: string | null;
  icon: string | null;
  sortOrder: number;
  isActive: boolean;
  /** Sus gastos no entran a la medición del gasto típico: son compras que no se repetirán. */
  excludedFromTypical: boolean;
};

export type SpendTypeInput = {
  name: string;
  color?: string | null;
  icon?: string | null;
  sortOrder?: number;
  excludedFromTypical?: boolean;
};

function mapRow(row: Record<string, unknown>): SpendType {
  return {
    id: Number(row.id),
    workspaceId: Number(row.workspace_id),
    name: String(row.name ?? ""),
    color: (row.color as string | null) ?? null,
    icon: (row.icon as string | null) ?? null,
    sortOrder: Number(row.sort_order ?? 0),
    isActive: row.is_active !== false,
    excludedFromTypical: row.excluded_from_typical === true,
  };
}

export function useSpendTypesQuery(workspaceId: number | null) {
  const networkMode = useOfflineNetworkMode(workspaceId);
  return useQuery({
    queryKey: ["spend-types", workspaceId],
    networkMode,
    queryFn: async (): Promise<SpendType[]> => {
      // Modo sin conexión (beta): con la copia local lista se lee de ella (misma ordenación que abajo).
      const local = workspaceId ? await offlineRuntime.listRows(workspaceId, "spend_types").catch(() => null) : null;
      if (local) {
        return [...local]
          .sort((a, b) => Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0) || String(a.name ?? "").localeCompare(String(b.name ?? "")))
          .map((row) => mapRow(row));
      }
      if (!supabase) throw new Error("Supabase no está configurado.");
      const { data, error } = await supabase
        .from("spend_types")
        .select("id, workspace_id, name, color, icon, sort_order, is_active, excluded_from_typical")
        .eq("workspace_id", workspaceId!)
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true });
      if (error) throw error;
      return (data ?? []).map((row) => mapRow(row as Record<string, unknown>));
    },
    enabled: Boolean(workspaceId),
    staleTime: STALE.medium,
  });
}

export function useCreateSpendTypeMutation(workspaceId: number | null, userId?: string | null) {
  const queryClient = useQueryClient();
  const networkMode = useOfflineNetworkMode(workspaceId);
  return useMutation({
    mutationKey: ["create-spend-type"],
    networkMode,
    mutationFn: async (input: SpendTypeInput) => {
      if (!supabase || !workspaceId) throw new Error("Workspace no disponible.");
      const payload = {
        workspace_id: workspaceId,
        created_by_user_id: userId ?? null,
        name: input.name.trim(),
        color: input.color ?? null,
        icon: input.icon ?? null,
        sort_order: input.sortOrder ?? 0,
        excluded_from_typical: input.excludedFromTypical ?? false,
      };
      // Modo sin conexión (beta): el nombre es único por espacio; se comprueba contra la copia local
      // con las mismas palabras que el rechazo del servidor.
      const existing = await offlineRuntime.listRows(workspaceId, "spend_types").catch(() => null);
      if (existing?.some((row) => String(row.name ?? "").trim().toLowerCase() === payload.name.toLowerCase())) {
        throw new Error("Ya tienes un tipo con ese nombre.");
      }
      if (await localCreate(workspaceId, "spend_types", payload)) return;
      const { error } = await supabase.from("spend_types").insert(payload);
      // 23505 = ya existe uno con ese nombre en este espacio. Se dice con palabras.
      if (error) {
        throw new Error(
          (error as { code?: string }).code === "23505"
            ? "Ya tienes un tipo con ese nombre."
            : error.message ?? "Error de base de datos",
        );
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["spend-types"] });
    },
  });
}

export function useUpdateSpendTypeMutation(workspaceId: number | null) {
  const queryClient = useQueryClient();
  const networkMode = useOfflineNetworkMode(workspaceId);
  return useMutation({
    mutationKey: ["update-spend-type"],
    networkMode,
    mutationFn: async ({ id, input }: { id: number; input: Partial<SpendTypeInput> & { isActive?: boolean } }) => {
      if (!supabase || !workspaceId) throw new Error("Workspace no disponible.");
      const payload: Record<string, unknown> = {};
      if (input.name !== undefined) payload.name = input.name.trim();
      if (input.color !== undefined) payload.color = input.color;
      if (input.icon !== undefined) payload.icon = input.icon;
      if (input.sortOrder !== undefined) payload.sort_order = input.sortOrder;
      if (input.isActive !== undefined) payload.is_active = input.isActive;
      if (input.excludedFromTypical !== undefined) payload.excluded_from_typical = input.excludedFromTypical;
      if (await localUpdate(workspaceId, "spend_types", id, payload)) return;
      const { error } = await supabase
        .from("spend_types")
        .update(payload)
        .eq("id", id)
        .eq("workspace_id", workspaceId);
      if (error) throw new Error(error.message ?? "Error de base de datos");
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["spend-types"] });
      runBackgroundQueryRefresh(queryClient, [["workspace-snapshot"]]);
    },
  });
}

export function useDeleteSpendTypeMutation(workspaceId: number | null) {
  const queryClient = useQueryClient();
  const networkMode = useOfflineNetworkMode(workspaceId);
  return useMutation({
    mutationKey: ["delete-spend-type"],
    networkMode,
    mutationFn: async (id: number) => {
      if (!supabase || !workspaceId) throw new Error("Workspace no disponible.");
      if (await localDelete(workspaceId, "spend_types", id)) return;
      const { error } = await supabase
        .from("spend_types")
        .delete()
        .eq("id", id)
        .eq("workspace_id", workspaceId);
      if (error) throw new Error(error.message ?? "Error de base de datos");
    },
    /* Borrar un tipo no borra movimientos: la columna es `on delete set null`, así que los que
       lo tenían pasan a heredar el de su categoría. Por eso hay que refrescar el snapshot. */
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["spend-types"] });
      runBackgroundQueryRefresh(queryClient, [["workspace-snapshot"], ["movements"]]);
    },
  });
}

/** El defecto de una categoría: lo que rellena el formulario al elegirla. */
export function useSetCategoryDefaultSpendTypeMutation(workspaceId: number | null) {
  const queryClient = useQueryClient();
  const networkMode = useOfflineNetworkMode(workspaceId);
  return useMutation({
    mutationKey: ["set-category-default-spend-type"],
    networkMode,
    mutationFn: async ({ categoryId, spendTypeId }: { categoryId: number; spendTypeId: number | null }) => {
      if (!supabase || !workspaceId) throw new Error("Workspace no disponible.");
      if (await localUpdate(workspaceId, "categories", categoryId, { default_spend_type_id: spendTypeId })) return;
      const { error } = await supabase
        .from("categories")
        .update({ default_spend_type_id: spendTypeId })
        .eq("id", categoryId)
        .eq("workspace_id", workspaceId);
      if (error) throw new Error(error.message ?? "Error de base de datos");
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["categories-overview"] });
      runBackgroundQueryRefresh(queryClient, [["workspace-snapshot"]]);
    },
  });
}
