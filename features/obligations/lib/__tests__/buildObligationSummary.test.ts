import { buildObligationSummary } from "../buildObligationSummary";
import type { ObligationListSection } from "../buildObligationSections";

/**
 * El caso que lo motivó, reportado desde el teléfono el 2026-08-28.
 *
 * La barra decía "Te deben S/ 24,106.80 · No debes nada" con una deuda compartida visible tres
 * dedos más abajo. Los S/ 24,106.80 eran los cuatro créditos (23,975.30) MÁS los S/ 131.50 de
 * esa deuda: se sumaba del lado equivocado, porque `direction` viene guardada desde el lado del
 * dueño y nadie preguntaba de quién era la perspectiva.
 */
function item(overrides: Record<string, unknown>) {
  return {
    id: 1,
    title: "Obligación",
    direction: "receivable",
    status: "active",
    pendingAmount: 0,
    pendingAmountInBaseCurrency: 0,
    currencyCode: "PEN",
    ...overrides,
  } as never;
}

const NO_RATES = {} as never;

describe("resumen de créditos y deudas", () => {
  it("una deuda compartida contigo NO se suma a lo que te deben", () => {
    const sections: ObligationListSection[] = [
      {
        key: "workspace",
        label: "Tu workspace",
        data: [
          item({ id: 1, pendingAmountInBaseCurrency: 21_025.0 }),
          item({ id: 2, pendingAmountInBaseCurrency: 2_298.9 }),
          item({ id: 3, pendingAmountInBaseCurrency: 371.4 }),
          item({ id: 4, pendingAmountInBaseCurrency: 280.0 }),
        ],
      },
      {
        key: "shared",
        label: "Compartidos contigo",
        // El dueño la registró como "me deben"; para quien la recibe compartida es "yo debo".
        data: [item({ id: 5, direction: "receivable", viewerMode: "shared_viewer", pendingAmountInBaseCurrency: 131.5 })],
      },
    ];

    const totals = buildObligationSummary(sections, NO_RATES, "PEN");

    expect(totals.receivableTotal).toBeCloseTo(23_975.3, 2);
    expect(totals.payableTotal).toBeCloseTo(131.5, 2);
    expect(totals.netTotal).toBeCloseTo(23_843.8, 2);
  });

  it("un credito compartido contigo SI se suma a lo que te deben", () => {
    const sections: ObligationListSection[] = [
      {
        key: "shared",
        label: "Compartidos contigo",
        // El dueño la registró como deuda suya, así que a quien la recibe le deben.
        data: [item({ id: 1, direction: "payable", viewerMode: "shared_viewer", pendingAmountInBaseCurrency: 500 })],
      },
    ];

    const totals = buildObligationSummary(sections, NO_RATES, "PEN");

    expect(totals.receivableTotal).toBe(500);
    expect(totals.payableTotal).toBe(0);
  });

  it("en las tuyas la direccion se lee tal cual", () => {
    const sections: ObligationListSection[] = [
      {
        key: "workspace",
        label: "Tu workspace",
        data: [
          item({ id: 1, direction: "receivable", pendingAmountInBaseCurrency: 300 }),
          item({ id: 2, direction: "payable", pendingAmountInBaseCurrency: 120 }),
        ],
      },
    ];

    const totals = buildObligationSummary(sections, NO_RATES, "PEN");

    expect(totals.receivableTotal).toBe(300);
    expect(totals.payableTotal).toBe(120);
    expect(totals.netTotal).toBe(180);
  });

  it("la fila divisoria de archivadas no aporta importes", () => {
    const sections: ObligationListSection[] = [
      { key: "archived-divider", label: "Archivadas (2)", data: [] },
      {
        key: "workspace-archived",
        label: "Tu workspace",
        data: [item({ id: 1, pendingAmountInBaseCurrency: 90 })],
      },
    ];

    expect(buildObligationSummary(sections, NO_RATES, "PEN").receivableTotal).toBe(90);
  });
});
