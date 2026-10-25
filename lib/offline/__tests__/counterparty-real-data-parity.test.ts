/**
 * Paridad del resumen de CONTACTOS con datos reales: lo que el teléfono calcula (movimientos desde la copia local,
 * créditos y deudas desde las obligaciones) debe coincidir con `v_counterparty_summary` del servidor, contacto por contacto.
 * La copia vive en .tmp/offline-fixtures/counterparty-parity.json (ignorada por git: datos financieros reales); si no
 * está, la suite se omite — en CI no corre. Se genera con .tmp/offline-fixtures/counterparty-parity.mjs (solo lectura).
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { rollupMovementsByCounterparty, rollupObligationsByCounterparty } from "../../../features/contacts/lib/localCounterpartyFinancials";
import { upsertMovementRows, type ServerRow } from "../movement-store";
import { listRowsLocal } from "../resource-store";
import { migrate } from "../schema";
import { createTestDriver } from "./helpers/node-sqlite-driver";

const file = join(process.cwd(), ".tmp", "offline-fixtures", "counterparty-parity.json");
const available = existsSync(file);
type Fixture = {
  movements: ServerRow[];
  obligations: Array<Record<string, any>>;
  events: Array<{ obligation_id: number; event_date: string }>;
  summary: Array<Record<string, any>>;
};
const c = (value: unknown) => Math.round(Number(value ?? 0) * 100);

(available ? describe : describe.skip)("contactos sin conexión: paridad con datos reales", () => {
  const fixture = available ? (JSON.parse(readFileSync(file, "utf8")) as Fixture) : null;

  it("movimientos: cantidad, lo que entró y lo que salió de cada contacto", async () => {
    const db = createTestDriver();
    await migrate(db);
    await upsertMovementRows(db, fixture!.movements);
    const rollup = rollupMovementsByCounterparty(await listRowsLocal(db, "movements", 1, "usuario"));
    for (const row of fixture!.summary) {
      const local = rollup.get(Number(row.counterparty_id));
      expect({ id: row.counterparty_id, count: local?.movementCount ?? 0, inflow: local?.inflowCents ?? 0, outflow: local?.outflowCents ?? 0 })
        .toEqual({ id: row.counterparty_id, count: Number(row.movement_count), inflow: c(row.inflow_total), outflow: c(row.outflow_total) });
    }
  });

  it("créditos y deudas: cantidad, total y pendiente por cobrar y por pagar", () => {
    const eventsByObligation = new Map<number, string[]>();
    for (const event of fixture!.events) eventsByObligation.set(event.obligation_id, [...(eventsByObligation.get(event.obligation_id) ?? []), event.event_date]);
    // Las obligaciones como las arma la app a partir de v_obligation_summary.
    const obligations = fixture!.obligations.map((row) => ({
      counterpartyId: row.counterparty_id == null ? null : Number(row.counterparty_id),
      direction: row.direction,
      principalAmount: Number(row.principal_amount),
      currentPrincipalAmount: row.principal_current_amount == null ? null : Number(row.principal_current_amount),
      pendingAmount: Number(row.pending_amount),
      lastPaymentDate: null,
      events: (eventsByObligation.get(Number(row.id)) ?? []).map((eventDate, index) => ({ id: index, eventType: "payment" as const, eventDate, amount: 0 })),
    }));
    const rollup = rollupObligationsByCounterparty(obligations);
    for (const row of fixture!.summary) {
      const local = rollup.get(Number(row.counterparty_id));
      expect({
        id: row.counterparty_id,
        receivable: [local?.receivableCount ?? 0, local?.receivablePrincipalCents ?? 0, local?.receivablePendingCents ?? 0],
        payable: [local?.payableCount ?? 0, local?.payablePrincipalCents ?? 0, local?.payablePendingCents ?? 0],
      }).toEqual({
        id: row.counterparty_id,
        receivable: [Number(row.receivable_count), c(row.receivable_principal_total), c(row.receivable_pending_total)],
        payable: [Number(row.payable_count), c(row.payable_principal_total), c(row.payable_pending_total)],
      });
    }
  });
});
