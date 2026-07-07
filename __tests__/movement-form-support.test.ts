import {
  findTransferExchangeRate,
  formatExchangeRateLabel,
  formatTransferAmount,
  isMovementFormDirty,
  getInitialMovementForm,
} from "../features/movements/lib/movement-form-support";
import { getUsdReferenceRate } from "../features/exchange-rates/lib/usdReferenceRate";

const rate = (from: string, to: string, value: number, effectiveAt: string) => ({
  fromCurrencyCode: from,
  toCurrencyCode: to,
  rate: value,
  effectiveAt,
});

describe("findTransferExchangeRate", () => {
  const rates = [
    rate("USD", "PEN", 3.7, "2026-07-01T00:00:00Z"),
    rate("USD", "PEN", 3.65, "2026-06-01T00:00:00Z"),
  ];

  test("usa la tasa más reciente en dirección directa", () => {
    expect(findTransferExchangeRate(rates as never, "USD", "PEN")?.rate).toBe(3.7);
  });

  test("invierte cuando el par está guardado al revés", () => {
    const inverse = findTransferExchangeRate(rates as never, "PEN", "USD");
    expect(inverse?.rate).toBeCloseTo(1 / 3.7, 6);
  });

  test("misma moneda o sin par devuelve null", () => {
    expect(findTransferExchangeRate(rates as never, "PEN", "PEN")).toBeNull();
    expect(findTransferExchangeRate(rates as never, "EUR", "PEN")).toBeNull();
  });
});

describe("getUsdReferenceRate", () => {
  test("resuelve USD→base en cualquier dirección y toma la más reciente", () => {
    const rates = [
      rate("PEN", "USD", 0.27, "2026-07-02T00:00:00Z"),
      rate("USD", "PEN", 3.65, "2026-06-01T00:00:00Z"),
    ];
    const ref = getUsdReferenceRate(rates as never, "PEN");
    expect(ref?.rate).toBeCloseTo(1 / 0.27, 6);
  });

  test("base USD o sin par devuelve null", () => {
    expect(getUsdReferenceRate([], "USD")).toBeNull();
    expect(getUsdReferenceRate([], "PEN")).toBeNull();
  });
});

describe("format helpers", () => {
  test("formatTransferAmount redondea a 2 decimales", () => {
    expect(formatTransferAmount(27.4567)).toBe("27.46");
    expect(formatTransferAmount(NaN)).toBe("");
  });

  test("formatExchangeRateLabel arma la etiqueta 1 X = n Y", () => {
    expect(formatExchangeRateLabel("usd", "pen", 3.7)).toContain("1 USD");
    expect(formatExchangeRateLabel("usd", "pen", 0)).toBe("");
  });
});

describe("isMovementFormDirty", () => {
  const cleanForm = getInitialMovementForm("expense");

  test("form nuevo sin cambios no está dirty", () => {
    expect(
      isMovementFormDirty({
        form: cleanForm,
        editMovement: undefined,
        attachmentsCount: 0,
        attachmentSignature: "::ready",
        initialAttachmentSignature: "::ready",
      }),
    ).toBe(false);
  });

  test("escribir descripción o adjuntar lo vuelve dirty", () => {
    expect(
      isMovementFormDirty({
        form: { ...cleanForm, description: "almuerzo" },
        editMovement: undefined,
        attachmentsCount: 0,
        attachmentSignature: "::ready",
        initialAttachmentSignature: "::ready",
      }),
    ).toBe(true);
    expect(
      isMovementFormDirty({
        form: cleanForm,
        editMovement: undefined,
        attachmentsCount: 1,
        attachmentSignature: "a::ready",
        initialAttachmentSignature: "::ready",
      }),
    ).toBe(true);
  });
});
