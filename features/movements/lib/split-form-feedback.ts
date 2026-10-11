import type { FormFieldRule } from "../../../components/ui/FormFeedback";
import { positiveAmountField, requiredField } from "../../../lib/form-field-rules";
import type { SplitLine } from "./split-movement";
import type { SplitAllocation } from "./splitAllocation";

export function splitFormFields(lines: SplitLine[], allocation: SplitAllocation): Record<string, FormFieldRule> {
  const fields: Record<string, FormFieldRule> = {};
  lines.forEach((line, index) => {
    fields[`category-${index}`] = requiredField(line.categoryId, "Elige una categoría",
      line.categoryId != null && lines.slice(0, index).some((previous) => previous.categoryId === line.categoryId) ? "Esta categoría ya tiene una parte; junta sus montos" : null);
    fields[`amount-${index}`] = positiveAmountField(line.amount);
  });
  if (lines.length === 1) fields["amount-0"].invalid = "Reparte el movimiento en al menos dos partes";
  const last = `amount-${Math.max(0, lines.length - 1)}`;
  if (fields[last] && !fields[last].missing && !fields[last].invalid && Math.abs(allocation.remaining) > 0.009) {
    fields[last].invalid = allocation.remaining > 0 ? `Falta repartir ${allocation.remaining.toFixed(2)}` : `Reduce el reparto en ${Math.abs(allocation.remaining).toFixed(2)}`;
  }
  return fields;
}
