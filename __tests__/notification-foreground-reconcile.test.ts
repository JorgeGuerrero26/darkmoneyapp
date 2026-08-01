import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("notification foreground reconcile", () => {
  it("sale en iOS antes de registrar AppState o invalidar queries", () => {
    const source = readFileSync(
      join(__dirname, "..", "hooks", "useNotificationDetectionForegroundReconcile.ts"),
      "utf8",
    );
    const effectStart = source.indexOf("useEffect(() => {");
    const availabilityGuard = source.indexOf("if (!notificationDetection.isAvailable()) return;", effectStart);
    const firstInvalidation = source.indexOf("queryClient.invalidateQueries", effectStart);
    const appStateListener = source.indexOf("AppState.addEventListener", effectStart);

    expect(effectStart).toBeGreaterThanOrEqual(0);
    expect(availabilityGuard).toBeGreaterThan(effectStart);
    expect(availabilityGuard).toBeLessThan(firstInvalidation);
    expect(availabilityGuard).toBeLessThan(appStateListener);
  });
});
