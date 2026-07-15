import { resolveOriginBackAction, shouldInterceptHardwareBack } from "../origin-back-action";

describe("resolveOriginBackAction", () => {
  it("pops on a stack when there is history", () => {
    expect(resolveOriginBackAction({ hasOrigin: true, canGoBack: true, navigatorType: "stack" })).toBe("pop");
  });

  it("replaces to origin from a tab even when canGoBack (goBack there jumps to firstRoute, not the origin tab)", () => {
    expect(resolveOriginBackAction({ hasOrigin: true, canGoBack: true, navigatorType: "tab" })).toBe("replace-origin");
  });

  it("keeps default tab back when no origin is declared", () => {
    expect(resolveOriginBackAction({ hasOrigin: false, canGoBack: true, navigatorType: "tab" })).toBe("pop");
  });

  it("replaces to origin on cold start (no stack, origin present)", () => {
    expect(resolveOriginBackAction({ hasOrigin: true, canGoBack: false })).toBe("replace-origin");
  });

  it("replaces to default on cold start without origin", () => {
    expect(resolveOriginBackAction({ hasOrigin: false, canGoBack: false })).toBe("replace-default");
  });
});

describe("shouldInterceptHardwareBack", () => {
  it("intercepts only when focused and origin present", () => {
    expect(shouldInterceptHardwareBack({ hasOrigin: true, isFocused: true })).toBe(true);
    expect(shouldInterceptHardwareBack({ hasOrigin: true, isFocused: false })).toBe(false);
    expect(shouldInterceptHardwareBack({ hasOrigin: false, isFocused: true })).toBe(false);
  });
});
