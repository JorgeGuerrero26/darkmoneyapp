// npx -y deno@2.5.4 test supabase/functions/_shared/account-deletion.test.ts
import { assertEquals } from "jsr:@std/assert@1";

import { isDeleteConfirmed, mustCancelProFirst, pickNewOwner, redactPersonalData } from "./account-deletion.ts";

Deno.test("la confirmación pide escribir ELIMINAR", () => {
  assertEquals(isDeleteConfirmed("ELIMINAR"), true);
  assertEquals(isDeleteConfirmed(" eliminar "), true);
  assertEquals(isDeleteConfirmed("ELIMINA"), false);
  assertEquals(isDeleteConfirmed(undefined), false);
  assertEquals(isDeleteConfirmed(1), false);
});

Deno.test("primero cancela Pro solo si Paddle le sigue cobrando", () => {
  assertEquals(mustCancelProFirst(null), false);
  assertEquals(mustCancelProFirst({ billing_provider: "paddle", billing_status: "active", cancel_at_period_end: false }), true);
  assertEquals(mustCancelProFirst({ billing_provider: "paddle", billing_status: "trialing" }), true);
  assertEquals(mustCancelProFirst({ billing_provider: "paddle", billing_status: "past_due" }), true);
  // Cancelación ya programada: se deja borrar.
  assertEquals(mustCancelProFirst({ billing_provider: "paddle", billing_status: "active", cancel_at_period_end: true }), false);
  assertEquals(mustCancelProFirst({ billing_provider: "paddle", billing_status: "canceled" }), false);
  // Pro manual (sin cobro) y proveedores viejos: no bloquean.
  assertEquals(mustCancelProFirst({ billing_provider: null, billing_status: null, manual_override: true }), false);
  assertEquals(mustCancelProFirst({ billing_provider: "mercado_pago", billing_status: "active" }), false);
});

Deno.test("el espacio pasa al admin más antiguo; sin admin, al miembro más antiguo; sin nadie, a nadie", () => {
  const me = "u-me";
  assertEquals(pickNewOwner([{ user_id: me, role: "owner" }], me), null);
  const members = [
    { user_id: me, role: "owner", joined_at: "2026-01-01" },
    { user_id: "u-viewer", role: "viewer", joined_at: "2026-01-02" },
    { user_id: "u-member-new", role: "member", joined_at: "2026-03-01" },
    { user_id: "u-member-old", role: "member", joined_at: "2026-02-01" },
  ];
  assertEquals(pickNewOwner(members, me)?.user_id, "u-member-old");
  assertEquals(pickNewOwner([...members, { user_id: "u-admin", role: "admin", joined_at: "2026-05-01" }], me)?.user_id, "u-admin");
});

Deno.test("el aviso de pago pierde nombre, correo, dirección e IP y conserva montos e ids", () => {
  const payload = {
    event_type: "transaction.completed",
    data: {
      id: "txn_1",
      customer: { id: "ctm_1", email: "ana@example.com", name: "Ana", address: { first_line: "Calle 1", postal_code: "15001", country_code: "PE" } },
      details: { totals: { grand_total: "1990", currency_code: "USD" } },
      ip_address: "1.2.3.4",
      notes: "Escribir a ana@example.com",
      items: [{ price: { id: "pri_1" }, quantity: 1 }],
    },
  };
  assertEquals(redactPersonalData(payload), {
    event_type: "transaction.completed",
    data: {
      id: "txn_1",
      customer: { id: "ctm_1", email: null, name: null, address: { first_line: null, postal_code: null, country_code: "PE" } },
      details: { totals: { grand_total: "1990", currency_code: "USD" } },
      ip_address: null,
      notes: "Escribir a [correo eliminado]",
      items: [{ price: { id: "pri_1" }, quantity: 1 }],
    },
  });
});
