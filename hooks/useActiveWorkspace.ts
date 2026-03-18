import { useWorkspace } from "../lib/workspace-context";

export function useActiveWorkspace() {
  return useWorkspace();
}
