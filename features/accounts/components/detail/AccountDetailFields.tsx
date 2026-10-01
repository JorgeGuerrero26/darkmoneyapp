import { memo } from "react";
import { StyleSheet, View } from "react-native";
import { format } from "date-fns";
import { es } from "date-fns/locale";

import { DetailFieldRow } from "../../../../components/ui/DetailFieldRow";
import { formatCurrency } from "../../../../components/ui/AmountDisplay";
import { currencyPluralTitle } from "../../../../constants/currencies";
import { COLORS, SPACING } from "../../../../constants/theme";
import { getAccountIcon, getAccountIconOption } from "../../../../lib/account-icons";
import { findInstitution } from "../../../../lib/account-institutions";
import { parseDisplayDate } from "../../../../lib/date";
import type { AccountSummary } from "../../../../types/domain";
import { accountDetailTypeLabel } from "../../lib/account-detail-labels";

type Props = { account: AccountSummary };

export const AccountDetailFields = memo(function AccountDetailFields({ account }: Props) {
  const institution = findInstitution(account.institutionCode)?.label;
  const Icon = getAccountIcon(account.icon, account.type);
  const appearance = getAccountIconOption(account.icon)?.label ?? accountDetailTypeLabel(account.type);

  return (
    <View style={styles.list}>
      <DetailFieldRow label="Nombre" value={account.name} />
      <DetailFieldRow label="Tipo" value={accountDetailTypeLabel(account.type)} />
      <DetailFieldRow label="Institución" value={institution ?? "Ninguna"} muted={!institution} />
      <DetailFieldRow label="Moneda" value={currencyPluralTitle(account.currencyCode)} />
      <DetailFieldRow label="Saldo inicial" value={formatCurrency(account.openingBalance, account.currencyCode)} />
      <DetailFieldRow label="Cuenta en patrimonio" value={account.includeInNetWorth ? "Sí" : "No"} />
      <DetailFieldRow label="Estado" value={account.isArchived ? "Archivada" : "Activa"} />
      {account.lastActivity ? (
        <DetailFieldRow label="Última actualización" value={format(parseDisplayDate(account.lastActivity), "d MMM yyyy", { locale: es })} />
      ) : null}
      {account.type === "credit_card" ? (
        <>
          <DetailFieldRow label="Día de corte" value={account.statementDay == null ? "Sin definir" : String(account.statementDay)} muted={account.statementDay == null} />
          <DetailFieldRow label="Día de pago" value={account.paymentDay == null ? "Sin definir" : String(account.paymentDay)} muted={account.paymentDay == null} />
          <DetailFieldRow label="Línea de crédito" value={account.creditLimit == null ? "Sin definir" : formatCurrency(account.creditLimit, account.currencyCode)} muted={account.creditLimit == null} />
        </>
      ) : null}
      <DetailFieldRow
        label="Apariencia"
        value={appearance}
        valueAdornment={<Icon size={17} color={account.color || COLORS.fog} />}
        last
      />
    </View>
  );
});

const styles = StyleSheet.create({ list: { paddingTop: SPACING.xs } });
