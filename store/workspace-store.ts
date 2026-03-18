import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

type WorkspaceState = {
  activeWorkspaceId: number | null;
  setActiveWorkspaceId: (id: number | null) => void;
  clearActiveWorkspaceId: () => void;
};

export const useWorkspaceStore = create<WorkspaceState>()(
  persist(
    (set) => ({
      activeWorkspaceId: null,
      setActiveWorkspaceId: (id) => set({ activeWorkspaceId: id }),
      clearActiveWorkspaceId: () => set({ activeWorkspaceId: null }),
    }),
    {
      name: "darkmoney-workspace",
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);
