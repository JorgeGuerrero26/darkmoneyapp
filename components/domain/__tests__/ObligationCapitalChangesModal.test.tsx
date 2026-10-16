import React from "react";
import type { ObligationEventSummary } from "../../../types/domain";

jest.mock("../../ui/BottomSheet", () => ({ BottomSheet: ({ children }: { children: React.ReactNode }) => require("react").createElement(require("react-native").View, null, children) }));

import { ObligationCapitalChangesModal } from "../ObligationCapitalChangesModal";

const { create, act } = require("react-test-renderer");
const event = (id: number, amount: number, description: string, eventDate = "2026-09-02"): ObligationEventSummary =>
  ({ id, amount, description, eventDate, reason: null, notes: null, installmentNo: null } as unknown as ObligationEventSummary);

const texts = (renderer: ReturnType<typeof create>) => JSON.stringify(renderer.toJSON());

it("muestra los aumentos en filas con su total y cambia a reducciones con el control segmentado", async () => {
  let renderer!: ReturnType<typeof create>;
  await act(async () => {
    renderer = create(
      React.createElement(ObligationCapitalChangesModal, {
        visible: true, onClose: () => {}, currencyCode: "PEN",
        increases: [event(1, 410, "Batería Anker"), event(2, 550, "Beyerdynamic DT 770PRO")],
        decreases: [event(3, 116, "Devolución")],
      }),
    );
  });
  const all = texts(renderer);
  expect(all).toContain("AUMENTOS REGISTRADOS");
  expect(all).toContain("Batería Anker");
  expect(all).toContain('["2"," ","eventos"," en total"]');
  expect(all).toContain("Aumentos (2)");
  const label = renderer.root.findAll((node: { children: unknown[] }) => node.children.length === 1 && typeof node.children[0] === "string" && /Reducciones/.test(node.children[0] as string))[0];
  let pressable = label;
  while (pressable && !pressable.props.onPress) pressable = pressable.parent;
  const reductions = pressable;
  await act(async () => { reductions.props.onPress(); });
  const after = texts(renderer);
  expect(after).toContain("REDUCCIONES REGISTRADAS");
  expect(after).toContain("Devolución");
  expect(after).toContain('["1"," ","evento"," en total"]');
});

it("sin eventos lo dice en una línea", async () => {
  let renderer!: ReturnType<typeof create>;
  await act(async () => {
    renderer = create(React.createElement(ObligationCapitalChangesModal, { visible: true, onClose: () => {}, currencyCode: "PEN", increases: [], decreases: [] }));
  });
  expect(texts(renderer)).toContain("Todavía no hay aumentos de capital registrados.");
});
