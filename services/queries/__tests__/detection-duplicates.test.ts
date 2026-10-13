import { countSameDayDetectionSignals, findPossibleDuplicateMovement } from "../notification-detection";
import { detectionDuplicateBounds } from "../../../features/detected-movements/lib/duplicate-day";

const mockFrom = jest.fn();
jest.mock("../../../lib/supabase", () => ({ supabase: { from: (...args: unknown[]) => mockFrom(...args) } }));
jest.mock("../../../lib/query-client", () => ({ STALE: {} }));
jest.mock("@tanstack/react-query", () => ({ useMutation: jest.fn(), useQuery: jest.fn(), useQueryClient: jest.fn() }));
const movement = { id: 20, workspace_id: 8, movement_type: "expense", status: "posted", description: "Taxi", occurred_at: "2026-10-14T04:50:00Z",
  source_account_id: 1, source_amount: 20, destination_account_id: null, destination_amount: null };
const suggestion = { id: 90, user_id: "u", workspace_id: 8, amount: 20, currency_code: "PEN", movement_type: "expense", status: "pending", occurred_at: "2026-10-13T12:00:00Z" };
const input = { workspaceId: 8, accountId: 1, amount: 20, movementType: "expense" as const, description: "Táxi!", occurredAt: suggestion.occurred_at };
function fixture() {
  const state = { movements: [{ ...movement }] as Record<string, any>[], suggestions: [{ ...suggestion }] as Record<string, any>[], error: "", count: null as number | null,
    headQueries: 0, counts: [] as number[], ranges: [] as [number, number][] };
  mockFrom.mockImplementation((table: string) => {
    const filters: ((row: Record<string, any>) => boolean)[] = []; let head = false, count = false, bounds = [0, Infinity];
    const query = {
      select: (_columns: string, options?: { head?: boolean; count?: string }) => { head = !!options?.head; count = !!options?.count; if (head) state.headQueries++; return query; },
      eq: (key: string, value: unknown) => { filters.push(row => row[key] === value); return query; },
      in: (key: string, values: unknown[]) => { filters.push(row => values.includes(row[key])); return query; },
      gte: (key: string, value: string) => { filters.push(row => Date.parse(row[key]) >= Date.parse(value)); return query; },
      lt: (key: string, value: string) => { filters.push(row => Date.parse(row[key]) < Date.parse(value)); return query; },
      order: () => query,
      range: (from: number, to: number) => { bounds = [from, to]; state.ranges.push([from, to]); return query; },
      then: (resolve: (value: unknown) => void) => {
        const rows = (table === "movements" ? state.movements : state.suggestions).filter(row => filters.every(test => test(row)));
        return Promise.resolve({ data: head ? null : rows.slice(bounds[0], bounds[1] + 1), count: count ? state.counts.shift() ?? state.count ?? rows.length : null,
          error: state.error === table ? { message: "offline" } : null }).then(resolve);
      },
    }; return query;
  }); return state;
}
beforeEach(() => jest.clearAllMocks());
it("uses the full Peru day and rejects an invalid date rather than using today", async () => {
  fixture(); expect(detectionDuplicateBounds("2026-10-14T04:59:59Z")).toEqual({ from: "2026-10-13T05:00:00.000Z", to: "2026-10-14T05:00:00.000Z" });
  expect((await findPossibleDuplicateMovement(input))?.id).toBe(20);
  expect(() => detectionDuplicateBounds("invalid")).toThrow("fecha");
  expect(detectionDuplicateBounds("2026-10-14T05:00:00Z").from).toBe("2026-10-14T05:00:00.000Z");
});
it("does not include an adjacent day, another space, another account or a voided movement", async () => {
  const state = fixture(); state.movements = [
    { ...movement, occurred_at: "2026-10-13T04:59:59Z" }, { ...movement, occurred_at: "2026-10-14T05:00:00Z" },
    { ...movement, workspace_id: 9 }, { ...movement, source_account_id: 2 }, { ...movement, status: "voided" },
  ]; expect(await findPossibleDuplicateMovement(input)).toBeNull();
});
it("reaches the matching description beyond 510 same-amount records", async () => {
  const state = fixture(); state.movements = [...Array.from({ length: 510 }, (_, id) => ({ ...movement, id: id + 100, description: "Otro comercio" })), movement];
  expect((await findPossibleDuplicateMovement(input))?.id).toBe(20);
  expect(state.ranges).toEqual([[0, 499], [500, 999]]);
});
it("uses the income leg and both transfer legs", async () => {
  const state = fixture(); state.movements = [{ ...movement, movement_type: "income", source_account_id: null, source_amount: null, destination_account_id: 1, destination_amount: 20 }];
  expect((await findPossibleDuplicateMovement({ ...input, movementType: "income" }))?.id).toBe(20);
  state.movements = [{ ...movement, movement_type: "transfer", destination_account_id: 2, destination_amount: 5 }];
  const transfer = { ...input, movementType: "transfer" as const, destinationAccountId: 2, destinationAmount: 5 };
  expect((await findPossibleDuplicateMovement(transfer))?.id).toBe(20);
  expect(await findPossibleDuplicateMovement({ ...transfer, destinationAmount: 6 })).toBeNull();
  expect(await findPossibleDuplicateMovement({ ...transfer, destinationAccountId: 3 })).toBeNull();
  await expect(findPossibleDuplicateMovement({ ...transfer, destinationAccountId: null })).rejects.toThrow("destino");
});
it("counts exact registered totals beyond the returned-row limit, scoped by user/currency/type/status", async () => {
  const state = fixture(); state.suggestions.push(...Array.from({ length: 1105 }, (_, id) => ({ ...suggestion, id: id + 100, status: "registered" })),
    { ...suggestion, user_id: "other" }, { ...suggestion, workspace_id: 9 }, { ...suggestion, currency_code: "USD" },
    { ...suggestion, movement_type: "income" }, { ...suggestion, status: "discarded" }, { ...suggestion, status: "duplicate" });
  expect(await countSameDayDetectionSignals({ ...input, userId: "u", currencyCode: "PEN" })).toEqual({ sameDaySuggestions: 1106, sameDayRegisteredFromSuggestions: 1105, sameDayMatchingMovements: 1 });
  expect(state.headQueries).toBe(3);
});
it.each(["movements", "notification_detected_movement_suggestions"])("does not invent counts after a failed %s read", async table => {
  const state = fixture(); state.error = table;
  await expect(countSameDayDetectionSignals({ ...input, userId: "u", currencyCode: "PEN" })).rejects.toThrow("evidencia");
  if (table === "movements") await expect(findPossibleDuplicateMovement(input)).rejects.toThrow("offline");
});
it("rejects missing scope/amount/account before reading", async () => {
  fixture();
  await expect(countSameDayDetectionSignals({ ...input, userId: "", currencyCode: "PEN" })).rejects.toThrow("usuario");
  await expect(findPossibleDuplicateMovement({ ...input, accountId: null })).rejects.toThrow("cuenta");
  expect(mockFrom).not.toHaveBeenCalled();
});
it.each([-1, NaN, 1.5])("rejects invalid server count %s", async count => {
  const state = fixture(); state.count = count;
  await expect(countSameDayDetectionSignals({ ...input, userId: "u", currencyCode: "PEN" })).rejects.toThrow("evidencia");
});
it("rejects mutually inconsistent counts instead of sending them to AI", async () => {
  const state = fixture(); state.counts = [1, 2, 1];
  await expect(countSameDayDetectionSignals({ ...input, userId: "u", currencyCode: "PEN" })).rejects.toThrow("evidencia cambió");
});
