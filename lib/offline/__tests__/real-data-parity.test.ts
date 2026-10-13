/**
 * Paridad con datos REALES del servidor. Las copias viven en .tmp/offline-fixtures (ignorada por
 * git: son datos financieros reales); si no están, la suite se omite — en CI no corre.
 * Se generan con .tmp/offline-fixtures/m3.mjs (solo lectura contra la base).
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { filterDateFrom, filterDateTo } from "../../date";
import type { MovementFilters } from "../../../features/movements/lib/filters";
import { computeAccountBalances, listMovementRecords, upsertMirrorRows, upsertMovementRows, type ServerRow } from "../movement-store";
import { migrate } from "../schema";
import { createTestDriver } from "./helpers/node-sqlite-driver";

const dir = join(process.cwd(), ".tmp", "offline-fixtures");
const available = ["t_movements.json", "t_accounts.json", "v_account_balances.json"].every((f) => existsSync(join(dir, f)));
const load = <T>(name: string): T => JSON.parse(readFileSync(join(dir, name), "utf8")) as T;

(available ? describe : describe.skip)("paridad con datos reales del servidor", () => {
  const movements = available ? load<ServerRow[]>("t_movements.json") : [];
  const accounts = available ? load<ServerRow[]>("t_accounts.json") : [];
  const serverBalances = available ? load<Array<Record<string, string>>>("v_account_balances.json") : [];

  const setup = async () => {
    const db = createTestDriver();
    await migrate(db);
    await upsertMirrorRows(db, "accounts", accounts);
    await upsertMovementRows(db, movements);
    return db;
  };

  it("los saldos locales coinciden con v_account_balances en cada cuenta", async () => {
    const db = await setup();
    const local = await computeAccountBalances(db, 1);
    expect(local.length).toBe(serverBalances.length);
    for (const row of serverBalances) {
      const mine = local.find((b) => b.accountId === Number(row.account_id));
      expect(mine).toBeDefined();
      expect(mine!.currentBalance).toBeCloseTo(Number(row.current_balance), 2);
      expect(mine!.totalIn).toBeCloseTo(Number(row.total_in), 2);
      expect(mine!.totalOut).toBeCloseTo(Number(row.total_out), 2);
    }
  });

  // Implementación independiente de las reglas documentadas de applyMovementFilters.
  const nominal = (m: ServerRow) => {
    const src = m.source_amount == null ? null : Number(m.source_amount);
    const dst = m.destination_amount == null ? null : Number(m.destination_amount);
    const type = m.movement_type as string;
    const useDestination =
      type === "income" || type === "refund" ||
      (!["expense", "subscription_payment", "transfer"].includes(type) && (dst ?? 0) > (src ?? 0));
    return Math.abs(useDestination ? (dst ?? src ?? 0) : (src ?? dst ?? 0));
  };
  const reference = (f: MovementFilters) =>
    movements
      .filter((m) => {
        if (f.types?.length ? !f.types.includes(m.movement_type as never) : f.type ? m.movement_type !== f.type : false) return false;
        if (f.status && m.status !== f.status) return false;
        const at = new Date(m.occurred_at as string).getTime();
        if (f.dateFrom && at < new Date(filterDateFrom(f.dateFrom)).getTime()) return false;
        if (f.dateTo && at > new Date(filterDateTo(f.dateTo)).getTime()) return false;
        if (f.accountId && m.source_account_id != f.accountId && m.destination_account_id != f.accountId) return false;
        if (f.uncategorized) {
          if (m.category_id != null) return false;
          if (!["income", "refund", "expense", "subscription_payment", "obligation_payment"].includes(m.movement_type as string)) return false;
        } else if (f.categoryId && m.category_id != f.categoryId) return false;
        if (f.search && !String(m.description).toLowerCase().includes(f.search.toLowerCase())) return false;
        if (f.amountMin != null && nominal(m) < f.amountMin) return false;
        if (f.amountMax != null && nominal(m) > f.amountMax) return false;
        return true;
      })
      .map((m) => Number(m.id))
      .sort((a, b) => b - a);

  const cases: Array<[string, MovementFilters]> = [
    ["sin filtros", {}],
    ["solo gastos", { type: "expense" }],
    ["ingresos y reembolsos", { types: ["income", "refund"] }],
    ["transferencias", { type: "transfer" }],
    ["anulados", { status: "voided" }],
    ["un mes", { dateFrom: "2026-09-01", dateTo: "2026-09-30" }],
    ["sin categoría", { uncategorized: true }],
    ["montos entre 20 y 100", { amountMin: 20, amountMax: 100 }],
    ["texto 'a'", { search: "a" }],
    ["gastos grandes de septiembre", { type: "expense", dateFrom: "2026-09-01", dateTo: "2026-09-30", amountMin: 50 }],
  ];

  it.each(cases)("filtro «%s»: mismas filas que la regla de referencia", async (_name, filters) => {
    const db = await setup();
    const got = (await listMovementRecords(db, 1, filters, 0, 5000)).data.map((m) => m.id);
    // Mismo conjunto; el orden real es por fecha y se comprueba aparte.
    expect([...got].sort((a, b) => b - a)).toEqual(reference(filters));
  });

  it("filtra por cada cuenta y por cada categoría real", async () => {
    const db = await setup();
    for (const account of accounts) {
      const got = (await listMovementRecords(db, 1, { accountId: Number(account.id) }, 0, 5000)).data.map((m) => m.id);
      expect([...got].sort((a, b) => b - a)).toEqual(reference({ accountId: Number(account.id) }));
    }
    const categoryIds = [...new Set(movements.map((m) => m.category_id).filter((id) => id != null))].slice(0, 12);
    for (const categoryId of categoryIds) {
      const got = (await listMovementRecords(db, 1, { categoryId: Number(categoryId) }, 0, 5000)).data.map((m) => m.id);
      expect([...got].sort((a, b) => b - a)).toEqual(reference({ categoryId: Number(categoryId) }));
    }
  });

  it("el orden es el del servidor: fecha descendente y, a igual fecha, id descendente", async () => {
    const db = await setup();
    const got = (await listMovementRecords(db, 1, {}, 0, 5000)).data;
    const expected = [...movements]
      .sort((a, b) => new Date(b.occurred_at as string).getTime() - new Date(a.occurred_at as string).getTime() || Number(b.id) - Number(a.id))
      .map((m) => Number(m.id));
    expect(got.map((m) => m.id)).toEqual(expected);
  });
});
