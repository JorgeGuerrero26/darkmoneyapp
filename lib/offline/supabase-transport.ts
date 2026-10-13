import { supabase } from "../supabase";
import type { PullCursor, PullResponse, PushOp, PushResult, SyncTransport } from "./sync-types";

/**
 * Las RPC de la Fase 1 sobre el cliente de Supabase de la app (mismo token, mismos plazos de red).
 * Cualquier error se lanza: el motor lo trata como "no se pudo ahora" y reintenta; los rechazos
 * de una operación concreta no son errores de transporte, llegan dentro de `push_batch`.
 */
async function rpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
  if (!supabase) throw new Error("Supabase no está configurado.");
  const { data, error } = await supabase.rpc(name, args);
  if (error) {
    const wrapped = new Error(error.message || `Falló ${name}`);
    (wrapped as Error & { code?: string }).code = error.code;
    throw wrapped;
  }
  return data as T;
}

export const supabaseSyncTransport: SyncTransport = {
  async reserveIds(workspaceId: number, table: string, count: number) {
    const ids = await rpc<Array<number | string>>("reserve_ids", {
      p_workspace_id: workspaceId,
      p_table: table,
      p_count: count,
    });
    return ids.map(Number);
  },

  pullChanges(workspaceId: number, cursors: Record<string, PullCursor>, tables: readonly string[], limit: number) {
    return rpc<PullResponse>("pull_changes", {
      p_workspace_id: workspaceId,
      p_cursors: cursors,
      p_tables: [...tables],
      p_limit: limit,
    });
  },

  async liveIds(workspaceId: number, tables: readonly string[]) {
    const result = await rpc<{ ids: Record<string, Array<number | string>> }>("sync_live_ids", {
      p_workspace_id: workspaceId,
      p_tables: [...tables],
    });
    return Object.fromEntries(Object.entries(result.ids).map(([table, ids]) => [table, ids.map(Number)]));
  },

  pushBatch(ops: PushOp[]) {
    return rpc<PushResult[]>("push_batch", { p_ops: ops });
  },
};
