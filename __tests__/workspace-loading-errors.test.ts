const mockFrom = jest.fn();

jest.mock("../lib/supabase", () => ({
  supabase: { from: (...args: unknown[]) => mockFrom(...args) },
  supabaseAnonKey: "test-anon-key",
  supabaseUrl: "https://example.test",
}));

jest.mock("../lib/query-client", () => ({
  STALE: { realtime: 0, short: 30_000, medium: 300_000, long: 1_800_000, session: Infinity },
  queryClient: {
    getQueryData: jest.fn(),
    invalidateQueries: jest.fn(),
    setQueriesData: jest.fn(),
  },
}));

jest.mock("../store/ui-store", () => ({
  useUiStore: Object.assign(jest.fn(), { getState: jest.fn(() => ({})) }),
}));

import { fetchUserWorkspaces } from "../services/queries/workspace-data";

type QueryError = {
  message: string;
  code?: string;
  details?: string;
  hint?: string;
};

type QueryResult = { data: unknown[] | null; error: QueryError | null };

function arrangeWorkspaceQueries(memberships: QueryResult, workspaces: QueryResult) {
  mockFrom.mockImplementation((table: string) => ({
    select: jest.fn(() => {
      if (table === "workspace_members") {
        return { eq: jest.fn().mockResolvedValue(memberships) };
      }
      if (table === "workspaces") return Promise.resolve(workspaces);
      throw new Error(`Tabla inesperada: ${table}`);
    }),
  }));
}

describe("fetchUserWorkspaces", () => {
  beforeEach(() => {
    mockFrom.mockReset();
  });

  it("con respuestas válidas conserva el resultado vacío real", async () => {
    arrangeWorkspaceQueries(
      { data: [], error: null },
      { data: [], error: null },
    );

    await expect(fetchUserWorkspaces("user-1")).resolves.toEqual([]);
  });

  it("propaga un error al consultar memberships en vez de devolver []", async () => {
    const error = { code: "42501", message: "permission denied" };
    arrangeWorkspaceQueries(
      { data: null, error },
      { data: [], error: null },
    );

    await expect(fetchUserWorkspaces("user-1")).rejects.toThrow("42501 | permission denied");
  });

  it("propaga un error al consultar workspaces en vez de devolver []", async () => {
    const error = new Error("Request aborted");
    arrangeWorkspaceQueries(
      { data: [], error: null },
      { data: null, error },
    );

    await expect(fetchUserWorkspaces("user-1")).rejects.toThrow("Request aborted");
  });
});
