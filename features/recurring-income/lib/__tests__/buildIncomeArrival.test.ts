import { buildIncomeArrival, type IncomeArrivalInput } from "../buildIncomeArrival";

const base: IncomeArrivalInput = {
  recurringIncomeId: 5, recurringIncomeName: "Sueldo", expectedDate: "2026-10-30", actualDate: "2026-10-30", amount: 3000, accountId: 2,
  currentAccountId: 2, currencyCode: "PEN", frequency: "monthly", intervalCount: 1, currentBaseAmount: 3000,
};

describe("llegada de un ingreso fijo (mismo resultado en línea y sin conexión)", () => {
  it("arma el movimiento de ingreso, la fila del historial y la próxima fecha", () => {
    const arrival = buildIncomeArrival(base);
    expect(arrival.movementFields).toMatchObject({
      movement_type: "income", status: "posted", description: "Sueldo", destination_account_id: 2, destination_amount: 3000, source_account_id: null,
    });
    expect(arrival.occurrenceFields).toMatchObject({ recurring_income_id: 5, expected_date: "2026-10-30", actual_date: "2026-10-30", amount: 3000, status: "on_time" });
    expect(arrival.recurringIncomePatch).toEqual({ next_expected_date: arrival.nextExpectedDate });
    expect(arrival.nextExpectedDate > "2026-10-30").toBe(true);
  });

  it("una llegada posterior a la esperada queda 'late'", () => {
    expect(buildIncomeArrival({ ...base, actualDate: "2026-11-02" }).occurrenceFields.status).toBe("late");
  });

  it("un cambio permanente de monto actualiza el esperado y lo cuenta en la nota", () => {
    const arrival = buildIncomeArrival({ ...base, newBaseAmount: 3200, baseChangeKind: "bonus" });
    expect(arrival.updatedBaseAmount).toBe(3200);
    expect(arrival.recurringIncomePatch.amount).toBe(3200);
    expect(arrival.movementFields.notes).toContain("3,200.00");
  });

  it("si el ingreso no tenía cuenta, la cuenta elegida pasa a ser la suya", () => {
    expect(buildIncomeArrival({ ...base, currentAccountId: null }).recurringIncomePatch.account_id).toBe(2);
    expect(buildIncomeArrival(base).recurringIncomePatch.account_id).toBeUndefined();
  });

  it("la clave identifica ESTA llegada: reenviarla no la duplica", () => {
    expect(buildIncomeArrival(base).movementFields.client_dedupe_key).toBe("income-arrival:5:2026-10-30");
  });

  it("sin fecha real o sin cuenta no se arma nada", () => {
    expect(() => buildIncomeArrival({ ...base, actualDate: " " })).toThrow("fecha real");
    expect(() => buildIncomeArrival({ ...base, accountId: 0 })).toThrow("cuenta destino");
  });
});
