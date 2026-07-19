import {
  buildObligationReport,
  buildObligationReportFolio,
  computeObligationReportRows,
} from "../obligationReport";
import type { ObligationEventSummary, ObligationSummary } from "../../../../types/domain";

function event(partial: Partial<ObligationEventSummary> & { id: number }): ObligationEventSummary {
  return {
    eventType: "payment",
    eventDate: "2026-07-01",
    amount: 0,
    ...partial,
  } as ObligationEventSummary;
}

const baseObligation = {
  id: 7,
  workspaceId: 1,
  title: "Préstamo a Juan <script>",
  direction: "receivable",
  originType: "cash_loan",
  counterparty: "Juan Pérez",
  counterpartyId: 3,
  status: "active",
  currencyCode: "PEN",
  principalAmount: 1000,
  pendingAmount: 730,
  progressPercent: 27,
  startDate: "2026-06-01",
  dueDate: "2026-12-01",
  installmentLabel: "6 cuotas de S/ 200",
  paymentCount: 1,
  events: [],
} as unknown as ObligationSummary;

describe("computeObligationReportRows", () => {
  it("saldo corrido espejea la fórmula de v_obligation_summary", () => {
    const rows = computeObligationReportRows(
      [
        event({ id: 1, eventType: "opening", eventDate: "2026-06-01", amount: 1000 }),
        event({ id: 2, eventType: "principal_increase", eventDate: "2026-06-10", amount: 200 }),
        event({ id: 3, eventType: "interest", eventDate: "2026-06-15", amount: 50 }),
        event({ id: 4, eventType: "payment", eventDate: "2026-06-20", amount: 400 }),
        event({ id: 5, eventType: "adjustment", eventDate: "2026-06-25", amount: -70 }),
        event({ id: 6, eventType: "discount", eventDate: "2026-07-01", amount: 50 }),
      ],
      1000,
    );

    expect(rows.map((r) => r.balance)).toEqual([1000, 1200, 1250, 850, 780, 730]);
    // adjustment negativo se muestra como abono
    expect(rows[4].credit).toBe(70);
    expect(rows[4].charge).toBeNull();
    // pago va en la columna abono
    expect(rows[3].credit).toBe(400);
  });

  it("sin evento de apertura arranca del principal y ordena por fecha", () => {
    const rows = computeObligationReportRows(
      [
        event({ id: 2, eventType: "payment", eventDate: "2026-06-20", amount: 100 }),
        event({ id: 1, eventType: "payment", eventDate: "2026-06-10", amount: 300 }),
      ],
      500,
    );
    expect(rows.map((r) => r.balance)).toEqual([200, 100]);
  });
});

describe("buildObligationReport", () => {
  const generatedAt = new Date(2026, 6, 19, 15, 30);

  it("genera folio determinista, escapa HTML y arma el mensaje con saldo", () => {
    const report = buildObligationReport({
      obligation: baseObligation,
      events: [event({ id: 1, eventType: "opening", eventDate: "2026-06-01", amount: 1000 })],
      ownerName: "Adrian Guerrero",
      generatedAt,
    });

    expect(report.folio).toBe(buildObligationReportFolio(7, generatedAt));
    expect(report.folio).toBe("DM-7-20260719-1530");
    // título con caracteres peligrosos queda escapado en el HTML
    expect(report.html).not.toContain("<script>");
    expect(report.html).toContain("&lt;script&gt;");
    // partes según dirección receivable: owner acreedor, contraparte deudor
    expect(report.html).toMatch(/Acreedor[\s\S]*Adrian Guerrero/);
    expect(report.html).toMatch(/Deudor[\s\S]*Juan Pérez/);
    expect(report.message).toContain("Juan Pérez");
    expect(report.message).toContain("crédito");
    expect(report.message).toContain(report.folio);
    expect(report.fileName.endsWith(".pdf")).toBe(true);
  });
});
