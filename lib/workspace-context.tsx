import { createContext, useContext } from "react";
import type { PropsWithChildren } from "react";
import { create } from "zustand";

import { useWorkspaceStore } from "../store/workspace-store";
import type { Workspace } from "../types/domain";

// ─── Lightweight store for the resolved workspace list ────────────────────────

type WorkspaceListState = {
  workspaces: Workspace[];
  setWorkspaces: (workspaces: Workspace[]) => void;
};

export const useWorkspaceListStore = create<WorkspaceListState>((set) => ({
  workspaces: [],
  setWorkspaces: (workspaces) => set({ workspaces }),
}));

// ─── Context ──────────────────────────────────────────────────────────────────

type WorkspaceContextValue = {
  activeWorkspaceId: number | null;
  setActiveWorkspaceId: (id: number | null) => void;
  activeWorkspace: Workspace | null;
  setWorkspaces: (workspaces: Workspace[]) => void;
  workspaces: Workspace[];
};

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function WorkspaceProvider({ children }: PropsWithChildren) {
  const { activeWorkspaceId, setActiveWorkspaceId } = useWorkspaceStore();
  const { workspaces, setWorkspaces } = useWorkspaceListStore();

  const activeWorkspace =
    workspaces.find((w) => w.id === activeWorkspaceId) ?? null;

  // La selección inicial / validación del workspace activo vive en NotificationSetup (_layout)
  // para no duplicar efectos con Zustand y evitar bucles de actualización.

  const value: WorkspaceContextValue = {
    activeWorkspaceId,
    setActiveWorkspaceId,
    activeWorkspace,
    setWorkspaces,
    workspaces,
  };

  return (
    <WorkspaceContext.Provider value={value}>
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace() {
  const context = useContext(WorkspaceContext);
  if (!context) throw new Error("useWorkspace debe usarse dentro de WorkspaceProvider.");
  return context;
}
