import { applyContactFilter } from "../features/contacts/lib/contactsFilter";
import { buildContactSections } from "../features/contacts/lib/buildContactSections";
import { contactRowSubtitle } from "../features/contacts/lib/contactRowSubtitle";
import type { CounterpartyOverview } from "../types/domain";
import type { ContactMetrics } from "../components/domain/ContactCard";

const contact = (id: number, overrides: Partial<CounterpartyOverview> = {}): CounterpartyOverview => ({
  id, workspaceId: 1, name: `Contacto ${id}`, type: "person", isPinned: false, isArchived: false,
  roles: [], movementCount: 0, receivableCount: 0, receivablePrincipalTotal: 0, receivablePendingTotal: 0,
  payableCount: 0, payablePrincipalTotal: 0, payablePendingTotal: 0, netPendingAmount: 0,
  inflowTotal: 0, outflowTotal: 0, netFlowAmount: 0,
  ...overrides,
});

describe("Contactos: filtros combinables", () => {
  const contacts = [
    contact(1, { name: "Ana", isPinned: true, phone: "999123456" }),
    contact(2, { name: "Empresa", type: "company", isPinned: true, isArchived: true }),
    contact(3, { name: "Banco", type: "bank", isArchived: true }),
    contact(4, { name: "Comercio", type: "merchant" }),
  ];

  it("permite ver solo activos, solo archivados o todos", () => {
    expect(applyContactFilter(contacts, { search: "", filters: [], status: "active" }).map((c) => c.id)).toEqual([1, 4]);
    expect(applyContactFilter(contacts, { search: "", filters: [], status: "archived" }).map((c) => c.id)).toEqual([2, 3]);
    expect(applyContactFilter(contacts, { search: "", filters: [], status: "all" })).toHaveLength(4);
  });

  it("combina tipos como alternativas y estado/fijados como restricciones", () => {
    expect(applyContactFilter(contacts, { search: "", filters: ["company", "bank", "pinned"], status: "archived" }).map((c) => c.id)).toEqual([2]);
    expect(applyContactFilter(contacts, { search: "", filters: ["person", "merchant"], status: "active" }).map((c) => c.id)).toEqual([1, 4]);
  });

  it("busca por datos de contacto junto con los filtros", () => {
    expect(applyContactFilter(contacts, { search: "  123456  ", filters: ["pinned"], status: "active" }).map((c) => c.id)).toEqual([1]);
    expect(applyContactFilter(contacts, { search: "empresa", filters: [], status: "active" })).toEqual([]);
  });
});

describe("Contactos: agrupación", () => {
  it("muestra fijados primero, tipos en orden y archivados al final sin repetir contactos", () => {
    const input = [contact(1, { type: "bank" }), contact(2, { isPinned: true }), contact(3, { type: "company" }), contact(4), contact(5, { isPinned: true, isArchived: true })];
    const sections = buildContactSections(input);
    expect(sections.map((s) => s.key)).toEqual(["pinned", "person", "company", "bank", "archived"]);
    const ids = sections.flatMap((s) => s.data.map((c) => c.id));
    expect(ids).toHaveLength(input.length);
    expect(new Set(ids).size).toBe(input.length);
    expect(sections.at(-1)?.data.map((c) => c.id)).toEqual([5]);
  });

  it("ordena nombres sin mutar la entrada y conserva conteos del resultado filtrado", () => {
    const input = [contact(1, { name: "Zoe" }), contact(2, { name: "Ana" })];
    const sections = buildContactSections(input);
    expect(sections[0].data.map((c) => c.id)).toEqual([2, 1]);
    expect(input.map((c) => c.id)).toEqual([1, 2]);
    expect(sections[0].trailing).toBe("2");
    expect(buildContactSections([])).toEqual([]);
  });
});

describe("Contactos: contexto de fila", () => {
  const metrics: ContactMetrics = { movementCount: 3, receivablePendingTotal: 100, payablePendingTotal: 0, subscriptionCount: 0, recurringIncomeCount: 0 };

  it("distingue quién debe a quién", () => {
    expect(contactRowSubtitle(contact(1, { phone: "999123456" }), metrics)).toBe("999123456 · Te debe");
    expect(contactRowSubtitle(contact(1), { ...metrics, receivablePendingTotal: 0, payablePendingTotal: 50 })).toBe("Le debes");
    expect(contactRowSubtitle(contact(1), { ...metrics, payablePendingTotal: 50 })).toBe("Te debe · Le debes");
  });

  it("respeta los flags de saldo real sin depender de conversiones de moneda", () => {
    expect(contactRowSubtitle(contact(1), { ...metrics, receivablePendingTotal: 0, hasReceivable: true })).toBe("Te debe");
    expect(contactRowSubtitle(contact(1), { ...metrics, hasReceivable: false })).toBe("3 movimientos");
  });

  it("usa datos disponibles y marca archivados sin cápsulas adicionales", () => {
    expect(contactRowSubtitle(contact(1, { email: "ana@example.com", isArchived: true }))).toBe("ana@example.com · Archivado");
    expect(contactRowSubtitle(contact(1, { movementCount: 1 }))).toBe("1 movimiento");
    expect(contactRowSubtitle(contact(1))).toBe("Sin datos de contacto");
  });
});
