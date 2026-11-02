jest.mock("../../../lib/supabase", () => ({
  supabaseUrl: "https://ejemplo.supabase.co",
  supabaseAnonKey: "anon",
  supabase: { auth: { getSession: jest.fn(async () => ({ data: { session: { access_token: "token" } } })) } },
}));

// eslint-disable-next-line import/first
import { deleteMyAccount, fetchAccountDeletionPreview } from "../account-deletion";

function respond(status: number, body: unknown) {
  (global as { fetch: unknown }).fetch = jest.fn(async () => ({ status, json: async () => body }));
}

describe("eliminar la cuenta: respuestas del servidor", () => {
  it("200 deleted → la cuenta se eliminó, y la llamada lleva la sesión y la palabra", async () => {
    respond(200, { deleted: true });
    expect(await deleteMyAccount("ELIMINAR")).toEqual({ kind: "deleted" });
    const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toBe("https://ejemplo.supabase.co/functions/v1/delete-account");
    expect(init.headers.Authorization).toBe("Bearer token");
    expect(JSON.parse(init.body)).toEqual({ confirm: "ELIMINAR" });
  });

  it("409 → primero cancela Pro, con el enlace a la web", async () => {
    respond(409, { error: "cancel_pro_first", message: "Cancela Pro primero.", manageUrl: "https://darkmoney.company/settings" });
    expect(await deleteMyAccount("ELIMINAR")).toEqual({
      kind: "cancel_pro_first",
      message: "Cancela Pro primero.",
      manageUrl: "https://darkmoney.company/settings",
    });
  });

  it("400, 401, 500 y sin red → un mensaje que se muestra dentro del diálogo", async () => {
    respond(400, { error: "bad_confirm" });
    expect(await deleteMyAccount("borrar")).toEqual({ kind: "error", message: "Escribe ELIMINAR para confirmar." });
    respond(401, { error: "unauthorized" });
    expect((await deleteMyAccount("ELIMINAR")).kind).toBe("error");
    respond(500, { error: "delete_failed" });
    expect(await deleteMyAccount("ELIMINAR")).toMatchObject({ kind: "error" });
    (global as { fetch: unknown }).fetch = jest.fn(async () => {
      throw new Error("Network request failed");
    });
    expect(await deleteMyAccount("ELIMINAR")).toMatchObject({ kind: "error" });
  });

  it("la vista previa dice si Pro se sigue cobrando y qué espacios pasan a otra persona", async () => {
    respond(200, { mustCancelPro: false, manageUrl: "https://darkmoney.company/settings", transfers: [{ workspaceName: "Casa", newOwnerName: "Ana" }] });
    expect(await fetchAccountDeletionPreview()).toEqual({
      mustCancelPro: false,
      manageUrl: "https://darkmoney.company/settings",
      transfers: [{ workspaceName: "Casa", newOwnerName: "Ana" }],
    });
  });
});
