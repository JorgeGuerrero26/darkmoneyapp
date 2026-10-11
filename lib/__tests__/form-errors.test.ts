import { authFormError, FormFieldError, formErrorFields } from "../form-errors";

describe("form server errors", () => {
  const fields = { email: {}, accountId: { serverKeys: ["settlement_account_id"] }, principalAmount: {} };
  it("maps only known fields and keeps messages from explicit validators", () => {
    expect(formErrorFields(new FormFieldError({ email: "Correo incorrecto", unknown: "No mostrar" }), fields)).toEqual({ email: "Correo incorrecto" });
  });
  it("identifies a foreign key by column alias without treating it as deletion", () => {
    expect(formErrorFields({ code: "23503", message: "foreign key", details: "Key (settlement_account_id)=(4) is not present" }, fields)).toEqual({ accountId: "La selección ya no está disponible. Elige otra opción" });
  });
  it("maps not-null and unique errors to their single column", () => {
    expect(formErrorFields({ code: "23502", message: 'null value in column "principal_amount"' }, fields)).toEqual({ principalAmount: "Completa este dato" });
    expect(formErrorFields({ code: "23505", details: "Key (email)=(a@b.c) already exists" }, fields)).toEqual({ email: "Ya existe un registro con este dato" });
  });
  it("leaves network, permission, unknown and ambiguous constraints as operational failures", () => {
    for (const error of [new Error("Failed to fetch"), { code: "42501", message: 'column "email" permission denied' }, { code: "23514", message: 'constraint "workspace_email_account_id_check"' }, { code: "23502", message: 'column "user_id"' }]) {
      expect(formErrorFields(error, fields)).toEqual({});
    }
  });
  it("places correctable auth errors in a field and preserves transport errors", () => {
    expect(formErrorFields(authFormError({ code: "invalid_credentials" }), { password: {} })).toEqual({ password: "Correo o contraseña incorrectos" });
    expect(formErrorFields(authFormError({ code: "email_exists" }), fields)).toEqual({ email: "Ya existe una cuenta con ese correo" });
    const network = new Error("Failed to fetch");
    expect(authFormError(network)).toBe(network);
  });
});
