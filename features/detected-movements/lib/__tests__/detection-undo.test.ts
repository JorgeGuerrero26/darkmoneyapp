/** @jest-environment node */
import { requestDetectedRegistrationUndo } from "../detection-undo";

const input = { workspaceId: 8, suggestionId: 90, movementId: 70 };
const result = { workspaceId: 8, suggestionId: 90, status: "pending", movementId: null, deletedMovementIds: [70, 71], alreadyUndone: false };

describe("deshacer registro detectado", () => {
  it("uses the captured workspace and one RPC for the complete registration", async () => {
    const rpc = jest.fn().mockResolvedValue({ data: result, error: null });
    expect(await requestDetectedRegistrationUndo({ rpc }, input)).toEqual(result);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("undo_detected_movement_registration", {
      p_workspace_id: 8, p_suggestion_id: 90, p_expected_movement_id: 70,
    });
  });
  it("accepts a successful lost-response retry", async () => {
    const rpc = jest.fn().mockResolvedValue({ data: { ...result, alreadyUndone: true }, error: null });
    expect((await requestDetectedRegistrationUndo({ rpc }, input)).alreadyUndone).toBe(true);
  });
  it("does not call the server with invalid IDs", async () => {
    const rpc = jest.fn();
    await expect(requestDetectedRegistrationUndo({ rpc }, { ...input, movementId: 0 })).rejects.toThrow("disponible");
    expect(rpc).not.toHaveBeenCalled();
  });
  it.each([{ workspaceId: 9 }, { suggestionId: 91 }, { status: "registered" }, { deletedMovementIds: [71] }, { deletedMovementIds: [70, 70] }])("rejects an unconfirmed server result %p", async (change) => {
    const rpc = jest.fn().mockResolvedValue({ data: { ...result, ...change }, error: null });
    await expect(requestDetectedRegistrationUndo({ rpc }, input)).rejects.toThrow("confirmar");
  });
  it("never falls back to delete/update when the transaction is missing", async () => {
    const rpc = jest.fn().mockResolvedValue({ data: null, error: { code: "PGRST202", message: "not found" } });
    await expect(requestDetectedRegistrationUndo({ rpc }, input)).rejects.toThrow("falta desplegar");
    expect(rpc).toHaveBeenCalledTimes(1);
  });
  it("surfaces permission failures without claiming success", async () => {
    const rpc = jest.fn().mockResolvedValue({ data: null, error: { message: "PRO requerido" } });
    await expect(requestDetectedRegistrationUndo({ rpc }, input)).rejects.toThrow("PRO requerido");
  });
});
