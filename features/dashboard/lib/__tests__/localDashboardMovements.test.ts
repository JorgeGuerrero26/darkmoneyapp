import { localDashboardMovements, selectLocalDashboardRows, toDashboardDayRow } from "../localDashboardMovements";

const row = (id: number, occurredAt: string, extra: Record<string, unknown> = {}) => ({
  id,
  workspace_id: 1,
  movement_type: "expense",
  status: "posted",
  occurred_at: occurredAt,
  source_amount: 10,
  destination_amount: null,
  source_account_id: 2,
  destination_account_id: null,
  category_id: 3,
  spend_type_id: null,
  counterparty_id: null,
  description: "Gasto",
  ...extra,
});

describe("movimientos del inicio desde la copia del teléfono", () => {
  it("mismo rango que el servidor: desde incluido, hasta excluido", () => {
    const rows = [
      row(1, "2026-09-30T23:59:59.000Z"),
      row(2, "2026-10-01T00:00:00.000Z"),
      row(3, "2026-10-31T23:59:59.000Z"),
      row(4, "2026-11-01T00:00:00.000Z"),
    ];
    const ids = selectLocalDashboardRows(rows, { from: "2026-10-01T00:00:00.000Z", until: "2026-11-01T00:00:00.000Z" }).map((r) => r.id);
    expect(ids).toEqual([3, 2]);
  });

  it("ordena por fecha real aunque las horas vengan con zonas distintas, y a igual fecha el id mayor primero", () => {
    const rows = [
      row(10, "2026-10-23T06:00:00-05:00"), // 11:00Z
      row(11, "2026-10-23T10:30:00+00:00"),
      row(12, "2026-10-23T11:00:00.000Z"),
    ];
    expect(selectLocalDashboardRows(rows, { from: "2026-10-01T00:00:00Z" }).map((r) => r.id)).toEqual([12, 10, 11]);
  });

  it("como el servidor, la vista de 90 días trae también pendientes y anulados; el detalle del día solo los aplicados", () => {
    const rows = [row(1, "2026-10-23T12:00:00Z"), row(2, "2026-10-23T13:00:00Z", { status: "voided" })];
    expect(selectLocalDashboardRows(rows, { from: "2026-10-01T00:00:00Z" })).toHaveLength(2);
    expect(selectLocalDashboardRows(rows, { from: "2026-10-01T00:00:00Z", postedOnly: true }).map((r) => r.id)).toEqual([1]);
  });

  it("incluye lo guardado sin internet que aún no se envía (está en la copia local)", () => {
    const rows = [row(1640, "2026-10-23T11:52:30Z", { source_amount: "1.50", description: "VENDOMATICA" })];
    expect(localDashboardMovements(rows, { from: "2026-10-01T00:00:00Z" })).toEqual([
      {
        id: 1640,
        movementType: "expense",
        status: "posted",
        occurredAt: "2026-10-23T11:52:30Z",
        sourceAmount: 1.5,
        destinationAmount: 0,
        sourceAccountId: 2,
        destinationAccountId: null,
        categoryId: 3,
        spendTypeId: null,
        counterpartyId: null,
        description: "VENDOMATICA",
      },
    ]);
  });

  it("montos: el inicio usa 0 si falta y el detalle del día null, igual que sus consultas del servidor", () => {
    const transfer = row(5, "2026-10-23T12:00:00Z", { movement_type: "transfer", source_amount: 20, destination_amount: "5.25", destination_account_id: 7 });
    expect(localDashboardMovements([row(6, "2026-10-23T12:00:00Z")], { from: "2026-10-01T00:00:00Z" })[0].destinationAmount).toBe(0);
    expect(toDashboardDayRow(row(6, "2026-10-23T12:00:00Z")).destinationAmount).toBeNull();
    expect(toDashboardDayRow(transfer)).toMatchObject({ sourceAmount: 20, destinationAmount: 5.25, destinationAccountId: 7 });
  });

  it("descarta filas con fecha ilegible en vez de romper el inicio", () => {
    expect(selectLocalDashboardRows([row(1, "no-es-fecha"), row(2, "2026-10-23T12:00:00Z")], { from: "2026-10-01T00:00:00Z" }).map((r) => r.id)).toEqual([2]);
  });
});
