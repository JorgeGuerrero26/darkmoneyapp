import React from "react";
import { Text, TextInput } from "react-native";

import { ScheduledChangesSection } from "../ScheduledChangesSection";
import type { ScheduledChangeDraft } from "../../lib/scheduledChanges";

const { create, act } = require("react-test-renderer");

/* El selector de fecha real abre un calendario; aquí solo importa que reciba y devuelva la fecha. */
jest.mock("../../../../components/ui/FormDateRow", () => ({
  FormDateRow: ({ value, onChange }: any) =>
    require("react").createElement(require("react-native").Text, {
      testID: "date-row",
      onPress: () => onChange("2027-01-01"),
    }, value || "sin fecha"),
}));

async function render(props: Partial<React.ComponentProps<typeof ScheduledChangesSection>> = {}) {
  const onChange = jest.fn();
  const onToggle = jest.fn();
  let renderer: ReturnType<typeof create>;
  await act(async () => {
    renderer = create(React.createElement(ScheduledChangesSection, { open: true, onToggle, changes: [], onChange, ...props }));
  });
  return { renderer: renderer!, onChange, onToggle };
}

const byLabel = (renderer: any, label: string) =>
  renderer.root.findAll((n: any) => n.props.accessibilityLabel === label && typeof n.props.onPress === "function")[0];

describe("ScheduledChangesSection", () => {
  it("cerrada solo muestra el encabezado, con cuántos cambios hay", async () => {
    const { renderer } = await render({
      open: false,
      changes: [{ key: "a", date: "2027-01-01", amount: "4500" }],
    });
    const text = renderer.root.findAllByType(Text).map((n: any) => [n.props.children].flat().join("")).join(" ");
    expect(text).toContain("Cambios de monto");
    expect(text).toContain("· 1");
    expect(renderer.root.findAllByType(TextInput)).toHaveLength(0);
  });

  it("añadir agrega una fila en blanco", async () => {
    const { renderer, onChange } = await render();
    byLabel(renderer, "Añadir cambio de monto").props.onPress();
    const [next] = onChange.mock.calls[0] as [ScheduledChangeDraft[]];
    expect(next).toHaveLength(1);
    expect(next[0]).toMatchObject({ date: "", amount: "" });
  });

  it("editar la fecha y el monto actualiza solo esa fila", async () => {
    const rows: ScheduledChangeDraft[] = [
      { key: "a", date: "", amount: "" },
      { key: "b", date: "2027-06-01", amount: "5000" },
    ];
    const { renderer, onChange } = await render({ changes: rows });
    renderer.root.findAllByProps({ testID: "date-row" })[0].props.onPress();
    expect(onChange).toHaveBeenLastCalledWith([{ key: "a", date: "2027-01-01", amount: "" }, rows[1]]);
    renderer.root.findAllByType(TextInput)[0].props.onChangeText("4500");
    expect(onChange).toHaveBeenLastCalledWith([{ key: "a", date: "", amount: "4500" }, rows[1]]);
  });

  it("quitar saca esa fila", async () => {
    const rows: ScheduledChangeDraft[] = [{ key: "a", date: "2027-01-01", amount: "4500" }];
    const { renderer, onChange } = await render({ changes: rows });
    byLabel(renderer, "Quitar este cambio").props.onPress();
    expect(onChange).toHaveBeenCalledWith([]);
  });
});
