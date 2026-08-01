import { resolveOriginBackAction, shouldInterceptHardwareBack } from "../lib/origin-back-action";

describe("resolveOriginBackAction", () => {
  it("pop cuando hay stack al que volver, con o sin origen declarado", () => {
    expect(resolveOriginBackAction({ hasOrigin: true, canGoBack: true })).toBe("pop");
    expect(resolveOriginBackAction({ hasOrigin: false, canGoBack: true })).toBe("pop");
  });

  it("sin stack: replace al origen declarado si existe, si no al default", () => {
    expect(resolveOriginBackAction({ hasOrigin: true, canGoBack: false })).toBe("replace-origin");
    expect(resolveOriginBackAction({ hasOrigin: false, canGoBack: false })).toBe("replace-default");
  });
});

describe("shouldInterceptHardwareBack", () => {
  it("solo intercepta la pantalla enfocada con origen declarado", () => {
    expect(shouldInterceptHardwareBack({ hasOrigin: true, isFocused: true })).toBe(true);
    // Pantalla montada pero no enfocada (tab oculta visitada antes): su listener
    // global NO debe secuestrar el back de la pantalla visible.
    expect(shouldInterceptHardwareBack({ hasOrigin: true, isFocused: false })).toBe(false);
    expect(shouldInterceptHardwareBack({ hasOrigin: false, isFocused: true })).toBe(false);
  });
});
