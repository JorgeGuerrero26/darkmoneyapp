import { extractReceiptAccountHints } from "../account-hints";
import { YAPE_ENVIADO } from "./fixtures/emails";

it("reads the BCP source account while ignoring beneficiary phone numbers", () => {
  expect(extractReceiptAccountHints("Desde\tCuenta de ahorro\n**** 6068\nMoneda\tSoles\nCelular del Beneficiario\tXXXXXXXXX0929", "expense"))
    .toEqual({ source: { kind: "account", last4: "6068" } });
});
it("keeps source and destination references separate", () => {
  expect(extractReceiptAccountHints("Desde\tCuenta de ahorro\n**** 6068\nDestino\tCuenta propia\n**** 1200\nMoneda\tSoles", "transfer"))
    .toEqual({ source: { kind: "account", last4: "6068" }, destination: { kind: "account", last4: "1200" } });
});
it("distinguishes cards from accounts and identifies income accounts", () => {
  expect(extractReceiptAccountHints("Tarjeta de Débito\t**** 4321\nFecha y hora\t8 octubre", "expense"))
    .toEqual({ source: { kind: "card", last4: "4321" } });
  expect(extractReceiptAccountHints("Cuenta abonada\t**** 6068", "income"))
    .toEqual({ destination: { kind: "account", last4: "6068" } });
});
it("does not retain full account numbers or guess from phone/operation digits", () => {
  expect(extractReceiptAccountHints("Desde\t1911234567890\nNúmero de operación\t12345678", "expense")).toEqual({});
  expect(extractReceiptAccountHints(YAPE_ENVIADO.text, "expense")).toEqual({});
});
it("leaves conflicting or ambiguous account/card rows blank", () => {
  expect(extractReceiptAccountHints("Desde\t**** 6068 **** 1200", "expense")).toEqual({});
  expect(extractReceiptAccountHints("Tarjeta\t**** 4321\nCuenta de ahorro\t**** 6068", "expense")).toEqual({});
});
