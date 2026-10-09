import { fetchDetectionLearning, useDetectionLearningQuery } from "../detection-learning";
const mockFrom = jest.fn(), mockUseQuery = jest.fn((options) => options);
jest.mock("../../../lib/supabase", () => ({ supabase: { from: (...args: unknown[]) => mockFrom(...args) } }));
jest.mock("../../../lib/query-client", () => ({ STALE: { medium: 300_000 } }));
jest.mock("@tanstack/react-query", () => ({ useQuery: (options: unknown) => mockUseQuery(options) }));
function chain(data: unknown, error: unknown = null) {
  const query: Record<string, any> = {};
  for (const method of ["select", "eq", "in", "or", "order", "limit", "maybeSingle"]) query[method] = jest.fn(() => query);
  query.then = (resolve: (value: unknown) => void) => Promise.resolve({ data, error }).then(resolve);
  return query;
}
beforeEach(() => jest.clearAllMocks());
it("reads only the user's live decisions in the selected workspace", async () => {
  const movements = chain([{ id: 1, metadata: {} }]), receipts = chain([]);
  mockFrom.mockImplementation((table: string) => table === "movements" ? movements : receipts);
  const history = await fetchDetectionLearning("user-1", 9);
  expect(history).toHaveLength(1);
  expect(movements.eq).toHaveBeenCalledWith("created_by_user_id", "user-1");
  expect(movements.eq).toHaveBeenCalledWith("workspace_id", 9);
  expect(movements.eq).toHaveBeenCalledWith("status", "posted");
  expect(movements.or).toHaveBeenCalledWith("updated_by_user_id.is.null,updated_by_user_id.eq.user-1");
  expect(receipts.eq).toHaveBeenCalledWith("user_id", "user-1");
  expect(receipts.eq).toHaveBeenCalledWith("workspace_id", 9);
  expect(receipts.in).toHaveBeenCalledWith("status", ["registered", "duplicate"]);
});
it("does not treat a failed history load as a successful empty history", async () => {
  const error = { message: "offline" };
  mockFrom.mockImplementation((table: string) => table === "movements" ? chain(null, error) : chain([]));
  await expect(fetchDetectionLearning("user-1", 9)).rejects.toEqual(error);
});
it("separates caches by user/workspace and stays out of blocking loading UI", () => {
  useDetectionLearningQuery("user-1", 9);
  expect(mockUseQuery.mock.calls[0][0]).toMatchObject({ queryKey: ["detection-learning", "user-1", 9], enabled: true, meta: { uxBlocking: false } });
  useDetectionLearningQuery(null, 9);
  useDetectionLearningQuery("user-1", null);
  useDetectionLearningQuery("user-1", 9, false);
  expect(mockUseQuery.mock.calls.slice(1).every(([query]) => query.enabled === false)).toBe(true);
});
it("includes unattributed old imports only for a verified sole owner of a personal space", async () => {
  const movements = chain([]);
  mockFrom.mockImplementation((table: string) => table === "workspaces" ? chain({ kind: "personal", owner_user_id: "user-1" }) :
    table === "workspace_members" ? chain([{ user_id: "user-1" }]) : table === "movements" ? movements : chain([]));
  await fetchDetectionLearning("user-1", 9);
  expect(movements.eq).not.toHaveBeenCalledWith("created_by_user_id", "user-1");
  expect(movements.or).toHaveBeenCalledWith("and(created_by_user_id.eq.user-1,or(updated_by_user_id.is.null,updated_by_user_id.eq.user-1)),and(created_by_user_id.is.null,or(updated_by_user_id.is.null,updated_by_user_id.eq.user-1))");
});
it.each([
  [{ kind: "personal", owner_user_id: "user-1" }, [{ user_id: "user-1" }, { user_id: "user-2" }]],
  [{ kind: "shared", owner_user_id: "user-1" }, [{ user_id: "user-1" }]],
  [{ kind: "personal", owner_user_id: "user-2" }, [{ user_id: "user-1" }]],
])("does not attribute legacy imports when workspace ownership is ambiguous", async (workspace, members) => {
  const movements = chain([]);
  mockFrom.mockImplementation((table: string) => table === "workspaces" ? chain(workspace) : table === "workspace_members" ? chain(members) : table === "movements" ? movements : chain([]));
  await fetchDetectionLearning("user-1", 9);
  expect(movements.eq).toHaveBeenCalledWith("created_by_user_id", "user-1");
});
