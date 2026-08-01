import { parseDuplicateVerdict, resolveDuplicateAction } from "../features/notifications/lib/duplicate-verdict";

describe("resolveDuplicateAction", () => {
  it("mapea cada veredicto a su accion", () => {
    expect(resolveDuplicateAction("distinct")).toBe("register");
    expect(resolveDuplicateAction("duplicate")).toBe("close-duplicate");
    expect(resolveDuplicateAction("skipped")).toBe("close-duplicate");
    expect(resolveDuplicateAction("unknown")).toBe("needs-review");
  });
});

describe("parseDuplicateVerdict", () => {
  it("acepta respuestas validas", () => {
    expect(parseDuplicateVerdict({ verdict: "distinct", reason: "montos de remitentes distintos" }))
      .toEqual({ verdict: "distinct", reason: "montos de remitentes distintos" });
    expect(parseDuplicateVerdict({ verdict: "skipped" })).toEqual({ verdict: "skipped", reason: null });
  });
  it("cualquier forma invalida cae a unknown", () => {
    expect(parseDuplicateVerdict(null).verdict).toBe("unknown");
    expect(parseDuplicateVerdict({ verdict: "yes" }).verdict).toBe("unknown");
    expect(parseDuplicateVerdict("distinct").verdict).toBe("unknown");
  });
});
