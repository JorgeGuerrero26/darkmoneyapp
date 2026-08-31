import { describeObligationEvent, signedNet } from "../describe-event";
import type { ObligationEventSummary } from "../../../../types/domain";

const ev = (
  eventType: ObligationEventSummary["eventType"],
  amount: number,
  description?: string,
  installmentNo?: number,
): ObligationEventSummary => ({
  id: 1, eventType, amount, eventDate: "2026-07-19", description, installmentNo,
});

const options = { sellsOnCredit: true, isReceivable: true };

/**
 * "Reducción de capital · Préstamo canon M50" y "Viper V3 Pro · venta" eran el mismo tipo de
 * dato titulado de dos maneras opuestas. El concepto identifica la fila —es lo que el PDF
 * imprime—, así que va siempre arriba.
 */
describe("el concepto va siempre en el título", () => {
  it("una venta se titula con el producto", () => {
    const d = describeObligationEvent(ev("principal_increase", 650, "Viper V3 Pro"), options);
    expect(d.title).toBe("Viper V3 Pro");
    expect(d.detail).toBe("le debe más");
  });

  it("una reducción también, y el mecanismo baja al subtítulo sin decir \"capital\"", () => {
    const d = describeObligationEvent(ev("principal_decrease", 5, "Canon M50 para viaje"), options);
    expect(d.title).toBe("Canon M50 para viaje");
    expect(d.detail).toBe("le debe menos");
    expect(d.detail).not.toContain("capital");
  });

  it("el pago conserva su etiqueta y su referencia baja al subtítulo", () => {
    const d = describeObligationEvent(ev("payment", 5, "para completar los 690", 7), options);
    expect(d.title).toBe("Pago recibido");
    expect(d.detail).toBe("para completar los 690");
  });

  it("el número de cuota no aparece: no describe nada en una cuenta que paga distinto", () => {
    const d = describeObligationEvent(ev("payment", 690, undefined, 6), options);
    expect(d.detail).toBeNull();
  });

  it("desde el lado del deudor el mecanismo se dice al revés", () => {
    const d = describeObligationEvent(
      ev("principal_increase", 650, "Viper V3 Pro"),
      { sellsOnCredit: false, isReceivable: false },
    );
    expect(d.detail).toBe("debes más");
  });
});

/**
 * El 19 de julio: un pago de S/ 5 y dos reducciones de S/ 5 y S/ 25. Los tres bajan la deuda, y
 * la cabecera decía "+ S/ 35.00" sumando magnitudes.
 */
describe("el signo dice hacia dónde se movió la deuda", () => {
  it("tres movimientos que bajan la deuda suman negativo", () => {
    expect(signedNet([
      ev("payment", 5),
      ev("principal_decrease", 5),
      ev("discount", 25),
    ])).toBe(-35);
  });

  it("una venta suma positivo", () => {
    expect(signedNet([ev("principal_increase", 650)])).toBe(650);
  });

  it("el neto mezcla las dos direcciones", () => {
    expect(signedNet([ev("principal_increase", 650), ev("payment", 690)])).toBe(-40);
  });

  it("sin movimientos el neto es cero", () => {
    expect(signedNet([])).toBe(0);
  });
});
