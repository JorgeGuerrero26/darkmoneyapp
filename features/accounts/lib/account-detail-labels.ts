import { accountTypeLabel } from "./account-types";

export function accountDetailTypeLabel(type: string): string {
  if (type === "credit_card") return "Tarjeta de crédito";
  if (type === "loan_wallet") return "Cartera de préstamos";
  return accountTypeLabel(type);
}
