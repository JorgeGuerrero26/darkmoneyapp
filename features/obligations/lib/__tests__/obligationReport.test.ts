import {
  buildObligationReport,
  buildObligationReportFolio,
  computeObligationReportRows,
} from "../obligationReport";
import type { ObligationEventSummary, ObligationSummary } from "../../../../types/domain";

function event(partial: Partial<ObligationEventSummary> & { id: number }): ObligationEventSummary {
  return {
    eventType: "payment",
    eventDate: "2026-07-01",
    amount: 0,
    ...partial,
  } as ObligationEventSummary;
}

const baseObligation = {
  id: 7,
  workspaceId: 1,
  title: "Préstamo a Juan <script>",
  direction: "receivable",
  originType: "cash_loan",
  counterparty: "Juan Pérez",
  counterpartyId: 3,
  status: "active",
  currencyCode: "PEN",
  principalAmount: 1000,
  pendingAmount: 730,
  progressPercent: 27,
  startDate: "2026-06-01",
  dueDate: "2026-12-01",
  installmentLabel: "6 cuotas de S/ 200",
  paymentCount: 1,
  events: [],
} as unknown as ObligationSummary;

describe("computeObligationReportRows", () => {
  it("saldo corrido espejea la fórmula de v_obligation_summary", () => {
    const rows = computeObligationReportRows(
      [
        event({ id: 1, eventType: "opening", eventDate: "2026-06-01", amount: 1000 }),
        event({ id: 2, eventType: "principal_increase", eventDate: "2026-06-10", amount: 200 }),
        event({ id: 3, eventType: "interest", eventDate: "2026-06-15", amount: 50 }),
        event({ id: 4, eventType: "payment", eventDate: "2026-06-20", amount: 400 }),
        event({ id: 5, eventType: "adjustment", eventDate: "2026-06-25", amount: -70 }),
        event({ id: 6, eventType: "discount", eventDate: "2026-07-01", amount: 50 }),
      ],
      1000,
    );

    expect(rows.map((r) => r.balance)).toEqual([1000, 1200, 1250, 850, 780, 730]);
    // adjustment negativo se muestra como abono
    expect(rows[4].credit).toBe(70);
    expect(rows[4].charge).toBeNull();
    // pago va en la columna abono
    expect(rows[3].credit).toBe(400);
  });

  it("sin evento de apertura arranca del principal y ordena por fecha", () => {
    const rows = computeObligationReportRows(
      [
        event({ id: 2, eventType: "payment", eventDate: "2026-06-20", amount: 100 }),
        event({ id: 1, eventType: "payment", eventDate: "2026-06-10", amount: 300 }),
      ],
      500,
    );
    expect(rows.map((r) => r.balance)).toEqual([200, 100]);
  });
});

describe("buildObligationReport", () => {
  const generatedAt = new Date(2026, 6, 19, 15, 30);

  it("genera folio determinista, escapa HTML y arma el mensaje con saldo", () => {
    const report = buildObligationReport({
      obligation: baseObligation,
      events: [event({ id: 1, eventType: "opening", eventDate: "2026-06-01", amount: 1000 })],
      ownerName: "Adrian Guerrero",
      generatedAt,
    });

    expect(report.folio).toBe(buildObligationReportFolio(7, generatedAt));
    expect(report.folio).toBe("DM-7-20260719-1530");
    // título con caracteres peligrosos queda escapado en el HTML
    expect(report.html).not.toContain("<script>");
    expect(report.html).toContain("&lt;script&gt;");
    // partes según dirección receivable: owner acreedor, contraparte deudor
    expect(report.html).toMatch(/Acreedor[\s\S]*Adrian Guerrero/);
    expect(report.html).toMatch(/Deudor[\s\S]*Juan Pérez/);
    expect(report.message).toContain("Juan Pérez");
    expect(report.message).toContain("crédito");
    expect(report.message).toContain(report.folio);
    expect(report.fileName.endsWith(".pdf")).toBe(true);
  });
});

/**
 * La revisión 14, sobre el PDF real: 21 movimientos en dos páginas.
 *
 * El corte caía dentro de la tabla y la segunda hoja arrancaba sin encabezado y sin decir en
 * cuánto venía el saldo. Suelta, esa hoja no se puede leer.
 */
describe("el estado de cuenta en dos páginas", () => {
  const manyEvents = [
    { id: 1, eventType: "opening" as const, eventDate: "2026-03-15", amount: 7175 },
    ...Array.from({ length: 20 }, (_, i) => ({
      id: i + 2,
      eventType: "principal_increase" as const,
      eventDate: `2026-04-${String((i % 28) + 1).padStart(2, "0")}`,
      amount: 100,
      description: `Producto ${i + 1}`,
    })),
  ];

  const result = buildObligationReport({
    obligation: { ...baseObligation, principalAmount: 7175, pendingAmount: 9175 },
    events: manyEvents,
    ownerName: "Adrian",
    generatedAt: new Date(2026, 7, 30, 20, 33),
  });

  it("reparte las filas en hojas y numera cada una", () => {
    expect(result.html).toContain("página 1 de 2");
    expect(result.html).toContain("página 2 de 2");
  });

  it("el corte dice el saldo arrastrado, y la hoja siguiente arranca con el mismo número", () => {
    expect(result.html).toMatch(/Continúa en la página 2 · saldo arrastrado<\/span><strong>[^<]+<\/strong>/);
    expect(result.html).toMatch(/Viene de la página 1 · saldo arrastrado<\/span><strong>[^<]+<\/strong>/);
  });

  it("cada hoja repite el encabezado de la tabla", () => {
    const heads = result.html.split("<th>Fecha</th>").length - 1;
    expect(heads).toBe(2);
  });
});

/**
 * "Aumento de capital" ocupaba trece veces la columna más visible mientras el producto —lo único
 * que distingue una fila de otra— iba en letra chica. Y una fila sin concepto, en un documento
 * que se le envía a un cliente, es una pregunta esperando.
 */
describe("la fila dice qué se vendió, no de qué tipo es el evento", () => {
  const result = buildObligationReport({
    obligation: { ...baseObligation, originType: "sale_financed", principalAmount: 1000, pendingAmount: 1650 },
    events: [
      { id: 1, eventType: "opening", eventDate: "2026-03-15", amount: 1000 },
      { id: 2, eventType: "principal_increase", eventDate: "2026-04-06", amount: 650, description: "Monitor Asus 260 Hz" },
      { id: 3, eventType: "principal_increase", eventDate: "2026-04-11", amount: 30 },
      { id: 4, eventType: "payment", eventDate: "2026-04-30", amount: 30, installmentNo: 2 },
    ],
    ownerName: "Adrian",
    generatedAt: new Date(2026, 7, 30, 20, 33),
  });

  it("el producto es el título de la fila", () => {
    expect(result.html).toContain('<span class="concept">Monitor Asus 260 Hz</span>');
  });

  it("una fila sin concepto se marca como dato faltante, no se omite", () => {
    expect(result.html).toContain('class="missing">Venta sin descripción');
  });

  it("los pagos sí llevan su etiqueta, con la referencia debajo", () => {
    expect(result.html).toContain('<span class="concept">Pago recibido</span>');
    expect(result.html).toContain("Cuota 2");
  });

  it("una sola columna de movimiento, con el signo diciendo la dirección", () => {
    expect(result.html).toContain("<th class=\"num\">Movimiento</th>");
    expect(result.html).not.toContain(">Cargo<");
    expect(result.html).not.toContain(">Abono<");
  });

  it("la moneda se dice en palabras y el total aparece en el resumen", () => {
    expect(result.html).toContain("Soles");
    expect(result.html).toContain("en total");
  });

  it("las tablas no repiten el símbolo de la moneda en cada cifra", () => {
    const tables = result.html.slice(
      result.html.indexOf('<table class="summary">'),
      result.html.indexOf("<h2>Condiciones</h2>"),
    );
    expect(tables).not.toMatch(/S\/\s*\d/);
  });

  it("la apertura va sin signo: es el punto de partida, no un aumento", () => {
    expect(result.html).toMatch(/Apertura del registro<\/span><\/td>\s*<td class="num">1,000\.00</);
  });
});
