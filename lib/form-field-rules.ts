import { parsePositiveAmountInput } from "./amount-parsing";
import type { FormFieldRule } from "../components/ui/FormFeedback";

export function requiredField(value: unknown, message: string, invalid?: string | null, open?: () => void): FormFieldRule {
  const empty = value == null || (typeof value === "string" && !value.trim());
  return { value, missing: empty ? message : null, invalid: empty ? null : invalid, open };
}
export function positiveAmountField(value: string, message = "Ingresa el monto", invalid?: string | null, open?: () => void): FormFieldRule {
  return requiredField(value, message, parsePositiveAmountInput(value) == null ? "El monto debe ser mayor a cero" : invalid, open);
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
