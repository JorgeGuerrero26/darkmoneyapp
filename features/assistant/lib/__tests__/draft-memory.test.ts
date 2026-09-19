/**
 * La memoria del asistente sobre lo que él mismo propuso.
 *
 * Caso real que lo motivó: el usuario dictó un ingreso y un gasto, la app solo registró el gasto,
 * y al pedirle el ingreso que faltaba el asistente volvió a ofrecer el MISMO gasto — porque al
 * servidor solo viajaban `role` y `content`, sin el borrador ni su desenlace.
 */
import type { AssistantDraft } from "../../../../services/queries/assistant";
import { annotateAssistantTurn, describeDraftTurn } from "../draft-memory";

function gasto(extra: Partial<AssistantDraft> = {}): AssistantDraft {
  return {
    operation: "expense",
    amount: 28.5,
    currency: "PEN",
    accountName: "Cuenta Principal",
    destinationAccountName: null,
    categoryName: "Restaurantes",
    counterpartyName: null,
    subscriptionId: null,
    subscriptionName: null,
    obligationId: null,
    obligationCounterparty: null,
    occurredAt: null,
    description: "Almuerzo",
    missing: [],
    ...extra,
  };
}

describe("describeDraftTurn", () => {
  it("describe un gasto con sus datos en una línea", () => {
    expect(describeDraftTurn({ draft: gasto() })).toBe(
      'gasto PEN 28.50 · Cuenta Principal · Restaurantes · "Almuerzo"',
    );
  });

  it("una transferencia dice las dos cuentas", () => {
    const linea = describeDraftTurn({
      draft: gasto({ operation: "transfer", destinationAccountName: "Ahorros", categoryName: null, description: null }),
    });
    expect(linea).toBe("transferencia PEN 28.50 · Cuenta Principal → Ahorros");
  });

  it("no deja separadores huérfanos cuando faltan campos", () => {
    const linea = describeDraftTurn({
      draft: gasto({ accountName: null, categoryName: null, description: null }),
    });
    expect(linea).toBe("gasto PEN 28.50");
  });

  it("arrastra lo que el borrador declara como faltante", () => {
    const linea = describeDraftTurn({ draft: gasto({ missing: ["accountName"] }) });
    expect(linea).toContain("falta: accountName");
  });

  it("un turno sin propuesta no inventa nada", () => {
    expect(describeDraftTurn({})).toBeNull();
    expect(describeDraftTurn({ draft: null, draftStatus: "pending" })).toBeNull();
  });
});

describe("annotateAssistantTurn", () => {
  it("el desenlace distingue guardado, descartado y sin confirmar", () => {
    const guardado = annotateAssistantTurn("Listo.", { draft: gasto(), draftStatus: "saved" });
    const descartado = annotateAssistantTurn("Listo.", { draft: gasto(), draftStatus: "discarded" });
    const pendiente = annotateAssistantTurn("Listo.", { draft: gasto(), draftStatus: "pending" });

    expect(guardado).toContain("el usuario lo GUARDÓ");
    expect(descartado).toContain("el usuario lo DESCARTÓ");
    expect(pendiente).toContain("sigue SIN CONFIRMAR");
  });

  /** Sin estado explícito hay que asumir lo NO confirmado: dar por guardado lo que no lo está es peor. */
  it("sin estado asume que no se confirmó", () => {
    expect(annotateAssistantTurn("Listo.", { draft: gasto() })).toContain("sigue SIN CONFIRMAR");
  });

  it("conserva el texto original y añade la nota debajo", () => {
    const salida = annotateAssistantTurn("Registrado el almuerzo.", { draft: gasto(), draftStatus: "saved" });
    expect(salida.startsWith("Registrado el almuerzo.\n")).toBe(true);
    expect(salida).toContain("[Propuse: gasto PEN 28.50");
  });

  it("un turno sin propuesta se manda tal cual", () => {
    expect(annotateAssistantTurn("Tus gastos de mayo fueron 1200.", {})).toBe("Tus gastos de mayo fueron 1200.");
  });

  it("si el turno no traía texto, la nota va sola y sin salto de línea suelto", () => {
    expect(annotateAssistantTurn("", { draft: gasto(), draftStatus: "saved" })).toBe(
      '[Propuse: gasto PEN 28.50 · Cuenta Principal · Restaurantes · "Almuerzo" — el usuario lo GUARDÓ]',
    );
  });
});
