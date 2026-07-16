import { rollDueDateForward } from "../lib/subscription-helpers";

const TODAY = "2026-07-16";

describe("rollDueDateForward", () => {
  it("rueda una mensual vencida varios períodos hasta la primera fecha >= hoy", () => {
    // Pausada desde mayo: 12 may → 12 jun → 12 jul → 12 ago (primera >= 16 jul)
    expect(rollDueDateForward("2026-05-12", "monthly", 1, TODAY)).toBe("2026-08-12");
  });

  it("respeta una fecha que ya es hoy o futura", () => {
    expect(rollDueDateForward(TODAY, "monthly", 1, TODAY)).toBe(TODAY);
    expect(rollDueDateForward("2026-09-01", "monthly", 1, TODAY)).toBe("2026-09-01");
  });

  it("cadencia custom usa días con intervalCount", () => {
    // Cada 45 días desde 1 jun: 16 jul (== hoy, se queda ahí)
    expect(rollDueDateForward("2026-06-01", "custom", 45, TODAY)).toBe("2026-07-16");
  });

  it("anual y semanal ruedan según su unidad", () => {
    expect(rollDueDateForward("2025-03-10", "yearly", 1, TODAY)).toBe("2027-03-10");
    expect(rollDueDateForward("2026-07-10", "weekly", 1, TODAY)).toBe("2026-07-17");
  });

  it("no se cuelga con intervalos inválidos (tope defensivo)", () => {
    const result = rollDueDateForward("2020-01-01", "custom", 0, TODAY);
    expect(result >= TODAY).toBe(true);
  });
});
