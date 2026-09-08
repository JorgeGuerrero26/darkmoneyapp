import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";


import { STALE } from "../../lib/query-client";
import { supabase } from "../../lib/supabase";
import { invokeEdgeFunction } from "./workspace-data";

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

export type InboxAiSuggestion = {
  key: string;
  categoryId: number;
  confidence: number;
  reason: string;
};

type InboxAiInput = {
  workspaceId: number | null;
  groups: Array<{ key: string; label: string; count: number; total: number }>;
  categories: Array<{ id: number; name: string; kind: string }>;
};

/**
 * Le pregunta a la IA por los grupos que los patrones no supieron resolver.
 *
 * **Una llamada para todos, no una por grupo.** La bandeja agrupa más de cien movimientos en
 * decenas de grupos: preguntar uno a uno serían decenas de esperas de siete segundos y decenas
 * de usos gastados para una sola limpieza. El lote es la misma idea que agrupar la pantalla.
 *
 * Solo llegan aquí los que el teléfono no sabe resolver solo: lo que ya está en tus patrones se
 * propone gratis, sin señal y al instante.
 */
export function useCategorizeInboxAiMutation() {
  return useMutation({
    mutationKey: ["categorize-inbox-ai"],
    mutationFn: async (input: InboxAiInput): Promise<InboxAiSuggestion[]> => {
      if (!input.workspaceId) throw new Error("No se encontró el workspace activo.");
      if (input.groups.length === 0) return [];
      const response = await invokeEdgeFunction<{ ok: boolean; suggestions?: InboxAiSuggestion[]; error?: string }>(
        "categorize-inbox-ai",
        { workspaceId: input.workspaceId, groups: input.groups, categories: input.categories },
      );
      if (!response.ok) throw new Error(response.error ?? "No se pudieron calcular las sugerencias.");
      return response.suggestions ?? [];
    },
  });
}
