import {
  dateShortcuts,
  dateTimeLabel,
  monthGrid,
  monthTitle,
  relativeDateLabel,
} from "../calendar";

describe("monthGrid", () => {
  it("setiembre 2026 arranca en martes, con dos huecos delante", () => {
    const weeks = monthGrid(2026, 8);
    expect(weeks[0]).toEqual([null, null, 1, 2, 3, 4, 5]);
    expect(weeks[1]).toEqual([6, 7, 8, 9, 10, 11, 12]);
  });

  it("termina el mes y rellena la ultima semana con huecos", () => {
    const weeks = monthGrid(2026, 8); // 30 dias
    const last = weeks[weeks.length - 1];
    expect(last).toContain(30);
    expect(last[last.length - 1]).toBeNull();
  });

  it("todas las semanas tienen siete casillas", () => {
    for (const month of [0, 1, 5, 11]) {
      for (const week of monthGrid(2026, month)) expect(week).toHaveLength(7);
    }
  });

  it("febrero bisiesto llega al 29", () => {
    const days = monthGrid(2028, 1).flat().filter((day) => day !== null);
    expect(days[days.length - 1]).toBe(29);
  });
});

describe("monthTitle", () => {
  it("solo la inicial en mayuscula: no es title case ingles", () => {
    expect(monthTitle(2026, 8)).toBe("Septiembre 2026");
  });
});

describe("relativeDateLabel", () => {
  const today = "2026-09-01";

  it("hoy, ayer y anteayer se dicen con palabras", () => {
    expect(relativeDateLabel("2026-09-01", today)).toBe("Hoy");
    expect(relativeDateLabel("2026-08-31", today)).toBe("Ayer");
    expect(relativeDateLabel("2026-08-30", today)).toBe("Anteayer");
  });

  it("manana tambien, que un movimiento puede fecharse adelante", () => {
    expect(relativeDateLabel("2026-09-02", today)).toBe("Mañana");
  });

  it("mas atras, formato corto sin ano si es el mismo", () => {
    expect(relativeDateLabel("2026-08-29", today)).toBe("29 ago");
  });

  it("otro ano si lo lleva", () => {
    expect(relativeDateLabel("2025-12-24", today)).toBe("24 dic 2025");
  });
});

describe("dateTimeLabel", () => {
  it("junta los dos datos en una linea", () => {
    expect(dateTimeLabel("2026-09-01", "16:07", "2026-09-01")).toBe("Hoy, 16:07");
    expect(dateTimeLabel("2026-08-29", "09:30", "2026-09-01")).toBe("29 ago, 09:30");
  });

  it("sin hora, solo la fecha", () => {
    expect(dateTimeLabel("2026-09-01", null, "2026-09-01")).toBe("Hoy");
  });
});

describe("dateShortcuts", () => {
  it("hoy, ayer y anteayer con su fecha resuelta", () => {
    expect(dateShortcuts("2026-09-01")).toEqual([
      { label: "Hoy", date: "2026-09-01" },
      { label: "Ayer", date: "2026-08-31" },
      { label: "Anteayer", date: "2026-08-30" },
    ]);
  });

  it("cruza el cambio de mes hacia atras", () => {
    expect(dateShortcuts("2026-09-01")[2].date).toBe("2026-08-30");
    expect(dateShortcuts("2026-01-01")[1].date).toBe("2025-12-31");
  });
});
