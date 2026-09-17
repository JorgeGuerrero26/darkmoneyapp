import { isLiquidAccount, liquidBalance, type LiquidAccountLike } from "../liquid-balance";

const identity = (amount: number) => amount;
const onlyPen = (amount: number, currency: string) => (currency === "PEN" ? amount : null);

function account(type: string, currentBalance: number, extra: Partial<LiquidAccountLike> = {}): LiquidAccountLike {
  return { type, currentBalance, currencyCode: "PEN", isArchived: false, ...extra };
}

describe("isLiquidAccount", () => {
  it("banco, efectivo y ahorros son gastables", () => {
    expect(isLiquidAccount("bank")).toBe(true);
    expect(isLiquidAccount("cash")).toBe(true);
    expect(isLiquidAccount("savings")).toBe(true);
  });

  it("inversión, préstamo, tarjeta y lo desconocido no lo son", () => {
    expect(isLiquidAccount("investment")).toBe(false);
    expect(isLiquidAccount("loan_wallet")).toBe(false);
    expect(isLiquidAccount("credit_card")).toBe(false);
    expect(isLiquidAccount("other")).toBe(false);
    expect(isLiquidAccount(null)).toBe(false);
    expect(isLiquidAccount(undefined)).toBe(false);
  });
});

describe("liquidBalance", () => {
  it("suma solo lo gastable", () => {
    const { total } = liquidBalance(
      [account("bank", 3000), account("cash", 200), account("savings", 500), account("investment", 9000)],
      identity,
    );
    expect(total).toBe(3700);
  });

  it("una tarjeta con deuda no resta del saldo de partida", () => {
    // Su saldo es deuda, no caja. Entra en la proyección como un pago con fecha, no aquí.
    const { total } = liquidBalance([account("bank", 3200), account("credit_card", -872)], identity);
    expect(total).toBe(3200);
  });

  it("las archivadas no cuentan", () => {
    const { total } = liquidBalance([account("bank", 3000), account("bank", 500, { isArchived: true })], identity);
    expect(total).toBe(3000);
  });

  it("lo que no se puede convertir suma cero y queda contado", () => {
    const { total, unconvertedCount } = liquidBalance(
      [account("bank", 3000), account("savings", 200, { currencyCode: "USD" })],
      onlyPen,
    );
    expect(total).toBe(3000);
    expect(unconvertedCount).toBe(1);
  });

  it("sin cuentas devuelve cero, no NaN", () => {
    const { total, unconvertedCount } = liquidBalance([], identity);
    expect(total).toBe(0);
    expect(unconvertedCount).toBe(0);
  });

  it("un saldo ausente vale cero en vez de romper la suma", () => {
    const { total } = liquidBalance([account("bank", 3000), { type: "cash", currencyCode: "PEN" }], identity);
    expect(total).toBe(3000);
  });
});
