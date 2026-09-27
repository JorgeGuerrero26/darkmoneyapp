import type { ResourceSection } from "../../../components/ui/ResourceSectionList";
import type { AccountSummary } from "../../../types/domain";

const TYPE_GROUPS = [
  { value: "bank", label: "Bancos" },
  { value: "savings", label: "Ahorro" },
  { value: "credit_card", label: "Tarjetas" },
  { value: "cash", label: "Efectivo" },
  { value: "investment", label: "Inversiones" },
  { value: "loan", label: "Préstamos" },
  { value: "loan_wallet", label: "Cartera de préstamos" },
  { value: "other", label: "Otras" },
] as const;

/** Group filtered active accounts by type; keep archived accounts at the end. */
export function buildAccountSections(accounts: readonly AccountSummary[]): ResourceSection<AccountSummary>[] {
  const buckets = new Map<string, AccountSummary[]>();
  const archived: AccountSummary[] = [];

  for (const account of accounts) {
    if (account.isArchived) {
      archived.push(account);
      continue;
    }
    const key = TYPE_GROUPS.some((group) => group.value === account.type) ? account.type : "other";
    const bucket = buckets.get(key);
    if (bucket) bucket.push(account);
    else buckets.set(key, [account]);
  }

  const sections: ResourceSection<AccountSummary>[] = [];
  for (const group of TYPE_GROUPS) {
    const data = buckets.get(group.value);
    if (!data?.length) continue;
    sections.push({
      key: `type-${group.value}`,
      label: `${group.label} (${data.length})`,
      data,
      headerVariant: "divider",
    });
  }
  if (archived.length) {
    sections.push({
      key: "archived",
      label: `Archivadas (${archived.length})`,
      data: archived,
      headerVariant: "divider",
    });
  }
  return sections;
}
