import { COLORS } from "../../constants/theme";
import { DUE_SOON_DAYS, dueDateColor, dueTone } from "../due-tone";

/**
 * La regla que hace que el amarillo aguante.
 *
 * El amarillo solo advierte de algo que **todavía no pasó pero está cerca**. Lo ya vencido es
 * un hecho, no un aviso, y va en clay. Sin esa línea los dos colores significarían
 * "vencimiento" y volveríamos al problema que hizo retirarlo: un token con varios significados
 * no comunica ninguno.
 *
 * Se prueba porque el umbral vive en UN sitio a propósito: si alguien lo mueve, esto lo dice.
 */
const HOY = new Date("2026-08-28T15:00:00");

const enDias = (d: number) => {
  const date = new Date(HOY);
  date.setDate(date.getDate() + d);
  return date.toISOString();
};

describe("tono de vencimiento", () => {
  it("lo que ya vencio es un HECHO, no un aviso: clay", () => {
    expect(dueTone(enDias(-1), HOY)).toBe("overdue");
    expect(dueTone(enDias(-120), HOY)).toBe("overdue");
    expect(dueDateColor(enDias(-1), HOY)).toBe(COLORS.expense);
  });

  it("lo que vence dentro de la ventana es lo unico amarillo", () => {
    expect(dueTone(enDias(0), HOY)).toBe("soon");
    expect(dueTone(enDias(DUE_SOON_DAYS), HOY)).toBe("soon");
    expect(dueDateColor(enDias(2), HOY)).toBe(COLORS.warning);
  });

  it("un dia despues del umbral ya no advierte de nada", () => {
    expect(dueTone(enDias(DUE_SOON_DAYS + 1), HOY)).toBe("later");
    expect(dueDateColor(enDias(DUE_SOON_DAYS + 1), HOY)).toBe(COLORS.storm);
  });

  it("Vence 31 ene 2027 va en gris, no compite con lo que urge", () => {
    expect(dueDateColor("2027-01-31T00:00:00", HOY)).toBe(COLORS.storm);
  });

  it("lo que vence HOY sigue venciendo hoy aunque sea de noche", () => {
    // Se comparan dias de calendario, no instantes: algo con hora 09:00 no esta "vencido" a
    // las 15:00 del mismo dia.
    expect(dueTone("2026-08-28T09:00:00", HOY)).toBe("soon");
  });

  it("sin fecha no hay nada que anticipar", () => {
    expect(dueTone(null, HOY)).toBe("none");
    expect(dueTone(undefined, HOY)).toBe("none");
    expect(dueDateColor(null, HOY)).toBe(COLORS.storm);
  });

  it("una fecha ilegible no pinta una advertencia falsa", () => {
    expect(dueTone("no-es-fecha", HOY)).toBe("none");
  });

  it("amarillo y clay nunca coinciden: son estados excluyentes", () => {
    expect(COLORS.warning).not.toBe(COLORS.expense);
    for (const d of [-30, -1, 0, 3, 7, 8, 400]) {
      const tone = dueTone(enDias(d), HOY);
      if (d < 0) expect(tone).toBe("overdue");
      else if (d <= DUE_SOON_DAYS) expect(tone).toBe("soon");
      else expect(tone).toBe("later");
    }
  });
});
