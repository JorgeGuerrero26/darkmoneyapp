import { QueryClient } from "@tanstack/react-query";
import { reconcileDetectedMovements, useDetectedMovementSuggestionQuery, usePendingDetectedMovementsQuery, useMarkDetectedMovementSuggestionMutation, useDetectedMovementOmissionsMutation, type DetectedMovementSuggestion } from "../notification-detection";

const mockRpc = jest.fn(), mockFrom = jest.fn(), mockUseQuery = jest.fn(options => options);
const mockClient = new QueryClient();
jest.spyOn(mockClient, "invalidateQueries").mockResolvedValue(undefined);
const mockUseMutation = jest.fn(options => options);
jest.mock("../../../lib/supabase", () => ({ supabase: { rpc: (...args: unknown[]) => mockRpc(...args), from: (...args: unknown[]) => mockFrom(...args) } }));
jest.mock("../../../lib/query-client", () => ({ STALE: { short: 30_000 } }));
jest.mock("@tanstack/react-query", () => ({ ...jest.requireActual("@tanstack/react-query"), useQuery: (options: unknown) => mockUseQuery(options), useQueryClient: () => mockClient, useMutation: (options: unknown) => mockUseMutation(options) }));

function chain(data: unknown, error: unknown = null) {
  const query: Record<string, any> = {};
  for (const method of ["select", "eq", "in", "order", "maybeSingle", "update", "single", "neq"]) query[method] = jest.fn(() => query);
  query.then = (resolve: (value: unknown) => void) => Promise.resolve({ data, error }).then(resolve);
  return query;
}
const receipt = { id: 7, workspace_id: 1, user_id: "tester", financial_app_key: "yape", package_name: "email:inbound", app_label: "Yape", amount: "15.00", currency_code: "PEN", movement_type: "expense", status: "pending", description: "Pago ficticio", metadata: {}, occurred_at: "2026-10-09T01:23:00Z" };
const movement = { id: 22, workspace_id: 1, movement_type: "expense", status: "posted", description: "Compra ficticia", source_account_id: 3, source_amount: "15.00", destination_account_id: null, destination_amount: null, occurred_at: "2026-10-09T01:23:00Z" };
beforeEach(() => { jest.clearAllMocks(); mockClient.clear(); mockRpc.mockResolvedValue({ data: { resolvedIds: [], candidates: [] }, error: null }); });
afterEach(() => mockClient.clear());

it("consulta el servidor y convierte candidatos sin registrarlos", async () => {
  mockRpc.mockResolvedValue({ data: { resolvedIds: [8], candidates: [{ suggestionId: 7, movement }] }, error: null });
  const result = await reconcileDetectedMovements(1);
  expect(mockRpc).toHaveBeenCalledWith("reconcile_detected_movements", { p_workspace_id: 1, p_suggestion_id: null });
  expect(result.resolvedIds).toEqual([8]);
  expect(result.candidates.get(7)).toMatchObject({ id: 22, sourceAmount: 15, status: "posted", workspaceId: 1 });
  expect(mockFrom).not.toHaveBeenCalled();
});
it("un error al conciliar no se presenta como una lista vacía", async () => {
  mockRpc.mockResolvedValue({ data: null, error: { message: "database unavailable" } });
  await expect(reconcileDetectedMovements(1)).rejects.toThrow("No se pudieron conciliar");
});
it("el dashboard obtiene el estado conciliado y avisa a Notificaciones", async () => {
  mockRpc.mockResolvedValue({ data: { resolvedIds: [8], candidates: [{ suggestionId: 7, movement }] }, error: null });
  const query = chain([receipt]); mockFrom.mockReturnValue(query);
  usePendingDetectedMovementsQuery("tester", 1);
  const result = await mockUseQuery.mock.calls[0][0].queryFn();
  expect(result).toHaveLength(1);
  expect(result[0].duplicateCandidate.id).toBe(22);
  expect(query.order).toHaveBeenCalledWith("created_at", { ascending: false });
  expect(mockClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: ["notifications"] });
  expect(mockClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: ["detected-movement-suggestion", 8] });
});
it("abrir desde Notificaciones relee una detección resuelta por el registro manual", async () => {
  mockRpc.mockResolvedValue({ data: { resolvedIds: [7], candidates: [] }, error: null });
  mockFrom.mockReturnValueOnce(chain(receipt)).mockReturnValueOnce(chain({ ...receipt, status: "duplicate", movement_id: 22 }));
  useDetectedMovementSuggestionQuery(7);
  const result = await mockUseQuery.mock.calls[0][0].queryFn();
  expect(mockRpc).toHaveBeenCalledWith("reconcile_detected_movements", { p_workspace_id: 1, p_suggestion_id: 7 });
  expect(result.status).toBe("duplicate"); expect(result.movementId).toBe(22);
});
it("una detección descartada no se vuelve a conciliar ni se reabre", async () => {
  mockFrom.mockReturnValue(chain({ ...receipt, status: "discarded" }));
  useDetectedMovementSuggestionQuery(7);
  const result = await mockUseQuery.mock.calls[0][0].queryFn();
  expect(result.status).toBe("discarded"); expect(mockRpc).not.toHaveBeenCalled();
});

it("Omitir guarda el estado compartido y conserva la notificación para abrirla después", async () => {
  const suggestion = chain({ ...receipt, status: "discarded" });
  const notification = chain(null);
  mockFrom.mockReturnValueOnce(suggestion).mockReturnValueOnce(notification);
  useMarkDetectedMovementSuggestionMutation("tester");
  const mutation = mockUseMutation.mock.calls[0][0];
  const input = { suggestionId: 7, status: "discarded", expectedStatus: "pending" };
  const result = await mutation.mutationFn(input);
  const key = ["pending-detected-movements", "tester", 1];
  mockClient.setQueryData(key, [result]);
  mutation.onSuccess(result, input);
  expect(suggestion.eq).toHaveBeenCalledWith("status", "pending");
  expect(notification.update).toHaveBeenCalledWith({ status: "read", read_at: expect.any(String) });
  expect(mockClient.getQueryData(key)).toEqual([]);
  expect(mockClient.getQueryData(["detected-movement-suggestion", 7])).toMatchObject({ status: "discarded" });
  expect(mockClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: ["notifications", "tester"] });
});

it.each(["pending", "needs_review"])("Deshacer recupera la última detección como %s sin volver a tocar el estado leído", async (status) => {
  mockFrom.mockReturnValue(chain({ ...receipt, status }));
  useMarkDetectedMovementSuggestionMutation("tester");
  const mutation = mockUseMutation.mock.calls[0][0];
  const input = { suggestionId: 7, status, expectedStatus: "discarded" };
  const result = await mutation.mutationFn(input);
  const ownKey = ["pending-detected-movements", "tester", 1];
  const otherWorkspace = ["pending-detected-movements", "tester", 2];
  const otherUser = ["pending-detected-movements", "another-user", 1];
  for (const key of [ownKey, otherWorkspace, otherUser]) mockClient.setQueryData(key, []);
  mutation.onSuccess(result, input);
  expect(mockClient.getQueryData(ownKey)).toEqual([result]);
  expect(mockClient.getQueryData(otherWorkspace)).toEqual([]);
  expect(mockClient.getQueryData(otherUser)).toEqual([]);
  expect(mockFrom).toHaveBeenCalledTimes(1);
});

function omissionTarget(id: number, status: "pending" | "needs_review" = "pending") {
  return { id, userId: "tester", workspaceId: 1, status, updatedAt: "2026-10-09T12:00:00Z", createdAt: "2026-10-09T11:00:00Z" } as DetectedMovementSuggestion;
}

it("omitir en lote limita usuario, espacio, ids y estados sin tocar las nuevas detecciones", async () => {
  const update = chain([{ ...receipt, status: "discarded", updated_at: "2026-10-09T13:00:00Z" }]);
  const notification = chain(null);
  mockFrom.mockReturnValueOnce(update).mockReturnValueOnce(notification);
  useDetectedMovementOmissionsMutation("tester", 1);
  const mutation = mockUseMutation.mock.calls[0][0];
  const target = omissionTarget(7), incoming = omissionTarget(8), foreign = { ...target, id: 99, userId: "other" };
  const result = await mutation.mutationFn({ action: "omit", suggestions: [target, target, foreign, { ...target, id: 100, status: "registered" }] });
  const own = ["pending-detected-movements", "tester", 1], other = ["pending-detected-movements", "tester", 2];
  mockClient.setQueryData(own, [target, incoming]); mockClient.setQueryData(other, [target]);
  mutation.onSuccess(result);
  expect(update.eq).toHaveBeenCalledWith("user_id", "tester");
  expect(update.eq).toHaveBeenCalledWith("workspace_id", 1);
  expect(update.in).toHaveBeenCalledWith("id", [7]);
  expect(update.in).toHaveBeenCalledWith("status", ["pending", "needs_review"]);
  expect(notification.in).toHaveBeenCalledWith("related_entity_id", [7]);
  expect(mockClient.getQueryData(own)).toEqual([incoming]);
  expect(mockClient.getQueryData(other)).toEqual([target]);
  expect(mockClient.getQueryData(["detected-movement-suggestion", 7])).toMatchObject({ status: "discarded" });
});

it("deshacer un lote respeta cada estado original y una resolución posterior", async () => {
  const pending = omissionTarget(7), review = omissionTarget(8, "needs_review");
  const omittedAt = "2026-10-09T13:00:00Z";
  const first = chain([{ ...receipt, status: "pending" }]), changedElsewhere = chain([]);
  mockFrom.mockReturnValueOnce(first).mockReturnValueOnce(changedElsewhere);
  useDetectedMovementOmissionsMutation("tester", 1);
  const mutation = mockUseMutation.mock.calls[0][0];
  const result = await mutation.mutationFn({ action: "restore", changes: [pending, review].map(before => ({ before, after: { ...before, status: "discarded", updatedAt: omittedAt } })) });
  for (const query of [first, changedElsewhere]) {
    expect(query.eq).toHaveBeenCalledWith("status", "discarded");
    expect(query.eq).toHaveBeenCalledWith("updated_at", omittedAt);
  }
  expect(first.update).toHaveBeenCalledWith(expect.objectContaining({ status: "pending" }));
  expect(changedElsewhere.update).toHaveBeenCalledWith(expect.objectContaining({ status: "needs_review" }));
  expect(result.changes.map((change: any) => change.after.id)).toEqual([7]);
  expect(mockFrom).toHaveBeenCalledTimes(2);
});

it("un error de lote conserva los pendientes y permite reintentar", async () => {
  mockFrom.mockReturnValue(chain(null, { message: "offline" }));
  useDetectedMovementOmissionsMutation("tester", 1);
  const mutation = mockUseMutation.mock.calls[0][0];
  const target = omissionTarget(7), key = ["pending-detected-movements", "tester", 1];
  mockClient.setQueryData(key, [target]);
  const result = await mutation.mutationFn({ action: "omit", suggestions: [target] });
  mutation.onSuccess(result);
  expect(result).toEqual({ changes: [], failed: 1 });
  expect(mockClient.getQueryData(key)).toEqual([target]);
  expect(mockFrom).toHaveBeenCalledTimes(1);
});
