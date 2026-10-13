import { migrate } from "../schema";
import {
  computeAccountBalances, getMovementRecord, listMovementRecords, upsertMirrorRows, upsertMovementRows, type ServerRow,
} from "../movement-store";
import type { SqlDriver } from "../sql-driver";
import { createTestDriver } from "./helpers/node-sqlite-driver";

let db: SqlDriver;
beforeEach(async () => {
  db = createTestDriver();
  await migrate(db);
  await upsertMirrorRows(db, "accounts", [
    { id: 1, workspace_id: 1, name: "Efectivo", currency_code: "PEN", opening_balance: 100, updated_at: "2026-01-01T00:00:00Z" },
    { id: 2, workspace_id: 1, name: "Banco USD", currency_code: "USD", opening_balance: 2168.35, updated_at: "2026-01-01T00:00:00Z" },
  ] as ServerRow[]);
  await upsertMirrorRows(db, "categories", [{ id: 5, workspace_id: 1, name: "Comida", updated_at: "2026-01-01T00:00:00Z" }] as ServerRow[]);
  await upsertMirrorRows(db, "counterparties", [{ id: 9, workspace_id: 1, name: "Juan", updated_at: "2026-01-01T00:00:00Z" }] as ServerRow[]);
});

const base = { workspace_id: 1, status: "posted", notes: null, fx_rate: null, metadata: {}, updated_at: "2026-10-01T00:00:00Z" };
const mov = (row: Partial<ServerRow> & { id: number }): ServerRow =>
  ({ ...base, description: "", movement_type: "expense", occurred_at: "2026-10-01T15:00:00Z", ...row }) as ServerRow;

const seed = () =>
  upsertMovementRows(db, [
    mov({ id: 1, description: "Café Starbucks", source_account_id: 1, source_amount: 12.5, category_id: 5, occurred_at: "2026-10-01T15:00:00Z" }),
    mov({ id: 2, description: "Sueldo", movement_type: "income", destination_account_id: 2, destination_amount: 1000, occurred_at: "2026-10-02T15:00:00Z" }),
    mov({ id: 3, description: "Cambio de moneda", movement_type: "transfer", source_account_id: 1, source_amount: 50, destination_account_id: 2, destination_amount: 13, occurred_at: "2026-10-03T15:00:00Z" }),
    mov({ id: 4, description: "Cena anulada", source_account_id: 1, source_amount: 80, status: "voided", category_id: 5, occurred_at: "2026-10-04T15:00:00Z" }),
    mov({ id: 5, description: "ÁNGEL taxi", source_account_id: 1, source_amount: 20, counterparty_id: 9, occurred_at: "2026-09-15T15:00:00Z" }),
    mov({ id: 6, description: "Reembolso", movement_type: "refund", destination_account_id: 1, destination_amount: 7, category_id: 5, occurred_at: "2026-09-20T15:00:00Z" }),
  ]);

const ids = async (filters: Parameters<typeof listMovementRecords>[2]) =>
  (await listMovementRecords(db, 1, filters, 0, 30)).data.map((record) => record.id);

describe("lista local de movimientos", () => {
  it("ordena por fecha descendente y desempata por id", async () => {
    await seed();
    expect(await ids({})).toEqual([4, 3, 2, 1, 6, 5]);
  });

  it("pagina y avisa si hay más", async () => {
    await seed();
    const first = await listMovementRecords(db, 1, {}, 0, 4);
    expect(first.data.map((r) => r.id)).toEqual([4, 3, 2, 1]);
    expect(first.hasMore).toBe(true);
    expect(first.nextPage).toBe(1);
    const second = await listMovementRecords(db, 1, {}, 1, 4);
    expect(second.data.map((r) => r.id)).toEqual([6, 5]);
    expect(second.hasMore).toBe(false);
  });

  it("trae nombre y moneda de las cuentas (como la lista del servidor)", async () => {
    await seed();
    const transfer = (await listMovementRecords(db, 1, { type: "transfer" }, 0, 30)).data[0];
    expect(transfer).toMatchObject({
      sourceAccountName: "Efectivo", sourceCurrencyCode: "PEN", destinationAccountName: "Banco USD", destinationCurrencyCode: "USD",
      sourceAmount: 50, destinationAmount: 13, category: "", counterparty: "",
    });
  });

  it("el detalle sí trae los nombres de categoría y contraparte", async () => {
    await seed();
    const detail = await getMovementRecord(db, 5);
    expect(detail).toMatchObject({ counterparty: "Juan", category: "" });
    expect((await getMovementRecord(db, 1))?.category).toBe("Comida");
    expect(await getMovementRecord(db, 999)).toBeNull();
  });

  describe("filtros (la misma applyMovementFilters del servidor)", () => {
    beforeEach(seed);
    it("por tipo y por varios tipos", async () => {
      expect(await ids({ type: "income" })).toEqual([2]);
      expect(await ids({ types: ["income", "refund"] })).toEqual([2, 6]);
      expect(await ids({ type: "income", types: ["transfer"] })).toEqual([3]);
    });
    it("por estado", async () => expect(await ids({ status: "voided" })).toEqual([4]));
    it("por cuenta: origen O destino", async () => {
      expect(await ids({ accountId: 2 })).toEqual([3, 2]);
      expect(await ids({ accountId: 1 })).toEqual([4, 3, 1, 6, 5]);
    });
    it("por categoría y sin categoría (solo tipos de flujo)", async () => {
      expect(await ids({ categoryId: 5 })).toEqual([4, 1, 6]);
      expect(await ids({ uncategorized: true })).toEqual([2, 5]);
    });
    it("por rango de fechas (día de Perú: 05:00 UTC a 04:59:59.999 UTC siguiente)", async () => {
      expect(await ids({ dateFrom: "2026-10-02", dateTo: "2026-10-03" })).toEqual([3, 2]);
      expect(await ids({ dateFrom: "2026-10-04" })).toEqual([4]);
      expect(await ids({ dateTo: "2026-09-20" })).toEqual([6, 5]);
    });
    it("por texto: sin mayúsculas, con acentos como Postgres ilike", async () => {
      expect(await ids({ search: "starbucks" })).toEqual([1]);
      expect(await ids({ search: "ángel" })).toEqual([5]);
      expect(await ids({ search: "angel" })).toEqual([]);
    });
    it("por ids concretos", async () => expect(await ids({ movementIds: [1, 6] })).toEqual([1, 6]));
    it("por rango de monto nominal (movement_filter_amount)", async () => {
      expect(await ids({ amountMin: 50 })).toEqual([4, 3, 2]);
      expect(await ids({ amountMin: 10, amountMax: 20 })).toEqual([1, 5]);
      expect(await ids({ amountMax: 8 })).toEqual([6]);
    });
    it("combina varios filtros", async () => {
      expect(await ids({ accountId: 1, status: "posted", amountMin: 10, search: "café" })).toEqual([1]);
    });
  });
});

describe("saldos de cuentas (paridad con v_account_balances)", () => {
  it("apertura + entradas posted menos salidas posted, en centavos exactos", async () => {
    await seed();
    const balances = await computeAccountBalances(db, 1);
    const byId = Object.fromEntries(balances.map((b) => [b.accountId, b]));
    expect(byId[1].currentBalance).toBe(24.5);
    expect(byId[1].totalIn).toBe(7);
    expect(byId[1].totalOut).toBe(82.5);
    expect(byId[2].currentBalance).toBe(3181.35);
  });

  it("evita los errores de coma flotante", async () => {
    await upsertMovementRows(db, [
      mov({ id: 1, source_account_id: 1, source_amount: 0.1 }),
      mov({ id: 2, source_account_id: 1, source_amount: 0.2 }),
    ]);
    const cash = (await computeAccountBalances(db, 1)).find((b) => b.accountId === 1)!;
    expect(cash.totalOut).toBe(0.3);
    expect(cash.currentBalance).toBe(99.7);
  });

  it("un movimiento anulado deja de contar", async () => {
    await seed();
    await upsertMovementRows(db, [mov({ id: 1, description: "Café", source_account_id: 1, source_amount: 12.5, status: "voided" })]);
    const cash = (await computeAccountBalances(db, 1)).find((b) => b.accountId === 1)!;
    expect(cash.currentBalance).toBe(37);
  });
});
