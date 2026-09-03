import { subscriptionStanding } from "../subscriptionStanding";
import type { SubscriptionSummary } from "../../../../types/domain";

const money = (amount: number) => `S/ ${amount.toFixed(2)}`;
const day = (ymd: string) => ymd.slice(8) + " " + ymd.slice(5, 7);

function build(overrides: Partial<SubscriptionSummary> = {}): SubscriptionSummary {
  return {
    id: 1,
    workspaceId: 1,
    name: "Yt Premium",
    vendor: "",
    status: "active",
    amount: 60.07,
    currencyCode: "PEN",
    frequency: "monthly",
    frequencyLabel: "Mensual",
    intervalCount: 1,
    startDate: "2026-01-04",
    nextDueDate: "2026-06-04",
    remindDaysBefore: 3,
    autoCreateMovement: false,
    isPinned: false,
    ...overrides,
  };
}

function standing(subscription: SubscriptionSummary, today: string) {
  return subscriptionStanding({ subscription, today, formatAmount: money, formatDate: day });
}

describe("subscriptionStanding", () => {
  it("el caso que lo motivo: tres meses sin anotar", () => {
    const result = standing(build(), "2026-09-02");
    expect(result.tone).toBe("overdue");
    expect(result.label).toBe("Atrasada");
    expect(result.missedCharges).toBe(3); // 4 jun, 4 jul, 4 ago
    expect(result.missedAmount).toBeCloseTo(180.21, 2);
    expect(result.detail).toContain("hace 90 días");
    expect(result.detail).toContain("Van 3 cobros sin anotar, S/ 180.21");
  });

  it("el cobro de manana todavia no cuenta como perdido", () => {
    const result = standing(build({ nextDueDate: "2026-09-03" }), "2026-09-02");
    expect(result.tone).toBe("soon");
    expect(result.missedCharges).toBe(0);
    expect(result.detail).toContain("en 1 día");
  });

  it("el dia del cobro no es atraso todavia", () => {
    const result = standing(build({ nextDueDate: "2026-09-02" }), "2026-09-02");
    // El dia del cobro no es un atraso todavia: toca hoy.
    expect(result.tone).toBe("soon");
    expect(result.label).toBe("Se cobra hoy");
    expect(result.missedCharges).toBe(0);
  });

  it("un solo cobro vencido se dice en singular", () => {
    const result = standing(build({ nextDueDate: "2026-08-30" }), "2026-09-02");
    expect(result.missedCharges).toBe(1);
    expect(result.detail).toContain("Va 1 cobro sin anotar");
    expect(result.detail).toContain("hace 3 días");
  });

  it("semanal atrasada un mes cuenta las semanas, no los meses", () => {
    const result = standing(
      build({ frequency: "weekly", nextDueDate: "2026-08-05", amount: 10 }),
      "2026-09-02",
    );
    expect(result.missedCharges).toBe(5); // 5, 12, 19, 26 ago y 2 sep
    expect(result.missedAmount).toBeCloseTo(50, 2);
  });

  it("el umbral de 'por cobrar' es el de toda la app, no uno propio", () => {
    expect(standing(build({ nextDueDate: "2026-09-09" }), "2026-09-02").label).toBe("Por cobrar");
    expect(standing(build({ nextDueDate: "2026-09-10" }), "2026-09-02").label).toBe("Al día");
  });

  it("pausada y cancelada no acumulan atraso aunque la fecha haya pasado", () => {
    const paused = standing(build({ status: "paused" }), "2026-09-02");
    expect(paused.tone).toBe("paused");
    expect(paused.missedCharges).toBe(0);

    const cancelled = standing(build({ status: "cancelled" }), "2026-09-02");
    expect(cancelled.tone).toBe("cancelled");
    expect(cancelled.missedCharges).toBe(0);
  });

  it("anual atrasada dos años cuenta dos cobros", () => {
    const result = standing(
      build({ frequency: "yearly", nextDueDate: "2024-06-04", amount: 300 }),
      "2026-09-02",
    );
    expect(result.missedCharges).toBe(3); // 2024, 2025 y 2026
    expect(result.missedAmount).toBeCloseTo(900, 2);
  });

  describe("con el historial real (fase 1)", () => {
    it("suma lo que costaba cada mes, no el precio de hoy tres veces", () => {
      // Netflix subio de 44.90 a 60.07: el historial no se reescribe hacia atras.
      const result = subscriptionStanding({
        subscription: build({ amount: 60.07 }),
        today: "2026-09-02",
        formatAmount: money,
        formatDate: day,
        occurrences: [
          { dueDate: "2026-06-04", status: "scheduled", expectedAmount: 44.9 },
          { dueDate: "2026-07-04", status: "scheduled", expectedAmount: 44.9 },
          { dueDate: "2026-08-04", status: "scheduled", expectedAmount: 60.07 },
          { dueDate: "2026-09-04", status: "scheduled", expectedAmount: 60.07 },
        ],
      });
      expect(result.missedCharges).toBe(3); // el de setiembre todavia no vence
      expect(result.missedAmount).toBeCloseTo(149.87, 2);
      expect(result.detail).toContain("S/ 149.87");
    });

    it("un mes saltado no es deuda", () => {
      const result = subscriptionStanding({
        subscription: build(),
        today: "2026-09-02",
        formatAmount: money,
        formatDate: day,
        occurrences: [
          { dueDate: "2026-06-04", status: "skipped", expectedAmount: 60.07 },
          { dueDate: "2026-07-04", status: "paid", expectedAmount: 60.07 },
          { dueDate: "2026-08-04", status: "scheduled", expectedAmount: 60.07 },
        ],
      });
      expect(result.missedCharges).toBe(1);
      expect(result.missedAmount).toBeCloseTo(60.07, 2);
    });

    it("si el historial dice que no debe nada, no esta atrasada aunque el puntero se quedara atras", () => {
      const result = subscriptionStanding({
        subscription: build(),
        today: "2026-09-02",
        formatAmount: money,
        formatDate: day,
        occurrences: [
          { dueDate: "2026-06-04", status: "paid", expectedAmount: 60.07 },
          { dueDate: "2026-07-04", status: "paid", expectedAmount: 60.07 },
          { dueDate: "2026-08-04", status: "paid", expectedAmount: 60.07 },
        ],
      });
      expect(result.tone).toBe("later");
      expect(result.missedCharges).toBe(0);
    });
  });

  it("no se cuelga con una cadencia diaria abandonada", () => {
    const result = standing(
      build({ frequency: "daily", intervalCount: 1, nextDueDate: "2020-01-01", amount: 1 }),
      "2026-09-02",
    );
    expect(result.missedCharges).toBe(400); // tope duro
  });
});
