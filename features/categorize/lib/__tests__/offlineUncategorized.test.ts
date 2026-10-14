import { buildLocalUncategorized } from "../offlineUncategorized";

const move = (extra: Record<string, unknown>) => ({
  id: 1, status: "posted", movement_type: "expense", occurred_at: "2026-10-14T10:00:00.000Z", description: "Café", source_amount: "5", destination_amount: null, category_id: null, ...extra,
});

describe("movimientos sin categoría desde la copia local", () => {
  it("solo confirmados, sin categoría, de gasto o ingreso (los traspasos no llevan)", () => {
    const rows = buildLocalUncategorized(
      [
        move({ id: 1 }),
        move({ id: 2, category_id: 4 }),
        move({ id: 3, status: "voided" }),
        move({ id: 4, movement_type: "transfer" }),
        move({ id: 5, movement_type: "income", source_amount: null, destination_amount: "9" }),
      ],
      500,
    );
    expect(rows.map((r) => r.id).sort()).toEqual([1, 5]);
  });

  it("más recientes primero y con tope, con los montos como número", () => {
    const rows = buildLocalUncategorized(
      [
        move({ id: 1, occurred_at: "2026-10-01T10:00:00.000Z" }),
        move({ id: 2, occurred_at: "2026-10-03T10:00:00.000Z" }),
        move({ id: 3, occurred_at: "2026-10-02T10:00:00.000Z" }),
      ],
      2,
    );
    expect(rows.map((r) => r.id)).toEqual([2, 3]);
    expect(rows[0]).toMatchObject({ source_amount: 5, destination_amount: null, description: "Café", movement_type: "expense" });
  });
});
