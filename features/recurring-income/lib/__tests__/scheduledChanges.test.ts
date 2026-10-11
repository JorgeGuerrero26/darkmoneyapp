import {
  collectChanges,
  toChangeDrafts,
  normalizeScheduledChanges,
  parseScheduledChanges,
  toScheduledChangesRows,
  upcomingScheduledChanges,
} from "../scheduledChanges";

describe("scheduledChanges", () => {
  it("ordena, descarta lo inválido y deja una entrada por fecha", () => {
    expect(
      normalizeScheduledChanges([
        { effectiveDate: "2027-03-01", amount: 5000 },
        { effectiveDate: "2027-01-01", amount: 4500 },
        { effectiveDate: "2027-01-01", amount: 4600 },
        { effectiveDate: "enero", amount: 4000 },
        { effectiveDate: "2027-05-01", amount: 0 },
      ]),
    ).toEqual([
      { effectiveDate: "2027-01-01", amount: 4600 },
      { effectiveDate: "2027-03-01", amount: 5000 },
    ]);
  });

  it("ida y vuelta con la forma de la base", () => {
    const rows = toScheduledChangesRows([{ effectiveDate: "2027-01-01", amount: 4500 }]);
    expect(rows).toEqual([{ effective_date: "2027-01-01", amount: 4500 }]);
    expect(parseScheduledChanges(rows)).toEqual([{ effectiveDate: "2027-01-01", amount: 4500 }]);
  });

  it("lo que no es una lista no rompe", () => {
    expect(parseScheduledChanges(null)).toEqual([]);
    expect(parseScheduledChanges("x")).toEqual([]);
    expect(parseScheduledChanges([null, 3, { amount: "no" }])).toEqual([]);
  });

  it("los próximos son los posteriores a hoy", () => {
    const list = [
      { effectiveDate: "2026-09-01", amount: 4000 },
      { effectiveDate: "2027-01-01", amount: 4500 },
    ];
    expect(upcomingScheduledChanges(list, "2026-10-11")).toEqual([{ effectiveDate: "2027-01-01", amount: 4500 }]);
  });
});

describe("borradores del formulario", () => {
  it("descarta las filas a medias y acepta la coma decimal", () => {
    expect(
      collectChanges([
        { key: "a", date: "2027-01-01", amount: "4500,50" },
        { key: "b", date: "", amount: "100" },
        { key: "c", date: "2027-02-01", amount: "" },
      ]),
    ).toEqual([{ effectiveDate: "2027-01-01", amount: 4500.5 }]);
  });

  it("lo guardado vuelve como texto editable", () => {
    expect(toChangeDrafts([{ effectiveDate: "2027-01-01", amount: 4500 }])).toEqual([
      { key: "sc-0", date: "2027-01-01", amount: "4500" },
    ]);
  });
});
