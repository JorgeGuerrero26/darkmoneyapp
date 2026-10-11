import { humanizeError } from "./errors";

/** A server or domain validator can identify the field without coupling itself to UI. */
export class FormFieldError extends Error {
  constructor(public readonly fieldErrors: Record<string, string>) {
    super(Object.values(fieldErrors)[0] ?? "Revisa los datos");
    this.name = "FormFieldError";
  }
}

export type ServerField = { serverKeys?: readonly string[] };

/** Only explicit field errors and identifiable database columns belong to a field. */
export function formErrorFields(error: unknown, fields: Record<string, ServerField>): Record<string, string> {
  if (typeof error !== "object" || error === null) return {};
  const source = error as Record<string, unknown>;
  const result: Record<string, string> = {};
  const aliases = (id: string) => [id, id.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`), ...(fields[id].serverKeys ?? [])];
  const resolve = (key: string) => Object.keys(fields).find((id) => aliases(id).includes(key));
  if (typeof source.fieldErrors === "object" && source.fieldErrors !== null) {
    for (const [key, message] of Object.entries(source.fieldErrors)) {
      const id = resolve(key);
      if (id && typeof message === "string") result[id] = message;
    }
    return result;
  }
  const code = String(source.code ?? "");
  if (!["23502", "23503", "23505", "23514", "22003", "22P02"].includes(code)) return {};
  const details = [source.message, source.details].filter((value) => typeof value === "string").join(" ");
  const column = details.match(/column\s+["']([a-z_]+)["']/i)?.[1]
    ?? details.match(/Key\s*\(([a-z_]+)\)/i)?.[1];
  let id = column ? resolve(column) : undefined;
  if (!id) {
    const constraint = details.match(/constraint\s+["']([^"']+)["']/i)?.[1];
    if (constraint) {
      const candidates = Object.keys(fields).filter((key) => aliases(key).some((alias) => new RegExp(`(?:^|_)${alias}(?:_|$)`).test(constraint)));
      if (candidates.length === 1) id = candidates[0];
    }
  }
  if (!id) return {};
  result[id] = code === "23503" ? "La selección ya no está disponible. Elige otra opción"
    : code === "23505" ? "Ya existe un registro con este dato"
      : code === "23502" ? "Completa este dato"
        : code === "22003" ? "El valor es demasiado grande"
          : "Revisa este dato: el valor no es válido";
  return result;
}

/** Authentication failures that the user can correct belong to their input. */
export function authFormError(error: unknown): unknown {
  const source = typeof error === "object" && error !== null ? error as Record<string, unknown> : {};
  const code = String(source.code ?? "");
  const message = String(source.message ?? "");
  if (code === "invalid_credentials" || /invalid login credentials/i.test(message)) {
    return new FormFieldError({ password: "Correo o contraseña incorrectos" });
  }
  if (code === "email_not_confirmed" || /email not confirmed/i.test(message)) {
    return new FormFieldError({ email: "Confirma tu correo antes de ingresar" });
  }
  if (["user_already_exists", "email_exists"].includes(code) || /already (?:been )?registered/i.test(message)) {
    return new FormFieldError({ email: "Ya existe una cuenta con ese correo" });
  }
  if (["weak_password", "same_password"].includes(code) || /password should be/i.test(message)) {
    return new FormFieldError({ password: code === "same_password" ? "Elige una contraseña diferente de la actual" : humanizeError(error) });
  }
  return error;
}
