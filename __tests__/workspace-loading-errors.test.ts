import type { QueryClient } from "@tanstack/react-query";

const mockFrom = jest.fn();
const mockUseQuery = jest.fn();

jest.mock("@tanstack/react-query", () => ({
  useMutation: jest.fn(),
  useQuery: (...args: unknown[]) => mockUseQuery(...args),
  useQueryClient: jest.fn(),
}));

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

import {
  fetchUserWorkspaces,
  fetchWorkspaceSnapshot,
  refreshSnapshotDomains,
  useWorkspaceSnapshotQuery,
} from "../services/queries/workspace-data";

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

function createQueryChain(result: QueryResult) {
  const query: Record<string, unknown> = {};
  for (const method of ["select", "eq", "order", "not", "gte", "limit", "in"]) {
    query[method] = jest.fn(() => query);
  }
  query.then = (
    resolve: (value: QueryResult) => unknown,
    reject: (reason: unknown) => unknown,
  ) => Promise.resolve(result).then(resolve, reject);
  return query;
}

function arrangeSnapshotQueries(results: Partial<Record<string, QueryResult>> = {}) {
  const success: QueryResult = { data: [], error: null };
  mockFrom.mockImplementation((table: string) =>
    createQueryChain(results[table] ?? success),
  );
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

describe("fetchWorkspaceSnapshot", () => {
  beforeEach(() => {
    mockFrom.mockReset();
  });

  it.each([
    "workspace_members",
    "workspaces",
    "accounts",
    "v_account_balances",
    "categories",
    "v_budget_progress",
    "counterparties",
    "v_obligation_summary",
    "obligations",
    "subscriptions",
    "recurring_income",
    "v_latest_exchange_rates",
  ])("rechaza el snapshot cuando falla el dominio core %s", async (table) => {
    arrangeSnapshotQueries({
      [table]: {
        data: null,
        error: { code: "57000", message: `${table} unavailable` },
      },
    });

    await expect(fetchWorkspaceSnapshot("user-1", 7)).rejects.toThrow(
      `57000 | ${table} unavailable`,
    );
  });

  it("mantiene best-effort solo para los historiales analíticos de movimientos", async () => {
    arrangeSnapshotQueries({
      movements: {
        data: null,
        error: { code: "57000", message: "movement history unavailable" },
      },
    });

    await expect(fetchWorkspaceSnapshot("user-1", 7)).resolves.toEqual(
      expect.objectContaining({
        subscriptionPostedMovements: [],
        categoryPostedMovements: [],
      }),
    );
  });
});

describe("useWorkspaceSnapshotQuery", () => {
  beforeEach(() => {
    mockUseQuery.mockClear();
  });

  it("hace como máximo dos intentos totales", () => {
    useWorkspaceSnapshotQuery(
      {
        id: "user-1",
        email: "user@example.test",
        fullName: "Test User",
        initials: "TU",
        baseCurrencyCode: "PEN",
        timezone: "America/Lima",
        avatarUrl: null,
      },
      7,
    );

    expect(mockUseQuery).toHaveBeenCalledWith(
      expect.objectContaining({ placeholderData: undefined, retry: 1 }),
    );
  });
});

describe("refreshSnapshotDomains", () => {
  beforeEach(() => {
    mockFrom.mockReset();
  });

  it("refresca también el historial de movimientos de suscripciones", async () => {
    arrangeSnapshotQueries({
      movements: {
        data: [
          {
            id: 99,
            category_id: 4,
            subscription_id: 8,
            status: "posted",
            occurred_at: "2026-07-29T12:00:00.000Z",
            source_amount: 25,
            destination_amount: null,
            source_account_id: 3,
            destination_account_id: null,
          },
        ],
        error: null,
      },
    });

    const current = {
      workspaces: [{ id: 7, baseCurrencyCode: "PEN" }],
      accounts: [{ id: 3, currencyCode: "PEN" }],
      exchangeRates: [],
    };
    const setQueriesData = jest.fn();
    const queryClient = {
      getQueriesData: jest.fn(() => [["workspace-snapshot", current]]),
      setQueriesData,
      invalidateQueries: jest.fn(),
    };

    await refreshSnapshotDomains(
      queryClient as unknown as QueryClient,
      7,
      ["categoryMovements", "subscriptionMovements"],
    );

    expect(mockFrom.mock.calls.filter(([table]) => table === "movements")).toHaveLength(2);
    expect(setQueriesData).toHaveBeenCalledTimes(1);
    const updater = setQueriesData.mock.calls[0][1] as (value: typeof current) => Record<string, unknown>;
    const updated = updater(current);
    expect(updated.categoryPostedMovements).toHaveLength(1);
    expect(updated.subscriptionPostedMovements).toHaveLength(1);
  });
});
