import { useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";

import { supabase } from "../../lib/supabase";

type NumericLike = number | string | null;

function toNum(val: NumericLike): number {
  if (val === null || val === undefined) return 0;
  const n = Number(val);
  return isNaN(n) ? 0 : n;
}

// ─── Category mutations ───────────────────────────────────────────────────────

function invalidateCategoryRelatedQueries(queryClient: QueryClient, workspaceId: number | null) {
  // Mark snapshot stale but don't trigger an immediate expensive refetch —
  // category name changes don't affect balances and will be picked up next navigation.
  void queryClient.invalidateQueries({ queryKey: ["workspace-snapshot"], refetchType: "none" });
  if (workspaceId != null) {
    void queryClient.invalidateQueries({ queryKey: ["categories-overview", workspaceId] });
  }
}

export type CategoryFormInput = {
  name: string;
  kind: "expense" | "income" | "both";
  parentId?: number | null;
  color?: string | null;
  icon?: string | null;
  sortOrder?: number;
  isActive?: boolean;
};

export function useCreateCategoryMutation(workspaceId: number | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: CategoryFormInput) => {
      if (!supabase || !workspaceId) throw new Error("Workspace no disponible.");
      const { data: authData, error: authErr } = await supabase.auth.getUser();
      if (authErr) throw new Error(authErr.message ?? "No se pudo verificar la sesión");
      const uid = authData.user?.id;
      if (!uid) throw new Error("No hay sesión");

      const { data: maxRow, error: maxErr } = await supabase
        .from("categories")
        .select("sort_order")
        .eq("workspace_id", workspaceId)
        .order("sort_order", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (maxErr) throw new Error(maxErr.message ?? "Error al leer orden de categorías");
      const maxSort = maxRow?.sort_order != null ? toNum(maxRow.sort_order as NumericLike) : 0;

      const clientSort = input.sortOrder;
      const sortOrder =
        clientSort !== undefined && Number.isFinite(clientSort) && clientSort > 0 ? Math.floor(clientSort) : maxSort + 10;

      const colorNorm = input.color?.trim() ? input.color.trim() : null;
      const iconNorm = input.icon?.trim() ? input.icon.trim() : null;

      const { data, error } = await supabase
        .from("categories")
        .insert({
          workspace_id: workspaceId,
          created_by_user_id: uid,
          name: input.name.trim(),
          kind: input.kind,
          parent_id: input.parentId ?? null,
          color: colorNorm,
          icon: iconNorm,
          is_active: input.isActive !== false,
          is_system: false,
          sort_order: sortOrder,
        })
        .select("id")
        .single();
      if (error) throw new Error(error.message ?? "Error de base de datos");
      return data as { id: number };
    },
    onSuccess: () => {
      invalidateCategoryRelatedQueries(queryClient, workspaceId);
    },
  });
}

export function useUpdateCategoryMutation(workspaceId: number | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, input }: { id: number; input: Partial<CategoryFormInput> }) => {
      if (!supabase || !workspaceId) throw new Error("Workspace no disponible.");
      if (input.parentId !== undefined && input.parentId === id) {
        throw new Error("La categoría no puede ser su propia categoría padre.");
      }

      const { data: authData, error: authErr } = await supabase.auth.getUser();
      if (authErr) throw new Error(authErr.message ?? "No se pudo verificar la sesión");
      const uid = authData.user?.id ?? null;

      const payload: Record<string, unknown> = { updated_by_user_id: uid };
      if (input.name !== undefined) payload.name = input.name.trim();
      if (input.kind !== undefined) payload.kind = input.kind;
      if (input.parentId !== undefined) payload.parent_id = input.parentId;
      if (input.color !== undefined) payload.color = input.color?.trim() ? input.color.trim() : null;
      if (input.icon !== undefined) payload.icon = input.icon?.trim() ? input.icon.trim() : null;
      if (input.sortOrder !== undefined) payload.sort_order = input.sortOrder;
      if (input.isActive !== undefined) payload.is_active = input.isActive;

      const { error } = await supabase
        .from("categories")
        .update(payload)
        .eq("id", id)
        .eq("workspace_id", workspaceId);
      if (error) throw new Error(error.message ?? "Error de base de datos");
    },
    onSuccess: () => {
      invalidateCategoryRelatedQueries(queryClient, workspaceId);
    },
  });
}

/** Solo activar / desactivar (toggle rápido en lista). */
export function useToggleCategoryMutation(workspaceId: number | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, isActive }: { id: number; isActive: boolean }) => {
      if (!supabase || !workspaceId) throw new Error("Workspace no disponible.");
      const { data: authData, error: authErr } = await supabase.auth.getUser();
      if (authErr) throw new Error(authErr.message ?? "No se pudo verificar la sesión");
      const uid = authData.user?.id ?? null;
      const { error } = await supabase
        .from("categories")
        .update({ is_active: isActive, updated_by_user_id: uid })
        .eq("id", id)
        .eq("workspace_id", workspaceId);
      if (error) throw new Error(error.message ?? "Error de base de datos");
    },
    onSuccess: () => {
      invalidateCategoryRelatedQueries(queryClient, workspaceId);
    },
  });
}

export function useDeleteCategoryMutation(workspaceId: number | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      if (!supabase || !workspaceId) throw new Error("Workspace no disponible.");

      const { data: catRow, error: catErr } = await supabase
        .from("categories")
        .select("id, is_system")
        .eq("id", id)
        .eq("workspace_id", workspaceId)
        .maybeSingle();
      if (catErr) throw new Error(catErr.message ?? "Error al cargar categoría");
      if (!catRow) throw new Error("Categoría no encontrada.");
      if ((catRow as { is_system?: boolean }).is_system) {
        throw new Error("No se puede eliminar una categoría base del sistema.");
      }

      const { count: movCount, error: movErr } = await supabase
        .from("movements")
        .select("*", { count: "exact", head: true })
        .eq("workspace_id", workspaceId)
        .eq("category_id", id);
      if (movErr) throw new Error(movErr.message ?? "Error al comprobar movimientos");
      if ((movCount ?? 0) > 0) {
        throw new Error("No se puede eliminar: hay movimientos que usan esta categoría.");
      }

      const { count: subCount, error: subErr } = await supabase
        .from("subscriptions")
        .select("*", { count: "exact", head: true })
        .eq("workspace_id", workspaceId)
        .eq("category_id", id);
      if (subErr) throw new Error(subErr.message ?? "Error al comprobar suscripciones");
      if ((subCount ?? 0) > 0) {
        throw new Error("No se puede eliminar: hay suscripciones que usan esta categoría.");
      }

      const { count: childCount, error: childErr } = await supabase
        .from("categories")
        .select("*", { count: "exact", head: true })
        .eq("workspace_id", workspaceId)
        .eq("parent_id", id);
      if (childErr) throw new Error(childErr.message ?? "Error al comprobar subcategorías");
      if ((childCount ?? 0) > 0) {
        throw new Error("No se puede eliminar: existen subcategorías. Reasígnalas o elimínalas primero.");
      }

      const { error } = await supabase.from("categories").delete().eq("id", id).eq("workspace_id", workspaceId);
      if (error) throw new Error(error.message ?? "Error de base de datos");
    },
    onSuccess: () => {
      invalidateCategoryRelatedQueries(queryClient, workspaceId);
    },
  });
}

// ─── Counterparty (contact) mutations ────────────────────────────────────────

export type CounterpartyFormInput = {
  name: string;
  type: "person" | "company" | "merchant" | "service" | "bank" | "other";
  phone?: string | null;
  email?: string | null;
  documentNumber?: string | null;
  notes?: string | null;
};

export function useCreateCounterpartyMutation(workspaceId: number | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: CounterpartyFormInput) => {
      if (!supabase || !workspaceId) throw new Error("Workspace no disponible.");
      const { data, error } = await supabase
        .from("counterparties")
        .insert({
          workspace_id: workspaceId,
          name: input.name,
          type: input.type,
          phone: input.phone ?? null,
          email: input.email ?? null,
          document_number: input.documentNumber ?? null,
          notes: input.notes ?? null,
          is_archived: false,
        })
        .select("id")
        .single();
      if (error) throw new Error(error.message ?? "Error de base de datos");
      return data as { id: number };
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["workspace-snapshot"], refetchType: "none" });
      void queryClient.invalidateQueries({ queryKey: ["counterparties"] });
    },
  });
}

export function useUpdateCounterpartyMutation(workspaceId: number | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, input }: { id: number; input: Partial<CounterpartyFormInput> & { isArchived?: boolean } }) => {
      if (!supabase || !workspaceId) throw new Error("Workspace no disponible.");
      const payload: Record<string, unknown> = {};
      if (input.name !== undefined) payload.name = input.name;
      if (input.type !== undefined) payload.type = input.type;
      if (input.phone !== undefined) payload.phone = input.phone;
      if (input.email !== undefined) payload.email = input.email;
      if (input.documentNumber !== undefined) payload.document_number = input.documentNumber;
      if (input.notes !== undefined) payload.notes = input.notes;
      if (input.isArchived !== undefined) payload.is_archived = input.isArchived;
      const { error } = await supabase
        .from("counterparties")
        .update(payload)
        .eq("id", id)
        .eq("workspace_id", workspaceId);
      if (error) throw new Error(error.message ?? "Error de base de datos");
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["workspace-snapshot"], refetchType: "none" });
      void queryClient.invalidateQueries({ queryKey: ["counterparties"] });
    },
  });
}

export function useToggleCounterpartyPinMutation(workspaceId: number | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, isPinned }: { id: number; isPinned: boolean }) => {
      if (!supabase || !workspaceId) throw new Error("Workspace no disponible.");
      const { data: authData, error: authErr } = await supabase.auth.getUser();
      if (authErr) throw new Error(authErr.message ?? "No se pudo verificar la sesiÃ³n");
      const uid = authData.user?.id ?? null;
      const { error } = await supabase
        .from("counterparties")
        .update({ is_pinned: isPinned, updated_by_user_id: uid })
        .eq("id", id)
        .eq("workspace_id", workspaceId);
      if (error) throw new Error(error.message ?? "Error de base de datos");
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["workspace-snapshot"] });
      void queryClient.invalidateQueries({ queryKey: ["counterparties"] });
    },
  });
}

export function useDeleteCounterpartyMutation(workspaceId: number | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      if (!supabase || !workspaceId) throw new Error("Workspace no disponible.");

      const [{ count: movementCount, error: movementError }, { count: obligationCount, error: obligationError }] =
        await Promise.all([
          supabase
            .from("movements")
            .select("id", { count: "exact", head: true })
            .eq("workspace_id", workspaceId)
            .eq("counterparty_id", id),
          supabase
            .from("obligations")
            .select("id", { count: "exact", head: true })
            .eq("workspace_id", workspaceId)
            .eq("counterparty_id", id),
        ]);

      if (movementError) throw new Error(movementError.message ?? "Error al validar movimientos del contacto");
      if (obligationError) throw new Error(obligationError.message ?? "Error al validar obligaciones del contacto");

      if ((movementCount ?? 0) > 0 || (obligationCount ?? 0) > 0) {
        throw new Error("No puedes eliminar este contacto porque tiene movimientos o créditos/deudas asociados. Archívalo en su lugar.");
      }

      const { error } = await supabase
        .from("counterparties")
        .delete()
        .eq("id", id)
        .eq("workspace_id", workspaceId);
      if (error) throw new Error(error.message ?? "Error de base de datos");
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["workspace-snapshot"], refetchType: "none" });
      void queryClient.invalidateQueries({ queryKey: ["counterparties"] });
    },
  });
}

export function useToggleCategoryPinMutation(workspaceId: number | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, isPinned }: { id: number; isPinned: boolean }) => {
      if (!supabase || !workspaceId) throw new Error("Workspace no disponible.");
      const { data: authData, error: authErr } = await supabase.auth.getUser();
      if (authErr) throw new Error(authErr.message ?? "No se pudo verificar la sesión");
      const uid = authData.user?.id ?? null;
      const { error } = await supabase
        .from("categories")
        .update({ is_pinned: isPinned, updated_by_user_id: uid })
        .eq("id", id)
        .eq("workspace_id", workspaceId);
      if (error) throw new Error(error.message ?? "Error de base de datos");
    },
    onSuccess: () => {
      invalidateCategoryRelatedQueries(queryClient, workspaceId);
    },
  });
}
