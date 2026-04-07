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
const EDGE_SWIPE_WIDTH = 28;
const EDGE_TRIGGER_DISTANCE = 72;
const EDGE_TRIGGER_VELOCITY = 320;

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

  const gesture = useMemo(() => {
    const prevGesture = Gesture.Pan()
      .hitSlop({ left: 0, width: EDGE_SWIPE_WIDTH })
      .activeOffsetX(24)
      .failOffsetY([-12, 12])
      .shouldCancelWhenOutside(true)
      .onEnd((e) => {
        "worklet";
        if (e.translationX > EDGE_TRIGGER_DISTANCE && e.velocityX > EDGE_TRIGGER_VELOCITY) {
          runOnJS(navigate)("prev");
        }
      });

    const nextGesture = Gesture.Pan()
      .hitSlop({ right: 0, width: EDGE_SWIPE_WIDTH })
      .activeOffsetX(-24)
      .failOffsetY([-12, 12])
      .shouldCancelWhenOutside(true)
      .onEnd((e) => {
        "worklet";
        if (e.translationX < -EDGE_TRIGGER_DISTANCE && e.velocityX < -EDGE_TRIGGER_VELOCITY) {
          runOnJS(navigate)("next");
        }
      });

    return Gesture.Race(prevGesture, nextGesture);
  }, [navigate]);

  return gesture;
}
