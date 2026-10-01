import { buildMovementDatePresets } from "../date-presets";

describe("rangos de Movimientos en hora de Perú", () => {
  it("mantiene septiembre mientras todavía es septiembre en Perú", () => {
    const presets = buildMovementDatePresets(new Date("2026-10-01T03:30:00.000Z"));
    expect(presets[0]).toEqual({ label: "Este mes", from: "2026-09-01", to: "2026-09-30" });
    expect(presets[4]).toEqual({ label: "Este año", from: "2026-01-01", to: "2026-09-30" });
  });

  it("cambia a octubre al llegar la medianoche de Perú", () => {
    const presets = buildMovementDatePresets(new Date("2026-10-01T05:00:00.000Z"));
    expect(presets[0]).toEqual({ label: "Este mes", from: "2026-10-01", to: "2026-10-31" });
    expect(presets[1]).toEqual({ label: "Mes anterior", from: "2026-09-01", to: "2026-09-30" });
    expect(presets[2]).toEqual({ label: "Últimos 3 meses", from: "2026-08-01", to: "2026-10-31" });
  });
});

describe("rangos en la zona del perfil", () => {
  it("usa la zona que se le pasa, no la del teléfono", () => {
    // 2026-10-01 02:00 UTC: en Lima todavía es 30 de septiembre; en Madrid ya es 1 de octubre.
    const instant = new Date("2026-10-01T02:00:00.000Z");
    expect(buildMovementDatePresets(instant, "America/Lima")[0].from).toBe("2026-09-01");
    expect(buildMovementDatePresets(instant, "Europe/Madrid")[0].from).toBe("2026-10-01");
  });

  it("cruza de año en «Mes anterior» y «Últimos 6 meses»", () => {
    const presets = buildMovementDatePresets(new Date("2027-01-15T15:00:00.000Z"), "America/Lima");
    expect(presets[1]).toEqual({ label: "Mes anterior", from: "2026-12-01", to: "2026-12-31" });
    expect(presets[3]).toEqual({ label: "Últimos 6 meses", from: "2026-08-01", to: "2027-01-31" });
    expect(presets[4]).toEqual({ label: "Este año", from: "2027-01-01", to: "2027-01-31" });
  });
});
