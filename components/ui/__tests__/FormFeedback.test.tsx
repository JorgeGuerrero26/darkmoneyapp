
const { act, create } = require("react-test-renderer");
import { Text } from "react-native";
import { FormFeedbackProvider, FormSubmitBar, useFormField, FieldFeedbackMessage } from "../FormFeedback";
import { requiredField, positiveAmountField } from "../../../lib/form-field-rules";
import { FormFieldError } from "../../../lib/form-errors";

function Field({ id }: { id: string }) { return <FieldFeedbackMessage feedback={useFormField(id)} />; }
describe("shared form feedback", () => {
  let tree: ReturnType<typeof create>;
  const save = jest.fn();
  const account = jest.fn();
  const category = jest.fn();
  const render = (accountId: number | null, categoryId: number | null, amount = "10", visible = true, error = "") =>
    <FormFeedbackProvider visible={visible} onSubmit={save} fields={{
      account: requiredField(accountId, "Elige una cuenta", null, account),
      category: requiredField(categoryId, "Elige una categoría", null, category),
      amount: positiveAmountField(amount),
    }}><Field id="account" /><Field id="amount" /><FormSubmitBar onSubmit={save} error={error} /></FormFeedbackProvider>;
  beforeEach(() => { jest.clearAllMocks(); });
  afterEach(() => { act(() => tree?.unmount()); });
  function pressSave() { const button = tree.root.findAll((n: any) => n.props.accessibilityRole === "button" && n.props.accessibilityLabel === "Guardar")[0]; act(() => button.props.onPress()); }
  it("shows missing once and opens each missing selector before saving once", () => {
    act(() => { tree = create(render(null, null)); });
    expect(tree.root.findAllByType(Text).filter((n: any) => n.props.children === "Elige una cuenta")).toHaveLength(1);
    pressSave(); expect(account).toHaveBeenCalledTimes(1); expect(save).not.toHaveBeenCalled();
    act(() => tree.update(render(1, null))); expect(category).toHaveBeenCalledTimes(1);
    act(() => tree.update(render(1, 2))); expect(save).toHaveBeenCalledTimes(1);
    act(() => tree.update(render(1, 2, "20"))); expect(save).toHaveBeenCalledTimes(1);
  });
  it("ordinary edits never save, and closing cancels a pending save", () => {
    act(() => { tree = create(render(null, 2)); });
    act(() => tree.update(render(1, 2))); expect(save).not.toHaveBeenCalled();
    act(() => tree.update(render(null, 2))); pressSave();
    act(() => tree.update(render(null, 2, "10", false)));
    act(() => tree.update(render(1, 2))); expect(save).not.toHaveBeenCalled();
  });
  it("invalid is shown only after Save, clears on correction, and never says retry", () => {
    act(() => { tree = create(render(1, 2, "0")); });
    expect(tree.root.findAll((n: any) => n.props.accessibilityRole === "alert")).toHaveLength(0);
    pressSave(); expect(save).not.toHaveBeenCalled();
    expect(tree.root.findAllByType(Text).some((n: any) => n.props.children === "El monto debe ser mayor a cero")).toBe(true);
    expect(tree.root.findAll((n: any) => n.props.accessibilityLabel === "Reintentar")).toHaveLength(0);
    act(() => tree.update(render(1, 2, "10")));
    expect(tree.root.findAll((n: any) => n.props.accessibilityRole === "alert")).toHaveLength(0);
  });
  it("only a save failure changes the button to retry and preserves the form", () => {
    act(() => { tree = create(render(1, 2, "10", true, "Sin conexión")); });
    expect(tree.root.findAllByType(Text).some((n: any) => String(n.props.children).includes("Tus cambios siguen aquí"))).toBe(true);
    expect(tree.root.findAll((n: any) => n.props.accessibilityLabel === "Reintentar").length).toBeGreaterThan(0);
  });
  it("does not save after the first character typed in a missing amount", () => {
    act(() => { tree = create(render(1, 2, "")); });
    pressSave();
    act(() => tree.update(render(1, 2, "1")));
    expect(save).not.toHaveBeenCalled();
    pressSave();
    expect(save).toHaveBeenCalledTimes(1);
  });
  it("reveals an invalid field without opening its selector", () => {
    const open = jest.fn(), reveal = jest.fn();
    act(() => { tree = create(<FormFeedbackProvider onSubmit={save} fields={{ account: { value: 3, invalid: "Cuenta no disponible", open, reveal } }}><Field id="account" /><FormSubmitBar onSubmit={save} /></FormFeedbackProvider>); });
    pressSave();
    expect(reveal).toHaveBeenCalledTimes(1);
    expect(open).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
  });
  it("blocks repeated Save and shows Retry only after an asynchronous failure", async () => {
    let reject!: (error: Error) => void;
    save.mockImplementationOnce(() => new Promise<void>((_resolve, fail) => { reject = fail; }));
    act(() => { tree = create(render(1, 2)); });
    const button = tree.root.findAll((n: any) => n.props.accessibilityRole === "button" && n.props.accessibilityLabel === "Guardar")[0];
    act(() => { button.props.onPress(); button.props.onPress(); });
    expect(save).toHaveBeenCalledTimes(1);
    await act(async () => { reject(new Error("Sin conexión")); });
    expect(tree.root.findAll((n: any) => n.props.accessibilityLabel === "Reintentar").length).toBeGreaterThan(0);
    expect(tree.root.findAllByType(Text).some((n: any) => String(n.props.children).includes("Tus cambios siguen aquí"))).toBe(true);
  });
  it("shows a server field error locally, clears it on edit and close, and keeps Save", async () => {
    save.mockRejectedValueOnce(new FormFieldError({ amount: "El monto supera el límite" }));
    act(() => { tree = create(render(1, 2)); });
    await act(async () => { pressSave(); });
    expect(tree.root.findAllByType(Text).filter((n: any) => n.props.children === "El monto supera el límite")).toHaveLength(1);
    expect(tree.root.findAll((n: any) => n.props.accessibilityLabel === "Reintentar")).toHaveLength(0);
    act(() => tree.update(render(1, 2, "20")));
    expect(tree.root.findAll((n: any) => n.props.accessibilityRole === "alert")).toHaveLength(0);
    save.mockRejectedValueOnce(new FormFieldError({ amount: "Revisa el monto" }));
    await act(async () => { pressSave(); });
    act(() => tree.update(render(1, 2, "20", false)));
    act(() => tree.update(render(1, 2, "20")));
    expect(tree.root.findAll((n: any) => n.props.accessibilityRole === "alert")).toHaveLength(0);
  });
});
