import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect } from "react";
import { findDetectedSuggestionIdByNativeId } from "../../services/queries/notification-detection";
import { useWorkspace } from "../../lib/workspace-context";

export default function DetectedSuggestionRedirect() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { activeWorkspaceId } = useWorkspace();
  const router = useRouter();

  useEffect(() => {
    async function redirect() {
      if (!id) {
        router.replace("/notifications");
        return;
      }
      if (!activeWorkspaceId) {
        router.replace("/notifications");
        return;
      }
      const suggestionId = await findDetectedSuggestionIdByNativeId(
        activeWorkspaceId,
        decodeURIComponent(id),
      ).catch(() => null);
      router.replace(
        suggestionId ? `/notifications?suggestionId=${suggestionId}` : "/notifications",
      );
    }
    void redirect();
  }, [id, activeWorkspaceId, router]);

  return null;
}
