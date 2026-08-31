import { balancesAfterEvents } from "../running-balance";
import type { ObligationEventSummary } from "../../../../types/domain";

const event = (
  id: number,
  eventType: ObligationEventSummary["eventType"],
  amount: number,
  eventDate: string,
): ObligationEventSummary => ({ id, eventType, amount, eventDate });

/**
 * El caso real de la revisión 13: una cuenta corriente con un cliente que empezó en S/ 7,175 y
 * fue creciendo con cada venta. La lista muestra el saldo que quedó tras cada movimiento —"quedan
 * 21,025.00"—, que es lo que enseña la mecánica sin las dos cápsulas de vocabulario interno.
 */
describe("el saldo que quedó después de cada movimiento", () => {
  it("suma lo que aumenta y resta lo que reduce", () => {
    const events = [
      event(1, "opening", 7175, "2026-03-15"),
      event(2, "payment", 330, "2026-03-31"),
      event(3, "principal_increase", 350, "2026-04-06"),
      event(4, "principal_increase", 1200, "2026-04-06"),
      event(5, "discount", 5, "2026-07-19"),
    ];
    const balances = balancesAfterEvents(events);
    expect(balances.get(1)).toBe(7175);
    expect(balances.get(2)).toBe(6845);
    expect(balances.get(3)).toBe(7195);
    expect(balances.get(4)).toBe(8395);
    expect(balances.get(5)).toBe(8390);
  });

  it("no depende del orden en que lleguen los eventos", () => {
    const events = [
      event(2, "payment", 330, "2026-03-31"),
      event(1, "opening", 7175, "2026-03-15"),
    ];
    const balances = balancesAfterEvents(events);
    expect(balances.get(1)).toBe(7175);
    expect(balances.get(2)).toBe(6845);
  });

  it("no pierde céntimos", () => {
    const events = [
      event(1, "opening", 100.1, "2026-01-01"),
      event(2, "payment", 0.05, "2026-01-02"),
      event(3, "payment", 0.05, "2026-01-03"),
    ];
    expect(balancesAfterEvents(events).get(3)).toBe(100);
  });

  it("sin eventos no hay saldos", () => {
    expect(balancesAfterEvents([]).size).toBe(0);
  });
});
