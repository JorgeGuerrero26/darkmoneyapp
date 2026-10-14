import type { OutboxKind } from "./outbox";
import { isMirroredTable } from "./schema";
import type { SqlExecutor } from "./sql-driver";

/** Un cambio guardado en el teléfono que todavía no confirmó el servidor, listo para mostrarse. */
export type PendingChange = {
  opId: string;
  table: string;
  kind: OutboxKind;
  workspaceId: number;
  rowId: number;
  /** ISO: cuándo se guardó en el teléfono. */
  createdAt: string;
  /** Nombre o descripción de lo que se cambió ("Café", "Cuenta principal"); null si no se conoce. */
  label: string | null;
  /** Campos que se editaron (solo en ediciones), para decir "Cuenta editada · nombre". */
  changedFields: string[];
};

type OutboxRow = {
  op_id: string;
  table_name: string;
  kind: OutboxKind;
  workspace_id: number;
  row_id: number;
  created_at: string;
  fields: string;
};

/** Qué campo guarda el nombre legible de cada tabla. */
const LABEL_FIELD: Record<string, string> = {
  movements: "description",
  obligations: "title",
};

function labelFor(table: string, data: Record<string, unknown> | null): string | null {
  if (!data) return null;
  const preferred = LABEL_FIELD[table] ?? "name";
  const value = data[preferred] ?? data.name ?? data.title ?? data.description;
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/**
 * Cambios sin enviar de todos los espacios, del más reciente al más antiguo. Une cada operación con
 * el nombre de la fila (de la copia local) para poder decir "Nuevo gasto · Café" sin abrir nada.
 */
export async function listPendingChanges(db: SqlExecutor): Promise<PendingChange[]> {
  const rows = await db.all<OutboxRow>(
    `select op_id, table_name, kind, workspace_id, row_id, created_at, fields
       from outbox where status in ('pending','sending') order by seq desc`,
  );
  const out: PendingChange[] = [];
  for (const row of rows) {
    let data: Record<string, unknown> | null = null;
    if (row.kind !== "delete" && isMirroredTable(row.table_name)) {
      const mirrored = await db.get<{ data: string }>(`select data from ${row.table_name} where id = ?`, [row.row_id]);
      data = mirrored ? (JSON.parse(mirrored.data) as Record<string, unknown>) : null;
    }
    const fields = JSON.parse(row.fields) as Record<string, unknown>;
    out.push({
      opId: row.op_id,
      table: row.table_name,
      kind: row.kind,
      workspaceId: Number(row.workspace_id),
      rowId: Number(row.row_id),
      createdAt: row.created_at,
      label: labelFor(row.table_name, data),
      changedFields: row.kind === "update" ? Object.keys(fields) : [],
    });
  }
  return out;
}

/** Cuándo se guardó cada fila de una tabla que sigue pendiente (para marcarla en su lista). */
export async function pendingRowTimes(db: SqlExecutor, workspaceId: number, table: string): Promise<Array<{ id: number; at: string }>> {
  const rows = await db.all<{ row_id: number; at: string }>(
    `select row_id, min(created_at) as at from outbox
      where workspace_id = ? and table_name = ? and status in ('pending','sending') group by row_id`,
    [workspaceId, table],
  );
  return rows.map((row) => ({ id: Number(row.row_id), at: row.at }));
}
