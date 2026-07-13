import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "../../lib/supabase";
import { STALE } from "../../lib/query-client";
import type { MovementType } from "../../types/domain";

export type MovementTemplate = {
  id: number;
  workspaceId: number;
  name: string;
  movementType: MovementType;
  sourceAccountId: number | null;
  destinationAccountId: number | null;
  sourceAmount: number | null;
  destinationAmount: number | null;
  categoryId: number | null;
  counterpartyId: number | null;
  description: string;
  notes: string | null;
};

export type MovementTemplateInput = Omit<MovementTemplate, "id" | "workspaceId">;

function mapRow(row: Record<string, unknown>): MovementTemplate {
  return {
    id: Number(row.id),
    workspaceId: Number(row.workspace_id),
    name: String(row.name ?? ""),
    movementType: String(row.movement_type) as MovementType,
    sourceAccountId: row.source_account_id == null ? null : Number(row.source_account_id),
    destinationAccountId: row.destination_account_id == null ? null : Number(row.destination_account_id),
    sourceAmount: row.source_amount == null ? null : Number(row.source_amount),
    destinationAmount: row.destination_amount == null ? null : Number(row.destination_amount),
    categoryId: row.category_id == null ? null : Number(row.category_id),
    counterpartyId: row.counterparty_id == null ? null : Number(row.counterparty_id),
    description: String(row.description ?? ""),
    notes: row.notes == null ? null : String(row.notes),
  };
}

export function useMovementTemplatesQuery(workspaceId: number | null) {
  return useQuery({
    queryKey: ["movement-templates", workspaceId],
    enabled: Boolean(supabase && workspaceId),
    staleTime: STALE.medium,
    queryFn: async (): Promise<MovementTemplate[]> => {
      const { data, error } = await supabase!
        .from("movement_templates")
        .select("id, workspace_id, name, movement_type, source_account_id, destination_account_id, source_amount, destination_amount, category_id, counterparty_id, description, notes")
        .eq("workspace_id", workspaceId!)
        .order("sort_order", { ascending: true })
        .order("id", { ascending: true });
      if (error) throw new Error(error.message ?? "No se pudieron cargar las plantillas");
      return (data ?? []).map((row) => mapRow(row as Record<string, unknown>));
    },
  });
}

export function useCreateMovementTemplateMutation(workspaceId: number | null, userId: string | null | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: MovementTemplateInput): Promise<MovementTemplate> => {
      if (!supabase || !workspaceId || !userId) throw new Error("Workspace no disponible.");
      const { data, error } = await supabase
        .from("movement_templates")
        .insert({
          workspace_id: workspaceId,
          created_by_user_id: userId,
          name: input.name,
          movement_type: input.movementType,
          source_account_id: input.sourceAccountId,
          destination_account_id: input.destinationAccountId,
          source_amount: input.sourceAmount,
          destination_amount: input.destinationAmount,
          category_id: input.categoryId,
          counterparty_id: input.counterpartyId,
          description: input.description,
          notes: input.notes,
        })
        .select("id, workspace_id, name, movement_type, source_account_id, destination_account_id, source_amount, destination_amount, category_id, counterparty_id, description, notes")
        .single();
      if (error) throw new Error(error.message ?? "No se pudo guardar la plantilla");
      return mapRow(data as Record<string, unknown>);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["movement-templates"] });
    },
  });
}

export function useRenameMovementTemplateMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ templateId, name }: { templateId: number; name: string }) => {
      if (!supabase) throw new Error("Supabase no está configurado.");
      const { error } = await supabase.from("movement_templates").update({ name }).eq("id", templateId);
      if (error) throw new Error(error.message ?? "No se pudo renombrar la plantilla");
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["movement-templates"] });
    },
  });
}

export function useDeleteMovementTemplateMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (templateId: number) => {
      if (!supabase) throw new Error("Supabase no está configurado.");
      const { error } = await supabase.from("movement_templates").delete().eq("id", templateId);
      if (error) throw new Error(error.message ?? "No se pudo eliminar la plantilla");
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["movement-templates"] });
    },
  });
}
