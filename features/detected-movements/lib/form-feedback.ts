import type { AccountSummary } from "../../../types/domain";
import { positiveAmountField, requiredField } from "../../../lib/form-field-rules";
import type { FormFieldRule } from "../../../components/ui/FormFeedback";
import type { DetectionDraft } from "./review-draft";

export function detectionFormFields(draft: DetectionDraft, accounts: readonly AccountSummary[], today: string): Record<string, FormFieldRule> {
  const source = accounts.find((a) => !a.isArchived && a.id === draft.accountId);
  const destination = accounts.find((a) => !a.isArchived && a.id === draft.destinationAccountId);
  const transfer = draft.movementType === "transfer";
  const fields: Record<string, FormFieldRule> = {
    description: requiredField(draft.description, "Escribe la descripción"),
    amount: positiveAmountField(draft.amount),
    date: requiredField(draft.date && draft.time ? `${draft.date} ${draft.time}` : "", "Elige la fecha y hora",
      !/^\d{4}-\d{2}-\d{2}$/.test(draft.date) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(draft.time) || Number.isNaN(new Date(`${draft.date}T${draft.time}:00-05:00`).getTime())
        ? "Elige una fecha y hora válidas" : draft.movementType === "expense" && draft.date > today ? "Un gasto no puede tener fecha futura" : null),
    accountId: requiredField(draft.accountId, transfer ? "Elige el origen" : "Elige una cuenta", !source ? "Esta cuenta ya no está disponible" : null),
  };
  if (transfer) {
    fields.destinationAccountId = requiredField(draft.destinationAccountId, "Elige el destino", !destination ? "Esta cuenta ya no está disponible" : source?.id === destination.id ? "El destino debe ser diferente del origen" : null);
    if (source && destination && source.currencyCode !== destination.currencyCode) {
      fields.destinationAmount = positiveAmountField(draft.destinationAmount, "Indica cuánto llega");
      fields.fxRate = positiveAmountField(draft.fxRate, "Ingresa el tipo de cambio");
    }
  }
  return fields;
}
