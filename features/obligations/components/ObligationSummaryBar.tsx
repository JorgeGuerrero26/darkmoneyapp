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
  return (
    <MetricSummaryBar
      items={[
        {
          key: "receivable",
          icon: ArrowDownLeft,
          value: formatCurrency(receivableTotal, currencyCode),
          label: "por cobrar",
          compactLabel: "cobrar",
          color: COLORS.pine,
          helpTitle: "Total por cobrar",
          helpDescription: "Monto pendiente que otras personas te deben dentro de los créditos y deudas visibles.",
        },
        {
          key: "payable",
          icon: ArrowUpRight,
          value: formatCurrency(payableTotal, currencyCode),
          label: "por pagar",
          compactLabel: "pagar",
          color: COLORS.rosewood,
          helpTitle: "Total por pagar",
          helpDescription: "Monto pendiente que tú debes pagar dentro de los créditos y deudas visibles.",
        },
        {
          key: "net",
          icon: Scale,
          value: formatCurrency(Math.abs(netTotal), currencyCode),
          label: netTotal >= 0 ? "neto a favor" : "neto en contra",
          compactLabel: netTotal >= 0 ? "neto +" : "neto -",
          color: netTotal >= 0 ? COLORS.pine : COLORS.rosewood,
          strong: true,
          helpTitle: netTotal >= 0 ? "Neto a favor" : "Neto en contra",
          helpDescription: "Diferencia entre lo pendiente por cobrar y lo pendiente por pagar. Resume si tu posición neta está a favor o en contra.",
        },
      ]}
    />
  );
}
