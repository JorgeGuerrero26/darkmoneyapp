import { useEffect, type ReactNode } from "react";
import { Platform } from "react-native";
import { useOriginBackNavigation } from "../../hooks/useOriginBackNavigation";

/** Do not mount Android permission screens or their queries on iPhone/web. */
export function AndroidNotificationDetectionGate({ children }: { children: ReactNode }) {
  return Platform.OS === "android" ? <>{children}</> : <ReturnToOrigin />;
}

function ReturnToOrigin() {
  const { handleBack } = useOriginBackNavigation({
    defaultRoute: "/(app)/settings",
    originRoutes: {
      settings: "/(app)/settings",
      "notification-detection": "/(app)/settings",
    },
    skipInterception: true,
  });
  useEffect(() => { handleBack(); }, [handleBack]);
  return null;
}
