import { formatCurrency } from "../../../components/ui/AmountDisplay";
import { MetricSummaryBar } from "../../../components/ui/MetricSummaryBar";
import { COLORS } from "../../../constants/theme";

type Props = {
  totalNetWorth: number;
  activeCurrency: string;
  currencyOptions: string[];
  disabledCurrencyOptions?: string[];
  onCurrencyChange: (currency: string) => void;
};

export function AccountNetWorthSummary({
  totalNetWorth,
  activeCurrency,
  currencyOptions,
  disabledCurrencyOptions = [],
  onCurrencyChange,
}: Props) {
  const disabledCurrencies = new Set(disabledCurrencyOptions);

  return (
    <MetricSummaryBar
      items={[{
        key: "net-worth",
        label: "Patrimonio neto",
        value: formatCurrency(totalNetWorth, activeCurrency),
        color: COLORS.ink,
        strong: true,
        helpTitle: "Patrimonio neto",
        helpDescription: "Suma de saldos de cuentas activas marcadas para incluirse en patrimonio. Puedes cambiar la moneda con los botones de la derecha.",
      }]}
      actions={currencyOptions.map((currency) => ({
        key: currency,
        label: currency,
        active: activeCurrency === currency,
        disabled: disabledCurrencies.has(currency),
        onPress: () => onCurrencyChange(currency),
      }))}
    />
  );
}
