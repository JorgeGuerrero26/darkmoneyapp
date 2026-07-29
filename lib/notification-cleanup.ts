type ExistingGeneratedNotification = {
  id: number;
  kind: string | null;
  related_entity_id: number | null;
};

type ActiveGeneratedNotification = {
  kind: string;
  related_entity_id: number;
};

/**
 * Calcula las filas obsoletas con la misma semántica del cleanup anterior:
 * cada kind conserva solo sus related_entity_id activos. Si el kind no tiene
 * IDs activos, elimina todas sus filas; si sí tiene, conserva IDs nulos igual
 * que `NOT IN (...)` en PostgreSQL.
 */
export function findStaleGeneratedNotificationIds(
  existingRows: ExistingGeneratedNotification[],
  activeRows: ActiveGeneratedNotification[],
  managedKinds: readonly string[],
): number[] {
  const activeIdsByKind = new Map<string, Set<number>>(
    managedKinds.map((kind) => [kind, new Set<number>()]),
  );

  for (const row of activeRows) {
    activeIdsByKind.get(row.kind)?.add(row.related_entity_id);
  }

  return existingRows.flatMap((row) => {
    if (!row.kind) return [];

    const activeIds = activeIdsByKind.get(row.kind);
    if (!activeIds) return [];
    if (activeIds.size === 0) return [row.id];
    if (row.related_entity_id === null) return [];

    return activeIds.has(row.related_entity_id) ? [] : [row.id];
  });
}
