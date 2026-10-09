export type DetectionUndoInput = { workspaceId: number; suggestionId: number; movementId: number };
export type DetectionUndoResult = {
  workspaceId: number; suggestionId: number; status: "pending"; movementId: null;
  deletedMovementIds: number[]; alreadyUndone: boolean;
};
type UndoClient = {
  rpc(name: string, args: Record<string, number>): PromiseLike<{ data: unknown; error: { message?: string; code?: string } | null }>;
};
function validId(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

/** One server transaction, never a client delete followed by an unrelated update. */
export async function requestDetectedRegistrationUndo(client: UndoClient, input: DetectionUndoInput): Promise<DetectionUndoResult> {
  if (![input.workspaceId, input.suggestionId, input.movementId].every(validId)) {
    throw new Error("El registro no está disponible para deshacer.");
  }
  const { data, error } = await client.rpc("undo_detected_movement_registration", {
    p_workspace_id: input.workspaceId, p_suggestion_id: input.suggestionId,
    p_expected_movement_id: input.movementId,
  });
  if (error?.code === "PGRST202" || error?.code === "42883") {
    throw new Error("El servidor aún no permite deshacer detecciones. No se eliminó ningún movimiento; falta desplegar la migración.");
  }
  if (error) throw new Error(error.message || "No se pudo deshacer el registro. Actualiza antes de reintentar.");
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("No se pudo confirmar el resultado. Actualiza o reintenta la misma operación.");
  const result = data as Record<string, unknown>;
  const ids = result.deletedMovementIds;
  if (result.workspaceId !== input.workspaceId || result.suggestionId !== input.suggestionId ||
      result.status !== "pending" || result.movementId !== null || typeof result.alreadyUndone !== "boolean" ||
      !Array.isArray(ids) || !ids.length || !ids.every(validId) || !ids.includes(input.movementId) ||
      new Set(ids).size !== ids.length) {
    throw new Error("No se pudo confirmar el resultado. Actualiza o reintenta la misma operación.");
  }
  return result as DetectionUndoResult;
}
