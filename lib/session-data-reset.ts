import { queryClient } from "./query-client";
import { useWorkspaceListStore } from "./workspace-context";
import { useWorkspaceStore } from "../store/workspace-store";
import { useUiStore } from "../store/ui-store";

/**
 * Al cerrar sesión o cambiar de usuario: vacía React Query y el workspace activo persistido.
 * Evita mostrar datos del usuario anterior (mismo workspace_id en caché, otro miembro, etc.).
 */
export async function clearSessionScopedClientState() {
  await queryClient.cancelQueries();
  queryClient.clear();
  useWorkspaceStore.getState().clearActiveWorkspaceId();
  useWorkspaceListStore.getState().setWorkspaces([]);
  useUiStore.getState().setLastMovementAccountId(null);
}
