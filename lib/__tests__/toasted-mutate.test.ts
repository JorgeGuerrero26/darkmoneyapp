import { toastedMutate } from "../toasted-mutate";

describe("mutation failure ownership", () => {
  it("keeps default toast behavior for list actions", async () => {
    const showToast = jest.fn(), error = new Error("Sin conexión");
    expect(await toastedMutate({ mutate: async () => { throw error; }, input: {}, showToast, successMessage: "Listo" })).toBe(false);
    expect(showToast).toHaveBeenCalledTimes(1);
  });
  it("returns raw server errors to a form without duplicating the toast", async () => {
    const showToast = jest.fn(), error = { code: "23503", details: "Key (account_id)=(5) is not present", message: "foreign key" };
    await expect(toastedMutate({ mutate: async () => { throw error; }, input: {}, showToast, successMessage: "Listo", errorMode: "throw" })).rejects.toBe(error);
    expect(showToast).not.toHaveBeenCalled();
  });
});
