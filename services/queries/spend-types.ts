import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { STALE } from "../../lib/query-client";
import { supabase } from "../../lib/supabase";
import { runBackgroundQueryRefresh } from "./_shared";

export type SpendType = {
  id: number;
  workspaceId: number;
  name: string;
  color: string | null;
  icon: string | null;
  sortOrder: number;
  isActive: boolean;
};

export type SpendTypeInput = {
  name: string;
  color?: string | null;
  icon?: string | null;
  sortOrder?: number;
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
  };
}

export function useSpendTypesQuery(workspaceId: number | null) {
  return useQuery({
    queryKey: ["spend-types", workspaceId],
    queryFn: async (): Promise<SpendType[]> => {
      if (!supabase) throw new Error("Supabase no está configurado.");
      const { data, error } = await supabase
        .from("spend_types")
        .select("id, workspace_id, name, color, icon, sort_order, is_active")
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
  return useMutation({
    mutationKey: ["create-spend-type"],
    mutationFn: async (input: SpendTypeInput) => {
      if (!supabase || !workspaceId) throw new Error("Workspace no disponible.");
      const { error } = await supabase.from("spend_types").insert({
        workspace_id: workspaceId,
        created_by_user_id: userId ?? null,
        name: input.name.trim(),
        color: input.color ?? null,
        icon: input.icon ?? null,
        sort_order: input.sortOrder ?? 0,
      });
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
  return useMutation({
    mutationKey: ["update-spend-type"],
    mutationFn: async ({ id, input }: { id: number; input: Partial<SpendTypeInput> & { isActive?: boolean } }) => {
      if (!supabase || !workspaceId) throw new Error("Workspace no disponible.");
      const payload: Record<string, unknown> = {};
      if (input.name !== undefined) payload.name = input.name.trim();
      if (input.color !== undefined) payload.color = input.color;
      if (input.icon !== undefined) payload.icon = input.icon;
      if (input.sortOrder !== undefined) payload.sort_order = input.sortOrder;
      if (input.isActive !== undefined) payload.is_active = input.isActive;
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
  return useMutation({
    mutationKey: ["delete-spend-type"],
    mutationFn: async (id: number) => {
      if (!supabase || !workspaceId) throw new Error("Workspace no disponible.");
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
  return useMutation({
    mutationKey: ["set-category-default-spend-type"],
    mutationFn: async ({ categoryId, spendTypeId }: { categoryId: number; spendTypeId: number | null }) => {
      if (!supabase || !workspaceId) throw new Error("Workspace no disponible.");
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
