jest.mock("../../../../lib/supabase", () => ({ supabase: null }));
jest.mock("../../../../services/queries/workspace-data", () => ({ recordManualMovementFingerprint: jest.fn() }));

import { buildSubscriptionPayment } from "../markSubscriptionPaid";
import type { SubscriptionSummary } from "../../../../types/domain";

const subscription = {
  id: 7, name: "Netflix", notes: null, categoryId: 3, vendorPartyId: null,
  nextDueDate: "2026-10-20", frequency: "monthly", intervalCount: 1, dayOfMonth: 20,
} as unknown as SubscriptionSummary;

describe("pago de una suscripción (mismo resultado en línea y sin conexión)", () => {
  it("avanza al siguiente período y arma el movimiento del pago", () => {
    const payment = buildSubscriptionPayment({ subscription, paidDate: "2026-10-15", amount: 12, accountId: 4 });
    expect(payment.nextDueDate).toBe("2026-11-20");
    expect(payment.movementFields).toMatchObject({
      movement_type: "subscription_payment", status: "posted", description: "Netflix", source_account_id: 4, source_amount: 12,
      subscription_id: 7, category_id: 3, destination_account_id: null,
    });
    expect(payment.movementFields.metadata).toEqual({ manual_subscription_payment: true, paid_for_due_date: "2026-10-20" });
  });

  it("la clave identifica ESTE cobro: mismo cobro = misma clave, otro período = otra", () => {
    const a = buildSubscriptionPayment({ subscription, paidDate: "2026-10-15", amount: 12, accountId: 4 });
    const again = buildSubscriptionPayment({ subscription, paidDate: "2026-10-16", amount: 12, accountId: 4 });
    const next = buildSubscriptionPayment({ subscription: { ...subscription, nextDueDate: "2026-11-20" }, paidDate: "2026-11-15", amount: 12, accountId: 4 });
    expect(a.movementFields.client_dedupe_key).toBe("subscription-payment:7:2026-10-20");
    expect(again.movementFields.client_dedupe_key).toBe(a.movementFields.client_dedupe_key);
    expect(next.movementFields.client_dedupe_key).not.toBe(a.movementFields.client_dedupe_key);
  });
});
