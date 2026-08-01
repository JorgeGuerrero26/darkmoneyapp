import { findStaleGeneratedNotificationIds } from "../notification-cleanup";

describe("findStaleGeneratedNotificationIds", () => {
  const managedKinds = ["budget_alert", "low_balance"] as const;

  it("conserva pares kind/entity activos y devuelve solo IDs obsoletos", () => {
    const staleIds = findStaleGeneratedNotificationIds(
      [
        { id: 1, kind: "budget_alert", related_entity_id: 10 },
        { id: 2, kind: "budget_alert", related_entity_id: 20 },
        { id: 3, kind: "low_balance", related_entity_id: 10 },
      ],
      [
        { kind: "budget_alert", related_entity_id: 10 },
        { kind: "low_balance", related_entity_id: 10 },
      ],
      managedKinds,
    );

    expect(staleIds).toEqual([2]);
  });

  it("elimina todas las filas de un kind sin alertas activas", () => {
    const staleIds = findStaleGeneratedNotificationIds(
      [
        { id: 1, kind: "budget_alert", related_entity_id: 10 },
        { id: 2, kind: "low_balance", related_entity_id: 20 },
        { id: 3, kind: "low_balance", related_entity_id: null },
      ],
      [{ kind: "budget_alert", related_entity_id: 10 }],
      managedKinds,
    );

    expect(staleIds).toEqual([2, 3]);
  });

  it("ignora kinds no administrados y conserva null cuando el kind tiene IDs activos", () => {
    const staleIds = findStaleGeneratedNotificationIds(
      [
        { id: 1, kind: "server_predictive", related_entity_id: 99 },
        { id: 2, kind: null, related_entity_id: 99 },
        { id: 3, kind: "budget_alert", related_entity_id: null },
      ],
      [{ kind: "budget_alert", related_entity_id: 10 }],
      managedKinds,
    );

    expect(staleIds).toEqual([]);
  });
});
