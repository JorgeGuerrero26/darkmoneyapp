import type { ServerRow } from "./movement-store";

/** Contrato de las RPC de la Fase 1 (docs/OFFLINE_PHASE1_PLAN.md). */

export type PullCursor = { since: string | null; after_id: number };

export type PullResponse = {
  server_time: string;
  tables: Record<
    string,
    { rows: ServerRow[]; has_more: boolean; next: { since: string | null; after_id: number | null } }
  >;
};

export type SubscriptionOccurrencePull = PullResponse["tables"][string] & { live_ids: number[] };

export type PushOp = {
  op_id: string;
  table: string;
  kind: "insert" | "update" | "delete";
  workspace_id: number;
  row_id: number;
  fields: Record<string, unknown>;
  base_updated_at: string | null;
  /** Operación atómica de grupo (Fase 5.1): las operaciones con el mismo `group_id` se aplican todas o ninguna. */
  group_id?: string;
  group_size?: number;
};

export type PushStatus = "applied" | "merged" | "review" | "noop" | "rejected";

export type PushResult = {
  op_id: string;
  status: PushStatus;
  table?: string;
  row_id?: number | null;
  row?: ServerRow;
  previous?: Record<string, unknown>;
  replayed?: boolean;
  /** Presente en las operaciones de un grupo atómico. */
  group_id?: string;
  code?: string;
  sqlstate?: string;
  message?: string;
};

export interface SyncTransport {
  reserveIds(workspaceId: number, table: string, count: number): Promise<number[]>;
  pullChanges(
    workspaceId: number,
    cursors: Record<string, PullCursor>,
    tables: readonly string[],
    limit: number,
  ): Promise<PullResponse>;
  liveIds(workspaceId: number, tables: readonly string[]): Promise<Record<string, number[]>>;
  /** Un fallo del lote entero (sin red, timeout) se lanza; un rechazo de una operación llega en su resultado. */
  pushBatch(ops: PushOp[]): Promise<PushResult[]>;
  /** null: servidor Fase 1 todavía sin el RPC de lectura del hijo. */
  pullSubscriptionOccurrences?(workspaceId: number, cursor: PullCursor, limit: number): Promise<SubscriptionOccurrencePull | null>;
}

export type SyncChange =
  | { kind: "queue" }
  | { kind: "data"; tables: string[] }
  | { kind: "inbox" };

export type SyncReport = {
  pushed: number;
  applied: number;
  rejected: number;
  review: number;
  retried: number;
  pulledRows: number;
  hydrated: boolean;
  error: string | null;
};
