import { dayKeyIn, resolveTimeZone } from "../calendar-day";

describe("calendar-day", () => {
  it("el día depende de la zona, no del reloj del teléfono", () => {
    const instant = new Date("2026-10-01T03:30:00.000Z");
    expect(dayKeyIn(instant, "America/Lima")).toBe("2026-09-30");
    expect(dayKeyIn(instant, "UTC")).toBe("2026-10-01");
  });

  it("una zona inválida o vacía cae a Lima", () => {
    expect(resolveTimeZone("Marte/Olympus")).toBe("America/Lima");
    expect(resolveTimeZone("")).toBe("America/Lima");
    expect(resolveTimeZone(null)).toBe("America/Lima");
    expect(resolveTimeZone(" Europe/Madrid ")).toBe("Europe/Madrid");
  });
});
