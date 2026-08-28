import { ArrowDownLeft, ArrowUpRight, Scale } from "lucide-react-native";

import { formatCurrency } from "../../../components/ui/AmountDisplay";
import { MetricSummaryBar } from "../../../components/ui/MetricSummaryBar";
import { COLORS } from "../../../constants/theme";

type Props = {
  receivableTotal: number;
  payableTotal: number;
  netTotal: number;
  currencyCode: string;
};

export function ObligationSummaryBar({
  receivableTotal,
  payableTotal,
  netTotal,
  currencyCode,
}: Props) {
  const meDeben = receivableTotal > 0;
  const debo = payableTotal > 0;
  // La cifra es la que domina; si las dos existen, manda el neto.
  const headline = meDeben && debo
    ? { label: netTotal >= 0 ? "Neto a favor" : "Neto en contra", amount: Math.abs(netTotal), color: netTotal >= 0 ? COLORS.income : COLORS.expense }
    : debo
      ? { label: "Debes", amount: payableTotal, color: COLORS.expense }
      : { label: "Te deben", amount: receivableTotal, color: COLORS.income };

  const partes: string[] = [];
  if (meDeben && debo) {
    partes.push(`Te deben ${formatCurrency(receivableTotal, currencyCode)}`);
    partes.push(`debes ${formatCurrency(payableTotal, currencyCode)}`);
  } else if (!debo) {
    partes.push("No debes nada");
  } else {
    partes.push("Nadie te debe");
  }

  return (
    <MetricSummaryBar
      label={headline.label}
      value={formatCurrency(headline.amount, currencyCode)}
      valueColor={headline.color}
      support={partes.join(" · ")}
      help={{
        title: headline.label,
        description: "Suma de lo pendiente en tus créditos y deudas activos, convertido a la moneda que elegiste.",
      }}
    />
  );
}
