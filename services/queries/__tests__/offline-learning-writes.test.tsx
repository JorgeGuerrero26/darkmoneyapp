const { act, create } = require("react-test-renderer");
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// Servidor de mentira: registra lo que se le escribe.
const mockWrites: Array<{ table: string; payload: unknown }> = [];
jest.mock("../../../lib/supabase", () => ({
  supabase: {
    from: (table: string) => ({
      insert: async (payload: unknown) => { mockWrites.push({ table, payload }); return { error: null }; },
      upsert: async (payload: unknown) => { mockWrites.push({ table, payload }); return { error: null }; },
    }),
  },
}));
jest.mock("@react-native-community/netinfo", () => ({
  __esModule: true,
  default: { addEventListener: jest.fn(() => jest.fn()), fetch: jest.fn(async () => ({ isConnected: true, isInternetReachable: true })) },
}));

// Motor sin conexión de mentira: qué movimientos siguen sin salir del teléfono y si hay internet.
const mockEngine = { online: true, pending: [] as number[], listeners: new Set<() => void>() };
jest.mock("../../../lib/offline/instance", () => ({
  offlineRuntime: {
    getState: () => ({ online: mockEngine.online }),
    pendingRowIds: async () => [...mockEngine.pending],
    subscribe: (listener: () => void) => { mockEngine.listeners.add(listener); return () => mockEngine.listeners.delete(listener); },
    canReadLocal: () => false,
  },
}));

// eslint-disable-next-line import/first
import { usePersistDashboardAnalyticsMutation, usePersistLearningFeedbackMutation } from "../workspace-data";

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
const sendAll = async () => {
  mockEngine.pending = [];
  mockEngine.online = true;
  mockEngine.listeners.forEach((listener) => listener());
  await settle();
};

let learning: ReturnType<typeof usePersistLearningFeedbackMutation>;
let analytics: ReturnType<typeof usePersistDashboardAnalyticsMutation>;
function Harness() {
  learning = usePersistLearningFeedbackMutation(1, "tester");
  analytics = usePersistDashboardAnalyticsMutation(1);
  return null;
}

let renderer: ReturnType<typeof create>;
beforeEach(async () => {
  mockWrites.length = 0;
  mockEngine.online = true;
  mockEngine.pending = [];
  mockEngine.listeners.clear();
  // networkMode "always": la prueba controla la red con el motor de mentira, no con React Query.
  const client = new QueryClient({ defaultOptions: { mutations: { networkMode: "always", retry: false } } });
  await act(async () => { renderer = create(React.createElement(QueryClientProvider, { client }, React.createElement(Harness))); });
});
afterEach(async () => { await act(async () => renderer.unmount()); });

const feedback = (movementId: number) => ({ movementId, feedbackKind: "manual_category_change" as const, acceptedCategoryId: 2 });

describe("aprendizaje de la categoría de un movimiento guardado sin internet", () => {
  it("con el movimiento ya en el servidor se guarda enseguida, como siempre", async () => {
    await act(async () => { await learning.mutateAsync(feedback(40)); });
    expect(mockWrites).toEqual([{ table: "movement_learning_feedback", payload: expect.objectContaining({ movement_id: 40, accepted_category_id: 2 }) }]);
  });

  it("si el movimiento aún no sale del teléfono, espera y se guarda cuando sale (antes fallaba y se perdía)", async () => {
    mockEngine.online = false;
    mockEngine.pending = [1644];
    let done = false;
    await act(async () => { void learning.mutateAsync(feedback(1644)).then(() => { done = true; }); await settle(); });
    expect(mockWrites).toEqual([]); // nada que choque con la llave foránea ni que falle sin red
    expect(done).toBe(false);
    await act(async () => { await sendAll(); await settle(); });
    expect(done).toBe(true);
    expect(mockWrites).toEqual([{ table: "movement_learning_feedback", payload: expect.objectContaining({ movement_id: 1644 }) }]);
  });
});

describe("estadísticas del inicio con el modo sin conexión", () => {
  const signal = (movementId: number) => ({ movementId, signalReasons: ["prueba"] });

  it("sin internet no se intentan (se recalculan solas al volver la red)", async () => {
    mockEngine.online = false;
    await act(async () => { await analytics.mutateAsync({ signals: [signal(40)] }); });
    expect(mockWrites).toEqual([]);
  });

  it("con internet omite las de movimientos que aún no salen del teléfono", async () => {
    mockEngine.pending = [1644];
    await act(async () => { await analytics.mutateAsync({ signals: [signal(40), signal(1644)] }); });
    expect(mockWrites).toHaveLength(1);
    expect(mockWrites[0]).toEqual({ table: "movement_analytics_signals", payload: [expect.objectContaining({ movement_id: 40 })] });
  });
});
