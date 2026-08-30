import { formatCurrency } from "../../../components/ui/AmountDisplay";
import { MetricSummaryBar } from "../../../components/ui/MetricSummaryBar";
import { COLORS } from "../../../constants/theme";

type Props = {
  totalNetWorth: number;
  activeCurrency: string;
  /** "2 cuentas activas · al 30 de agosto": a qué fecha está el patrimonio. */
  support?: string;
  currencyOptions: string[];
  disabledCurrencyOptions?: string[];
  onCurrencyChange: (currency: string) => void;
};

export function AccountNetWorthSummary({
  totalNetWorth,
  activeCurrency,
  support,
  currencyOptions,
  disabledCurrencyOptions = [],
  onCurrencyChange,
}: Props) {
  const disabledCurrencies = new Set(disabledCurrencyOptions);

  return (
    <MetricSummaryBar
      label="Patrimonio neto"
      value={formatCurrency(totalNetWorth, activeCurrency)}
      support={support}
      help={{
        title: "Patrimonio neto",
        description: "Suma de saldos de cuentas activas marcadas para incluirse en patrimonio. Si tienes cuentas en más de una moneda, puedes cambiar en cuál se muestra el total.",
      }}
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
