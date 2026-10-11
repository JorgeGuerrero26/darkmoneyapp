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
