import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { STALE } from "../../lib/query-client";
import { supabase } from "../../lib/supabase";

export type UncategorizedRow = {
  id: number;
  description: string | null;
  occurred_at: string;
  source_amount: number | null;
  destination_amount: number | null;
  movement_type: string;
};

/**
 * Cuántos movimientos sin categoría se traen de una vez.
 *
 * Es una pantalla para vaciar una bandeja, no para pasearse por el historial: si alguien tiene
 * más de 500 sin clasificar, los 500 más recientes ya son varias sesiones de trabajo, y al
 * terminarlos la consulta se refresca y trae los siguientes.
 */
const MAX_ROWS = 500;

async function fetchUncategorized(workspaceId: number): Promise<UncategorizedRow[]> {
  if (!supabase) throw new Error("Supabase no está configurado.");
  const { data, error } = await supabase
    .from("movements")
    .select("id, description, occurred_at, source_amount, destination_amount, movement_type")
    .eq("workspace_id", workspaceId)
    .eq("status", "posted")
    .is("category_id", null)
    // Los traspasos no llevan categoría por diseño: es tu plata cambiando de bolsillo, no un
    // gasto. Sin este filtro la bandeja arrancaba con 401 cuando lo accionable eran 225.
    .in("movement_type", ["expense", "income"])
    .order("occurred_at", { ascending: false })
    .limit(MAX_ROWS);
  if (error) throw error;
  return (data ?? []) as UncategorizedRow[];
}

export function useUncategorizedMovementsQuery(workspaceId: number | null) {
  return useQuery({
    queryKey: ["uncategorized-movements", workspaceId],
    queryFn: () => fetchUncategorized(workspaceId!),
    enabled: Boolean(workspaceId),
    staleTime: STALE.short,
  });
}

/**
 * Le pone la misma categoría a un grupo entero, de una vez.
 *
 * Va por `in(id)` y no por una edición por movimiento porque el grupo puede tener veintitrés:
 * veintitrés viajes de ida y vuelta para una decisión que el usuario tomó una sola vez, y con
 * la mitad aplicada si se corta la señal a medias.
 */
export function useAssignCategoryToMovementsMutation(workspaceId: number | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: ["assign-category-to-movements"],
    mutationFn: async ({ ids, categoryId }: { ids: number[]; categoryId: number | null }) => {
      if (!supabase || !workspaceId) throw new Error("Workspace no disponible.");
      if (ids.length === 0) return;
      const { error } = await supabase
        .from("movements")
        .update({ category_id: categoryId })
        .in("id", ids)
        .eq("workspace_id", workspaceId);
      if (error) throw new Error(error.message ?? "Error de base de datos");
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["uncategorized-movements"] });
      void queryClient.invalidateQueries({ queryKey: ["movements"] });
      void queryClient.invalidateQueries({ queryKey: ["workspace-snapshot"] });
      void queryClient.invalidateQueries({ queryKey: ["categories-overview"] });
      // Lo que acabas de clasificar es justo lo que mejora las sugerencias siguientes.
      void queryClient.invalidateQueries({ queryKey: ["movement-patterns"] });
    },
  });
}
