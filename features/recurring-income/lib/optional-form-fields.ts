import { dateField, optionalNumberField, positiveAmountField, requiredField } from "../../../lib/form-field-rules";
import type { FormFieldRule } from "../../../components/ui/FormFeedback";
import type { DeductionDraft } from "./incomeBreakdown";
import type { ScheduledChangeDraft } from "./scheduledChanges";

export function incomeOptionalFields(gross: string, deductions: readonly DeductionDraft[], changes: readonly ScheduledChangeDraft[]): Record<string, FormFieldRule> {
  const fields: Record<string, FormFieldRule> = { grossAmount: optionalNumberField(gross, { positive: true }) };
  for (const row of deductions) {
    fields[`deduction-name-${row.key}`] = requiredField(row.name, "Escribe el concepto", row.name.trim().length > 60 ? "Usa como máximo 60 caracteres" : null);
    fields[`deduction-amount-${row.key}`] = positiveAmountField(row.amount);
  }
  const seen = new Set<string>();
  for (const row of changes) {
    const duplicate = seen.has(row.date);
    seen.add(row.date);
    fields[`change-date-${row.key}`] = { ...dateField(row.date), invalid: duplicate && row.date ? "Ya hay un cambio para esta fecha" : dateField(row.date).invalid };
    fields[`change-amount-${row.key}`] = positiveAmountField(row.amount);
  }
  return fields;
}
