jest.mock("@react-native-community/netinfo", () => ({
  __esModule: true,
  default: { addEventListener: jest.fn(() => jest.fn()), fetch: jest.fn(async () => ({ isConnected: true, isInternetReachable: true })) },
}));

// eslint-disable-next-line import/first
import { pickDuplicateFromRows } from "../notification-detection";

const row = (id: number, overrides: Record<string, unknown> = {}) => ({
  id, workspace_id: 1, movement_type: "expense", status: "posted", occurred_at: "2026-10-24T20:45:00Z",
  description: "PATRONAL", source_account_id: 2, source_amount: "181", destination_account_id: null, destination_amount: null,
  ...overrides,
});
const input = { workspaceId: 1, movementType: "expense" as const, accountId: 2, amount: 181, occurredAt: "2026-10-24T20:45:00Z", description: "Patronal" };

describe("duplicado de un movimiento detectado buscado en la copia del teléfono", () => {
  it("mismo día y misma descripción (sin importar mayúsculas ni tildes) es duplicado", () => {
    expect(pickDuplicateFromRows([row(10)], input)?.id).toBe(10);
  });

  it("otro día u otra descripción no lo es", () => {
    expect(pickDuplicateFromRows([row(10, { occurred_at: "2026-10-22T20:45:00Z" }), row(11, { description: "Otra cosa" })], input)).toBeNull();
  });

  it("con varios, el más reciente primero, como la consulta del servidor", () => {
    expect(pickDuplicateFromRows([row(10, { occurred_at: "2026-10-24T14:00:00Z" }), row(11, { occurred_at: "2026-10-24T20:00:00Z" })], input)?.id).toBe(11);
  });

  it("otro espacio no cuenta", () => {
    expect(pickDuplicateFromRows([row(10, { workspace_id: 2 })], input)).toBeNull();
  });

  it("una transferencia exige además el mismo destino y monto de destino", () => {
    const transfer = { ...input, movementType: "transfer" as const, destinationAccountId: 5, destinationAmount: 181 };
    expect(pickDuplicateFromRows([row(10, { movement_type: "transfer", destination_account_id: 5, destination_amount: "181" })], transfer)?.id).toBe(10);
    expect(pickDuplicateFromRows([row(10, { movement_type: "transfer", destination_account_id: 6, destination_amount: "181" })], transfer)).toBeNull();
  });
});
