import { obligationViewerDirection } from "../obligation-viewer-labels";

/**
 * La dirección está guardada desde el lado del DUEÑO. Estas cuatro combinaciones son el motivo
 * de que exista la función: leer `direction` a pelo acierta en dos y falla en las otras dos, y
 * las que falla son justo las compartidas.
 */
describe("la dirección desde tu lado", () => {
  it("un crédito tuyo lo cobras tú", () => {
    expect(obligationViewerDirection({ direction: "receivable" })).toBe("receivable");
  });

  it("una deuda tuya la pagas tú", () => {
    expect(obligationViewerDirection({ direction: "payable" })).toBe("payable");
  });

  it("un crédito que te compartieron es TU deuda", () => {
    expect(
      obligationViewerDirection({ direction: "receivable", viewerMode: "shared_viewer" } as never),
    ).toBe("payable");
  });

  it("una deuda que te compartieron es TU crédito", () => {
    expect(
      obligationViewerDirection({ direction: "payable", viewerMode: "shared_viewer" } as never),
    ).toBe("receivable");
  });
});
