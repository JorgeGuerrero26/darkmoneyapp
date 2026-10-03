import { buildRecurringIncomeSections } from "../buildRecurringIncomeSections";
import type { RecurringIncomeSummary } from "../../../../types/domain";

function income(id: number, overrides: Partial<RecurringIncomeSummary> = {}): RecurringIncomeSummary {
  return {
    id,
    workspaceId: 1,
    name: `Ingreso ${id}`,
    payer: "",
    status: "active",
    amount: 100,
    currencyCode: "PEN",
    frequency: "monthly",
    frequencyLabel: "Mensual",
    intervalCount: 1,
    startDate: "2026-01-01",
    nextExpectedDate: "2026-10-15",
    remindDaysBefore: 3,
    isPinned: false,
    ...overrides,
  };
}

describe("buildRecurringIncomeSections", () => {
  it("deja pendientes arriba y agrupa los próximos por frecuencia con encabezados de sección", () => {
    const sections = buildRecurringIncomeSections({
      today: "2026-10-03",
      items: [
        income(1, { nextExpectedDate: "2026-09-30" }),
        income(2, { frequency: "weekly" }),
        income(3),
        income(4, { frequency: "weekly", isPinned: true }),
        income(5, { status: "paused" }),
        income(6, { status: "cancelled" }),
      ],
    });

    expect(sections.map((section) => section.key)).toEqual([
      "unconfirmed", "frequency-weekly", "frequency-monthly", "paused", "cancelled",
    ]);
    expect(sections[1].label).toBe("Semanales (2)");
    expect(sections[1].data.map((item) => item.id)).toEqual([4, 2]);
    expect(sections.every((section) => section.headerVariant === "divider")).toBe(true);
    expect(sections[4].data).toEqual([]);
  });
});
