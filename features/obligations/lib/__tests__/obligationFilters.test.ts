import type { ObligationSummary, SharedObligationSummary } from "../../../../types/domain";
import { filterObligations } from "../obligationFilters";

describe("filtros de créditos y deudas", () => {
  it("Me deben usa la perspectiva del usuario también en compartidos", () => {
    const mine = { id: 1, direction: "receivable", status: "active" } as ObligationSummary;
    const sharedDebt = { id: 2, direction: "receivable", status: "active", viewerMode: "shared_viewer" } as SharedObligationSummary;
    const sharedCredit = { id: 3, direction: "payable", status: "active", viewerMode: "shared_viewer" } as SharedObligationSummary;
    expect(filterObligations([mine, sharedDebt, sharedCredit], ["receivable"]).map((item) => item.id)).toEqual([1, 3]);
  });
});
