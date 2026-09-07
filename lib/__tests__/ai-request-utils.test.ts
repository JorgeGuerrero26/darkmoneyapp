import {
  ASSISTANT_CHAT_TIMEOUT_MS,
  DASHBOARD_AI_TIMEOUT_MS,
  DEFAULT_EDGE_TIMEOUT_MS,
  INTERACTIVE_AI_TIMEOUT_MS,
  resolveAiEdgeTimeoutMs,
} from "../ai-request-utils";

describe("resolveAiEdgeTimeoutMs", () => {
  it("una sugerencia del formulario espera lo que de verdad tarda el servidor", () => {
    // Medido el 2026-09-06: p90 de 15,6 s. Con el corte viejo de 6.5 s se perdia el 45% de las
    // respuestas YA generadas, y se veian igual que un "no hay nada que proponer".
    expect(resolveAiEdgeTimeoutMs("movement-category-ai-suggestion")).toBe(INTERACTIVE_AI_TIMEOUT_MS);
    expect(INTERACTIVE_AI_TIMEOUT_MS).toBeGreaterThanOrEqual(15_600);
  });

  it("las tarjetas del panel avanzado no caen al plazo generico", () => {
    expect(resolveAiEdgeTimeoutMs("dashboard-advanced-ai-summary")).toBe(DASHBOARD_AI_TIMEOUT_MS);
    expect(resolveAiEdgeTimeoutMs("dashboard-advanced-ai-health")).toBe(DASHBOARD_AI_TIMEOUT_MS);
    expect(DASHBOARD_AI_TIMEOUT_MS).toBeGreaterThan(DEFAULT_EDGE_TIMEOUT_MS);
  });

  it("el chat conserva su plazo largo: encadena hasta cuatro llamadas al modelo", () => {
    expect(resolveAiEdgeTimeoutMs("assistant-chat")).toBe(ASSISTANT_CHAT_TIMEOUT_MS);
  });

  it("lo que no es IA se queda en el plazo corto", () => {
    expect(resolveAiEdgeTimeoutMs("accept-workspace-invitation")).toBe(DEFAULT_EDGE_TIMEOUT_MS);
  });

  it("las ocho funciones interactivas estan cubiertas, no solo la de categoria", () => {
    for (const name of [
      "movement-category-ai-suggestion",
      "movement-description-ai-cleanup",
      "movement-counterparty-ai-suggestion",
      "movement-recurring-ai-suggestion",
      "notification-movement-ai-classifier",
      "movement-risk-ai-explanation",
      "movement-budget-ai-recommendation",
      "daily-ai-digest",
    ]) {
      expect(resolveAiEdgeTimeoutMs(name)).toBe(INTERACTIVE_AI_TIMEOUT_MS);
    }
  });
});
