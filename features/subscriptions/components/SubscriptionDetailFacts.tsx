import { StyleSheet, View } from "react-native";
import { format } from "date-fns";
import { es } from "date-fns/locale";

import { DetailFieldRow } from "../../../components/ui/DetailFieldRow";
import { currencyPluralTitle } from "../../../constants/currencies";
import { SPACING } from "../../../constants/theme";
import { parseDisplayDate } from "../../../lib/date";
import { subscriptionRecurrencePhrase } from "../../../lib/subscription-helpers";
import type { SubscriptionSummary } from "../../../types/domain";

type Props = {
  subscription: SubscriptionSummary;
  onPickAccount: () => void;
  onPickCategory: () => void;
};

function displayDate(value: string): string {
  return format(parseDisplayDate(value), "d MMM yyyy", { locale: es });
}

const STATUS_LABELS: Record<SubscriptionSummary["status"], string> = {
  active: "Activa",
  paused: "Pausada",
  cancelled: "Cancelada",
};

/** Las características usan la misma fila de lectura de Movimientos y Cuentas. */
export function SubscriptionDetailFacts({ subscription, onPickAccount, onPickCategory }: Props) {
  const remind = subscription.remindDaysBefore;
  const accountName = subscription.accountName?.trim();
  const categoryName = subscription.categoryName?.trim();
  const description = subscription.description?.trim();
  const notes = subscription.notes?.trim();

  return (
    <View style={styles.list}>
      <DetailFieldRow label="Nombre" value={subscription.name} />
      {subscription.vendor?.trim() ? <DetailFieldRow label="Proveedor" value={subscription.vendor.trim()} /> : null}
      <DetailFieldRow label="Estado" value={STATUS_LABELS[subscription.status]} />
      <DetailFieldRow label="Moneda" value={currencyPluralTitle(subscription.currencyCode)} />
      <DetailFieldRow
        label="Se repite"
        value={subscriptionRecurrencePhrase(
          subscription.intervalCount,
          subscription.frequency,
          subscription.dayOfMonth,
        )}
      />
      <DetailFieldRow label="Fecha de inicio" value={displayDate(subscription.startDate)} />
      <DetailFieldRow label="Próximo cobro" value={displayDate(subscription.nextDueDate)} />
      {subscription.endDate ? <DetailFieldRow label="Fecha de fin" value={displayDate(subscription.endDate)} /> : null}
      <DetailFieldRow
        label="Avisarme antes"
        value={remind > 0 ? `${remind} ${remind === 1 ? "día" : "días"}` : "Sin aviso"}
      />
      <DetailFieldRow
        label="Se paga con"
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
        label="Anotar gasto solo"
        value={subscription.autoCreateMovement ? (accountName ? "Sí" : "Requiere cuenta") : "No"}
        muted={subscription.autoCreateMovement && !accountName}
      />
      {description ? <DetailFieldRow label="Descripción" value={description} valueLines={0} /> : null}
      {notes ? <DetailFieldRow label="Notas" value={notes} valueLines={0} /> : null}
      <DetailFieldRow label="Fijada en la lista" value={subscription.isPinned ? "Sí" : "No"} last />
    </View>
  );
}

const styles = StyleSheet.create({ list: { paddingTop: SPACING.xs } });
