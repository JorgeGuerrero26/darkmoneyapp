import { pendingAmountInBaseCurrency } from "../../../lib/obligation-pending-base";
import { obligationViewerActsAsCollector } from "../../../lib/obligation-viewer-labels";
import type { ExchangeRateMap } from "../../../lib/exchange-rate-map";
import type { ObligationListSection } from "./buildObligationSections";

export type ObligationSummaryTotals = {
  receivableTotal: number;
  payableTotal: number;
  netTotal: number;
};

/**
 * Lo que te deben y lo que debes, **desde tu lado**.
 *
 * `direction` está guardada desde el lado del DUEÑO de la obligación. En una compartida contigo,
 * su "me deben" es tu "yo debo". Leerla a pelo sumaba las deudas compartidas a la columna de
 * créditos, y la barra decía "No debes nada" con una deuda visible tres dedos más abajo
 * (reportado el 2026-08-28: S/ 24,106.80 = los cuatro créditos + los S/ 131.50 de una deuda
 * compartida). La fila ya se pintaba en clay con `obligationViewerActsAsCollector`; el resumen
 * era el único sitio que no preguntaba de quién es la perspectiva.
 *
 * Vive fuera de la pantalla porque es una regla de dinero, y porque un error así solo se ve
 * mirando el teléfono: compila igual y no rompe ningún otro cálculo.
 */
export function buildObligationSummary(
  sections: ObligationListSection[],
  exchangeRateMap: ExchangeRateMap,
  baseCurrency: string,
): ObligationSummaryTotals {
  const visibleItems = sections.flatMap((section) =>
    section.key === "archived-divider" ? [] : section.data,
  );

  const totals = visibleItems.reduce<ObligationSummaryTotals>(
    (summary, obligation) => {
      const amount = pendingAmountInBaseCurrency(obligation, exchangeRateMap, baseCurrency);
      if (obligationViewerActsAsCollector(obligation.direction, "viewerMode" in obligation)) {
        summary.receivableTotal += amount;
      } else {
        summary.payableTotal += amount;
      }
      return summary;
    },
    { receivableTotal: 0, payableTotal: 0, netTotal: 0 },
  );

  totals.netTotal = totals.receivableTotal - totals.payableTotal;
  return totals;
}
