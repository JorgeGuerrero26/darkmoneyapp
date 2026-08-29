import { buildReviewInboxSnapshot } from "../dashboard-builders";
import type { DashboardMovementRow } from "../../../../services/queries/workspace-data";

/**
 * Los dos datos que la Revisión 06 sube a primera fila de "Por revisar".
 *
 * "409 movimientos sin contraparte" era la segunda viñeta de una tarjeta de dos líneas, sin nada
 * que tocar, mientras 1.400 px más abajo se detallaba la madurez del análisis. Y el peso del
 * gasto sin categoría vivía en otra tarjeta, tres pantallas más abajo que el número al que se
 * refiere: el número y su consecuencia tienen que ir juntos.
 */
function movement(overrides: Partial<DashboardMovementRow>): DashboardMovementRow {
  return {
    id: 1,
    status: "posted",
    movementType: "expense",
    categoryId: 1,
    counterpartyId: 1,
    sourceAmount: 100,
    description: "Movimiento",
    occurredAt: "2026-08-01",
    ...overrides,
  } as DashboardMovementRow;
}

const NO_SUBS: never[] = [];
const NO_OBLIGATIONS: never[] = [];

describe("bandeja de por revisar", () => {
  it("cuenta los movimientos sin contraparte", () => {
    const snapshot = buildReviewInboxSnapshot(
      [
        movement({ id: 1, counterpartyId: null }),
        movement({ id: 2, counterpartyId: null }),
        movement({ id: 3, counterpartyId: 7 }),
      ],
      NO_SUBS,
      NO_OBLIGATIONS,
    );

    expect(snapshot.noCounterpartyCount).toBe(2);
  });

  it("un movimiento pendiente todavia no cuenta: no ha impactado nada", () => {
    const snapshot = buildReviewInboxSnapshot(
      [movement({ id: 1, counterpartyId: null, status: "pending" })],
      NO_SUBS,
      NO_OBLIGATIONS,
    );

    expect(snapshot.noCounterpartyCount).toBe(0);
  });

  it("el peso del gasto sin categoria se mide sobre el GASTO, no sobre el total", () => {
    const snapshot = buildReviewInboxSnapshot(
      [
        movement({ id: 1, categoryId: null, sourceAmount: 45 }),
        movement({ id: 2, categoryId: 3, sourceAmount: 55 }),
        // El ingreso no entra en el reparto: lo que se ordena es el gasto.
        movement({ id: 3, movementType: "income", categoryId: null, destinationAmount: 900 }),
      ],
      NO_SUBS,
      NO_OBLIGATIONS,
    );

    expect(snapshot.uncategorizedExpenseShare).toBe(45);
  });

  it("sin gastos el peso es cero y no NaN", () => {
    const snapshot = buildReviewInboxSnapshot([], NO_SUBS, NO_OBLIGATIONS);

    expect(snapshot.uncategorizedExpenseShare).toBe(0);
  });
});
