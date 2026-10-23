/**
 * Paridad del INICIO con datos reales: los movimientos que el inicio lee de la copia del teléfono deben ser exactamente
 * los que devuelven sus consultas del servidor (90 días, año y detalle de un día), en el mismo orden.
 * La copia vive en .tmp/offline-fixtures/dashboard-parity.json (ignorada por git: datos financieros reales); si no
 * está, la suite se omite — en CI no corre. Se genera con .tmp/offline-fixtures/dashboard-parity.mjs (solo lectura).
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { localDashboardMovements, selectLocalDashboardRows } from "../../../features/dashboard/lib/localDashboardMovements";
import { upsertMovementRows, type ServerRow } from "../movement-store";
import { listRowsLocal } from "../resource-store";
import { migrate } from "../schema";
import { createTestDriver } from "./helpers/node-sqlite-driver";

const file = join(process.cwd(), ".tmp", "offline-fixtures", "dashboard-parity.json");
const available = existsSync(file);

type Fixture = {
  since: string; yFrom: string; yTo: string; dFrom: string; dTo: string;
  rows: ServerRow[];
  server90: number[]; serverYear: number[]; serverDay: number[];
  sum90: string;
};

(available ? describe : describe.skip)("inicio sin conexión: paridad con datos reales", () => {
  const fixture = available ? (JSON.parse(readFileSync(file, "utf8")) as Fixture) : null;

  // Pasa por la base local de verdad (escritura del espejo y lectura de `listRows`), no por el JSON directo.
  const localRows = async () => {
    const db = createTestDriver();
    await migrate(db);
    await upsertMovementRows(db, fixture!.rows);
    return listRowsLocal(db, "movements", 1, "usuario");
  };

  it("últimos 90 días: mismos movimientos, mismo orden y mismo gasto total", async () => {
    const rows = await localRows();
    const local = localDashboardMovements(rows, { from: fixture!.since });
    expect(local.map((m) => m.id)).toEqual(fixture!.server90);
    const spent = local.filter((m) => m.movementType === "expense" && m.status === "posted").reduce((sum, m) => sum + Math.round(m.sourceAmount * 100), 0);
    expect(spent).toBe(Math.round(Number(fixture!.sum90) * 100));
  });

  it("historial anual: mismos movimientos y orden", async () => {
    const rows = await localRows();
    expect(selectLocalDashboardRows(rows, { from: fixture!.yFrom, until: fixture!.yTo }).map((r) => Number(r.id))).toEqual(fixture!.serverYear);
  });

  it("detalle de un día: solo aplicados, mismos movimientos y orden", async () => {
    const rows = await localRows();
    expect(selectLocalDashboardRows(rows, { from: fixture!.dFrom, until: fixture!.dTo, postedOnly: true }).map((r) => Number(r.id))).toEqual(fixture!.serverDay);
  });
});
