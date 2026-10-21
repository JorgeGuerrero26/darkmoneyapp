import { addDaysYmd, dayRangeUtc, dayStartUtc, resolveTimeZone, todayInZone } from "../time-zone";

describe("resolveTimeZone", () => {
  it("usa la del perfil si es válida y Lima si no", () => {
    expect(resolveTimeZone("Europe/Madrid")).toBe("Europe/Madrid");
    expect(resolveTimeZone("Marte/Base")).toBe("America/Lima");
    expect(resolveTimeZone(null)).toBe("America/Lima");
    expect(resolveTimeZone("  ")).toBe("America/Lima");
  });
});

describe("todayInZone", () => {
  it("a las 9 p. m. de Lima sigue siendo hoy aunque en UTC ya sea mañana", () => {
    const nineFifteenPmLima = new Date("2026-10-22T02:15:00Z");
    expect(todayInZone("America/Lima", nineFifteenPmLima)).toBe("2026-10-21");
    expect(todayInZone("UTC", nineFifteenPmLima)).toBe("2026-10-22");
  });
});

describe("addDaysYmd", () => {
  it("cruza fin de mes y de año", () => {
    expect(addDaysYmd("2026-10-31", 1)).toBe("2026-11-01");
    expect(addDaysYmd("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDaysYmd("2026-03-01", -1)).toBe("2026-02-28");
  });
});

describe("dayStartUtc / dayRangeUtc", () => {
  it("el día en Lima empieza a las 05:00 UTC", () => {
    expect(dayStartUtc("2026-10-01", "America/Lima")).toBe("2026-10-01T05:00:00.000Z");
  });

  it("octubre en Lima incluye la noche del 31 y excluye la del 30 de septiembre", () => {
    const range = dayRangeUtc("2026-10-01", "2026-10-31", "America/Lima");
    expect(range).toEqual({ gte: "2026-10-01T05:00:00.000Z", lt: "2026-11-01T05:00:00.000Z" });
    const nightOfOct31 = "2026-11-01T02:00:00.000Z"; // 9 p. m. del 31 en Lima
    const nightOfSep30 = "2026-10-01T02:00:00.000Z"; // 9 p. m. del 30 de septiembre en Lima
    expect(nightOfOct31 >= range.gte && nightOfOct31 < range.lt).toBe(true);
    expect(nightOfSep30 >= range.gte && nightOfSep30 < range.lt).toBe(false);
  });

  it("respeta el cambio de horario (Madrid pasa de UTC+2 a UTC+1 el 25 de octubre)", () => {
    expect(dayStartUtc("2026-10-25", "Europe/Madrid")).toBe("2026-10-24T22:00:00.000Z");
    expect(dayStartUtc("2026-10-26", "Europe/Madrid")).toBe("2026-10-25T23:00:00.000Z");
  });
});
