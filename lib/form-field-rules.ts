import { parseAmountInput, type ParseAmountKind } from "./amount-parsing";
import type { FormFieldRule } from "../components/ui/FormFeedback";

export function requiredField(value: unknown, message: string, invalid?: string | null, open?: () => void): FormFieldRule {
  const empty = value == null || (typeof value === "string" && !value.trim());
  return { value, missing: empty ? message : null, invalid: empty ? null : invalid, open };
}
export function positiveAmountField(value: string, message = "Ingresa el monto", invalid?: string | null, open?: () => void): FormFieldRule {
  const number = parseFormAmountInput(value);
  return requiredField(value, message, number == null || number <= 0 ? "El monto debe ser mayor a cero" : invalid, open);
}
export function integerField(value: string, min: number, max: number, optional = false): FormFieldRule {
  const number = Number(value);
  return { value, missing: !optional && !value.trim() ? "Ingresa un número" : null,
    invalid: value.trim() && (!Number.isInteger(number) || number < min || number > max) ? `Ingresa un número entre ${min} y ${max}` : null };
}

export function emailField(value: string, optional = false): FormFieldRule {
  const rule = requiredField(value, "Escribe tu correo", /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim()) ? null : "Escribe un correo válido");
  return optional ? { ...rule, missing: null } : rule;
}

export function passwordField(value: string, minimum = 0): FormFieldRule {
  return requiredField(value, "Escribe tu contraseña", value.length < minimum ? `Usa al menos ${minimum} caracteres` : null);
}

export function selectedAccountField(value: number | null, accounts: readonly { id: number; isArchived?: boolean }[], optional = false): FormFieldRule {
  const rule = requiredField(value, accounts.length ? "Elige una cuenta" : "Crea una cuenta para continuar", value != null && !accounts.some((account) => account.id === value && !account.isArchived) ? "Esta cuenta ya no está disponible" : null);
  return { ...rule, missing: optional ? null : rule.missing, serverKeys: ["settlement_account_id"] };
}

/** Form input is numeric; unlike receipt extraction, letters must not silently disappear. */
export function parseFormAmountInput(value: string | null | undefined, kind: ParseAmountKind = "amount"): number | null {
  if (value == null || !/^-?[\d.,\s]+$/.test(value.trim())) return null;
  return parseAmountInput(value, { kind });
}

export function optionalNumberField(value: string, options: { positive?: boolean; nonnegative?: boolean; kind?: ParseAmountKind } = {}): FormFieldRule {
  const number = parseFormAmountInput(value, options.kind);
  return { value, invalid: !value.trim() ? null : number == null ? "Escribe un número válido"
    : options.positive && number <= 0 ? "El monto debe ser mayor a cero"
      : options.nonnegative && number < 0 ? "El valor no puede ser negativo" : null };
}

export function dateField(value: string, options: { optional?: boolean; min?: string; max?: string } = {}): FormFieldRule {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  const date = match ? new Date(`${value}T12:00:00Z`) : null;
  const valid = date != null && Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
  const rule = requiredField(value, "Elige una fecha", !valid ? "Elige una fecha válida"
    : options.min && value < options.min ? "La fecha debe ser igual o posterior al inicio"
      : options.max && value > options.max ? "La fecha no puede ser futura" : null);
  return options.optional ? { ...rule, missing: null } : rule;
}
