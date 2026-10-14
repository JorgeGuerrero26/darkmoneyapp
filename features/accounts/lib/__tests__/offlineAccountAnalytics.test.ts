import { buildLocalAccountAnalytics } from "../offlineAccountAnalytics";

const categories = [{ id: 4, name: "Combustible" }];
const move = (extra: Record<string, unknown>) => ({
  id: 1, status: "posted", movement_type: "expense", occurred_at: "2026-10-14T17:54:00.000Z", description: "Gasolina",
  source_account_id: 1, source_amount: "12.50", destination_account_id: null, destination_amount: null, category_id: 4, ...extra,
});
const build = (movements: Record<string, unknown>[], limit = 300) => buildLocalAccountAnalytics({ movements, categories, accountId: 1, limit });

describe("analítica de una cuenta desde la copia local", () => {
  it("trae lo que entra o sale de la cuenta con el nombre de la categoría", () => {
    const rows = build([
      move({}),
      move({ id: 2, occurred_at: "2026-10-15T10:00:00.000Z", source_account_id: null, destination_account_id: 1, destination_amount: "3", source_amount: null, movement_type: "income", category_id: null }),
    ]);
    expect(rows.map((r) => [r.id, r.sourceAmount, r.destinationAmount, r.categoryName])).toEqual([
      [2, null, 3, null],
      [1, 12.5, null, "Combustible"],
    ]);
  });

  it("solo confirmados y solo de esa cuenta", () => {
    const rows = build([
      move({ id: 1 }),
      move({ id: 2, status: "voided" }),
      move({ id: 3, source_account_id: 9 }),
      move({ id: 4, source_account_id: 9, destination_account_id: 1, destination_amount: "5" }),
    ]);
    expect(rows.map((r) => r.id).sort()).toEqual([1, 4]);
  });

  it("más recientes primero y respeta el tope", () => {
    const rows = build(
      [
        move({ id: 1, occurred_at: "2026-10-01T10:00:00.000Z" }),
        move({ id: 2, occurred_at: "2026-10-03T10:00:00.000Z" }),
        move({ id: 3, occurred_at: "2026-10-02T10:00:00.000Z" }),
      ],
      2,
    );
    expect(rows.map((r) => r.id)).toEqual([2, 3]);
  });
});
