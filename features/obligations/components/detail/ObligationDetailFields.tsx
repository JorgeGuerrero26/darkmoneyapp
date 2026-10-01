import { format } from "date-fns";
import { es } from "date-fns/locale";
import { View } from "react-native";

import { formatCurrency } from "../../../../components/ui/AmountDisplay";
import { DetailFieldRow } from "../../../../components/ui/DetailFieldRow";
import { currencyPluralTitle } from "../../../../constants/currencies";
import { getObligationStatusLabel } from "../../../../lib/obligation-labels";
import { parseDisplayDate } from "../../../../lib/date";
import type { ObligationSummary, SharedObligationSummary } from "../../../../types/domain";

const ORIGIN_LABELS: Record<ObligationSummary["originType"], string> = {
  cash_loan: "Préstamo de dinero",
  sale_financed: "Venta a crédito",
  purchase_financed: "Compra a crédito",
  paid_for_other: "Pago por otra persona",
  manual: "Registro manual",
};

type Props = {
  obligation: ObligationSummary | SharedObligationSummary;
  directionLabel: string;
};

export function ObligationDetailFields({ obligation, directionLabel }: Props) {
  const money = (amount: number) => formatCurrency(amount, obligation.currencyCode);
  const date = (value: string) => format(parseDisplayDate(value), "d MMM yyyy", { locale: es });
  const adjustedPrincipal = obligation.currentPrincipalAmount ?? obligation.principalAmount;

  return (
    <View>
      <DetailFieldRow label="Nombre" value={obligation.title} />
      <DetailFieldRow label="Tipo" value={directionLabel} />
      <DetailFieldRow label="Origen" value={ORIGIN_LABELS[obligation.originType]} />
      <DetailFieldRow label="Contacto" value={obligation.counterparty || "Sin contacto"} muted={!obligation.counterparty} />
      {"share" in obligation ? (
        <DetailFieldRow label="Compartido por" value={obligation.share.ownerDisplayName?.trim() || "Otro usuario"} />
      ) : null}
      <DetailFieldRow label="Estado" value={getObligationStatusLabel(obligation.status)} />
      <DetailFieldRow label="Moneda" value={currencyPluralTitle(obligation.currencyCode)} />
      <DetailFieldRow label="Monto inicial" value={money(obligation.principalAmount)} />
      {Math.abs(adjustedPrincipal - obligation.principalAmount) > 0.005 ? (
        <DetailFieldRow label="Monto ajustado" value={money(adjustedPrincipal)} />
      ) : null}
      <DetailFieldRow label="Fecha de inicio" value={date(obligation.startDate)} />
      <DetailFieldRow label="Vencimiento" value={obligation.dueDate ? date(obligation.dueDate) : "Sin fecha"} muted={!obligation.dueDate} />
      {obligation.installmentAmount != null ? (
        <DetailFieldRow label="Cuota pactada" value={money(obligation.installmentAmount)} />
      ) : null}
      {obligation.installmentCount != null ? (
        <DetailFieldRow label="Número de cuotas" value={String(obligation.installmentCount)} />
      ) : null}
      {obligation.interestRate != null ? (
        <DetailFieldRow label="Interés" value={`${obligation.interestRate}%`} />
      ) : null}
      <DetailFieldRow label="Cuenta de liquidación" value={obligation.settlementAccountName || "Sin cuenta"} muted={!obligation.settlementAccountName} last={!obligation.description?.trim() && !obligation.notes?.trim()} />
      {obligation.description?.trim() ? <DetailFieldRow label="Descripción" value={obligation.description.trim()} valueLines={0} last={!obligation.notes?.trim()} /> : null}
      {obligation.notes?.trim() ? <DetailFieldRow label="Notas" value={obligation.notes.trim()} valueLines={0} last /> : null}
    </View>
  );
}
