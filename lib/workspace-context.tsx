import { createContext, useContext, useEffect } from "react";
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
  setActiveWorkspaceId: (id: number) => void;
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

  // Auto-select first default workspace if none is active yet
  useEffect(() => {
    if (activeWorkspaceId !== null || workspaces.length === 0) return;
    const defaultWs = workspaces.find((w) => w.isDefaultWorkspace) ?? workspaces[0];
    if (defaultWs) setActiveWorkspaceId(defaultWs.id);
  }, [workspaces, activeWorkspaceId, setActiveWorkspaceId]);

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
