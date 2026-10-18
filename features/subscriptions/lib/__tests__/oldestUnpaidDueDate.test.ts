import { oldestUnpaidDueDate } from "../oldestUnpaidDueDate";

const occ = (dueDate: string, status: string) => ({ dueDate, status });

describe("qué cobro propone la hoja de pago", () => {
  it("el primer mes sin pagar, aunque la suscripción diga una fecha posterior", () => {
    const occurrences = [occ("2026-08-04", "skipped"), occ("2026-09-04", "scheduled"), occ("2026-10-04", "scheduled")];
    expect(oldestUnpaidDueDate("2026-10-04", occurrences)).toBe("2026-09-04");
  });
  it("sin historial cargado, o sin pendientes, usa la fecha guardada", () => {
    expect(oldestUnpaidDueDate("2026-10-04", undefined)).toBe("2026-10-04");
    expect(oldestUnpaidDueDate("2026-10-04", [])).toBe("2026-10-04");
    expect(oldestUnpaidDueDate("2026-10-04", [occ("2026-09-04", "paid")])).toBe("2026-10-04");
  });
  it("nunca propone una fecha posterior a la guardada", () => {
    expect(oldestUnpaidDueDate("2026-09-04", [occ("2026-10-04", "scheduled")])).toBe("2026-09-04");
  });
});

import { defaultPaymentDate } from "../oldestUnpaidDueDate";

describe("fecha que lleva el movimiento del pago", () => {
  it("un cobro vencido se anota con la fecha de hoy", () => {
    expect(defaultPaymentDate("2026-09-04", "2026-10-17")).toBe("2026-10-17");
  });
  it("un cobro que aún no vence (o vence hoy) conserva su fecha", () => {
    expect(defaultPaymentDate("2026-10-20", "2026-10-17")).toBe("2026-10-20");
    expect(defaultPaymentDate("2026-10-17", "2026-10-17")).toBe("2026-10-17");
  });
});
