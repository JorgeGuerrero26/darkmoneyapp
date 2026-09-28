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
