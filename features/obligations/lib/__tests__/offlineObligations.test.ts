import type { ObligationSummary } from "../../../../types/domain";
import { buildOfflineObligationSummary, mergePendingObligations } from "../offlineObligations";

const names = new Map<number, string>([[1, "Juan"], [2, "Ana"]]);

const localRow = (extra: Record<string, unknown> = {}) => ({
  id: 10, workspace_id: 1, title: "Préstamo a Juan", direction: "receivable", origin_type: "manual", status: "active",
  counterparty_id: 1, currency_code: "PEN", principal_amount: "150.00", start_date: "2026-10-13", due_date: null,
  installment_amount: null, installment_count: null, interest_rate: null, description: null, notes: null, ...extra,
});

const serverSummary = (extra: Partial<ObligationSummary> = {}): ObligationSummary => ({
  id: 10, workspaceId: 1, title: "Préstamo a Juan", direction: "receivable", originType: "manual", counterparty: "Juan",
  counterpartyId: 1, status: "active", currencyCode: "PEN", principalAmount: 150, pendingAmount: 90, progressPercent: 40,
  startDate: "2026-10-13", dueDate: null, paymentCount: 2, installmentLabel: "", events: [{ id: 1 } as never], ...extra,
});

describe("obligaciones creadas o editadas sin conexión", () => {
  it("una obligación nueva sin eventos nace con pendiente = principal y avance 0", () => {
    const summary = buildOfflineObligationSummary(localRow(), names);
    expect(summary).toMatchObject({
      id: 10, title: "Préstamo a Juan", counterparty: "Juan", principalAmount: 150, pendingAmount: 150,
      progressPercent: 0, paymentCount: 0, events: [], status: "active", currencyCode: "PEN",
    });
  });

  it("agrega las nuevas con operaciones pendientes y deja intactas las del servidor", () => {
    const other = serverSummary({ id: 7, title: "Otra" });
    const merged = mergePendingObligations([other], [localRow()], new Set([10]), names);
    expect(merged.map((item) => item.id)).toEqual([7, 10]);
    expect(merged[0]).toBe(other);
  });

  it("una obligación ya enviada (sin pendientes) no se vuelve a sintetizar ni a pisar", () => {
    const known = serverSummary();
    expect(mergePendingObligations([known], [localRow({ title: "Distinto" })], new Set(), names)).toEqual([known]);
  });

  it("una edición pendiente cambia la definición pero conserva lo que calcula el servidor", () => {
    const merged = mergePendingObligations(
      [serverSummary()],
      [localRow({ title: "Préstamo a Ana", counterparty_id: 2, due_date: "2026-12-31", status: "cancelled", notes: "nota" })],
      new Set([10]),
      names,
    );
    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({
      title: "Préstamo a Ana", counterparty: "Ana", counterpartyId: 2, dueDate: "2026-12-31", status: "cancelled", notes: "nota",
      pendingAmount: 90, progressPercent: 40, paymentCount: 2,
    });
    expect(merged[0].events).toHaveLength(1);
  });

  it("si el nombre del contacto aún no se conoce conserva el que ya mostraba", () => {
    const merged = mergePendingObligations([serverSummary()], [localRow({ counterparty_id: 99 })], new Set([10]), names);
    expect(merged[0].counterparty).toBe("Juan");
    expect(merged[0].counterpartyId).toBe(99);
  });
});

describe("obligación creada y eliminada sin enviar", () => {
  const row = (id: number) => ({ ...localRow(), id });

  it("sale de la lista: tiene operaciones pendientes pero ya no existe en la copia local", () => {
    const created = buildOfflineObligationSummary(row(10), names); // la que el cache mostraba como nueva
    const merged = mergePendingObligations([created, serverSummary({ id: 7 })], [], new Set([10]), names);
    expect(merged.map((item) => item.id)).toEqual([7]);
  });

  it("las demás, con o sin cambios pendientes, se quedan", () => {
    const merged = mergePendingObligations([serverSummary({ id: 7 }), serverSummary({ id: 8 })], [row(8)], new Set([8, 10]), names);
    expect(merged.map((item) => item.id).sort()).toEqual([7, 8]);
  });
});
