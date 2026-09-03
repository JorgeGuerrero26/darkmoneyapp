import { buildSubscriptionSections } from "../buildSubscriptionSections";
import type { SubscriptionSummary } from "../../../../types/domain";

const TODAY = "2026-09-03";

function build(overrides: Partial<SubscriptionSummary> = {}): SubscriptionSummary {
  return {
    id: 1,
    workspaceId: 1,
    name: "Yt Premium",
    vendor: "",
    status: "active",
    amount: 60.07,
    currencyCode: "PEN",
    frequency: "monthly",
    frequencyLabel: "Mensual",
    intervalCount: 1,
    startDate: "2026-01-04",
    nextDueDate: "2026-10-04",
    remindDaysBefore: 3,
    autoCreateMovement: false,
    isPinned: false,
    ...overrides,
  };
}

const sectionsOf = (subscriptions: SubscriptionSummary[], extra = {}) =>
  buildSubscriptionSections({ subscriptions, today: TODAY, ...extra });

describe("buildSubscriptionSections", () => {
  it("ordena por urgencia: atrasadas, proximas, pausadas y canceladas", () => {
    const result = sectionsOf([
      build({ id: 1, nextDueDate: "2026-10-04" }),
      build({ id: 2, nextDueDate: "2026-06-04" }),
      build({ id: 3, status: "paused" }),
      build({ id: 4, status: "cancelled" }),
    ]);
    expect(result.map((section) => section.key)).toEqual([
      "overdue",
      "upcoming",
      "paused",
      "cancelled",
    ]);
  });

  it("lo fijado ordena dentro de su seccion, no crea una propia", () => {
    const result = sectionsOf([
      build({ id: 1, nextDueDate: "2026-06-04" }),
      build({ id: 2, nextDueDate: "2026-06-10", isPinned: true }),
      build({ id: 3, nextDueDate: "2026-10-04", isPinned: true }),
    ]);
    expect(result.map((section) => section.key)).toEqual(["overdue", "upcoming"]);
    // La fijada sube dentro de Atrasadas, pero no se lleva por delante la seccion.
    expect(result[0].data.map((s) => s.id)).toEqual([2, 1]);
    expect(result[1].data.map((s) => s.id)).toEqual([3]);
  });

  it("la que vence hoy es proxima, no atrasada", () => {
    const result = sectionsOf([build({ nextDueDate: TODAY })]);
    expect(result[0].key).toBe("upcoming");
  });

  it("sin conteos entre parentesis mientras las filas se ven", () => {
    const result = sectionsOf([
      build({ id: 1, nextDueDate: "2026-06-04" }),
      build({ id: 2, status: "paused" }),
    ]);
    expect(result.map((section) => section.label)).toEqual(["Atrasadas", "Pausadas"]);
  });

  it("canceladas llega plegada, con su conteo y sin filas", () => {
    const result = sectionsOf([
      build({ id: 1, nextDueDate: "2026-06-04" }),
      build({ id: 2, status: "cancelled" }),
      build({ id: 3, status: "cancelled" }),
    ]);
    const cancelled = result.find((section) => section.key === "cancelled");
    expect(cancelled?.label).toBe("Canceladas (2)");
    expect(cancelled?.data).toEqual([]);
    expect(cancelled?.collapsed).toBe(true);
  });

  it("y al abrirla enseña las filas y suelta el conteo", () => {
    const result = sectionsOf(
      [build({ id: 2, status: "cancelled" }), build({ id: 3, status: "cancelled" })],
      { cancelledExpanded: true },
    );
    const cancelled = result.find((section) => section.key === "cancelled");
    expect(cancelled?.label).toBe("Canceladas");
    expect(cancelled?.data).toHaveLength(2);
    expect(cancelled?.collapsed).toBe(false);
  });

  it("con una sola lista en pantalla el encabezado sobra", () => {
    const result = sectionsOf([build({ id: 1 }), build({ id: 2 })]);
    expect(result).toHaveLength(1);
    expect(result[0].headerVariant).toBe("hidden");
  });

  it("el total sin anotar solo aparece si se lo pasan: nunca se estima", () => {
    const sinDato = sectionsOf([build({ nextDueDate: "2026-06-04" })]);
    expect(sinDato[0].trailing).toBeUndefined();

    const conDato = sectionsOf([build({ nextDueDate: "2026-06-04" })], {
      overdueTotalLabel: "S/ 180.21 sin anotar",
    });
    expect(conDato[0].trailing).toBe("S/ 180.21 sin anotar");
  });
});
