export type Period = "today" | "week" | "month" | "last_30";

export type ConversionCtx = {
  accountCurrencyMap: Map<number, string>;
  exchangeRateMap: Map<string, number>;
  displayCurrency: string;
};

export type DashboardChartDay = {
  label: string;
  dateKey: string;
  dayStart: Date;
  dayEnd: Date;
  income: number;
  expense: number;
  transferTotal: number;
};
