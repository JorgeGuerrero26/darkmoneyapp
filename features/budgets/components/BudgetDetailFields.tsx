import { memo } from "react";
import { StyleSheet, View } from "react-native";
import { format } from "date-fns";
import { es } from "date-fns/locale";

import { formatCurrency } from "../../../components/ui/AmountDisplay";
import { DetailFieldRow } from "../../../components/ui/DetailFieldRow";
import { currencyPluralTitle } from "../../../constants/currencies";
import { SPACING } from "../../../constants/theme";
import { parseDisplayDate, todayPeru } from "../../../lib/date";
import type { BudgetOverview } from "../../../types/domain";
import { budgetRecurrenceLabel, displayBudgetRecurrence } from "../lib/budgetRecurrence";
import { budgetScopeSummary } from "../lib/budgetScopeSummary";

type Props = { budget: BudgetOverview };

function displayDate(value: string): string {
  return format(parseDisplayDate(value), "d MMM yyyy", { locale: es });
}

export const BudgetDetailFields = memo(function BudgetDetailFields({ budget }: Props) {
  const today = todayPeru();
  const status = !budget.isActive ? "Inactivo"
    : budget.periodEnd < today ? "Finalizado"
    : budget.periodStart > today ? "Próximo"
    : "En curso";
  const recurrence = displayBudgetRecurrence(budget);
  const notes = budget.notes?.trim();

  return (
    <View style={styles.list}>
      <DetailFieldRow label="Nombre" value={budget.name} />
      <DetailFieldRow label="Estado" value={status} />
      <DetailFieldRow label="Límite" value={formatCurrency(budget.limitAmount, budget.currencyCode)} />
      <DetailFieldRow label="Qué limita" value={budgetScopeSummary(budget.categoryName ?? null, budget.accountName ?? null, budget.spendTypeName)} />
      <DetailFieldRow label="Moneda" value={currencyPluralTitle(budget.currencyCode)} />
      <DetailFieldRow label="Se renueva" value={budgetRecurrenceLabel(recurrence)} />
      <DetailFieldRow label="Desde" value={displayDate(budget.periodStart)} />
      <DetailFieldRow label="Hasta" value={displayDate(budget.periodEnd)} />
      <DetailFieldRow label="Aviso al llegar al" value={`${budget.alertPercent}%`} />
      <DetailFieldRow label="Arrastrar saldo" value={budget.rolloverEnabled ? "Sí" : "No"} />
      {notes ? <DetailFieldRow label="Notas" value={notes} valueLines={0} /> : null}
      <DetailFieldRow label="Fijado en la lista" value={budget.isPinned ? "Sí" : "No"} last />
    </View>
  );
});

const styles = StyleSheet.create({ list: { paddingTop: SPACING.xs } });
