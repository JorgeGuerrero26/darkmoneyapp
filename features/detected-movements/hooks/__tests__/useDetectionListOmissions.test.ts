import React from "react";
import { useDetectionListOmissions } from "../useDetectionListOmissions";
import type { DetectedMovementSuggestion } from "../../../../services/queries/notification-detection";

const { create, act } = require("react-test-renderer");
const mockMutate = jest.fn(), mockToast = jest.fn(), mockError = jest.fn(), mockResolved = jest.fn();
jest.mock("../../../../services/queries/notification-detection", () => ({ useDetectedMovementOmissionsMutation: () => ({ mutateAsync: mockMutate }) }));
jest.mock("../../../../hooks/useToast", () => ({ useToast: () => ({ showRichToast: mockToast, showErrorToast: mockError }) }));
let current: ReturnType<typeof useDetectionListOmissions>, renderer: ReturnType<typeof create>;
const receipt = (id: number) => ({ id, userId: "tester", workspaceId: 1, status: "pending", description: `Pago ${id}` }) as DetectedMovementSuggestion;
function Harness({ pending }: { pending: DetectedMovementSuggestion[] }) { current = useDetectionListOmissions("tester", 1, pending, mockResolved); return null; }
beforeEach(() => { jest.clearAllMocks(); });
afterEach(async () => { if (renderer) await act(async () => renderer.unmount()); });
async function render(pending = [receipt(7), receipt(8)]) { await act(async () => { renderer = create(React.createElement(Harness, { pending })); }); }

it("Omitir todos pide confirmación y excluye correos llegados después", async () => {
  const first = receipt(7), second = receipt(8);
  await render([first, second]);
  await act(async () => current.requestOmitAll());
  expect(mockMutate).not.toHaveBeenCalled();
  await act(async () => renderer.update(React.createElement(Harness, { pending: [first, second, receipt(9)] })));
  mockMutate.mockResolvedValue({ changes: [first, second].map(before => ({ before, after: { ...before, status: "discarded" } })), failed: 0 });
  await act(async () => current.confirmOmitAll());
  expect(mockMutate).toHaveBeenCalledWith({ action: "omit", suggestions: [first, second] });
  expect(mockResolved).toHaveBeenCalledWith([7, 8]);
  expect(current.confirmation).toBeNull();
  const banner = mockToast.mock.calls[0][0];
  expect(banner.title).toBe("2 detecciones omitidas");
  mockMutate.mockResolvedValue({ changes: [], failed: 0 });
  await act(async () => banner.onUndo());
  expect(mockMutate).toHaveBeenLastCalledWith({ action: "restore", changes: expect.arrayContaining([expect.objectContaining({ before: first }), expect.objectContaining({ before: second })]) });
});

it("cancelar la confirmación no cambia ninguna detección", async () => {
  await render();
  await act(async () => current.requestOmitAll());
  await act(async () => current.cancel());
  await act(async () => current.confirmOmitAll());
  expect(mockMutate).not.toHaveBeenCalled();
});

it("omitir una fila bloquea pulsaciones repetidas y conserva las demás", async () => {
  let finish: (value: unknown) => void = () => {};
  mockMutate.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  await render();
  await act(async () => { current.omitOne(8); current.omitOne(8); current.requestOmitAll(); });
  expect(mockMutate).toHaveBeenCalledTimes(1);
  expect(current.busy).toBe(true);
  expect(current.omittingId).toBe(8);
  expect(current.confirmation).toBeNull();
  await act(async () => finish({ changes: [{ before: receipt(8), after: { ...receipt(8), status: "discarded" } }], failed: 0 }));
  expect(mockResolved).toHaveBeenCalledWith([8]);
  expect(current.busy).toBe(false);
});

it("el fallo conserva la lista y permite repetir la acción", async () => {
  mockMutate.mockResolvedValue({ changes: [], failed: 2 });
  await render();
  await act(async () => current.requestOmitAll());
  await act(async () => current.confirmOmitAll());
  expect(current.error).toContain("No se pudieron omitir 2");
  expect(mockResolved).not.toHaveBeenCalled();
  expect(mockToast).not.toHaveBeenCalled();
  expect(current.busy).toBe(false);
});
