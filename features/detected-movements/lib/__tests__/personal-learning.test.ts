import { attachLearningReceipts, learningDescription, proposeFromPersonalHistory, type LearningMovement, type LearningReceipt } from "../personal-learning";
import type { AccountSummary, CategorySummary } from "../../../../types/domain";

const accounts = [
  { id: 1, name: "Principal", currencyCode: "PEN", isArchived: false },
  { id: 2, name: "Ahorro", currencyCode: "PEN", isArchived: false },
  { id: 3, name: "Dólares", currencyCode: "USD", isArchived: false },
] as AccountSummary[];
const categories = [
  { id: 10, name: "Comida", kind: "expense", isActive: true },
  { id: 11, name: "Salario", kind: "income", isActive: true },
  { id: 12, name: "Restaurantes", kind: "expense", isActive: true },
] as CategorySummary[];
function movement(id: number, overrides: Partial<LearningMovement> = {}): LearningMovement {
  return { id, description: "Tambo Larco", movement_type: "expense", status: "posted", source_account_id: 1,
    destination_account_id: null, category_id: 10, created_at: `2026-10-0${id}T12:00:00Z`, updated_at: `2026-10-0${id}T12:00:00Z`, metadata: {}, ...overrides };
}
function proposal(history: LearningMovement[], extra: Partial<Parameters<typeof proposeFromPersonalHistory>[0]> = {}) {
  return proposeFromPersonalHistory({ history, accounts, categories, description: "TAMBO* LARCO 008", movementType: "expense", currencyCode: "PEN", financialAppKey: "bcp_email", ...extra });
}
it("recognizes terminal variants without matching unrelated merchants", () => {
  expect(learningDescription("Consumo tarjeta BCP en TAMBO* LARCO 008")).toBe("tambo larco");
  expect(proposal([movement(1), movement(2)])).toMatchObject({ accountId: 1, categoryId: 10, accountEvidence: "history" });
  expect(proposal([movement(1), movement(2)], { description: "Tambo Miraflores" }).categoryId).toBeNull();
});
it("requires repetition and keeps conflicting decisions blank", () => {
  expect(proposal([movement(1)]).categoryId).toBeNull();
  expect(proposal([movement(1), movement(2, { source_account_id: 2, category_id: 12 })])).toMatchObject({ accountId: null, categoryId: null });
});
it("does not propose another bank's account for a known bank receipt", () => {
  expect(proposal([movement(1), movement(2)], { accounts: [{ ...accounts[0], institutionCode: "bbva" }] }).accountId).toBeNull();
});
it("separates expenses and income and respects account currency and category kind", () => {
  const history = [movement(1), movement(2), movement(3, { movement_type: "income", destination_account_id: 2, category_id: 11 }), movement(4, { movement_type: "income", destination_account_id: 2, category_id: 11 })];
  expect(proposal(history, { movementType: "income" })).toMatchObject({ accountId: 2, categoryId: 11 });
  expect(proposal(history, { currencyCode: "USD" }).accountId).toBeNull();
  expect(proposal([movement(1, { category_id: 11 }), movement(2, { category_id: 11 })]).categoryId).toBeNull();
});
it("a recent correction replaces an older habit", () => {
  expect(proposal([movement(1), movement(2), movement(3), movement(4), movement(5, { source_account_id: 2, category_id: 12, updated_at: "2026-10-08T12:00:00Z" })])).toMatchObject({ accountId: 2, categoryId: 12 });
});
it("retracts removed or voided movements without retaining feedback", () => {
  const history = [movement(1), movement(2)];
  expect(proposal(history).categoryId).toBe(10);
  expect(proposal(history.slice(0, 1)).categoryId).toBeNull();
  expect(proposal([history[0], { ...history[1], status: "voided" }]).categoryId).toBeNull();
});
it("excludes adjustments, split lines and repeated idempotent records", () => {
  expect(proposal([movement(1, { description: "Corrección Tambo Larco" }), movement(2, { metadata: { split_group: "split" } }), movement(3, { movement_type: "adjustment" })]).categoryId).toBeNull();
  expect(proposal([movement(1, { client_dedupe_key: "same" }), movement(2, { client_dedupe_key: "same" })]).categoryId).toBeNull();
});
const hint = { kind: "account", last4: "6068" };
function receipt(overrides: Partial<LearningReceipt> = {}): LearningReceipt {
  return { movement_id: 1, description: "Tambo Larco", financial_app_key: "bcp_email", movement_type: "expense", status: "registered", metadata: { accountHints: { source: hint } }, ...overrides };
}
it("uses a confirmed bank reference before a merchant habit", () => {
  const history = attachLearningReceipts([movement(1, { source_account_id: 2 }), movement(2), movement(3), movement(4), movement(5), movement(6)], [receipt()]);
  expect(proposal(history, { accountHints: { source: hint } })).toMatchObject({ accountId: 2, accountEvidence: "receipt", categoryId: 10 });
  expect(proposal(history, { accountHints: { source: { ...hint, last4: "9999" } } }).accountId).toBeNull();
  expect(proposal(history, { accountHints: { source: hint }, financialAppKey: "bbva_email" }).accountId).toBeNull();
});
it("ignores omitted, pending, automatically reconciled and orphan receipts", () => {
  for (const invalid of [receipt({ status: "discarded" }), receipt({ status: "pending" }), receipt({ movement_id: 99 }), receipt({ metadata: { accountHints: { source: hint }, reconciliation: { mode: "automatic" } } })]) {
    expect(proposal(attachLearningReceipts([movement(1)], [invalid]), { accountHints: { source: hint } }).accountId).toBeNull();
  }
});
it("keeps ambiguous references blank and skips archived accounts", () => {
  const history = attachLearningReceipts([movement(1), movement(2, { source_account_id: 2 })], [receipt(), receipt({ movement_id: 2 })]);
  expect(proposal(history, { accountHints: { source: hint } }).accountId).toBeNull();
  expect(proposal(attachLearningReceipts([movement(1)], [receipt()]), { accountHints: { source: hint }, accounts: [{ ...accounts[0], isArchived: true }] }).accountId).toBeNull();
});
it("uses original receipt descriptions after the user renames the movement", () => {
  const history = attachLearningReceipts([movement(1, { description: "Cena de trabajo" }), movement(2, { description: "Cena de trabajo" })], [receipt(), receipt({ movement_id: 2 })]);
  expect(proposal(history).categoryId).toBe(10);
});
it("learns a repeated specific transfer pair, without copying amounts or exchange rates", () => {
  const history = [movement(1, { description: "Ahorro vacaciones", movement_type: "transfer", destination_account_id: 3 }), movement(2, { description: "Ahorro vacaciones", movement_type: "transfer", destination_account_id: 3 })];
  expect(proposal(history, { description: "Ahorro vacaciones", movementType: "transfer" })).toMatchObject({ accountId: 1, destinationAccountId: 3, categoryId: null });
  expect(proposal(history, { description: "Ahorro vacaciones", movementType: "transfer", accountId: 2 }).destinationAccountId).toBeNull();
});
it("does not guess the destination from a generic transfer title or a Yape payment", () => {
  const history = [movement(1, { description: "Transferencia BCP", movement_type: "transfer", destination_account_id: 2 }), movement(2, { description: "Transferencia BCP", movement_type: "transfer", destination_account_id: 2 })];
  expect(proposal(history, { description: "Transferencia BCP", movementType: "transfer" }).destinationAccountId).toBeNull();
  expect(proposal(history).destinationAccountId).toBeNull();
});
it("does not learn a merchant from generic bank subjects or legal banners", () => {
  for (const description of ["Por tu seguridad, te notificaremos por cada yapeo", "Realizaste un consumo con tu tarjeta", "Constancia de consumo", "Suma opciones con tus Tarjetas BCP"]) {
    expect(proposal([movement(1, { description }), movement(2, { description })], { description })).toMatchObject({ accountId: null, categoryId: null });
  }
});
it("resolves both transfer sides from confirmed references even with a generic title", () => {
  const destinationHint = { kind: "account", last4: "9999" };
  const history = attachLearningReceipts([movement(1, { movement_type: "transfer", destination_account_id: 3 })], [receipt({ movement_type: "transfer", metadata: { accountHints: { source: hint, destination: destinationHint } } })]);
  expect(proposal(history, { movementType: "transfer", description: "Transferencia BCP", accountHints: { source: hint, destination: destinationHint } })).toMatchObject({ accountId: 1, destinationAccountId: 3, accountEvidence: "receipt", destinationEvidence: "receipt" });
});
