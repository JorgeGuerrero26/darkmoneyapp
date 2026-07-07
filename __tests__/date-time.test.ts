import { dateTimeStrToISO, isoToTimeStr, nowTimePeru } from "../lib/date";

describe("dateTimeStrToISO", () => {
  test("combina fecha + hora Perú y convierte a UTC (+5h)", () => {
    // 2026-07-07 14:30 Perú == 19:30 UTC
    expect(dateTimeStrToISO("2026-07-07", "14:30")).toBe("2026-07-07T19:30:00.000Z");
  });

  test("medianoche Perú cae al mismo día 05:00 UTC", () => {
    expect(dateTimeStrToISO("2026-07-07", "00:00")).toBe("2026-07-07T05:00:00.000Z");
  });

  test("hora que cruza medianoche UTC mantiene la fecha Perú correcta", () => {
    // 2026-07-07 20:00 Perú == 2026-07-08 01:00 UTC
    expect(dateTimeStrToISO("2026-07-07", "20:00")).toBe("2026-07-08T01:00:00.000Z");
  });

  test("hora inválida cae al comportamiento previo (no crashea)", () => {
    const result = dateTimeStrToISO("2026-07-07", "99:99");
    expect(result).toMatch(/^2026-07-07T/);
    expect(result.endsWith("Z")).toBe(true);
  });

  test("hora vacía usa la hora actual (dateStrToISO)", () => {
    const result = dateTimeStrToISO("2026-07-07", "");
    expect(result).toMatch(/^2026-07-07T/);
  });
});

describe("isoToTimeStr", () => {
  test("extrae HH:mm en hora Perú de un timestamp UTC", () => {
    expect(isoToTimeStr("2026-07-07T19:30:00.000Z")).toBe("14:30");
  });

  test("round-trip con dateTimeStrToISO", () => {
    const iso = dateTimeStrToISO("2026-07-07", "08:15");
    expect(isoToTimeStr(iso)).toBe("08:15");
  });

  test("solo-fecha sin hora devuelve mediodía por defecto", () => {
    expect(isoToTimeStr("2026-07-07")).toBe("12:00");
  });
});

describe("nowTimePeru", () => {
  test("formato HH:mm válido", () => {
    expect(nowTimePeru()).toMatch(/^([01]\d|2[0-3]):[0-5]\d$/);
  });
});
