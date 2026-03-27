import { useCallback, useMemo, useRef } from "react";
import { Gesture } from "react-native-gesture-handler";
import { runOnJS } from "react-native-reanimated";
import { useRouter, usePathname } from "expo-router";

const TABS = [
  "/(app)/dashboard",
  "/(app)/movements",
  "/(app)/accounts",
  "/(app)/obligations",
  "/(app)/more",
] as const;

const TAB_SEGMENTS = ["dashboard", "movements", "accounts", "obligations", "more"];

export function useSwipeTab() {
  const router = useRouter();
  const pathname = usePathname();

  // Ref so the worklet callback always reads the latest values
  const stateRef = useRef({ router, pathname });
  stateRef.current = { router, pathname };

  const navigate = useCallback((dir: "prev" | "next") => {
    const { router, pathname } = stateRef.current;
    const segment = pathname.split("/").pop() ?? "";
    const idx = TAB_SEGMENTS.indexOf(segment);
    if (idx === -1) return;
    if (dir === "next" && idx < TABS.length - 1) {
      router.navigate(TABS[idx + 1]);
    } else if (dir === "prev" && idx > 0) {
      router.navigate(TABS[idx - 1]);
    }
  }, []);

  const gesture = useMemo(
    () =>
      Gesture.Pan()
        // Require clear horizontal intent before activating
        .activeOffsetX([-50, 50])
        // Fail if vertical movement detected first (preserves ScrollView scrolling)
        .failOffsetY([-20, 20])
        .onEnd((e) => {
          "worklet";
          // Require both distance AND velocity to avoid accidental triggers
          if (e.translationX < -60 && e.velocityX < -250) {
            runOnJS(navigate)("next");
          } else if (e.translationX > 60 && e.velocityX > 250) {
            runOnJS(navigate)("prev");
          }
        }),
    [navigate],
  );

  return gesture;
}
