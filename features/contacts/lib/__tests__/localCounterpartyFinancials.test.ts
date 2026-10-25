import {
  rollupMovementsByCounterparty,
  rollupObligationsByCounterparty,
  withLocalFinancials,
} from "../localCounterpartyFinancials";
import type { CounterpartyOverview } from "../../../../types/domain";

const mv = (overrides: Record<string, unknown>) => ({
  id: 1, workspace_id: 1, status: "posted", movement_type: "expense", counterparty_id: 5,
  occurred_at: "2026-10-20T15:00:00Z", source_amount: "10.00", destination_amount: null, ...overrides,
});

const contact = (overrides: Partial<CounterpartyOverview> = {}): CounterpartyOverview => ({
  id: 5, name: "Sergio", type: "person", isArchived: false, isPinned: false, workspaceId: 1, phone: null, email: null,
  documentNumber: null, notes: null, roles: ["client"], receivableCount: 1, receivablePrincipalTotal: 100,
  receivablePendingTotal: 60, payableCount: 0, payablePrincipalTotal: 0, payablePendingTotal: 0, netPendingAmount: 60,
  movementCount: 2, inflowTotal: 40, outflowTotal: 0, netFlowAmount: 40, lastActivityAt: "2026-10-22T10:00:00Z",
  ...overrides,
} as CounterpartyOverview);

describe("resumen de contactos calculado en el teléfono", () => {
  it("movimientos: como la vista, solo los aplicados cuentan; ingresos y devoluciones entran, gastos y pagos salen", () => {
    const rollup = rollupMovementsByCounterparty([
      mv({ id: 1, movement_type: "income", source_amount: null, destination_amount: "50" }),
      mv({ id: 2, movement_type: "refund", source_amount: "5", destination_amount: null }), // sin destino: usa el origen
      mv({ id: 3, movement_type: "expense", source_amount: "12.10" }),
      mv({ id: 4, movement_type: "obligation_payment", source_amount: "20" }),
      mv({ id: 5, movement_type: "transfer", source_amount: "99" }), // cuenta pero no suma
      mv({ id: 6, status: "voided", source_amount: "1000", occurred_at: "2026-10-30T00:00:00Z" }), // anulado: nada
      mv({ id: 7, counterparty_id: null, source_amount: "7" }), // sin contacto
    ]);
    expect(rollup.get(5)).toEqual({ movementCount: 5, inflowCents: 5500, outflowCents: 3210, lastMovementAt: "2026-10-20T15:00:00Z" });
    expect(rollup.size).toBe(1);
  });

  it("créditos y deudas: suma el total vigente (o el inicial) y el pendiente por dirección", () => {
    const rollup = rollupObligationsByCounterparty([
      { counterpartyId: 5, direction: "receivable", principalAmount: 100, currentPrincipalAmount: 150, pendingAmount: 70, lastPaymentDate: "2026-10-01", events: [] },
      { counterpartyId: 5, direction: "payable", principalAmount: 30, currentPrincipalAmount: null, pendingAmount: 30, lastPaymentDate: null, events: [{ id: 1, eventType: "payment", eventDate: "2026-10-23", amount: 1 }] },
      { counterpartyId: null, direction: "payable", principalAmount: 999, currentPrincipalAmount: 999, pendingAmount: 999, lastPaymentDate: null, events: [] },
    ]);
    expect(rollup.get(5)).toEqual({
      receivableCount: 1, receivablePrincipalCents: 15000, receivablePendingCents: 7000,
      payableCount: 1, payablePrincipalCents: 3000, payablePendingCents: 3000, lastObligationActivityAt: "2026-10-23",
    });
  });

  it("aplica solo las partes recalculadas y deja el resto como estaba", () => {
    const movements = rollupMovementsByCounterparty([mv({ movement_type: "expense", source_amount: "1", occurred_at: "2026-10-24T12:00:00Z" })]);
    const next = withLocalFinancials(contact(), { movements });
    expect(next).toMatchObject({ movementCount: 1, inflowTotal: 0, outflowTotal: 1, netFlowAmount: -1, lastActivityAt: "2026-10-24T12:00:00Z" });
    expect(next).toMatchObject({ receivablePendingTotal: 60, netPendingAmount: 60, roles: ["client"] }); // deudas: intactas
  });

  it("un contacto sin movimientos ni deudas queda en cero en esa parte, y la última actividad nunca retrocede", () => {
    const next = withLocalFinancials(contact(), { movements: new Map(), obligations: new Map() });
    expect(next).toMatchObject({ movementCount: 0, inflowTotal: 0, outflowTotal: 0, receivableCount: 0, receivablePendingTotal: 0, netPendingAmount: 0 });
    expect(next.lastActivityAt).toBe("2026-10-22T10:00:00Z");
  });

  it("un pago registrado sin internet baja lo pendiente del contacto", () => {
    const obligations = rollupObligationsByCounterparty([
      { counterpartyId: 5, direction: "receivable", principalAmount: 100, currentPrincipalAmount: 100, pendingAmount: 59, lastPaymentDate: "2026-10-24", events: [] },
    ]);
    expect(withLocalFinancials(contact(), { obligations })).toMatchObject({ receivablePendingTotal: 59, netPendingAmount: 59 });
  });
});
