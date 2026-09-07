import type { UncategorizedGroup } from "../groupUncategorized";
import {
  assignedToastTitle,
  hasConfidentSuggestion,
  inboxSupportPhrase,
  movementCountLabel,
  summarizeInbox,
} from "../uncategorizedInbox";

const grupo = (over: Partial<UncategorizedGroup> = {}): UncategorizedGroup => ({
  key: "moto",
  label: "Moto",
  movements: [
    { id: 1, description: "Moto", amount: 2, occurredAt: "2026-08-30T12:00:00Z" },
    { id: 2, description: "Moto", amount: 2, occurredAt: "2026-08-31T12:00:00Z" },
  ],
  total: 4,
  suggestedCategoryId: 7,
  confidence: 0.7,
  ...over,
});

describe("hasConfidentSuggestion", () => {
  it("una propuesta floja no se ofrece de un toque: tocaria 23 filas a ciegas", () => {
    expect(hasConfidentSuggestion(grupo({ confidence: 0.55 }))).toBe(false);
    expect(hasConfidentSuggestion(grupo({ confidence: 0.6 }))).toBe(true);
  });

  it("sin categoria propuesta no hay atajo, por alta que sea la confianza", () => {
    expect(hasConfidentSuggestion(grupo({ suggestedCategoryId: null, confidence: 0.9 }))).toBe(false);
  });
});

describe("summarizeInbox", () => {
  it("suma la plata y cuenta las decisiones, no las filas", () => {
    const summary = summarizeInbox([
      grupo(),
      grupo({ key: "cena", label: "Cena", total: 300, confidence: 0.4, movements: [
        { id: 3, description: "Cena", amount: 300, occurredAt: "2026-08-20T12:00:00Z" },
      ] }),
    ]);
    expect(summary).toEqual({ groups: 2, movements: 3, total: 304, withSuggestion: 1 });
  });

  it("sin nada pendiente no inventa cifras", () => {
    expect(summarizeInbox([])).toEqual({ groups: 0, movements: 0, total: 0, withSuggestion: 0 });
  });
});

describe("movementCountLabel", () => {
  it("respeta el singular: la mitad de los grupos son de uno solo", () => {
    expect(movementCountLabel(1)).toBe("1 movimiento");
    expect(movementCountLabel(23)).toBe("23 movimientos");
  });
});

describe("inboxSupportPhrase", () => {
  it("dice grupos, movimientos y cuantos vienen con propuesta", () => {
    expect(inboxSupportPhrase({ groups: 129, movements: 225, total: 0, withSuggestion: 75 }))
      .toBe("129 grupos · 225 movimientos · 75 con propuesta");
  });

  it("si no hay propuestas no anuncia un cero", () => {
    expect(inboxSupportPhrase({ groups: 2, movements: 5, total: 0, withSuggestion: 0 }))
      .toBe("2 grupos · 5 movimientos");
  });

  it("vacia cuando no hay nada que clasificar", () => {
    expect(inboxSupportPhrase({ groups: 0, movements: 0, total: 0, withSuggestion: 0 })).toBe("");
  });
});

describe("assignedToastTitle", () => {
  it("confirma en plata y filas, no con un listo", () => {
    expect(assignedToastTitle("Transporte", 23)).toBe("Transporte · 23 movimientos");
  });
});
