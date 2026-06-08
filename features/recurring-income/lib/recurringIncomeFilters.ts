import type {
  RecurringIncomeFrequency,
  RecurringIncomeStatus,
  RecurringIncomeSummary,
} from "../../../types/domain";

export type RecurringIncomeFilter = "all" | "pinned" | RecurringIncomeStatus | RecurringIncomeFrequency;
export type ActiveRecurringIncomeFilter = Exclude<RecurringIncomeFilter, "all">;

export type RecurringIncomeAdvancedFilters = {
  payerId: number | null;
  accountId: number | null;
  categoryId: number | null;
  upcomingOnly: boolean;
};

export const RECURRING_INCOME_FILTERS: Array<{ label: string; value: RecurringIncomeFilter }> = [
  { label: "Todos", value: "all" },
  { label: "Fijados", value: "pinned" },
  { label: "Activos", value: "active" },
  { label: "Pausados", value: "paused" },
  { label: "Cancelados", value: "cancelled" },
  { label: "Diario", value: "daily" },
  { label: "Mensual", value: "monthly" },
  { label: "Anual", value: "yearly" },
  { label: "Semanal", value: "weekly" },
  { label: "Trimestral", value: "quarterly" },
  { label: "Personalizado", value: "custom" },
];

const STATUS_VALUES = new Set<RecurringIncomeStatus>(["active", "paused", "cancelled"]);
const FREQUENCY_VALUES = new Set<RecurringIncomeFrequency>([
  "daily",
  "weekly",
  "monthly",
  "quarterly",
  "yearly",
  "custom",
]);

export function recurringIncomeFilterLabel(filter: ActiveRecurringIncomeFilter) {
  return RECURRING_INCOME_FILTERS.find((item) => item.value === filter)?.label ?? filter;
}

export function ymdWithin30Days(ymd: string) {
  const target = new Date(`${ymd}T00:00:00`);
  const now = new Date();
  const limit = new Date();
  limit.setDate(limit.getDate() + 30);
  return target >= new Date(now.getFullYear(), now.getMonth(), now.getDate()) && target <= limit;
}

export function filterRecurringIncome(
  items: RecurringIncomeSummary[],
  filters: ActiveRecurringIncomeFilter[],
  searchText: string,
  advancedFilters: RecurringIncomeAdvancedFilters,
) {
  const query = searchText.trim().toLowerCase();
  const pinnedOnly = filters.includes("pinned");
  const statusFilters = filters.filter((filter): filter is RecurringIncomeStatus =>
    STATUS_VALUES.has(filter as RecurringIncomeStatus),
  );
  const frequencyFilters = filters.filter((filter): filter is RecurringIncomeFrequency =>
    FREQUENCY_VALUES.has(filter as RecurringIncomeFrequency),
  );

  return items
    .filter((item) => {
      if (pinnedOnly && !item.isPinned) return false;
      if (statusFilters.length > 0 && !statusFilters.includes(item.status)) return false;
      if (frequencyFilters.length > 0 && !frequencyFilters.includes(item.frequency)) return false;
      if (advancedFilters.payerId != null && item.payerPartyId !== advancedFilters.payerId) return false;
      if (advancedFilters.accountId != null && item.accountId !== advancedFilters.accountId) return false;
      if (advancedFilters.categoryId != null && item.categoryId !== advancedFilters.categoryId) return false;
      if (advancedFilters.upcomingOnly && !ymdWithin30Days(item.nextExpectedDate)) return false;

      if (!query) return true;
      const haystack = [
        item.name,
        item.payer,
        item.accountName ?? "",
        item.categoryName ?? "",
        item.description ?? "",
        item.notes ?? "",
      ].join(" ").toLowerCase();
      return haystack.includes(query);
    })
    .sort((a, b) => a.nextExpectedDate.localeCompare(b.nextExpectedDate));
}

export function getMonthlyRecurringIncomeAmount(item: RecurringIncomeSummary, useBaseCurrency = false) {
  const amount = useBaseCurrency && item.amountInBaseCurrency != null
    ? item.amountInBaseCurrency
    : item.amount;

  switch (item.frequency) {
    case "yearly":
      return amount / 12;
    case "weekly":
      return (amount * 52) / 12;
    case "quarterly":
      return amount / 3;
    case "daily":
      return amount * 30;
    case "monthly":
    case "custom":
    default:
      return amount;
  }
}
