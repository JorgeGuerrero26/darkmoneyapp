import { QueryClient } from "@tanstack/react-query";

const mockEngine = { pending: new Set<string>(), movements: [] as Record<string, unknown>[] | null };
jest.mock("../../../lib/offline/instance", () => ({
  offlineRuntime: {
    hasPendingOps: async (_ws: number, tables: string[]) => tables.some((table) => mockEngine.pending.has(table)),
    listRows: async () => mockEngine.movements,
  },
}));

// eslint-disable-next-line import/first
import { applyLocalCounterpartyFinancialsToCache } from "../offline-counterparties";

const WS = 1;
const contact = { id: 5, name: "Sergio", movementCount: 0, inflowTotal: 0, outflowTotal: 0, netFlowAmount: 0, receivableCount: 1,
  receivablePrincipalTotal: 100, receivablePendingTotal: 60, payableCount: 0, payablePrincipalTotal: 0, payablePendingTotal: 0,
  netPendingAmount: 60, lastActivityAt: null, roles: [] };

function cache() {
  const queryClient = new QueryClient();
  queryClient.setQueryData(["workspace-snapshot", WS, "u1"], { workspaces: [], accounts: [], counterparties: [contact] });
  queryClient.setQueryData(["workspace-snapshot", WS, "u1", "deferred"], {
    budgets: [],
    obligations: [{ counterpartyId: 5, direction: "receivable", principalAmount: 100, currentPrincipalAmount: 100, pendingAmount: 40, events: [] }],
  });
  return queryClient;
}
const shown = (queryClient: QueryClient) => (queryClient.getQueryData(["workspace-snapshot", WS, "u1"]) as { counterparties: typeof contact[] }).counterparties[0];

describe("resumen de contactos en la pantalla con el modo sin conexión", () => {
  beforeEach(() => { mockEngine.pending = new Set(); mockEngine.movements = []; });

  it("sin cambios sin enviar no toca nada: el servidor ya es exacto", async () => {
    const queryClient = cache();
    expect(await applyLocalCounterpartyFinancialsToCache(queryClient, WS)).toBe(false);
    expect(shown(queryClient)).toBe(contact);
  });

  it("un gasto con el contacto guardado sin internet aparece en lo que salió", async () => {
    mockEngine.pending.add("movements");
    mockEngine.movements = [{ id: 9, workspace_id: WS, status: "posted", movement_type: "expense", counterparty_id: 5, source_amount: "25.50", occurred_at: "2026-10-24T12:00:00Z" }];
    const queryClient = cache();
    expect(await applyLocalCounterpartyFinancialsToCache(queryClient, WS)).toBe(true);
    expect(shown(queryClient)).toMatchObject({ movementCount: 1, outflowTotal: 25.5, netFlowAmount: -25.5, receivablePendingTotal: 60 });
  });

  it("un cobro registrado sin internet baja lo que te debe (sale de la deuda ya actualizada)", async () => {
    mockEngine.pending.add("obligation_events");
    const queryClient = cache();
    expect(await applyLocalCounterpartyFinancialsToCache(queryClient, WS)).toBe(true);
    expect(shown(queryClient)).toMatchObject({ receivablePendingTotal: 40, netPendingAmount: 40, movementCount: 0 });
  });
});
