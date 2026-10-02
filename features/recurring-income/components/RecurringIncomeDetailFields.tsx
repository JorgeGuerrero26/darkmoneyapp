import { StyleSheet, View } from "react-native";
import { format } from "date-fns";
import { es } from "date-fns/locale";

import { DetailFieldRow } from "../../../components/ui/DetailFieldRow";
import { currencyPluralTitle } from "../../../constants/currencies";
import { SPACING } from "../../../constants/theme";
import { parseDisplayDate } from "../../../lib/date";
import { subscriptionRecurrencePhrase } from "../../../lib/subscription-helpers";
import type { RecurringIncomeSummary } from "../../../types/domain";

type Props = {
  item: RecurringIncomeSummary;
  onPickPayer: () => void;
  onPickAccount: () => void;
  onPickCategory: () => void;
};

const STATUS_LABELS: Record<RecurringIncomeSummary["status"], string> = {
  active: "Activo",
  paused: "En pausa",
  cancelled: "Cancelado",
};

function displayDate(value: string): string {
  return format(parseDisplayDate(value), "d MMM yyyy", { locale: es });
}

export function RecurringIncomeDetailFields({ item, onPickPayer, onPickAccount, onPickCategory }: Props) {
  const accountName = item.accountName?.trim();
  const categoryName = item.categoryName?.trim();
  const payerName = item.payer?.trim();
  const description = item.description?.trim();
  const notes = item.notes?.trim();
  const remind = item.remindDaysBefore;

  return (
    <View style={styles.list}>
      <DetailFieldRow label="Nombre" value={item.name} />
      <DetailFieldRow label="Estado" value={STATUS_LABELS[item.status]} />
      <DetailFieldRow label="Moneda" value={currencyPluralTitle(item.currencyCode)} />
      <DetailFieldRow
        label="Se repite"
        value={subscriptionRecurrencePhrase(item.intervalCount, item.frequency, item.dayOfMonth)}
      />
      <DetailFieldRow label="Fecha de inicio" value={displayDate(item.startDate)} />
      <DetailFieldRow label="Llegada prevista" value={displayDate(item.nextExpectedDate)} />
      {item.endDate ? <DetailFieldRow label="Fecha de fin" value={displayDate(item.endDate)} /> : null}
      <DetailFieldRow
        label="Avisarme antes"
        value={remind > 0 ? `${remind} ${remind === 1 ? "día" : "días"}` : "Sin aviso"}
      />
      <DetailFieldRow
        label="Entra a"
        value={accountName || "Sin cuenta"}
        muted={!accountName}
        action={!accountName}
        onPress={accountName ? undefined : onPickAccount}
      />
      <DetailFieldRow
        label="Categoría"
        value={categoryName || "Sin categoría"}
        muted={!categoryName}
        action={!categoryName}
        onPress={categoryName ? undefined : onPickCategory}
      />
      <DetailFieldRow
        label="Quién paga"
        value={payerName || "Nadie elegido"}
        muted={!payerName}
        action={!payerName}
        onPress={onPickPayer}
      />
      {description ? <DetailFieldRow label="Descripción" value={description} valueLines={0} /> : null}
      {notes ? <DetailFieldRow label="Notas" value={notes} valueLines={0} /> : null}
      <DetailFieldRow label="Fijado en la lista" value={item.isPinned ? "Sí" : "No"} last />
    </View>
  );
}

const styles = StyleSheet.create({ list: { paddingTop: SPACING.xs } });
